"use client";

import Link from "next/link";
import { useState } from "react";
import { Banner, PageHeader } from "@/components/ui";
import WhoSwitch from "@/components/who-switch";
import { SURVEY, SURVEY_CATEGORIES } from "@/lib/content";
import { josa } from "@/lib/josa";
import { update, useAppState } from "@/lib/store";

export default function SurveyPage() {
  const state = useAppState();
  const [cat, setCat] = useState<string>(SURVEY_CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);
  if (!state?.profile) return null;

  const { profile, survey } = state;
  const me = profile.me;
  const partner = me === "a" ? "b" : "a";
  const names = profile.names;

  const both = SURVEY.filter((q) => survey[q.id]?.a !== undefined && survey[q.id]?.b !== undefined);
  const same = both.filter((q) => survey[q.id]!.a === survey[q.id]!.b).length;
  const pct = both.length ? Math.round((same / both.length) * 100) : null;
  const questions = SURVEY.filter((q) => q.category === cat);

  function choose(id: string, option: string) {
    // 같은 답을 다시 누르면 취소
    const r = update((s) => {
      const row = { ...s.survey[id] };
      if (row[me] === option) delete row[me];
      else row[me] = option;
      return { ...s, survey: { ...s.survey, [id]: row } };
    });
    if (!r.ok) setError(r.error);
  }

  return (
    <div>
      <Banner message={error} onClose={() => setError(null)} />
      <PageHeader title="취향 설문" sub="각자 답하면 둘 다 답한 문항부터 공개돼요" right={<WhoSwitch />} />
      <Link href="/play" className="mb-3 inline-block px-1 text-sm text-ink-soft">
        ‹ 놀이로
      </Link>

      {/* 일치율 */}
      <div className="mb-4 flex items-center gap-4 rounded-[28px] bg-gradient-to-br from-peach to-blush p-5 shadow-soft ring-1 ring-white">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="white" strokeWidth="4" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#e8648c"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${((pct ?? 0) / 100) * 97.4} 97.4`}
              className="transition-all duration-700"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-cute text-lg text-rose">{pct === null ? "?" : `${pct}%`}</span>
        </div>
        <div>
          <p className="font-cute text-lg">우리 취향 일치율</p>
          <p className="text-sm text-ink-soft">
            {pct === null ? `${josa(names[partner], "이", "가")} 답하면 결과가 나와요` : `둘 다 답한 ${both.length}문항 중 ${same}개가 같아요`}
          </p>
        </div>
      </div>

      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {SURVEY_CATEGORIES.map((c) => {
          const left = SURVEY.filter((q) => q.category === c && survey[q.id]?.[me] === undefined).length;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`press relative shrink-0 rounded-full px-4 py-1.5 text-sm ring-1 ${cat === c ? "bg-ink text-white ring-ink" : "bg-white/70 text-ink-soft ring-line"}`}
            >
              {c}
              {left > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose" />}
            </button>
          );
        })}
      </div>

      <ul className="space-y-3">
        {questions.map((q, i) => {
          const r = survey[q.id];
          const mine = r?.[me];
          const theirs = r?.[partner];
          const revealed = mine !== undefined && theirs !== undefined;
          return (
            <li key={q.id} className="rounded-[26px] bg-white/85 p-4 shadow-soft ring-1 ring-line">
              <div className="mb-3 flex items-start gap-2">
                <span className="font-cute text-sm text-pink">Q{i + 1}</span>
                <p className="flex-1 text-[15px]">{q.q}</p>
                {revealed && <span className="animate-pop text-lg">{mine === theirs ? "💕" : "🤔"}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((o) => {
                  const iPicked = mine === o;
                  const theyPicked = revealed && theirs === o;
                  return (
                    <button
                      key={o}
                      onClick={() => choose(q.id, o)}
                      className={`press flex items-center gap-1 rounded-full px-3.5 py-2 text-sm ${
                        iPicked ? "bg-gradient-to-br from-pink to-rose text-white" : theyPicked ? "bg-violet text-white" : "bg-cream text-ink"
                      }`}
                    >
                      {o}
                      {iPicked && theyPicked && <span>💕</span>}
                    </button>
                  );
                })}
              </div>
              {mine !== undefined && (
                <p className="mt-2.5 text-xs text-ink-soft">
                  {revealed
                    ? mine === theirs
                      ? "같은 답이에요!"
                      : `${josa(names[partner], "은", "는")} ‘${theirs}’를 골랐어요`
                    : `🔒 ${josa(names[partner], "이", "가")} 답하면 공개돼요`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
