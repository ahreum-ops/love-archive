"use client";

import Link from "next/link";
import { useState } from "react";
import PlanSheet from "@/components/plan-sheet";
import { Banner, Button, Card, Field, PageHeader, Sheet, inputClass } from "@/components/ui";
import { dayEvents, monthCells, planDays, shiftMonth, timeLabel, upcomingPlans, WHO_STYLE, whoLabel } from "@/lib/calendar";
import { dayCount, dLabel, diffDays, formatDate, today, upcoming } from "@/lib/dates";
import { uid, update, useAppState } from "@/lib/store";
import type { Anniversary, Plan } from "@/lib/types";

const EMOJIS = ["🎂", "💐", "💍", "🥂", "✈️", "🏠", "🐾", "🎓", "⭐", "💌"];

export default function DaysPage() {
  const state = useAppState();
  const [editing, setEditing] = useState<Anniversary | "new" | null>(null);
  // today() 는 서버 렌더링 중에 부를 수 없어서, 처음엔 비워 두고 아래에서 오늘로 채운다
  const [picked, setSelected] = useState<string | null>(null);
  const [shownMonth, setMonth] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState<Plan | "new" | null>(null);
  if (!state?.profile) return null;

  const { profile, anniversaries } = state;
  const list = upcoming(profile.startDate, anniversaries);
  const count = dayCount(profile.startDate);
  const now = today();
  const selected = picked ?? now;
  const month = shownMonth ?? selected.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const cells = monthCells(month);
  const day = dayEvents(state, selected);
  const selCount = dayCount(profile.startDate, selected);
  const next = upcomingPlans(state.plans, now).slice(0, 5);

  function pick(date: string) {
    setSelected(date);
    setMonth(date.slice(0, 7));
  }

  return (
    <div>
      <PageHeader
        title="캘린더"
        sub={`오늘은 함께한 지 ${count.toLocaleString()}일째`}
        right={
          <button
            onClick={() => setPlanOpen("new")}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-pink to-rose text-2xl text-white shadow-soft"
            aria-label="일정 추가"
          >
            +
          </button>
        }
      />

      {/* 달력 */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="press h-9 w-9 rounded-full bg-cream text-lg text-ink" aria-label="이전 달">
            ‹
          </button>
          <button onClick={() => pick(now)} className="font-cute text-lg text-ink" aria-label="오늘로">
            {y}년 {m}월{month !== now.slice(0, 7) && <span className="ml-1.5 align-middle text-xs text-rose">오늘로</span>}
          </button>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="press h-9 w-9 rounded-full bg-cream text-lg text-ink" aria-label="다음 달">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-ink-soft">
          {"일월화수목금토".split("").map((w, i) => (
            <span key={w} className={`pb-1.5 ${i === 0 ? "text-rose" : i === 6 ? "text-violet" : ""}`}>
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`e${i}`} />;
            const ev = dayEvents(state, d);
            const isSel = d === selected;
            const isToday = d === now;
            const wd = i % 7;
            return (
              <button
                key={d}
                onClick={() => setSelected(d)}
                className={`press flex h-14 flex-col items-center rounded-2xl pt-1 ${isSel ? "bg-blush ring-1 ring-pink" : ""}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] ${
                    isToday ? "bg-rose font-cute text-white" : wd === 0 ? "text-rose" : wd === 6 ? "text-violet" : "text-ink"
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
                <span className="h-3.5 text-[10px] leading-[14px]">{ev.marks[0]?.emoji}</span>
                <span className="flex h-1.5 gap-0.5">
                  {ev.plans.slice(0, 3).map((p) => (
                    <span key={p.id} className={`h-1.5 w-1.5 rounded-full ${WHO_STYLE[p.who].dot}`} />
                  ))}
                  {ev.memories.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-ink-soft/40" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
          {(["both", "a", "b"] as const).map((w) => (
            <span key={w} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${WHO_STYLE[w].dot}`} />
              {whoLabel(w, profile.names)}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-soft/40" />
            추억
          </span>
        </div>
      </Card>

      {/* 고른 날 */}
      <Card className="mt-3">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-cute text-lg">{formatDate(selected)}</h2>
          <span className="text-xs text-ink-soft">
            {selCount >= 1 ? `${selCount.toLocaleString()}일째` : ""}
            {selected !== now && ` · ${dLabel(diffDays(now, selected))}`}
          </span>
        </div>
        {day.marks.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {day.marks.map((mk) => (
              <span key={mk.key} className="rounded-full bg-gradient-to-r from-blush to-lilac px-3 py-1 font-cute text-sm text-rose">
                {mk.emoji} {mk.title}
              </span>
            ))}
          </div>
        )}
        {day.plans.length === 0 && day.memories.length === 0 ? (
          <button onClick={() => setPlanOpen("new")} className="press w-full rounded-2xl bg-cream px-4 py-4 text-sm text-ink-soft">
            아직 일정이 없어요. <span className="font-cute text-rose">+ 이 날 일정 추가</span>
          </button>
        ) : (
          <ul className="space-y-2">
            {day.plans.map((p) => (
              <li key={p.id}>
                <PlanRow plan={p} names={profile.names} onClick={() => setPlanOpen(p)} />
              </li>
            ))}
            {day.memories.map((mm) => (
              <li key={mm.key}>
                <Link href={mm.href} className="press flex items-center gap-3 rounded-2xl bg-mint/60 px-3 py-2.5">
                  <span className="text-xl">{mm.emoji}</span>
                  <span className="flex-1 text-[15px]">{mm.title}</span>
                  <span className="text-xs text-ink-soft">추억 ›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 다가오는 일정 */}
      {next.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 px-1 font-cute text-lg">다가오는 일정</h2>
          <ul className="space-y-2">
            {next.map((p) => (
              <li key={p.id}>
                <PlanRow plan={p} names={profile.names} onClick={() => pick(p.date < now ? now : p.date)} showDate />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 기념일 */}
      <div className="mb-2 mt-6 flex items-center justify-between px-1">
        <h2 className="font-cute text-lg">다가오는 기념일</h2>
        <button onClick={() => setEditing("new")} className="press rounded-full bg-blush px-3 py-1.5 font-cute text-sm text-rose">
          + 기념일
        </button>
      </div>
      <ul className="space-y-2.5">
        {list.map((u, i) => (
          <li key={u.key}>
            <button
              disabled={u.auto}
              onClick={() => setEditing(anniversaries.find((a) => a.id === u.anniversaryId) ?? null)}
              className={`press flex w-full items-center gap-3 rounded-[24px] px-4 py-3.5 text-left shadow-soft ring-1 ring-white ${
                i === 0 ? "bg-gradient-to-br from-blush to-lilac" : "bg-white/85"
              }`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-2xl">{u.emoji}</span>
              <div className="flex-1">
                <p className="font-cute text-[17px]">{u.title}</p>
                <p className="text-xs text-ink-soft">
                  {formatDate(u.date)}
                  {u.auto && " · 자동"}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 font-cute ${u.daysLeft <= 7 ? "bg-rose text-white" : "bg-white text-rose"}`}>{dLabel(u.daysLeft)}</span>
            </button>
          </li>
        ))}
      </ul>

      {anniversaries.length === 0 && (
        <Card className="mt-4 text-center">
          <p className="font-cute text-ink">생일도 등록해 보세요 🎂</p>
          <p className="mt-1 text-sm text-ink-soft">100일 단위와 주년은 자동으로 계산돼요. 생일이나 처음 만난 날처럼 우리만의 날은 ‘+ 기념일’로 추가해요.</p>
          <Button variant="soft" onClick={() => setEditing("new")} className="mt-3">
            기념일 추가하기
          </Button>
        </Card>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "기념일 추가" : "기념일 수정"}>
        {editing !== null && <DayForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      </Sheet>
      <PlanSheet
        key={planOpen === null ? "closed" : planOpen === "new" ? `new-${selected}` : planOpen.id}
        open={planOpen !== null}
        plan={planOpen && planOpen !== "new" ? planOpen : undefined}
        date={selected}
        me={profile.me}
        names={profile.names}
        onClose={() => setPlanOpen(null)}
      />
    </div>
  );
}

function PlanRow({ plan, names, onClick, showDate }: { plan: Plan; names: Record<"a" | "b", string>; onClick: () => void; showDate?: boolean }) {
  const when = [
    showDate && formatDate(plan.date).slice(5),
    plan.endDate && `${planDays(plan)}일간 (~${formatDate(plan.endDate).slice(5)})`,
    plan.time && timeLabel(plan.time),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button onClick={onClick} className="press flex w-full items-center gap-3 rounded-2xl bg-white/85 px-3 py-2.5 text-left shadow-soft ring-1 ring-line">
      <span className="text-xl">{plan.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px]">{plan.title}</p>
        <p className="truncate text-xs text-ink-soft">{when || "하루 종일"}{plan.memo && ` · ${plan.memo}`}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${WHO_STYLE[plan.who].chip}`}>{whoLabel(plan.who, names)}</span>
    </button>
  );
}

function DayForm({ initial, onClose }: { initial?: Anniversary; onClose: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? EMOJIS[0]);
  const [date, setDate] = useState(initial?.date ?? today());
  const [yearly, setYearly] = useState(initial?.yearly ?? true);
  const [error, setError] = useState<string | null>(null);

  function save() {
    const item: Anniversary = { id: initial?.id ?? uid(), title: title.trim(), emoji, date, yearly };
    const r = update((s) => ({
      ...s,
      anniversaries: initial ? s.anniversaries.map((a) => (a.id === item.id ? item : a)) : [...s.anniversaries, item],
    }));
    if (r.ok) onClose();
    else setError(r.error);
  }

  function remove() {
    const r = update((s) => ({ ...s, anniversaries: s.anniversaries.filter((a) => a.id !== initial!.id) }));
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError(null)} />
      <Field label="이름">
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 아름 생일" maxLength={20} />
      </Field>
      <Field label="아이콘">
        <div className="flex flex-wrap gap-1.5">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => setEmoji(e)} className={`press h-10 w-10 rounded-xl text-xl ${emoji === e ? "bg-blush ring-2 ring-pink" : "bg-cream"}`}>
              {e}
            </button>
          ))}
        </div>
      </Field>
      <Field label="날짜">
        <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <label className="flex items-center justify-between rounded-2xl bg-cream px-4 py-3">
        <span>매년 반복 (생일 등)</span>
        <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} className="h-5 w-5 accent-rose" />
      </label>
      {!yearly && date < today() && <p className="pl-1 text-sm text-rose">한 번만 있는 날이 이미 지났어요. 지난 날은 목록에 나오지 않아요.</p>}
      <Button onClick={save} disabled={!title.trim() || !date} className="w-full">
        저장
      </Button>
      {initial && (
        <button onClick={remove} className="w-full py-1 text-center text-sm text-ink-soft">
          이 기념일 지우기
        </button>
      )}
    </div>
  );
}
