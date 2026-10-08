"use client";

// 우리집 냥이 키우기: 배고픔·물·똥은 저장하지 않고 '마지막으로 챙긴 시각'에서 계산한다.
// 그래서 앱을 안 열어둔 동안에도 시간이 흐른 만큼 배가 고파진다.

import { useSyncExternalStore } from "react";
import { addDays, today } from "./dates";
import { josa } from "./josa";
import { uid, update, type SaveResult } from "./store";
import type { AppState, Cat, CatAction, CatLook, Who } from "./types";

const HOUR = 3_600_000;
const HUNGER_HOURS = 12; // 밥 먹고 12시간이면 배고픔 0
const THIRST_HOURS = 10;
const POOP_EVERY_HOURS = 6;
export const MAX_POOP = 3;
export const PET_LIMIT = 5;
/** 이 아래로 떨어져야 밥·물을 더 줄 수 있다 */
const REFILL_BELOW = 80;
const LOG_KEEP = 40;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function fullness(cat: Cat, now: number) {
  return clamp(100 - ((now - cat.fedAt) / (HUNGER_HOURS * HOUR)) * 100);
}
export function water(cat: Cat, now: number) {
  return clamp(100 - ((now - cat.wateredAt) / (THIRST_HOURS * HOUR)) * 100);
}
export function poops(cat: Cat, now: number) {
  return Math.max(0, Math.min(MAX_POOP, Math.floor((now - cat.cleanedAt) / (POOP_EVERY_HOURS * HOUR))));
}
export function petsToday(cat: Cat, day = today()) {
  return cat.petDay === day ? (cat.petCount ?? 0) : 0;
}

/** 지금 제일 급한 것 (방에서 말풍선으로 보여줌) */
export function urgent(cat: Cat, now: number): string | null {
  if (poops(cat, now) >= 2) return "💩";
  if (fullness(cat, now) < 25) return "🍚";
  if (water(cat, now) < 25) return "💧";
  return null;
}

/** 새벽 1시 ~ 7시는 쿨쿨 */
export function isSleepTime(now: number) {
  const h = new Date(now).getHours();
  return h >= 1 && h < 7;
}

// ── 레벨 ────────────────────────────────────────────

const needFor = (level: number) => 40 + 20 * (level - 1);

export function levelInfo(xp: number) {
  let level = 1;
  let rest = xp;
  while (rest >= needFor(level)) rest -= needFor(level++);
  return { level, into: rest, need: needFor(level) };
}

export const STAGES = [
  { from: 1, label: "아기 고양이", emoji: "🍼", scale: 0.5 },
  { from: 4, label: "꼬마 고양이", emoji: "🧶", scale: 0.66 },
  { from: 8, label: "청소년 고양이", emoji: "🎀", scale: 0.84 },
  { from: 12, label: "어른 고양이", emoji: "👑", scale: 1 },
] as const;

export function stageOf(level: number) {
  let i = 0;
  STAGES.forEach((s, idx) => level >= s.from && (i = idx));
  return { ...STAGES[i], index: i, next: STAGES[i + 1] };
}

// ── 돌보기 ──────────────────────────────────────────

/** 지금 이 행동을 못 하는 이유. 할 수 있으면 null */
export function blocker(cat: Cat, action: Exclude<CatAction, "checkin">, now: number): string | null {
  switch (action) {
    case "feed":
      return fullness(cat, now) >= REFILL_BELOW ? "아직 배불러요" : null;
    case "water":
      return water(cat, now) >= REFILL_BELOW ? "물이 아직 넉넉해요" : null;
    case "clean":
      return poops(cat, now) === 0 ? "화장실이 깨끗해요" : null;
    case "pet":
      return petsToday(cat) >= PET_LIMIT ? "오늘은 충분히 쓰다듬었어요" : null;
  }
}

const REWARD: Record<Exclude<CatAction, "checkin">, { xp: number; affection: number }> = {
  feed: { xp: 10, affection: 1 },
  water: { xp: 8, affection: 1 },
  clean: { xp: 5, affection: 1 }, // 똥 하나당
  pet: { xp: 3, affection: 2 },
};

export type ActResult = SaveResult & { xp?: number; affection?: number; levelUp?: number };

export function careFor(catId: string, action: Exclude<CatAction, "checkin">, by: Who): ActResult {
  const now = Date.now();
  let gained = { xp: 0, affection: 0, levelUp: undefined as number | undefined };
  const r = update((s) => {
    const cat = s.cats.find((c) => c.id === catId);
    if (!cat || blocker(cat, action, now)) return s;
    const times = action === "clean" ? poops(cat, now) : 1;
    const xp = REWARD[action].xp * times;
    const affection = Math.min(100, cat.affection + REWARD[action].affection) - cat.affection;
    const next: Cat = {
      ...cat,
      xp: cat.xp + xp,
      affection: cat.affection + affection,
      ...(action === "feed" && { fedAt: now }),
      ...(action === "water" && { wateredAt: now }),
      ...(action === "clean" && { cleanedAt: now }),
      ...(action === "pet" && { petDay: today(), petCount: petsToday(cat) + 1 }),
    };
    const before = levelInfo(cat.xp).level;
    const after = levelInfo(next.xp).level;
    gained = { xp, affection, levelUp: after > before ? after : undefined };
    return {
      ...s,
      cats: s.cats.map((c) => (c.id === catId ? next : c)),
      catLog: [{ at: now, by, catId, action, xp }, ...s.catLog].slice(0, LOG_KEEP),
    };
  });
  return r.ok ? { ...r, ...gained } : r;
}

/** 하루 첫 접속 보상: 사람마다 하루 한 번, 모든 냥이 애정도 +5 · 경험치 +10 (7일 연속이면 +20 더) */
export function checkIn(state: AppState, by: Who): (SaveResult & { streak?: number; xp?: number }) | null {
  const day = today();
  const prev = state.catCheckin[by];
  if (!state.cats.length || prev?.date === day) return null;
  const streak = prev?.date === addDays(day, -1) ? prev.streak + 1 : 1;
  const xp = 10 + (streak % 7 === 0 ? 20 : 0);
  const now = Date.now();
  const r = update((s) => ({
    ...s,
    cats: s.cats.map((c) => ({ ...c, xp: c.xp + xp, affection: Math.min(100, c.affection + 5) })),
    catCheckin: { ...s.catCheckin, [by]: { date: day, streak } },
    catLog: [{ at: now, by, action: "checkin" as const, xp }, ...s.catLog].slice(0, LOG_KEEP),
  }));
  return { ...r, streak, xp };
}

export function adoptCats(names: Record<CatLook, string>): SaveResult {
  const now = Date.now();
  // 처음엔 살짝 배고프고 똥 하나 있는 상태로 시작해서 바로 돌봐줄 수 있게
  const base = { xp: 0, affection: 10, fedAt: now - 6 * HOUR, wateredAt: now - 5 * HOUR, cleanedAt: now - 6 * HOUR, adoptedAt: today() };
  return update((s) => ({
    ...s,
    cats: [
      { ...base, id: uid(), name: names.tabby.trim(), look: "tabby" },
      { ...base, id: uid(), name: names.patch.trim(), look: "patch" },
    ],
  }));
}

export function renameCat(catId: string, name: string): SaveResult {
  return update((s) => ({ ...s, cats: s.cats.map((c) => (c.id === catId ? { ...c, name: name.trim() } : c)) }));
}

export function logText(action: CatAction, by: string, cat?: string) {
  const who = josa(by, "이", "가");
  switch (action) {
    case "feed":
      return `${who} ${josa(cat ?? "", "이에게", "에게")} 밥을 줬어요`;
    case "water":
      return `${who} ${josa(cat ?? "", "이에게", "에게")} 물을 갈아줬어요`;
    case "clean":
      return `${who} ${josa(cat ?? "", "이", "")} 화장실을 치웠어요`;
    case "pet":
      return `${who} ${josa(cat ?? "", "이를", "를")} 쓰다듬었어요`;
    case "checkin":
      return `${who} 냥이들 보러 왔어요`;
  }
}

// ── 시계 ────────────────────────────────────────────
// 화면에 보이는 배고픔 등이 저절로 줄어들도록 10초마다 다시 그린다.

const TICK = 10_000;
function subscribeClock(fn: () => void) {
  const t = setInterval(fn, TICK);
  return () => clearInterval(t);
}
const clockSnapshot = () => Math.floor(Date.now() / TICK) * TICK;

export function useNow(): number {
  return useSyncExternalStore(subscribeClock, clockSnapshot, () => 0);
}
