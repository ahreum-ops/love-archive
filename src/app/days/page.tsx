"use client";

import { useState } from "react";
import { Banner, Button, Card, Field, PageHeader, Sheet, inputClass } from "@/components/ui";
import { dayCount, dLabel, formatDate, today, upcoming } from "@/lib/dates";
import { uid, update, useAppState } from "@/lib/store";
import type { Anniversary } from "@/lib/types";

const EMOJIS = ["🎂", "💐", "💍", "🥂", "✈️", "🏠", "🐾", "🎓", "⭐", "💌"];

export default function DaysPage() {
  const state = useAppState();
  const [editing, setEditing] = useState<Anniversary | "new" | null>(null);
  if (!state?.profile) return null;

  const { profile, anniversaries } = state;
  const list = upcoming(profile.startDate, anniversaries);
  const count = dayCount(profile.startDate);

  return (
    <div>
      <PageHeader
        title="기념일"
        sub={`오늘은 함께한 지 ${count.toLocaleString()}일째`}
        right={
          <button
            onClick={() => setEditing("new")}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-pink to-rose text-2xl text-white shadow-soft"
            aria-label="기념일 추가"
          >
            +
          </button>
        }
      />

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
          <p className="mt-1 text-sm text-ink-soft">100일 단위와 주년은 자동으로 계산돼요. 생일이나 처음 만난 날처럼 우리만의 날은 + 로 추가해요.</p>
          <Button variant="soft" onClick={() => setEditing("new")} className="mt-3">
            기념일 추가하기
          </Button>
        </Card>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "기념일 추가" : "기념일 수정"}>
        {editing !== null && <DayForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      </Sheet>
    </div>
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
