"use client";

import { useEffect, useState } from "react";
import { adoptCats, checkIn, fullness, isSleepTime, levelInfo, poops, stageOf, urgent, useNow, water } from "@/lib/cats";
import type { AppState, Cat } from "@/lib/types";
import CatSheet from "./cat-sheet";
import CatSprite from "./cat-sprite";
import { Banner, Button, Card, inputClass } from "./ui";

const INK = "#5b4760";
const SPRITE = 92;

/** 홈: 냥이들이 돌아다니는 방. 누르면 돌보기 시트 */
export default function CatRoom({ state }: { state: AppState }) {
  const { cats, profile } = state;
  const me = profile!.me;
  const now = useNow();
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 하루 첫 접속 보상 (사람마다 하루 한 번)
  const checkedToday = state.catCheckin[me];
  useEffect(() => {
    const r = checkIn(state, me);
    if (!r) return;
    if (!r.ok) return void queueMicrotask(() => setError(r.error));
    const msg = `${profile!.names[me]}, 오늘도 와줬네! 냥이들 애정도 +5 · 경험치 +${r.xp}${r.streak! > 1 ? ` (🔥 ${r.streak}일 연속)` : ""}`;
    queueMicrotask(() => setToast(msg));
    // state 전체를 넣으면 돌볼 때마다 다시 돌아서, 사람·고양이 수·출석일이 바뀔 때만 확인
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, cats.length, checkedToday?.date]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!cats.length) return <Adopt />;
  if (!now) return null;

  const sleeping = isSleepTime(now);
  const food = Math.min(...cats.map((c) => fullness(c, now)));
  const drink = Math.min(...cats.map((c) => water(c, now)));
  const mess = cats.reduce((n, c) => n + poops(c, now), 0);
  const streak = checkedToday?.streak ?? 0;

  return (
    <section>
      <Banner message={error} onClose={() => setError(null)} />
      <div className="mb-2 flex items-end justify-between px-1">
        <h2 className="font-cute text-lg">우리집 냥이들</h2>
        <span className="text-xs text-ink-soft">{streak > 1 ? `🔥 ${streak}일 연속 출석` : "눌러서 돌봐주세요"}</span>
      </div>

      <div className="relative isolate h-[230px] overflow-hidden rounded-[28px] shadow-soft ring-1 ring-line">
        {/* 벽 */}
        <div className={`absolute inset-x-0 top-0 h-[42%] ${sleeping ? "bg-gradient-to-b from-[#6f6390] to-[#a597c4]" : "bg-gradient-to-b from-lemon to-peach"}`}>
          <div className={`absolute left-6 top-4 h-14 w-16 rounded-xl border-4 border-white ${sleeping ? "bg-[#3d3a66]" : "bg-sky"}`}>
            <span className="absolute right-1.5 top-1 text-sm">{sleeping ? "🌙" : "☁️"}</span>
            <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-white" />
          </div>
          <span className="absolute right-8 top-5 text-2xl">🪴</span>
        </div>
        {/* 바닥 */}
        <div
          className="absolute inset-x-0 bottom-0 h-[58%]"
          style={{
            background: sleeping
              ? "repeating-linear-gradient(90deg,#b7a6a0 0 38px,#ad9c96 38px 40px)"
              : "repeating-linear-gradient(90deg,#f6dcc8 0 38px,#efd0ba 38px 40px)",
          }}
        />
        <div className="absolute left-1/2 top-[52%] h-12 w-40 -translate-x-1/2 rounded-[50%] bg-blush/80" />

        {/* 밥그릇 · 물그릇 · 화장실 */}
        <div className="absolute bottom-3 left-3 z-[1] flex gap-1">
          <Bowl level={food} fill="#c98b5a" bowl="#ffb3c7" />
          <Bowl level={drink} fill="#9fd3f5" bowl="#a98bf0" />
        </div>
        <div className="absolute bottom-3 right-3 z-[1]">
          <div className="relative h-8 w-16 rounded-b-xl rounded-t-md border-2 border-ink/70 bg-mint">
            <div className="absolute inset-x-1 top-1 h-2 rounded-full bg-[#f3e2c4]" />
            <div className="absolute -top-3 left-0 flex w-full justify-center gap-0.5 text-sm">
              {Array.from({ length: Math.min(mess, 4) }, (_, i) => (
                <span key={i}>💩</span>
              ))}
            </div>
          </div>
        </div>

        {cats.map((cat, i) => (
          <Wanderer key={cat.id} cat={cat} index={i} now={now} sleeping={sleeping} onTap={() => setOpenId(cat.id)} />
        ))}

        {toast && (
          <div className="absolute inset-x-3 top-3 z-[200] animate-pop rounded-2xl bg-white/95 px-4 py-2.5 text-center text-sm text-rose shadow-pop">{toast}</div>
        )}
      </div>

      <CatSheet catId={openId} onClose={() => setOpenId(null)} />
    </section>
  );
}

function Wanderer({ cat, index, now, sleeping, onTap }: { cat: Cat; index: number; now: number; sleeping: boolean; onTap: () => void }) {
  // x: 방 너비 %, y: 바닥에서 px
  const [pos, setPos] = useState({ x: index ? 66 : 36, y: index ? 24 : 44, flip: index === 1, moving: false });

  useEffect(() => {
    if (sleeping) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(
        () => {
          // 가끔은 그 자리에 가만히
          if (Math.random() > 0.3) {
            setPos((p) => {
              const x = 22 + Math.random() * 56;
              const y = 10 + Math.random() * 60;
              return { x, y, flip: x < p.x, moving: true };
            });
          }
          next();
        },
        2500 + Math.random() * 3500,
      );
    };
    next();
    return () => clearTimeout(t);
  }, [sleeping]);

  const lv = levelInfo(cat.xp).level;
  const stage = stageOf(lv);
  const size = Math.round(SPRITE * stage.scale);
  const need = urgent(cat, now);

  return (
    <button
      onClick={onTap}
      onTransitionEnd={() => setPos((p) => ({ ...p, moving: false }))}
      className="absolute flex -translate-x-1/2 flex-col items-center transition-[left,bottom] duration-[2200ms] ease-in-out"
      style={{ left: `${pos.x}%`, bottom: pos.y, zIndex: 100 - Math.round(pos.y) }}
      aria-label={`${cat.name} 돌보기`}
    >
      {sleeping ? (
        <span className="mb-[-6px] animate-float text-sm text-white">Zzz</span>
      ) : need ? (
        <span className="mb-[-4px] animate-pop rounded-full bg-white px-1.5 py-0.5 text-sm shadow-soft ring-1 ring-line">{need}</span>
      ) : null}
      <div className={pos.moving ? "animate-waddle" : "animate-breathe"} style={{ transformOrigin: "50% 100%" }}>
        <div style={{ transform: pos.flip ? "scaleX(-1)" : undefined }}>
          <CatSprite look={cat.look} baby={stage.index < 2} mood={sleeping ? "sleep" : "idle"} size={size} />
        </div>
      </div>
      <span className="-mt-1 rounded-full bg-white/85 px-2 py-0.5 font-cute text-[11px] text-ink shadow-sm">
        {cat.name} <span className="text-rose">Lv.{lv}</span>
      </span>
    </button>
  );
}

function Bowl({ level, fill, bowl }: { level: number; fill: string; bowl: string }) {
  return (
    <svg width="40" height="24" viewBox="0 0 44 26" aria-hidden>
      {level > 0 && <ellipse cx="22" cy="10" rx="16" ry={1.5 + (level / 100) * 6} fill={fill} />}
      <path d="M3 10 H41 L37 23 Q36 25 34 25 H10 Q8 25 7 23 Z" fill={bowl} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function Adopt() {
  const [tabby, setTabby] = useState("");
  const [patch, setPatch] = useState("");
  const [error, setError] = useState<string | null>(null);

  function adopt() {
    const r = adoptCats({ tabby, patch });
    if (!r.ok) setError(r.error);
  }

  return (
    <Card>
      <Banner message={error} onClose={() => setError(null)} />
      <h2 className="font-cute text-lg">우리집 냥이 데려오기</h2>
      <p className="mt-1 text-sm text-ink-soft">
        아기 고양이부터 같이 키워요. 매일 들어오면 애정도가 오르고, 밥·물·화장실을 챙겨주면 쑥쑥 자라요.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {(
          [
            ["tabby", tabby, setTabby, "고등어 냥이"],
            ["patch", patch, setPatch, "흰 냥이"],
          ] as const
        ).map(([look, value, set, hint]) => (
          <div key={look} className="flex flex-col items-center rounded-2xl bg-cream p-3">
            <div className="animate-breathe" style={{ transformOrigin: "50% 100%" }}>
              <CatSprite look={look} baby size={84} />
            </div>
            <input className={`${inputClass} mt-2 text-center`} value={value} onChange={(e) => set(e.target.value)} placeholder={hint} maxLength={8} />
          </div>
        ))}
      </div>
      <Button onClick={adopt} disabled={!tabby.trim() || !patch.trim()} className="mt-4 w-full">
        🍼 아기 고양이로 데려오기
      </Button>
    </Card>
  );
}
