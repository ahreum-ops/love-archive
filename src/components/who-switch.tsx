"use client";

import { update, useAppState } from "@/lib/store";

/**
 * 체험 모드 전용: 한 기기에서 두 사람 역할을 번갈아 해볼 수 있게 '지금 누구인지'를 바꾼다.
 * 서버 연결 후에는 로그인한 사람으로 고정되므로 이 버튼은 사라진다.
 */
export default function WhoSwitch() {
  const state = useAppState();
  const p = state?.profile;
  if (!p) return null;
  const other = p.me === "a" ? "b" : "a";
  return (
    <button
      onClick={() => update((s) => ({ ...s, profile: { ...s.profile!, me: other } }))}
      className="press flex items-center gap-1.5 rounded-full bg-white/90 py-1.5 pl-3 pr-2 text-xs text-ink shadow-soft ring-1 ring-line"
      title="체험 모드: 상대방 시점으로 바꾸기"
    >
      <span className="text-ink-soft">지금</span>
      <b className="font-cute text-[13px] text-rose">{p.names[p.me]}</b>
      <span className="rounded-full bg-lilac px-1.5 py-0.5 text-[10px] text-violet">⇄ {p.names[other]}</span>
    </button>
  );
}
