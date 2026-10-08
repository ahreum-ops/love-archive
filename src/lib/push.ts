"use client";

// 푸시 알림 (서버 모드에서만).
// - 구독: 이 기기 브라우저를 Web Push 에 등록하고 push_subscriptions 에 저장한다.
// - 보내기: 내가 저장에 성공하면 저장 전후 state 를 비교해 연인에게 알릴 만한 일을 하나 골라 /api/push 로 보낸다.
//   냥이 돌보기·출석처럼 자주 생기는 일은 알리지 않는다.

import { formatDate } from "./dates";
import { josa } from "./josa";
import { isLocked } from "./letters";
import { REMOTE, supabase } from "./supabase";
import type { AppState, Who } from "./types";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PushPayload = { title: string; body: string; url: string; tag?: string };

export type PushStatus = "unsupported" | "denied" | "off" | "on";

export function pushSupported(): boolean {
  return (
    REMOTE && Boolean(VAPID) && typeof window !== "undefined" &&
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

let registration: Promise<ServiceWorkerRegistration> | null = null;
function sw(): Promise<ServiceWorkerRegistration> {
  registration ??= navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return registration;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await sw()).pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushSupported()) return { ok: false, error: "이 브라우저는 알림을 지원하지 않아요. 크롬이나 삼성 인터넷으로 열어 주세요." };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "알림이 차단돼 있어요. 주소창 왼쪽 자물쇠 → 권한 → 알림을 ‘허용’으로 바꿔 주세요." };
  }
  try {
    const reg = await sw();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(VAPID!) }));
    return await saveSubscription(sub);
  } catch (e) {
    console.error("[push] subscribe failed", e);
    return { ok: false, error: "알림을 켜지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요." };
  }
}

export async function disablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sub = await (await sw()).pushManager.getSubscription();
    if (!sub) return { ok: true };
    const { error } = await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    if (error) throw error;
    await sub.unsubscribe();
    return { ok: true };
  } catch (e) {
    console.error("[push] unsubscribe failed", e);
    return { ok: false, error: "알림을 끄지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요." };
  }
}

/** 로그인할 때마다 이 기기 구독을 다시 저장 (다른 계정으로 바뀌었거나 브라우저가 구독을 갱신했을 때) */
export async function refreshPush() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const sub = await (await sw()).pushManager.getSubscription();
    if (sub) await saveSubscription(sub);
  } catch (e) {
    console.error("[push] refresh failed", e);
  }
}

async function saveSubscription(sub: PushSubscription): Promise<{ ok: true } | { ok: false; error: string }> {
  const json = sub.toJSON();
  const { error } = await supabase().rpc("save_push_subscription", {
    sub_endpoint: sub.endpoint,
    sub_p256dh: json.keys?.p256dh,
    sub_auth: json.keys?.auth,
  });
  if (error) {
    console.error("[push] save subscription failed", error);
    return { ok: false, error: "알림 설정을 저장하지 못했어요. 다시 시도해 주세요." };
  }
  return { ok: true };
}

/** 저장 성공 뒤 불린다. 알림이 안 가도 저장은 된 것이라 실패는 기록만 남긴다 */
export async function notifyPartner(before: AppState, after: AppState, me: Who) {
  const payload = describe(before, after, me);
  if (!payload) return;
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("[push] send failed", res.status, await res.text());
  } catch (e) {
    console.error("[push] send failed", e);
  }
}

/** 이번 저장에서 연인에게 알릴 일 하나 (없으면 null) */
export function describe(before: AppState, after: AppState, me: Who): PushPayload | null {
  const name = after.profile?.names[me] ?? "연인";
  const i = josa(name, "이", "가");
  const isNew = <T extends { id: string }>(list: T[], prev: T[]) => {
    const ids = new Set(prev.map((x) => x.id));
    return list.filter((x) => !ids.has(x.id));
  };
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));

  // 편지
  const letter = isNew(after.letters, before.letters).find((l) => l.from === me);
  if (letter) {
    return isLocked(letter)
      ? { title: "🔒 예약 편지가 도착했어요", body: `${i} ${formatDate(letter.openAt!)}에 열어볼 수 있는 편지를 남겼어요`, url: "/letters", tag: "letter" }
      : { title: `💌 ${i} 편지를 보냈어요`, body: letter.title || "지금 열어볼까요?", url: "/letters", tag: "letter" };
  }
  const prevLetters = byId(before.letters);
  const read = after.letters.find((l) => l.from !== me && l.readAt && !prevLetters.get(l.id)?.readAt);
  if (read) return { title: `💌 ${i} 편지를 읽었어요`, body: read.title || "내 마음이 잘 전해졌을까요?", url: "/letters", tag: "letter-read" };

  // 버킷리스트
  const prevBucket = byId(before.bucket);
  const done = after.bucket.find((b) => b.doneAt && !prevBucket.get(b.id)?.doneAt && prevBucket.has(b.id));
  if (done) return { title: `🎉 버킷리스트 완료!`, body: `${i} ‘${done.emoji} ${done.title}’ 완료로 표시했어요`, url: "/bucket", tag: "bucket" };
  const wish = isNew(after.bucket, before.bucket)[0];
  if (wish) return { title: `✨ 하고 싶은 게 생겼대요`, body: `${i} 버킷리스트에 ‘${wish.emoji} ${wish.title}’ 담았어요`, url: "/bucket", tag: "bucket" };

  // 우리의 장소
  const place = isNew(after.places, before.places)[0];
  if (place) return { title: `📍 새 장소가 생겼어요`, body: `${i} ‘${place.name}’ 다녀온 기록을 남겼어요`, url: "/places", tag: "place" };
  const prevPlaces = byId(before.places);
  const reviewed = after.places.find((p) => p.reviews[me] && !prevPlaces.get(p.id)?.reviews[me]);
  if (reviewed) return { title: `⭐ ${i} 후기를 남겼어요`, body: `‘${reviewed.name}’ 어땠는지 확인해 볼까요?`, url: "/places", tag: "place" };

  // 기념일
  const day = isNew(after.anniversaries, before.anniversaries)[0];
  if (day) return { title: `${day.emoji} 기념일이 추가됐어요`, body: `${i} ‘${day.title}’ (${formatDate(day.date)}) 챙겨 뒀어요`, url: "/days", tag: "day" };

  // 커플 사진
  if (after.profile?.photo && after.profile.photo !== before.profile?.photo) {
    return { title: "📸 커플 사진이 바뀌었어요", body: `${i} 홈 사진을 새로 골랐어요`, url: "/", tag: "photo" };
  }

  // 놀이: 내가 새로 답한 것 중 상대도 이미 답했으면 결과가 열린다
  const partner: Who = me === "a" ? "b" : "a";
  const answered = (a: AppState["balance"] | AppState["survey"], b: typeof a) =>
    Object.keys(a).filter((q) => a[q]?.[me] !== undefined && b[q]?.[me] === undefined);
  const balance = answered(after.balance, before.balance);
  if (balance.length) {
    const both = balance.some((q) => after.balance[q]?.[partner] !== undefined);
    return { title: "⚖️ 밸런스 게임", body: both ? `${i} 답했어요! 우리 결과를 확인해 봐요` : `${i} 밸런스 게임을 하고 있어요`, url: "/play/balance", tag: "balance" };
  }
  const survey = answered(after.survey, before.survey);
  if (survey.length) {
    const both = survey.some((q) => after.survey[q]?.[partner] !== undefined);
    return { title: "📝 취향 설문", body: both ? `${i} 답했어요! 우리 취향을 비교해 봐요` : `${i} 취향 설문에 답하고 있어요`, url: "/play/survey", tag: "survey" };
  }

  // 새 냥이 (돌보기는 너무 잦아서 안 알림)
  const cat = isNew(after.cats, before.cats)[0];
  if (cat) return { title: "🐱 새 식구가 왔어요", body: `${i} ‘${cat.name}’ 데려왔어요`, url: "/", tag: "cat" };

  return null;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
