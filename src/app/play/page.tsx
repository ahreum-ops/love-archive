"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import WhoSwitch from "@/components/who-switch";
import { BALANCE, SURVEY } from "@/lib/content";
import { useAppState } from "@/lib/store";
import type { Answers } from "@/lib/types";

function stats<T>(answers: Answers<T>, ids: string[]) {
  let both = 0;
  let same = 0;
  for (const id of ids) {
    const r = answers[id];
    if (r?.a !== undefined && r?.b !== undefined) {
      both++;
      if (r.a === r.b) same++;
    }
  }
  return { both, same, pct: both ? Math.round((same / both) * 100) : null };
}

export default function PlayPage() {
  const state = useAppState();
  if (!state?.profile) return null;
  const me = state.profile.me;

  const bal = stats(state.balance, BALANCE.map((q) => q.id));
  const sur = stats(state.survey, SURVEY.map((q) => q.id));
  const balMine = BALANCE.filter((q) => state.balance[q.id]?.[me] !== undefined).length;
  const surMine = SURVEY.filter((q) => state.survey[q.id]?.[me] !== undefined).length;

  return (
    <div>
      <PageHeader title="놀이" sub="둘이 각자 고르고, 둘 다 고르면 공개돼요" right={<WhoSwitch />} />

      <div className="space-y-4">
        <Link href="/play/balance" className="press block overflow-hidden rounded-[32px] bg-gradient-to-br from-lilac to-blush p-6 shadow-pop ring-1 ring-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-cute text-2xl text-ink">밸런스 게임</p>
              <p className="mt-1 text-sm text-ink-soft">둘 중 하나만 골라야 한다면?</p>
            </div>
            <span className="text-4xl">⚖️</span>
          </div>
          <div className="mt-5 flex items-end justify-between">
            <p className="text-sm text-ink">
              내가 고른 질문 <b className="font-cute text-rose">{balMine}</b> / {BALANCE.length}
            </p>
            <p className="rounded-full bg-white/80 px-3 py-1 font-cute text-sm text-violet">
              {bal.pct === null ? "아직 결과 없음" : `${bal.both}개 중 ${bal.same}개 통함`}
            </p>
          </div>
        </Link>

        <Link href="/play/survey" className="press block overflow-hidden rounded-[32px] bg-gradient-to-br from-peach to-lemon p-6 shadow-pop ring-1 ring-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-cute text-2xl text-ink">취향 설문</p>
              <p className="mt-1 text-sm text-ink-soft">음식부터 연애 스타일까지, 우리 얼마나 닮았을까?</p>
            </div>
            <span className="text-4xl">📝</span>
          </div>
          <div className="mt-5 flex items-end justify-between">
            <p className="text-sm text-ink">
              내 답변 <b className="font-cute text-rose">{surMine}</b> / {SURVEY.length}
            </p>
            <p className="rounded-full bg-white/80 px-3 py-1 font-cute text-sm text-rose">
              {sur.pct === null ? "아직 결과 없음" : `취향 일치 ${sur.pct}%`}
            </p>
          </div>
        </Link>

        <div className="rounded-[28px] border-2 border-dashed border-line bg-white/50 p-5 text-center text-sm text-ink-soft">
          <p className="font-cute text-base text-ink">더 많은 놀이를 준비 중이에요</p>
          <p className="mt-1">연인을 얼마나 아는지 맞히는 퀴즈 등이 곧 추가돼요.</p>
        </div>
      </div>
    </div>
  );
}
