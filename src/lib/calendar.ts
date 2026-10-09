// 공유 캘린더: 하루에 보여 줄 것 = 일정 + 기념일(자동 100일·주년, 직접 등록) + 그날의 추억(버킷 완료·장소·사진첩)

import { addYears, dayCount, fromUtc, toUtc } from "./dates";
import type { AppState, Plan, Who } from "./types";

export type DayMark = { key: string; emoji: string; title: string };
export type Memory = DayMark & { href: string };

export type DayEvents = { plans: Plan[]; marks: DayMark[]; memories: Memory[] };

/** 그 달 달력에 그릴 날짜 (일요일 시작, 앞뒤 달 빈칸은 null) */
export function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = Date.UTC(y, m - 1, 1);
  const lead = new Date(first).getUTCDay();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= last; d++) cells.push(fromUtc(Date.UTC(y, m - 1, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** "2026-10" ± n 달 */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return fromUtc(Date.UTC(y, m - 1 + n, 1)).slice(0, 7);
}

/** date 가 base 의 N주년(N ≥ 1, 2/29 는 평년 2/28)인지 */
function yearsAfter(base: string, date: string): number | null {
  const n = Number(date.slice(0, 4)) - Number(base.slice(0, 4));
  return n >= 1 && addYears(base, n) === date ? n : null;
}

export function inPlan(p: Plan, date: string): boolean {
  return p.endDate ? p.date <= date && date <= p.endDate : p.date === date;
}

export function dayEvents(s: AppState, date: string): DayEvents {
  const start = s.profile!.startDate;
  const marks: DayMark[] = [];
  if (date === start) marks.push({ key: "start", emoji: "💕", title: "우리가 사귄 날" });
  const n = dayCount(start, date);
  if (n > 1 && n % 100 === 0) marks.push({ key: `d${n}`, emoji: n % 1000 === 0 ? "🎉" : "💗", title: `${n}일` });
  const y = yearsAfter(start, date);
  if (y) marks.push({ key: `y${y}`, emoji: "💍", title: `${y}주년` });
  for (const a of s.anniversaries) {
    if (a.date === date || (a.yearly && yearsAfter(a.date, date))) marks.push({ key: a.id, emoji: a.emoji, title: a.title });
  }

  const memories: Memory[] = [
    ...s.bucket.filter((b) => b.doneAt === date).map((b) => ({ key: `b-${b.id}`, emoji: b.emoji, title: `${b.title} 완료`, href: "/bucket" })),
    ...s.places.filter((p) => p.visitedAt === date).map((p) => ({ key: `p-${p.id}`, emoji: "📍", title: p.name, href: "/places" })),
  ];
  const shots = s.photos.filter((p) => p.date === date).length;
  if (shots) memories.push({ key: "photos", emoji: "📸", title: `사진 ${shots}장`, href: "/album" });

  const plans = s.plans.filter((p) => inPlan(p, date)).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  return { plans, marks, memories };
}

/** 오늘 이후 일정 (진행 중인 여러 날 일정 포함), 가까운 순 */
export function upcomingPlans(plans: Plan[], from: string): Plan[] {
  return plans
    .filter((p) => (p.endDate ?? p.date) >= from)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}

/** "19:30" → "오후 7:30" */
export function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : "시"}`;
}

/** 일정 주인 색: a·b 각자 · 같이 */
export const WHO_STYLE: Record<Who | "both", { dot: string; chip: string }> = {
  a: { dot: "bg-pink", chip: "bg-blush text-rose" },
  b: { dot: "bg-violet", chip: "bg-lilac text-violet" },
  both: { dot: "bg-rose", chip: "bg-rose text-white" },
};

export function whoLabel(who: Who | "both", names: Record<Who, string>): string {
  return who === "both" ? "같이" : names[who];
}

/** 여러 날 일정 길이 */
export function planDays(p: Plan): number {
  return p.endDate ? Math.round((toUtc(p.endDate) - toUtc(p.date)) / 86_400_000) + 1 : 1;
}
