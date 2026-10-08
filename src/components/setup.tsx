"use client";

import { useState } from "react";
import { today } from "@/lib/dates";
import { createCouple, joinCouple, signOut, trialData } from "@/lib/store";
import { REMOTE } from "@/lib/supabase";
import { Banner, Button, Field, inputClass } from "./ui";

/** 처음 들어왔을 때: 새로 만들기(두 사람 이름 + 사귄 날) 또는 연인이 준 초대 코드로 들어가기 */
export default function Setup() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative flex min-h-dvh flex-col px-6 pb-10 pt-[calc(env(safe-area-inset-top)+56px)]">
      <Banner message={error} onClose={() => setError(null)} />
      <div className="mb-8 text-center">
        <div className="mb-4 inline-block animate-float text-6xl">💞</div>
        <h1 className="font-cute text-3xl text-ink">러브아카이브</h1>
        <p className="mt-2 text-ink-soft">우리 둘만의 추억 보관함을 만들어요</p>
      </div>

      {REMOTE && (
        <div className="mb-4 flex rounded-full bg-white/85 p-1 shadow-soft ring-1 ring-line">
          {(
            [
              ["create", "처음 만들어요"],
              ["join", "초대 코드가 있어요"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setMode(k); setError(null); }}
              className={`press flex-1 rounded-full py-2 text-sm ${mode === k ? "bg-blush font-cute text-rose" : "text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === "create" ? <CreateForm onError={setError} /> : <JoinForm onError={setError} />}

      {REMOTE && (
        <button onClick={() => void signOut()} className="mt-3 py-2 text-center text-xs text-ink-soft">
          다른 계정으로 로그인
        </button>
      )}
    </div>
  );
}

function CreateForm({ onError }: { onError: (e: string) => void }) {
  const trial = REMOTE ? trialData() : null;
  const [a, setA] = useState(trial?.profile?.names.a ?? "");
  const [b, setB] = useState(trial?.profile?.names.b ?? "");
  const [start, setStart] = useState(trial?.profile?.startDate ?? "");
  const [importTrial, setImportTrial] = useState(Boolean(trial));
  const [busy, setBusy] = useState(false);

  const ready = a.trim() && b.trim() && start && start <= today() && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    const r = await createCouple({ names: { a: a.trim(), b: b.trim() }, startDate: start, me: "a" }, importTrial);
    setBusy(false);
    if (!r.ok) onError(r.error);
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
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
        {trial && (
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3 text-sm">
            <span>이 기기에서 체험하던 기록도 가져오기</span>
            <input type="checkbox" checked={importTrial} onChange={(e) => setImportTrial(e.target.checked)} className="h-5 w-5 accent-rose" />
          </label>
        )}
      </div>

      <div className="mt-auto pt-8">
        <Button type="submit" disabled={!ready} className="w-full py-4 text-lg">
          {busy ? "만드는 중…" : "시작하기 💗"}
        </Button>
        <p className="mt-3 text-center text-xs text-ink-soft">
          {REMOTE ? (
            <>
              만들고 나면 설정에서 초대 코드를 볼 수 있어요.
              <br />
              연인에게 코드를 보내 주면 같은 공간을 함께 써요.
            </>
          ) : (
            <>
              지금은 체험 모드라 이 기기에만 저장돼요.
              <br />
              연인과 함께 쓰는 기능은 서버 연결 후 열려요.
            </>
          )}
        </p>
      </div>
    </form>
  );
}

function JoinForm({ onError }: { onError: (e: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = code.trim().length === 6 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    const r = await joinCouple(code);
    setBusy(false);
    if (!r.ok) onError(r.error);
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="space-y-4 rounded-[32px] bg-white/85 p-6 shadow-soft ring-1 ring-line backdrop-blur">
        <Field label="연인에게 받은 초대 코드 (6자리)">
          <input
            className={`${inputClass} text-center font-cute text-2xl tracking-[0.4em] uppercase`}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9a-z]/gi, "").slice(0, 6))}
            placeholder="A1B2C3"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </Field>
        <p className="pl-1 text-xs text-ink-soft">연인 앱의 설정(⚙️)에 초대 코드가 있어요.</p>
      </div>
      <div className="mt-auto pt-8">
        <Button type="submit" disabled={!ready} className="w-full py-4 text-lg">
          {busy ? "연결하는 중…" : "함께하기 💗"}
        </Button>
      </div>
    </form>
  );
}
