"use client";

import { useState } from "react";
import { today } from "@/lib/dates";
import { resetAll, update, useAppState } from "@/lib/store";
import { Banner, Button, Field, Sheet, inputClass } from "./ui";

export default function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="설정">
      {/* 열 때마다 현재 값으로 다시 채우려고 open 일 때만 마운트 */}
      {open && <SettingsForm onClose={onClose} />}
    </Sheet>
  );
}

function SettingsForm({ onClose }: { onClose: () => void }) {
  const state = useAppState()!;
  const p = state.profile!;
  const [a, setA] = useState(p.names.a);
  const [b, setB] = useState(p.names.b);
  const [start, setStart] = useState(p.startDate);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = a.trim() && b.trim() && start && start <= today();

  function save() {
    const r = update((s) => ({ ...s, profile: { ...s.profile!, names: { a: a.trim(), b: b.trim() }, startDate: start } }));
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError(null)} />
      <Field label="첫 번째 사람">
        <input className={inputClass} value={a} onChange={(e) => setA(e.target.value)} maxLength={12} />
      </Field>
      <Field label="두 번째 사람">
        <input className={inputClass} value={b} onChange={(e) => setB(e.target.value)} maxLength={12} />
      </Field>
      <Field label="사귄 날">
        <input type="date" className={inputClass} value={start} max={today()} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Button onClick={save} disabled={!valid} className="w-full">
        저장
      </Button>

      <div className="rounded-2xl bg-cream p-4 text-sm text-ink-soft">
        <p className="font-cute text-ink">체험 모드</p>
        <p className="mt-1">
          지금은 이 기기 브라우저에만 저장돼요. 브라우저 데이터를 지우면 함께 사라지니, 연인과 같이 쓰려면 서버 연결이 필요해요.
        </p>
      </div>

      {confirmReset ? (
        <div className="rounded-2xl bg-blush p-4">
          <p className="text-sm text-rose">버킷리스트 기록, 사진, 게임 답변까지 전부 지워져요. 되돌릴 수 없어요.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(false)} className="flex-1 bg-white">
              취소
            </Button>
            <Button onClick={() => resetAll()} className="flex-1">
              전부 지우기
            </Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmReset(true)} className="w-full py-2 text-center text-sm text-ink-soft underline-offset-2 hover:underline">
          처음부터 다시 시작하기
        </button>
      )}
    </div>
  );
}
