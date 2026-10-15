"use client";

// 채팅 저장소. 메시지는 AppState(couples.state)와 따로 둔다 — 쌓일수록 커지고 저장 충돌이 잦아지니까.
// - 체험 모드: 이 기기 localStorage 에 메시지 배열로. 보내는 사람은 profile.me (WhoSwitch 로 바꿔 가며 테스트).
// - 서버 모드: Supabase messages 테이블. 최근 PAGE 개씩 불러오고, 실시간으로 새 메시지·읽음·반응을 받는다.
//   보내기는 화면에 먼저 띄우고(낙관적) 뒤에서 insert. 실패하면 메시지에 '다시 보내기'가 붙는다.
//   상대가 채팅 화면을 보고 있으면(presence) 푸시는 보내지 않는다.

import { useEffect, useSyncExternalStore } from "react";
import { sendPush } from "./push";
import { currentSession, currentState, uid, useSession } from "./store";
import { REMOTE, supabase } from "./supabase";
import type { Who } from "./types";

export type Message = {
  id: string;
  from: Who;
  body: string;
  /** 체험 모드·보내는 중엔 data URL, 서버에 올라간 뒤엔 Storage 주소 */
  photo?: string;
  /** ISO */
  createdAt: string;
  /** 받는 사람이 읽은 시각 (ISO) */
  readAt?: string;
  reactions: Partial<Record<Who, string>>;
  /** 보내기 취소됨 */
  deleted?: boolean;
  /** 서버 모드에서 아직 저장 안 됨 */
  status?: "sending" | "failed";
};

export type ChatView = {
  /** 오래된 것 → 최신 순 */
  messages: Message[];
  /** 서버 모드에서 처음 불러오는 중 */
  loading: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  error: string | null;
};

export const PAGE = 40;
const KEY = "love-archive:chat:v1";

let view: ChatView = { messages: [], loading: REMOTE, hasMore: false, loadingOlder: false, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<ChatView>) {
  view = { ...view, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (REMOTE) return () => listeners.delete(fn);
  // 다른 탭에서 보낸 것도 반영 (한 기기에서 두 사람 역할 테스트할 때)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) showLocal();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

let localStarted = false;
function getSnapshot(): ChatView {
  if (!REMOTE && !localStarted) {
    localStarted = true;
    view = { ...view, ...localView() };
  }
  return view;
}

const serverView: ChatView = { messages: [], loading: true, hasMore: false, loadingOlder: false, error: null };

export function useChat(): ChatView {
  const session = useSession();
  const coupleId = REMOTE && session.status === "ready" ? session.coupleId : null;
  useEffect(() => {
    if (coupleId) startRemote(coupleId);
  }, [coupleId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverView);
}

export function clearChatError() {
  set({ error: null });
}

export async function sendMessage(me: Who, body: string, photo?: string) {
  body = body.trim().slice(0, 2000);
  if (!body && !photo) return;
  const msg: Message = { id: uuid(), from: me, body, photo, createdAt: new Date().toISOString(), reactions: {} };
  if (!REMOTE) return saveLocal((list) => [...list, msg]);
  set({ messages: [...view.messages, { ...msg, status: "sending" }] });
  await insertRemote(msg);
}

export async function retryMessage(id: string) {
  const msg = view.messages.find((m) => m.id === id);
  if (!msg || msg.status !== "failed") return;
  patch(id, { status: "sending" });
  await insertRemote(msg);
}

/** 보내기에 실패한 메시지 지우기 (서버엔 없으니 화면에서만) */
export function discardMessage(id: string) {
  set({ messages: view.messages.filter((m) => m.id !== id) });
}

export async function react(me: Who, id: string, emoji: string | null) {
  const msg = view.messages.find((m) => m.id === id);
  if (!msg) return;
  const reactions = { ...msg.reactions };
  if (emoji) reactions[me] = emoji;
  else delete reactions[me];
  if (!REMOTE) return saveLocal((list) => list.map((m) => (m.id === id ? { ...m, reactions } : m)));
  const before = msg.reactions;
  patch(id, { reactions });
  const { error } = await supabase().rpc("react_message", { mid: id, emoji: emoji ?? "" });
  if (error) {
    console.error("[chat] react failed", error);
    patch(id, { reactions: before });
    set({ error: friendly(error, "반응을 남기지 못했어요.") });
  }
}

export async function unsend(id: string) {
  const gone = { deleted: true, body: "", photo: undefined, reactions: {} };
  if (!REMOTE) return saveLocal((list) => list.map((m) => (m.id === id ? { ...m, ...gone } : m)));
  const before = view.messages.find((m) => m.id === id);
  patch(id, gone);
  const { error } = await supabase().rpc("unsend_message", { mid: id });
  if (error) {
    console.error("[chat] unsend failed", error);
    if (before) patch(id, before);
    set({ error: friendly(error, "보내기를 취소하지 못했어요.") });
  }
}

let marking = false;
/** 상대가 보낸 메시지를 모두 읽음으로 (채팅 화면이 보일 때 부른다) */
export async function markRead(me: Who) {
  const unread = view.messages.some((m) => m.from !== me && !m.readAt && !m.status);
  if (!unread || marking) return;
  const now = new Date().toISOString();
  const read = (m: Message) => (m.from !== me && !m.readAt ? { ...m, readAt: now } : m);
  if (!REMOTE) return saveLocal((list) => list.map(read));
  marking = true;
  set({ messages: view.messages.map(read) });
  const { error } = await supabase().rpc("mark_messages_read");
  marking = false;
  if (error) console.error("[chat] mark read failed", error);
}

export async function loadOlder() {
  if (!view.hasMore || view.loadingOlder) return;
  if (!REMOTE) {
    shown += PAGE;
    return showLocal();
  }
  const oldest = view.messages.find((m) => !m.status);
  if (!oldest || !remoteId) return;
  set({ loadingOlder: true });
  const { data, error } = await query(remoteId).lt("created_at", oldest.createdAt);
  if (error) {
    console.error("[chat] load older failed", error);
    return set({ loadingOlder: false, error: friendly(error, "이전 대화를 불러오지 못했어요.") });
  }
  set({ loadingOlder: false, hasMore: data.length === PAGE, messages: merge(view.messages, data.map(fromRow)) });
}

// ───────── 체험 모드 ─────────

/** 처음엔 최근 PAGE 개만 보여 주고 '이전 대화'를 누를 때마다 늘린다 (서버 모드와 같은 모양으로) */
let shown = PAGE;

function readLocal(): Message[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch (e) {
    console.error("[chat] load failed", e);
    return [];
  }
}

function localView(): Partial<ChatView> {
  const all = readLocal();
  return { messages: all.slice(-shown), hasMore: all.length > shown, loading: false };
}

function showLocal() {
  set(localView());
}

function saveLocal(fn: (list: Message[]) => Message[]) {
  const prev = readLocal();
  const next = fn(prev);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.error("[chat] save failed", e);
    return set({ error: "저장 공간이 부족해서 보내지 못했어요. 사진이 많은 메시지를 지우고 다시 시도해 주세요." });
  }
  // 새로 보낸 만큼은 계속 보이게
  shown += Math.max(0, next.length - prev.length);
  showLocal();
}

// ───────── 서버 모드 ─────────

type Row = {
  id: string;
  sender: Who;
  body: string;
  photo: string | null;
  reactions: Partial<Record<Who, string>> | null;
  read_at: string | null;
  deleted: boolean;
  created_at: string;
};

const COLS = "id, sender, body, photo, reactions, read_at, deleted, created_at";

let remoteId: string | null = null;
let channel: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
let subscribed = false;
/** 이 기기에서 채팅 화면을 보고 있는지 (presence 로 상대에게 알림 → 상대는 푸시를 안 보냄) */
let viewing = false;

function fromRow(r: Row): Message {
  return {
    id: r.id,
    from: r.sender,
    body: r.body,
    photo: r.photo ?? undefined,
    createdAt: r.created_at,
    readAt: r.read_at ?? undefined,
    reactions: r.reactions ?? {},
    deleted: r.deleted || undefined,
  };
}

function query(coupleId: string) {
  return supabase().from("messages").select(COLS).eq("couple_id", coupleId).order("created_at", { ascending: false }).limit(PAGE);
}

/** id 로 합치고 시간순 정렬. 보내는 중·실패한 것은 맨 뒤에 둔다 */
function merge(list: Message[], incoming: Message[]): Message[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => {
    if (Boolean(x.status) !== Boolean(y.status)) return x.status ? 1 : -1;
    return x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id);
  });
}

function patch(id: string, p: Partial<Message>) {
  set({ messages: view.messages.map((m) => (m.id === id ? { ...m, ...p } : m)) });
}

function startRemote(coupleId: string) {
  if (remoteId === coupleId) return;
  if (channel) void supabase().removeChannel(channel);
  remoteId = coupleId;
  subscribed = false;
  view = { messages: [], loading: true, hasMore: false, loadingOlder: false, error: null };
  const s = currentSession();
  const who = s.status === "ready" ? s.who : "a";
  const apply = (row: Row) => set({ messages: merge(view.messages, [fromRow(row)]) });
  channel = supabase()
    .channel(`chat-${coupleId}`, { config: { presence: { key: who } } })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `couple_id=eq.${coupleId}` }, (p) => apply(p.new as Row))
    // 읽음 처리는 아직 안 불러온 옛 메시지도 바꾸니, 화면에 있는 것만 반영 (중간이 빈 채로 끼어들지 않게)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `couple_id=eq.${coupleId}` }, (p) => {
      const row = p.new as Row;
      if (view.messages.some((m) => m.id === row.id)) apply(row);
    })
    .subscribe((status) => {
      subscribed = status === "SUBSCRIBED";
      if (subscribed) void track();
    });
  void refresh();
  if (!visibilityHooked) {
    visibilityHooked = true;
    // 폰은 백그라운드에서 실시간 연결이 끊기므로 돌아오면 최근 대화를 다시 받는다
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && remoteId) void refresh();
      void track();
    });
  }
  emitAll();
}

let visibilityHooked = false;

function emitAll() {
  listeners.forEach((l) => l());
}

async function refresh() {
  const id = remoteId;
  if (!id) return;
  const { data, error } = await query(id);
  if (id !== remoteId) return;
  if (error) {
    console.error("[chat] load failed", error);
    return set({ loading: false, error: friendly(error, "대화를 불러오지 못했어요.") });
  }
  const fresh = data.map(fromRow);
  const saved = view.messages.filter((m) => !m.status);
  // 자리를 비운 사이 한 페이지보다 많이 쌓였으면 사이가 비니, 이전 대화는 버리고 최근 것부터 다시
  const gap = fresh.length === PAGE && saved.length > 0 && !fresh.some((m) => saved.some((s) => s.id === m.id));
  set({
    loading: false,
    // 처음이면 더 있는지 여기서 정하고, 다시 받을 땐 이미 불러온 이전 대화를 그대로 둔다
    hasMore: view.loading || gap ? data.length === PAGE : view.hasMore,
    messages: merge(gap ? view.messages.filter((m) => m.status) : view.messages, fresh),
  });
}

async function insertRemote(msg: Message) {
  try {
    let photo = msg.photo;
    if (photo?.startsWith("data:")) {
      const blob = await (await fetch(photo)).blob();
      const path = `${remoteId}/chat/${uid()}.jpg`;
      const { error } = await supabase().storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (error) throw error;
      photo = supabase().storage.from("photos").getPublicUrl(path).data.publicUrl;
      // 다시 보내기 때 또 올리지 않게
      patch(msg.id, { photo });
    }
    const { data, error } = await supabase()
      .from("messages")
      .insert({ id: msg.id, couple_id: remoteId, sender: msg.from, body: msg.body, photo: photo ?? null })
      .select(COLS)
      .single();
    if (error) throw error;
    set({ messages: merge(view.messages.filter((m) => m.id !== msg.id), [fromRow(data as Row)]) });
    void notify(msg.from, msg.body, Boolean(photo));
  } catch (e) {
    console.error("[chat] send failed", e);
    patch(msg.id, { status: "failed" });
    set({ error: friendly(e as { message?: string; code?: string }, "메시지를 보내지 못했어요.") });
  }
}

async function notify(me: Who, body: string, photo: boolean) {
  const s = currentSession();
  if (s.status !== "ready" || !s.partnerJoined || partnerViewing(me)) return;
  const name = currentState()?.profile?.names[me] ?? "연인";
  await sendPush({ title: `💬 ${name}`, body: body || (photo ? "📷 사진을 보냈어요" : ""), url: "/chat", tag: "chat" });
}

function partnerViewing(me: Who): boolean {
  if (!channel || !subscribed) return false;
  const partner = me === "a" ? "b" : "a";
  const states = channel.presenceState<{ viewing?: boolean }>()[partner] ?? [];
  return states.some((s) => s.viewing);
}

async function track() {
  if (!channel || !subscribed) return;
  const on = viewing && document.visibilityState === "visible";
  try {
    await channel.track({ viewing: on });
  } catch (e) {
    console.error("[chat] presence failed", e);
  }
}

/** 채팅 화면이 열리고 닫힐 때 부른다 */
export function setViewing(on: boolean) {
  viewing = on;
  void track();
}

function friendly(e: { message?: string; code?: string }, what: string): string {
  const msg = e.message ?? "";
  // 테이블이 아직 없을 때 (schema.sql 의 채팅 부분을 안 돌림)
  if (e.code === "42P01" || e.code === "PGRST205") {
    return "채팅 저장소가 아직 준비되지 않았어요. supabase/schema.sql 의 '채팅' 부분을 SQL Editor 에서 실행해 주세요.";
  }
  if (msg.includes("Failed to fetch")) return `${what} 인터넷 연결을 확인하고 다시 시도해 주세요.`;
  return `${what} 잠시 뒤에 다시 시도해 주세요.`;
}

/** 서버 id 가 uuid 라서. randomUUID 는 https·localhost 에서만 있어 없으면 직접 만든다 */
function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ───────── 화면용 도우미 ─────────

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 이 기기 시간대 기준 YYYY-MM-DD (날짜 구분선용) */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 2026년 10월 15일 목요일 (올해면 연도 생략) */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? "" : `${d.getFullYear()}년 `;
  return `${year}${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`;
}

/** 오후 3:05 */
export function clockLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 이모지만 1~3개면 말풍선 없이 크게 */
export function isJumboEmoji(text: string): boolean {
  const t = text.trim();
  if (!t || !/^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]+$/u.test(t) || /^[\d#*\s]+$/.test(t)) return false;
  const count = [...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(t.replace(/\s/g, ""))].length;
  return count <= 3;
}
