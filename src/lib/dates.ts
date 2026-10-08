// 날짜는 전부 "YYYY-MM-DD" 문자열로 다루고, 계산할 때만 UTC 자정으로 바꾼다.
// (시간대 때문에 하루씩 밀리는 문제를 피하려고)

const DAY = 86_400_000;

export function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUtc(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

export function today(): string {
  const now = new Date();
  return fromUtc(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY);
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY);
}

export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number);
  // 2/29 → 평년에는 2/28
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return fromUtc(Date.UTC(y + years, m - 1, Math.min(d, last)));
}

/** 사귄 날을 1일로 센다 (한국식) */
export function dayCount(startDate: string, on = today()): number {
  return diffDays(startDate, on) + 1;
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const w = "일월화수목금토"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}.${m}.${d} (${w})`;
}

export function dLabel(days: number): string {
  if (days === 0) return "D-DAY";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}

export type Upcoming = {
  key: string;
  title: string;
  emoji: string;
  date: string;
  /** 오늘부터 남은 날 (0 = 오늘) */
  daysLeft: number;
  auto: boolean;
  anniversaryId?: string;
};

/** 다가오는 기념일: 100일 단위 · N주년(자동) + 직접 등록한 날 */
export function upcoming(
  startDate: string,
  custom: { id: string; title: string; emoji: string; date: string; yearly: boolean }[],
  from = today(),
): Upcoming[] {
  const list: Upcoming[] = [];
  const count = dayCount(startDate, from);

  // 100일 단위: 지금 이후 3개
  let next100 = Math.ceil(count / 100) * 100;
  if (next100 === 0) next100 = 100;
  for (let n = next100; n < next100 + 300; n += 100) {
    const date = addDays(startDate, n - 1);
    list.push({ key: `d${n}`, title: `${n}일`, emoji: n % 1000 === 0 ? "🎉" : "💗", date, daysLeft: diffDays(from, date), auto: true });
  }

  // N주년: 다음 1개
  for (let y = 1; y < 100; y++) {
    const date = addYears(startDate, y);
    if (diffDays(from, date) >= 0) {
      list.push({ key: `y${y}`, title: `${y}주년`, emoji: "💍", date, daysLeft: diffDays(from, date), auto: true });
      break;
    }
  }

  for (const a of custom) {
    let date = a.date;
    if (a.yearly) {
      const [, m, d] = a.date.split("-");
      const thisYear = from.slice(0, 4);
      date = `${thisYear}-${m}-${d}`;
      if (diffDays(from, date) < 0) date = addYears(date, 1);
    }
    const left = diffDays(from, date);
    if (left >= 0) list.push({ key: a.id, title: a.title, emoji: a.emoji, date, daysLeft: left, auto: false, anniversaryId: a.id });
  }

  return list.sort((x, y) => x.daysLeft - y.daysLeft);
}
