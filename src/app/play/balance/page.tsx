"use client";

import Link from "next/link";
import { useState } from "react";
import { Banner, Button, PageHeader } from "@/components/ui";
import WhoSwitch from "@/components/who-switch";
import { BALANCE } from "@/lib/content";
import { josa } from "@/lib/josa";
import { update, useAppState } from "@/lib/store";

export default function BalancePage() {
  const state = useAppState();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state?.profile) return null;

  const { profile, balance } = state;
  const me = profile.me;
  const partner = me === "a" ? "b" : "a";
  const names = profile.names;

  const firstUnanswered = BALANCE.find((q) => balance[q.id]?.[me] === undefined);
  const q = BALANCE.find((x) => x.id === currentId) ?? firstUnanswered;
  const mine = q ? balance[q.id]?.[me] : undefined;
  const theirs = q ? balance[q.id]?.[partner] : undefined;
  const revealed = mine !== undefined && theirs !== undefined;
  const answeredCount = BALANCE.filter((x) => balance[x.id]?.[me] !== undefined).length;
  const partnerWaiting = BALANCE.filter((x) => balance[x.id]?.[partner] !== undefined && balance[x.id]?.[me] === undefined).length;

  function choose(side: 0 | 1) {
    if (!q || mine !== undefined) return;
    setCurrentId(q.id);
    const r = update((s) => ({ ...s, balance: { ...s.balance, [q.id]: { ...s.balance[q.id], [me]: side } } }));
    if (!r.ok) setError(r.error);
  }

  function next() {
    const n = BALANCE.find((x) => x.id !== q?.id && balance[x.id]?.[me] === undefined);
    setCurrentId(n?.id ?? null);
  }

  const results = BALANCE.filter((x) => balance[x.id]?.a !== undefined && balance[x.id]?.b !== undefined);

  return (
    <div>
      <Banner message={error} onClose={() => setError(null)} />
      <PageHeader
        title="밸런스 게임"
        sub={`${answeredCount} / ${BALANCE.length} 골랐어요`}
        right={<WhoSwitch />}
      />
      <Link href="/play" className="mb-3 inline-block px-1 text-sm text-ink-soft">
        ‹ 놀이로
      </Link>

      {!q ? (
        <div className="rounded-[32px] bg-white/85 p-8 text-center shadow-soft ring-1 ring-line">
          <div className="animate-float text-6xl">🏆</div>
          <p className="mt-4 font-cute text-2xl">전부 골랐어요!</p>
          <p className="mt-1 text-sm text-ink-soft">
            {results.length < BALANCE.length ? `${josa(names[partner], "이", "가")} 다 고르면 결과가 모두 공개돼요.` : "아래에서 우리 결과를 확인해 보세요."}
          </p>
        </div>
      ) : (
        <div className="rounded-[32px] bg-white/85 p-5 shadow-pop ring-1 ring-line">
          <p className="mb-4 text-center font-cute text-sm text-violet">Q. 둘 중 하나만 고른다면?</p>
          <div className="relative space-y-3">
            {([0, 1] as const).map((side) => {
              const label = side === 0 ? q.a : q.b;
              const iPicked = mine === side;
              const theyPicked = revealed && theirs === side;
              return (
                <button
                  key={side}
                  onClick={() => choose(side)}
                  disabled={mine !== undefined}
                  className={`press relative flex min-h-24 w-full flex-col items-center justify-center rounded-[26px] px-4 py-5 text-center transition-all ${
                    iPicked
                      ? "bg-gradient-to-br from-pink to-rose text-white shadow-soft"
                      : mine !== undefined
                        ? "bg-cream text-ink-soft"
                        : side === 0
                          ? "bg-blush text-ink"
                          : "bg-lilac text-ink"
                  }`}
                >
                  <span className="font-cute text-xl leading-snug">{label}</span>
                  {(iPicked || theyPicked) && (
                    <span className="mt-2 flex gap-1.5">
                      {iPicked && <span className="animate-pop rounded-full bg-white/90 px-2 py-0.5 text-xs text-rose">{names[me]}</span>}
                      {theyPicked && <span className="animate-pop rounded-full bg-violet px-2 py-0.5 text-xs text-white">{names[partner]}</span>}
                    </span>
                  )}
                </button>
              );
            })}
            <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white font-cute text-sm text-rose shadow-soft ring-4 ring-cream">
              VS
            </span>
          </div>

          {mine !== undefined && (
            <div className="mt-5 text-center">
              {revealed ? (
                <p className="animate-pop font-cute text-xl">
                  {mine === theirs ? <span className="text-rose">통했다! 💕</span> : <span className="text-violet">달랐네 😝 이야기 나눠봐요</span>}
                </p>
              ) : (
                <p className="text-sm text-ink-soft">
                  🔒 {names[partner]}의 선택은 비밀이에요.
                  <br />
                  {names[partner]}도 고르면 결과가 공개돼요.
                </p>
              )}
              <Button onClick={next} variant="soft" className="mt-4">
                다음 질문 ›
              </Button>
            </div>
          )}
        </div>
      )}

      {partnerWaiting > 0 && (
        <p className="mt-3 rounded-2xl bg-lemon px-4 py-3 text-center text-sm text-ink">
          💌 {josa(names[partner], "이", "가")} 먼저 고르고 기다리는 질문이 {partnerWaiting}개 있어요
        </p>
      )}

      <section className="mt-6">
        <button onClick={() => setShowAll(!showAll)} className="flex w-full items-center justify-between px-1">
          <h2 className="font-cute text-lg">공개된 결과 {results.length}개</h2>
          <span className="text-sm text-ink-soft">{showAll ? "접기 ▲" : "펼치기 ▼"}</span>
        </button>
        {showAll && (
          <ul className="mt-3 space-y-2">
            {results.length === 0 && <li className="rounded-2xl bg-white/70 p-4 text-center text-sm text-ink-soft">둘 다 고른 질문이 생기면 여기에 모여요.</li>}
            {results.map((x) => {
              const r = balance[x.id]!;
              const same = r.a === r.b;
              return (
                <li key={x.id} className="flex items-center gap-3 rounded-2xl bg-white/85 px-4 py-3 shadow-soft ring-1 ring-line">
                  <span className="text-lg">{same ? "💕" : "🤔"}</span>
                  <div className="flex-1 text-sm">
                    <p>
                      <span className="text-ink-soft">{names.a}</span> {r.a === 0 ? x.a : x.b}
                    </p>
                    <p>
                      <span className="text-ink-soft">{names.b}</span> {r.b === 0 ? x.a : x.b}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
