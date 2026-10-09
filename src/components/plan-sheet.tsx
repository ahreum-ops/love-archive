"use client";

import { useState } from "react";
import { whoLabel } from "@/lib/calendar";
import { uid, update } from "@/lib/store";
import type { Plan, Who } from "@/lib/types";
import { Banner, Button, Field, Sheet, inputClass } from "./ui";

const EMOJIS = ["🗓️", "💗", "🍽️", "☕", "🎬", "✈️", "🏖️", "🎂", "💼", "🏥", "🎮", "🛍️", "🚗", "🎤", "🏃", "📚"];

/** 일정 추가 / 수정. plan 이 없으면 date 에 새로 만든다 */
export default function PlanSheet({
  open,
  plan,
  date,
  me,
  names,
  onClose,
}: {
  open: boolean;
  plan?: Plan;
  date: string;
  me: Who;
  names: Record<Who, string>;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={plan ? "일정 고치기" : "일정 추가"}>
      {open && <PlanForm plan={plan} date={date} me={me} names={names} onClose={onClose} />}
    </Sheet>
  );
}

function PlanForm({ plan, date, me, names, onClose }: { plan?: Plan; date: string; me: Who; names: Record<Who, string>; onClose: () => void }) {
  const [title, setTitle] = useState(plan?.title ?? "");
  const [emoji, setEmoji] = useState(plan?.emoji ?? EMOJIS[0]);
  const [start, setStart] = useState(plan?.date ?? date);
  const [multi, setMulti] = useState(Boolean(plan?.endDate));
  const [end, setEnd] = useState(plan?.endDate ?? plan?.date ?? date);
  const [time, setTime] = useState(plan?.time ?? "");
  const [who, setWho] = useState<Who | "both">(plan?.who ?? "both");
  const [memo, setMemo] = useState(plan?.memo ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badRange = multi && end < start;

  function save() {
    const item: Plan = {
      id: plan?.id ?? uid(),
      title: title.trim(),
      emoji,
      date: start,
      endDate: multi && end > start ? end : undefined,
      time: !multi && time ? time : undefined,
      who,
      memo: memo.trim() || undefined,
      createdBy: plan?.createdBy ?? me,
      createdAt: plan?.createdAt ?? new Date().toISOString(),
    };
    const r = update((s) => ({ ...s, plans: plan ? s.plans.map((p) => (p.id === item.id ? item : p)) : [...s.plans, item] }));
    if (r.ok) onClose();
    else setError(r.error);
  }

  function remove() {
    const r = update((s) => ({ ...s, plans: s.plans.filter((p) => p.id !== plan!.id) }));
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError(null)} />
      <Field label="무슨 일정?">
        <input autoFocus={!plan} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 성수 데이트, 준 회식" maxLength={30} />
      </Field>
      <Field label="아이콘">
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => setEmoji(e)} className={`press aspect-square rounded-xl text-xl ${emoji === e ? "bg-blush ring-2 ring-pink" : "bg-cream"}`}>
              {e}
            </button>
          ))}
        </div>
      </Field>
      <Field label="누구 일정?">
        <div className="flex gap-1.5">
          {(["both", "a", "b"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWho(w)}
              className={`press flex-1 rounded-full py-2 text-sm ${who === w ? "bg-ink font-cute text-white" : "bg-cream text-ink-soft"}`}
            >
              {w === "both" ? "💑 같이" : whoLabel(w, names)}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={multi ? "시작일" : "날짜"}>
          <input type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        {multi ? (
          <Field label="마지막 날">
            <input type="date" className={inputClass} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        ) : (
          <Field label="시간 (선택)">
            <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        )}
      </div>
      <label className="flex items-center justify-between rounded-2xl bg-cream px-4 py-3">
        <span>여러 날 (여행 등)</span>
        <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="h-5 w-5 accent-rose" />
      </label>
      {badRange && <p className="pl-1 text-sm text-rose">마지막 날이 시작일보다 앞이에요. 날짜를 다시 골라 주세요.</p>}
      <Field label="메모 (선택)">
        <textarea className={`${inputClass} min-h-20 resize-none`} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="장소, 준비물 등" />
      </Field>
      <Button onClick={save} disabled={!title.trim() || !start || badRange} className="w-full py-4">
        저장
      </Button>
      {plan && (
        <div className="text-center">
          {confirmDelete ? (
            <span className="flex items-center justify-center gap-4 text-sm">
              <span className="text-rose">이 일정을 지울까요?</span>
              <button onClick={() => setConfirmDelete(false)} className="text-ink-soft">
                취소
              </button>
              <button onClick={remove} className="font-cute text-rose">
                지우기
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-sm text-ink-soft">
              이 일정 지우기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
