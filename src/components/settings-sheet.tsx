"use client";

import { useEffect, useState } from "react";
import { today } from "@/lib/dates";
import { disablePush, enablePush, pushStatus, type PushStatus } from "@/lib/push";
import { resetAll, signOut, update, useAppState, useSession } from "@/lib/store";
import { REMOTE } from "@/lib/supabase";
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
  const session = useSession();
  const p = state.profile!;
  const [a, setA] = useState(p.names.a);
  const [b, setB] = useState(p.names.b);
  const [start, setStart] = useState(p.startDate);
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

      {REMOTE ? (
        session.status === "ready" && (
          <>
            <div className="rounded-2xl bg-cream p-4 text-sm text-ink-soft">
              <p className="font-cute text-ink">{session.partnerJoined ? "함께 쓰는 중 💞" : "연인 초대하기"}</p>
              {!session.partnerJoined && <p className="mt-1">연인이 앱에 가입한 뒤 ‘초대 코드가 있어요’에 이 코드를 넣으면 연결돼요.</p>}
              <p className="mt-3 text-center font-cute text-3xl tracking-[0.3em] text-rose">{session.inviteCode}</p>
              <p className="mt-3 text-xs">로그인: {session.email}</p>
            </div>
            <PushToggle />

            <button onClick={() => void signOut()} className="w-full py-2 text-center text-sm text-ink-soft underline-offset-2 hover:underline">
              로그아웃
            </button>
          </>
        )
      ) : (
        <TrialReset />
      )}
    </div>
  );
}

function TrialReset() {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <>
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
    </>
  );
}

/** 이 기기에서 푸시 알림 받기 (기기마다 따로 켠다) */
function PushToggle() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = useAppState()!.profile!.names;
  const session = useSession();
  const other = session.status === "ready" ? names[session.who === "a" ? "b" : "a"] : "연인";

  useEffect(() => {
    let alive = true;
    pushStatus()
      .then((s) => alive && setStatus(s))
      .catch((e) => {
        console.error("[push] status failed", e);
        if (alive) setStatus("off");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function toggle() {
    setBusy(true);
    const r = status === "on" ? await disablePush() : await enablePush();
    setBusy(false);
    if (!r.ok) setError(r.error);
    setStatus(await pushStatus().catch(() => status));
  }

  if (status === null) return null;
  return (
    <div className="rounded-2xl bg-cream p-4 text-sm text-ink-soft">
      <Banner message={error} onClose={() => setError(null)} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-cute text-ink">이 기기로 알림 받기 🔔</p>
          <p className="mt-1 text-xs">
            {status === "on"
              ? `${other}님이 편지·버킷리스트·장소를 남기면 알려 드려요`
              : status === "denied"
                ? "알림이 차단돼 있어요. 주소창 왼쪽 자물쇠 → 권한 → 알림을 ‘허용’으로 바꾼 뒤 새로고침해 주세요."
                : status === "unsupported"
                  ? "이 브라우저는 알림을 지원하지 않아요. 크롬이나 삼성 인터넷으로 열어 주세요."
                  : "앱을 닫아 둬도 휴대폰 알림으로 받아요"}
          </p>
        </div>
        {(status === "on" || status === "off") && (
          <button
            role="switch"
            aria-checked={status === "on"}
            aria-label="알림 받기"
            disabled={busy}
            onClick={() => void toggle()}
            className={`press relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${status === "on" ? "bg-rose" : "bg-line"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${status === "on" ? "left-6" : "left-1"}`} />
          </button>
        )}
      </div>
    </div>
  );
}
