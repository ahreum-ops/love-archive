"use client";

// 푸시 알림 (서버 모드에서만).
// - 구독: 이 기기 브라우저를 Web Push 에 등록하고 push_subscriptions 에 저장한다.
// - 보내기: 내가 저장에 성공하면 저장 전후 state 를 비교해 내가 한 일을 하나 골라 /api/push 로 보낸다.
//   추가·수정·삭제·냥이 돌보기·출석까지 모든 행동을 알린다. 같은 종류는 tag 로 묶여 알림이 쌓이지 않는다.

import { timeLabel } from "./calendar";
import { logText } from "./cats";
import { formatDate } from "./dates";
import { josa } from "./josa";
import { isLocked } from "./letters";
import { REMOTE, supabase } from "./supabase";
import { registerSW } from "./sw";
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

export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await registerSW()).pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushSupported()) return { ok: false, error: "이 브라우저는 알림을 지원하지 않아요. 크롬이나 삼성 인터넷으로 열어 주세요." };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "알림이 차단돼 있어요. 주소창 왼쪽 자물쇠 → 권한 → 알림을 ‘허용’으로 바꿔 주세요." };
  }
  try {
    const reg = await registerSW();
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
    const sub = await (await registerSW()).pushManager.getSubscription();
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
    const sub = await (await registerSW()).pushManager.getSubscription();
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

/** 저장 성공 뒤 불린다 */
export async function notifyPartner(before: AppState, after: AppState, me: Who) {
  const payload = describe(before, after, me);
  if (payload) await sendPush(payload);
}

/** 연인 기기들로 알림 보내기. 알림이 안 가도 저장은 된 것이라 실패는 기록만 남긴다 */
export async function sendPush(payload: PushPayload) {
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

/**
 * 이번 저장에서 연인에게 알릴 일 하나 (바뀐 게 없으면 null).
 * before → after 는 내 변경 하나만 적용한 결과라서, 달라진 건 모두 내가 한 일이다.
 * 알맞은 문구가 없는 변경도 맨 끝에서 한 번은 알린다 — 모든 행동이 연인에게 전해지게.
 */
export function describe(before: AppState, after: AppState, me: Who): PushPayload | null {
  const names = after.profile?.names ?? before.profile?.names;
  const name = names?.[me] ?? "연인";
  const i = josa(name, "이", "가");
  const isNew = <T extends { id: string }>(list: T[], prev: T[]) => {
    const ids = new Set(prev.map((x) => x.id));
    return list.filter((x) => !ids.has(x.id));
  };
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  /** 양쪽에 다 있는데 내용이 바뀐 것 */
  const edited = <T extends { id: string }>(list: T[], prev: T[]) => {
    const old = byId(prev);
    return list.filter((x) => old.has(x.id) && !same(old.get(x.id), x));
  };

  // 편지
  const letter = isNew(after.letters, before.letters)[0];
  if (letter) {
    return isLocked(letter)
      ? { title: "🔒 예약 편지가 도착했어요", body: `${i} ${formatDate(letter.openAt!)}에 열어볼 수 있는 편지를 남겼어요`, url: "/letters", tag: "letter" }
      : { title: `💌 ${i} 편지를 보냈어요`, body: letter.title || "지금 열어볼까요?", url: "/letters", tag: "letter" };
  }
  const prevLetters = byId(before.letters);
  const read = after.letters.find((l) => l.readAt && !prevLetters.get(l.id)?.readAt);
  if (read) return { title: `💌 ${i} 편지를 읽었어요`, body: read.title || "내 마음이 잘 전해졌을까요?", url: "/letters", tag: "letter-read" };
  const torn = isNew(before.letters, after.letters)[0];
  if (torn) return { title: "💌 편지가 정리됐어요", body: `${i} ${torn.title ? `‘${torn.title}’ ` : ""}편지를 지웠어요`, url: "/letters", tag: "letter" };
  const rewritten = edited(after.letters, before.letters)[0];
  if (rewritten) return { title: "💌 편지가 고쳐졌어요", body: `${i} ${rewritten.title ? `‘${rewritten.title}’ ` : ""}편지를 고쳤어요`, url: "/letters", tag: "letter" };

  // 버킷리스트
  const prevBucket = byId(before.bucket);
  const done = after.bucket.find((b) => b.doneAt && prevBucket.has(b.id) && !prevBucket.get(b.id)!.doneAt);
  if (done) return { title: "🎉 버킷리스트 완료!", body: `${i} ‘${done.emoji} ${done.title}’ 완료로 표시했어요`, url: "/bucket", tag: "bucket" };
  const undone = after.bucket.find((b) => !b.doneAt && prevBucket.get(b.id)?.doneAt);
  if (undone) return { title: "🪣 버킷리스트", body: `${i} ‘${undone.emoji} ${undone.title}’ 다시 하고 싶은 일로 돌려놨어요`, url: "/bucket", tag: "bucket" };
  const wish = isNew(after.bucket, before.bucket)[0];
  if (wish) return { title: "✨ 하고 싶은 게 생겼대요", body: `${i} 버킷리스트에 ‘${wish.emoji} ${wish.title}’ 담았어요`, url: "/bucket", tag: "bucket" };
  const dropped = isNew(before.bucket, after.bucket)[0];
  if (dropped) return { title: "🪣 버킷리스트", body: `${i} ‘${dropped.emoji} ${dropped.title}’ 뺐어요`, url: "/bucket", tag: "bucket" };
  const bucketEdit = edited(after.bucket, before.bucket)[0];
  if (bucketEdit) {
    const what = bucketEdit.photo !== prevBucket.get(bucketEdit.id)?.photo ? "사진을 바꿨어요" : "기록을 고쳤어요";
    return { title: "🪣 버킷리스트", body: `${i} ‘${bucketEdit.emoji} ${bucketEdit.title}’ ${what}`, url: "/bucket", tag: "bucket" };
  }

  // 우리의 장소
  const place = isNew(after.places, before.places)[0];
  if (place) return { title: "📍 새 장소가 생겼어요", body: `${i} ‘${place.name}’ 다녀온 기록을 남겼어요`, url: "/places", tag: "place" };
  const prevPlaces = byId(before.places);
  const reviewed = after.places.find((p) => p.reviews[me] && prevPlaces.has(p.id) && !prevPlaces.get(p.id)!.reviews[me]);
  if (reviewed) return { title: `⭐ ${i} 후기를 남겼어요`, body: `‘${reviewed.name}’ 어땠는지 확인해 볼까요?`, url: "/places", tag: "place" };
  const rereviewed = after.places.find((p) => prevPlaces.has(p.id) && !same(p.reviews[me], prevPlaces.get(p.id)!.reviews[me]));
  if (rereviewed) {
    return rereviewed.reviews[me]
      ? { title: `⭐ ${i} 후기를 고쳤어요`, body: `‘${rereviewed.name}’ 후기가 바뀌었어요`, url: "/places", tag: "place" }
      : { title: "📍 우리의 장소", body: `${i} ‘${rereviewed.name}’ 후기를 지웠어요`, url: "/places", tag: "place" };
  }
  const gonePlace = isNew(before.places, after.places)[0];
  if (gonePlace) return { title: "📍 우리의 장소", body: `${i} ‘${gonePlace.name}’ 기록을 지웠어요`, url: "/places", tag: "place" };
  const placeEdit = edited(after.places, before.places)[0];
  if (placeEdit) return { title: "📍 우리의 장소", body: `${i} ‘${placeEdit.name}’ 기록을 고쳤어요`, url: "/places", tag: "place" };

  // 사진첩
  const shots = isNew(after.photos, before.photos);
  if (shots.length) {
    const what = shots[0].caption ? `‘${shots[0].caption}’ ` : "";
    return { title: "📸 사진첩에 사진이 올라왔어요", body: `${i} ${what}사진 ${shots.length}장을 올렸어요`, url: "/album", tag: "album" };
  }
  const goneShots = isNew(before.photos, after.photos);
  if (goneShots.length) return { title: "📸 사진첩", body: `${i} 사진 ${goneShots.length}장을 지웠어요`, url: "/album", tag: "album" };
  const shotEdit = edited(after.photos, before.photos)[0];
  if (shotEdit) {
    const what = shotEdit.caption ? `‘${shotEdit.caption}’` : "사진 설명";
    return { title: "📸 사진첩", body: `${i} ${josa(what, "으로", "로")} 고쳤어요`, url: "/album", tag: "album" };
  }

  // 캘린더 일정
  const when = (p: AppState["plans"][number]) => `${formatDate(p.date)}${p.time ? ` ${timeLabel(p.time)}` : ""}`;
  const plan = isNew(after.plans, before.plans)[0];
  if (plan) return { title: `${plan.emoji} 새 일정이 생겼어요`, body: `${i} ‘${plan.title}’ (${when(plan)}) 일정을 추가했어요`, url: "/days", tag: "plan" };
  const planEdit = edited(after.plans, before.plans)[0];
  if (planEdit) return { title: `${planEdit.emoji} 일정이 바뀌었어요`, body: `${i} ‘${planEdit.title}’ (${when(planEdit)}) 일정을 고쳤어요`, url: "/days", tag: "plan" };
  const gonePlan = isNew(before.plans, after.plans)[0];
  if (gonePlan) return { title: `${gonePlan.emoji} 일정이 취소됐어요`, body: `${i} ‘${gonePlan.title}’ (${when(gonePlan)}) 일정을 지웠어요`, url: "/days", tag: "plan" };

  // 기념일
  const day = isNew(after.anniversaries, before.anniversaries)[0];
  if (day) return { title: `${day.emoji} 기념일이 추가됐어요`, body: `${i} ‘${day.title}’ (${formatDate(day.date)}) 챙겨 뒀어요`, url: "/days", tag: "day" };
  const dayEdit = edited(after.anniversaries, before.anniversaries)[0];
  if (dayEdit) return { title: `${dayEdit.emoji} 기념일이 바뀌었어요`, body: `${i} ‘${dayEdit.title}’ (${formatDate(dayEdit.date)}) 고쳤어요`, url: "/days", tag: "day" };
  const goneDay = isNew(before.anniversaries, after.anniversaries)[0];
  if (goneDay) return { title: `${goneDay.emoji} 기념일`, body: `${i} ‘${goneDay.title}’ 기념일을 지웠어요`, url: "/days", tag: "day" };

  // 프로필 (커플 사진·이름·사귄 날)
  const pa = after.profile;
  const pb = before.profile;
  if (pa?.photo !== pb?.photo) {
    return pa?.photo
      ? { title: "📸 커플 사진이 바뀌었어요", body: `${i} 홈 사진을 새로 골랐어요`, url: "/", tag: "photo" }
      : { title: "📸 커플 사진", body: `${i} 홈 사진을 내렸어요`, url: "/", tag: "photo" };
  }
  if (pa && pb && pa.startDate !== pb.startDate) {
    return { title: "💞 사귄 날이 바뀌었어요", body: `${i} 사귄 날을 ${formatDate(pa.startDate)}로 고쳤어요`, url: "/days", tag: "profile" };
  }
  if (pa && pb && !same(pa.names, pb.names)) {
    return { title: "💞 이름이 바뀌었어요", body: `${i} 우리 이름을 ${pa.names.a}·${josa(pa.names.b, "으로", "로")} 고쳤어요`, url: "/", tag: "profile" };
  }

  // 놀이: 내가 새로 답한 것 중 상대도 이미 답했으면 결과가 열린다
  const partner: Who = me === "a" ? "b" : "a";
  const answered = (a: AppState["balance"] | AppState["survey"], b: typeof a) =>
    Object.keys(a).filter((q) => a[q]?.[me] !== undefined && b[q]?.[me] !== a[q]?.[me]);
  const cancelled = (a: AppState["balance"] | AppState["survey"], b: typeof a) =>
    Object.keys(b).filter((q) => b[q]?.[me] !== undefined && a[q]?.[me] === undefined);
  const balance = answered(after.balance, before.balance);
  if (balance.length) {
    const both = balance.some((q) => after.balance[q]?.[partner] !== undefined);
    return { title: "⚖️ 밸런스 게임", body: both ? `${i} 답했어요! 우리 결과를 확인해 봐요` : `${i} 밸런스 게임을 하고 있어요`, url: "/play/balance", tag: "balance" };
  }
  if (cancelled(after.balance, before.balance).length) {
    return { title: "⚖️ 밸런스 게임", body: `${i} 답을 다시 고민하고 있어요`, url: "/play/balance", tag: "balance" };
  }
  const survey = answered(after.survey, before.survey);
  if (survey.length) {
    const both = survey.some((q) => after.survey[q]?.[partner] !== undefined);
    return { title: "📝 취향 설문", body: both ? `${i} 답했어요! 우리 취향을 비교해 봐요` : `${i} 취향 설문에 답하고 있어요`, url: "/play/survey", tag: "survey" };
  }
  if (cancelled(after.survey, before.survey).length) {
    return { title: "📝 취향 설문", body: `${i} 답을 다시 고민하고 있어요`, url: "/play/survey", tag: "survey" };
  }

  // 냥이
  const cat = isNew(after.cats, before.cats);
  if (cat.length) return { title: "🐱 새 식구가 왔어요", body: `${i} ${cat.map((c) => `‘${c.name}’`).join(", ")} 데려왔어요`, url: "/", tag: "cat" };
  const prevCats = byId(before.cats);
  const renamed = after.cats.find((c) => prevCats.has(c.id) && prevCats.get(c.id)!.name !== c.name);
  if (renamed) return { title: "🐱 냥이 이름이 바뀌었어요", body: `${i} ‘${prevCats.get(renamed.id)!.name}’ 이름을 ${josa(renamed.name, "으로", "로")} 바꿨어요`, url: "/", tag: "cat" };
  const lastLog = before.catLog[0];
  const care = after.catLog.find((l) => l.by === me && (!lastLog || l.at > lastLog.at));
  if (care) {
    const catName = after.cats.find((c) => c.id === care.catId)?.name;
    return { title: care.action === "checkin" ? "🐾 출석했어요" : "🐾 냥이 돌보기", body: logText(care.action, name, catName), url: "/", tag: "cat" };
  }

  // 위에서 못 고른 그 밖의 변경
  if (!same({ ...after, profile: null }, { ...before, profile: null })) {
    return { title: "💞 러브아카이브", body: `${i} 우리 기록을 고쳤어요`, url: "/", tag: "etc" };
  }
  return null;
}

function same(x: unknown, y: unknown): boolean {
  return JSON.stringify(x) === JSON.stringify(y);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
