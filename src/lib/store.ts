"use client";

// 저장소. 두 가지 모드:
// - 체험 모드 (Supabase 키 없음): 이 기기 브라우저(localStorage)에만 저장. WhoSwitch 로 두 사람 역할을 번갈아 해 본다.
// - 서버 모드: 커플 하나의 AppState 전체를 Supabase couples.state 에 통으로 저장하고 실시간으로 맞춘다.
//   update() 는 화면에 바로 반영(낙관적)하고 뒤에서 저장한다. 저장 실패는 useSyncError() 로 알린다.
//   두 사람이 동시에 고치면 save_state 가 rev 불일치로 거절 → 최신 state 를 받아 같은 변경을 다시 적용한다.

import { useSyncExternalStore } from "react";
import { DEFAULT_BUCKET } from "./content";
import { notifyPartner, refreshPush } from "./push";
import { REMOTE, supabase } from "./supabase";
import type { AppState, Profile, Who } from "./types";

const KEY = "love-archive:v1";

const EMPTY: AppState = {
  version: 1,
  profile: null,
  anniversaries: [],
  bucket: [],
  balance: {},
  survey: {},
  letters: [],
  cats: [],
  catCheckin: {},
  catLog: [],
  places: [],
  photos: [],
};

export type SaveResult = { ok: true } | { ok: false; error: string };

export type Session =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "recovery" }
  | { status: "no-couple"; email: string }
  | { status: "ready"; email: string; who: Who; inviteCode: string; partnerJoined: boolean };

let state: AppState | null = null;
let session: Session = REMOTE ? { status: "loading" } : { status: "ready", email: "", who: "a", inviteCode: "", partnerJoined: true };
let syncError: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (REMOTE) {
    startRemote();
    return () => listeners.delete(fn);
  }
  // 다른 탭에서 바꾼 것도 반영 (한 폰에서 두 사람 역할 테스트할 때)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = loadLocal();
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): AppState | null {
  if (!REMOTE && !state) state = loadLocal();
  return state;
}

/** 서버 렌더링 중이나 불러오기 전에는 null */
export function useAppState(): AppState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

const loadingSession: Session = { status: "loading" };
export function useSession(): Session {
  return useSyncExternalStore(subscribe, () => session, () => loadingSession);
}

/** 서버 저장 실패 메시지 (체험 모드에선 항상 null) */
export function useSyncError(): string | null {
  return useSyncExternalStore(subscribe, () => syncError, () => null);
}

export function clearSyncError() {
  syncError = null;
  emit();
}

export function update(fn: (s: AppState) => AppState): SaveResult {
  return REMOTE ? updateRemote(fn) : updateLocal(fn);
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function freshState(profile: Profile): AppState {
  return { ...EMPTY, profile, bucket: DEFAULT_BUCKET.map((b) => ({ ...b, id: uid() })) };
}

export async function createCouple(profile: Profile, importTrial = false): Promise<SaveResult> {
  if (!REMOTE) return updateLocal(() => freshState(profile));
  const trial = importTrial ? trialData() : null;
  // 사진(data URL)은 couple id 가 있어야 올릴 수 있어서, 체험 데이터는 만든 뒤 update 로 옮긴다
  const { error } = await supabase().rpc("create_couple", { initial: freshState(profile) });
  if (error) return { ok: false, error: friendly(error.message) };
  await loadCouple();
  if (trial) update(() => ({ ...trial, profile: { ...profile, photo: trial.profile!.photo } }));
  return { ok: true };
}

export function resetAll(): SaveResult {
  return updateLocal(() => EMPTY);
}

// ───────── 체험 모드 ─────────

function loadLocal(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch (e) {
    console.error("[store] load failed", e);
  }
  return EMPTY;
}

function updateLocal(fn: (s: AppState) => AppState): SaveResult {
  const next = fn(getSnapshot()!);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.error("[store] save failed", e);
    return {
      ok: false,
      error: "저장 공간이 부족해서 저장하지 못했어요. 사진 몇 장을 지우고 다시 시도해 주세요.",
    };
  }
  state = next;
  emit();
  return { ok: true };
}

/** 이 기기에 체험 모드로 쓰던 기록 (서버 커플을 만들 때 가져오기용) */
export function trialData(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? ({ ...EMPTY, ...JSON.parse(raw) } as AppState) : null;
    return s?.profile ? s : null;
  } catch {
    return null;
  }
}

// ───────── 서버 모드 ─────────

type Pending = { fn: (s: AppState) => AppState; cache?: { base: AppState; value: AppState } };

let started = false;
/** 비번 재설정 링크로 들어와 아직 새 비밀번호를 안 정함 */
let recovering = false;
let coupleId: string | null = null;
/** 서버에 저장된 마지막 state (profile.me 는 이 기기 사람으로 바꿔 둠) + rev */
let server: { state: AppState; rev: number } | null = null;
/** 화면엔 먼저 보여 줬지만 아직 저장 안 된 변경들 (순서대로) */
let pending: Pending[] = [];
let flushing = false;
let channel: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
let channelFor: string | null = null;
const uploaded = new Map<string, string>();

function withMe(s: AppState): AppState {
  if (session.status !== "ready" || !s.profile) return s;
  return { ...EMPTY, ...s, profile: { ...s.profile, me: session.who } };
}

/** 같은 base 면 fn 을 다시 돌리지 않는다 (fn 안의 uid() 가 매번 바뀌지 않게) */
function apply(p: Pending, base: AppState): AppState {
  if (p.cache?.base !== base) p.cache = { base, value: p.fn(base) };
  return p.cache.value;
}

function recompute() {
  state = server ? pending.reduce((s, p) => apply(p, s), server.state) : null;
  emit();
}

function updateRemote(fn: (s: AppState) => AppState): SaveResult {
  if (!server) return { ok: false, error: "아직 불러오는 중이에요. 잠깐 뒤에 다시 시도해 주세요." };
  pending.push({ fn });
  recompute();
  void flush();
  return { ok: true };
}

async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (pending.length && server) {
      const p = pending[0];
      for (let attempt = 0; ; attempt++) {
        const base = server.state;
        const next = await uploadPhotos(apply(p, base));
        const { data, error } = await supabase().rpc("save_state", { expected: server.rev, next });
        if (error) throw error;
        if (typeof data === "number") {
          server = { state: next, rev: data };
          if (session.status === "ready" && session.partnerJoined) void notifyPartner(base, next, session.who);
          break;
        }
        // 상대가 먼저 저장함 → 최신을 받아 다시
        if (attempt >= 4) throw new Error("저장이 계속 겹쳤어요");
        await refetch();
      }
      pending.shift();
      recompute();
    }
  } catch (e) {
    console.error("[store] save failed", e);
    pending = [];
    syncError = "저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.";
    await refetch().catch(() => {});
    recompute();
  } finally {
    flushing = false;
  }
}

/** state 안의 사진 data URL 을 Storage 에 올리고 주소로 바꾼다 */
async function uploadPhotos(s: AppState): Promise<AppState> {
  const up = async (photo?: string) => {
    if (!photo?.startsWith("data:")) return photo;
    const done = uploaded.get(photo);
    if (done) return done;
    const blob = await (await fetch(photo)).blob();
    const path = `${coupleId}/${uid()}.jpg`;
    const { error } = await supabase().storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg" });
    if (error) throw error;
    const url = supabase().storage.from("photos").getPublicUrl(path).data.publicUrl;
    uploaded.set(photo, url);
    return url;
  };
  const has = (x?: string) => x?.startsWith("data:");
  if (!has(s.profile?.photo) && !s.bucket.some((b) => has(b.photo)) && !s.places.some((p) => has(p.photo)) && !s.photos.some((p) => has(p.src))) {
    return s;
  }
  return {
    ...s,
    profile: s.profile && { ...s.profile, photo: await up(s.profile.photo) },
    bucket: await Promise.all(s.bucket.map(async (b) => (has(b.photo) ? { ...b, photo: await up(b.photo) } : b))),
    places: await Promise.all(s.places.map(async (p) => (has(p.photo) ? { ...p, photo: await up(p.photo) } : p))),
    photos: await Promise.all(s.photos.map(async (p) => (has(p.src) ? { ...p, src: (await up(p.src))! } : p))),
  };
}

async function refetch() {
  if (!coupleId) return;
  const { data, error } = await supabase().from("couples").select("state, rev").eq("id", coupleId).single();
  if (error) throw error;
  if (!server || data.rev > server.rev) server = { state: withMe(data.state as AppState), rev: data.rev };
}

async function loadCouple() {
  const sb = supabase();
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) {
    setSignedOut();
    return;
  }
  // 비번 재설정 메일 링크로 들어온 경우: 새 비밀번호부터 정하게
  if (recovering) {
    session = { status: "recovery" };
    emit();
    return;
  }
  const email = user.email ?? "";
  const { data: mine, error } = await sb.from("couple_members").select("couple_id, who").eq("user_id", user.id).maybeSingle();
  if (error) {
    console.error("[store] load failed", error);
    syncError = "불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.";
    emit();
    return;
  }
  if (!mine) {
    session = { status: "no-couple", email };
    state = null;
    emit();
    return;
  }
  coupleId = mine.couple_id;
  const [{ data: couple, error: e1 }, { data: members, error: e2 }] = await Promise.all([
    sb.from("couples").select("invite_code, state, rev").eq("id", coupleId).single(),
    sb.from("couple_members").select("who").eq("couple_id", coupleId),
  ]);
  if (e1 || e2 || !couple) {
    console.error("[store] load failed", e1 ?? e2);
    syncError = "불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.";
    emit();
    return;
  }
  session = {
    status: "ready",
    email,
    who: mine.who as Who,
    inviteCode: couple.invite_code,
    partnerJoined: (members ?? []).length >= 2,
  };
  server = { state: withMe(couple.state as AppState), rev: couple.rev };
  recompute();
  listen();
  void refreshPush();
}

/** 상대가 저장하거나 들어오면 바로 다시 받기 */
function listen() {
  if (channelFor === coupleId) return;
  const sb = supabase();
  if (channel) void sb.removeChannel(channel);
  channelFor = coupleId;
  channel = sb
    .channel(`couple-${coupleId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "couples", filter: `id=eq.${coupleId}` }, () => void sync())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "couple_members", filter: `couple_id=eq.${coupleId}` }, () => void loadCouple())
    .subscribe();
}

async function sync() {
  try {
    await refetch();
    recompute();
  } catch (e) {
    console.error("[store] sync failed", e);
  }
}

function setSignedOut() {
  session = { status: "signed-out" };
  recovering = false;
  state = null;
  server = null;
  coupleId = null;
  pending = [];
  if (channel) void supabase().removeChannel(channel);
  channel = null;
  channelFor = null;
  emit();
}

function startRemote() {
  if (started) return;
  started = true;
  // 클라이언트가 주소의 #...type=recovery 를 지우기 전에 확인
  if (window.location.hash.includes("type=recovery")) recovering = true;
  const sb = supabase();
  sb.auth.onAuthStateChange((event, s) => {
    // 콜백 안에서 supabase 를 바로 await 하면 막힐 수 있어서 한 박자 뒤에
    if (!s) setTimeout(setSignedOut, 0);
    else if (event === "PASSWORD_RECOVERY") {
      recovering = true;
      setTimeout(() => void loadCouple(), 0);
    }
    else if (event === "INITIAL_SESSION" || event === "SIGNED_IN") setTimeout(() => void loadCouple(), 0);
  });
  // 폰은 백그라운드에서 실시간 연결이 끊기므로 돌아오면 한 번 맞춘다
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (session.status === "ready") void sync();
    else if (session.status === "no-couple") void loadCouple();
  });
}

// ───────── 로그인 · 커플 연결 ─────────

export async function signIn(email: string, password: string): Promise<SaveResult> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/** 가입. 이메일 인증이 켜져 있으면 needsConfirm */
export async function signUp(email: string, password: string): Promise<SaveResult & { needsConfirm?: boolean }> {
  const { data, error } = await supabase().auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
  if (error) return { ok: false, error: friendly(error.message) };
  // 이미 가입된 이메일이면 Supabase 는 에러 대신 빈 identities 를 준다
  if (data.user && data.user.identities?.length === 0) return { ok: false, error: "이미 가입된 이메일이에요. 로그인해 주세요." };
  return { ok: true, needsConfirm: !data.session };
}

/** 비밀번호 재설정 메일 보내기. 링크를 누르면 이 앱으로 돌아와 새 비밀번호를 정한다 */
export async function sendPasswordReset(email: string): Promise<SaveResult> {
  const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/** 재설정 링크로 들어온 뒤 새 비밀번호 저장 */
export async function setNewPassword(password: string): Promise<SaveResult> {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) return { ok: false, error: friendly(error.message) };
  recovering = false;
  await loadCouple();
  return { ok: true };
}

export async function signOut() {
  await supabase().auth.signOut();
}

export async function joinCouple(code: string): Promise<SaveResult> {
  const { error } = await supabase().rpc("join_couple", { code });
  if (error) return { ok: false, error: friendly(error.message) };
  await loadCouple();
  return { ok: true };
}

function friendly(msg: string): string {
  if (msg.includes("invalid_code")) return "초대 코드가 맞지 않아요. 다시 확인해 주세요.";
  if (msg.includes("couple_full")) return "이미 두 사람이 연결된 코드예요.";
  if (msg.includes("already_in_couple")) return "이미 연결된 커플이 있어요. 새로고침해 주세요.";
  if (msg.includes("Invalid login credentials")) return "이메일이나 비밀번호가 맞지 않아요.";
  if (msg.includes("Email not confirmed")) return "메일함에서 인증 링크를 먼저 눌러 주세요.";
  if (msg.includes("already registered")) return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (msg.includes("Password should be")) return "비밀번호는 6자 이상이어야 해요.";
  if (msg.includes("different from the old")) return "예전과 다른 비밀번호로 정해 주세요.";
  if (msg.includes("rate limit")) return "잠깐 너무 많이 시도했어요. 조금 뒤에 다시 해 주세요.";
  if (msg.includes("Failed to fetch")) return "인터넷 연결을 확인해 주세요.";
  return `문제가 생겼어요: ${msg}`;
}
