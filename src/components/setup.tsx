"use client";

import { useState } from "react";
import { today } from "@/lib/dates";
import { createCouple } from "@/lib/store";
import { Banner, Button, Field, inputClass } from "./ui";

/** 처음 들어왔을 때: 두 사람 이름 + 사귄 날 */
export default function Setup() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [start, setStart] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ready = a.trim() && b.trim() && start && start <= today();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const r = createCouple({ names: { a: a.trim(), b: b.trim() }, startDate: start, me: "a" });
    if (!r.ok) setError(r.error);
  }

  return (
    <form onSubmit={submit} className="relative flex min-h-dvh flex-col px-6 pb-10 pt-[calc(env(safe-area-inset-top)+56px)]">
      <Banner message={error} onClose={() => setError(null)} />
      <div className="mb-10 text-center">
        <div className="mb-4 inline-block animate-float text-6xl">💞</div>
        <h1 className="font-cute text-3xl text-ink">러브아카이브</h1>
        <p className="mt-2 text-ink-soft">우리 둘만의 추억 보관함을 만들어요</p>
      </div>

      <div className="space-y-4 rounded-[32px] bg-white/85 p-6 shadow-soft ring-1 ring-line backdrop-blur">
        <Field label="내 이름 (애칭도 좋아요)">
          <input className={inputClass} value={a} onChange={(e) => setA(e.target.value)} placeholder="예) 아름" maxLength={12} />
        </Field>
        <Field label="연인 이름">
          <input className={inputClass} value={b} onChange={(e) => setB(e.target.value)} placeholder="예) 자기" maxLength={12} />
        </Field>
        <Field label="우리가 사귄 날">
          <input type="date" className={inputClass} value={start} max={today()} onChange={(e) => setStart(e.target.value)} />
        </Field>
        {start > today() && <p className="pl-1 text-sm text-rose">사귄 날은 오늘 이전이어야 해요</p>}
      </div>

      <div className="mt-auto pt-8">
        <Button type="submit" disabled={!ready} className="w-full py-4 text-lg">
          시작하기 💗
        </Button>
        <p className="mt-3 text-center text-xs text-ink-soft">
          지금은 체험 모드라 이 기기에만 저장돼요.
          <br />
          연인과 함께 쓰는 기능은 서버 연결 후 열려요.
        </p>
      </div>
    </form>
  );
}
