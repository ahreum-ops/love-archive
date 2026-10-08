"use client";

import { useEffect, useRef, useState } from "react";
import { adoptCats, blocker, careFor, checkIn, fullness, isSleepTime, levelInfo, poops, stageOf, urgent, useNow, water } from "@/lib/cats";
import type { AppState, Cat, CatAction, Who } from "@/lib/types";
import CatSheet from "./cat-sheet";
import CatSprite, { type CatMood } from "./cat-sprite";
import { Banner, Button, Card, inputClass } from "./ui";

const INK = "#5b4760";
const SPRITE = 92;

type Care = Exclude<CatAction, "checkin">;
const MENU: { key: Care; emoji: string; label: string }[] = [
  { key: "feed", emoji: "🍚", label: "밥 주기" },
  { key: "water", emoji: "💧", label: "물 주기" },
  { key: "clean", emoji: "🧹", label: "똥 치우기" },
  { key: "pet", emoji: "🤚", label: "쓰다듬기" },
];
/** 밥그릇 · 물그릇 · 화장실 앞 자리 (x: 방 너비 %, y: 바닥에서 px) */
const SPOT: Partial<Record<Care, { x: number; y: number }>> = {
  feed: { x: 12, y: 20 },
  water: { x: 24, y: 20 },
  clean: { x: 76, y: 26 },
};
const WALK_MS = 1200;
const WANDER_MS = 2200;
const DO_MS = 2200;

/** 홈: 냥이들이 돌아다니는 방. 냥이를 누르면 머리 위에 돌보기 아이콘 */
export default function CatRoom({ state }: { state: AppState }) {
  const { cats, profile } = state;
  const me = profile!.me;
  const now = useNow();
  const [selected, setSelected] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
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
        <span className="text-xs text-ink-soft">{streak > 1 ? `🔥 ${streak}일 연속 출석` : "냥이를 눌러 돌봐주세요"}</span>
      </div>

      <div onClick={() => setSelected(null)} className="@container relative isolate h-[250px] overflow-hidden rounded-[28px] shadow-soft ring-1 ring-line">
        {/* 벽 */}
        <div className={`absolute inset-x-0 top-0 h-[40%] ${sleeping ? "bg-gradient-to-b from-[#6f6390] to-[#a597c4]" : "bg-gradient-to-b from-lemon to-peach"}`}>
          <div className={`absolute left-6 top-4 h-14 w-16 rounded-xl border-4 border-white ${sleeping ? "bg-[#3d3a66]" : "bg-sky"}`}>
            <span className="absolute right-1.5 top-1 text-sm">{sleeping ? "🌙" : "☁️"}</span>
            <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-white" />
          </div>
          <span className="absolute right-8 top-5 text-2xl">🪴</span>
        </div>
        {/* 바닥 */}
        <div
          className="absolute inset-x-0 bottom-0 h-[60%]"
          style={{
            background: sleeping
              ? "repeating-linear-gradient(90deg,#b7a6a0 0 38px,#ad9c96 38px 40px)"
              : "repeating-linear-gradient(90deg,#f6dcc8 0 38px,#efd0ba 38px 40px)",
          }}
        />
        <div className="absolute left-1/2 top-[50%] h-12 w-40 -translate-x-1/2 rounded-[50%] bg-blush/80" />

        {/* 밥그릇 · 물그릇 · 화장실 — 냥이가 그 뒤에 서서 먹도록 앞에 그린다 */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-[120] flex gap-1">
          <Bowl level={food} fill="#c98b5a" bowl="#ffb3c7" />
          <Bowl level={drink} fill="#9fd3f5" bowl="#a98bf0" />
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 z-[120]">
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
          <Wanderer
            key={cat.id}
            cat={cat}
            who={me}
            index={i}
            now={now}
            sleeping={sleeping}
            selected={selected === cat.id}
            onSelect={() => setSelected(selected === cat.id ? null : cat.id)}
            onDone={() => setSelected(null)}
            onInfo={() => {
              setSelected(null);
              setInfoId(cat.id);
            }}
            onError={setError}
          />
        ))}

        {toast && (
          <div className="absolute inset-x-3 top-3 z-[200] animate-pop rounded-2xl bg-white/95 px-4 py-2.5 text-center text-sm text-rose shadow-pop">{toast}</div>
        )}
      </div>

      <CatSheet catId={infoId} onClose={() => setInfoId(null)} />
    </section>
  );
}

type WandererProps = {
  cat: Cat;
  who: Who;
  index: number;
  now: number;
  sleeping: boolean;
  selected: boolean;
  onSelect: () => void;
  onDone: () => void;
  onInfo: () => void;
  onError: (e: string) => void;
};

function Wanderer({ cat, who, index, now, sleeping, selected, onSelect, onDone, onInfo, onError }: WandererProps) {
  // x: 방 너비 %, y: 바닥에서 px
  const [pos, setPos] = useState({ x: index ? 64 : 40, y: index ? 30 : 50, flip: index === 1, moving: false, ms: WANDER_MS });
  const [motion, setMotion] = useState<Care | null>(null);
  const [say, setSay] = useState<{ key: number; text: string } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = selected || !!motion;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  // 걷기가 끝나는 건 transitionend 대신 시간으로 (탭이 가려져 있으면 이벤트가 안 올 수 있어서)
  const walkTo = (x: number, y: number, ms: number) => {
    setPos((p) => ({ x, y, flip: x < p.x, moving: true, ms }));
    later(() => setPos((p) => ({ ...p, moving: false })), ms);
  };

  // 아무것도 안 할 때만 어슬렁
  useEffect(() => {
    if (sleeping || busy) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(
        () => {
          // 가끔은 그 자리에 가만히
          if (Math.random() > 0.3) {
            walkTo(22 + Math.random() * 56, 34 + Math.random() * 46, WANDER_MS);
          }
          next();
        },
        2500 + Math.random() * 3500,
      );
    };
    next();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleeping, busy]);

  function speak(text: string, ms = 1600) {
    setSay((s) => ({ key: (s?.key ?? 0) + 1, text }));
    later(() => setSay(null), ms);
  }

  function care(action: Care) {
    const why = blocker(cat, action, now);
    if (why) return speak(why);
    onDone();
    setMotion(action);
    const spot = SPOT[action];
    if (spot) walkTo(spot.x, spot.y, WALK_MS);

    // 그릇 앞에 도착하면 실제로 기록하고 냠냠 · 할짝 · 쓱쓱
    later(
      () => {
        const r = careFor(cat.id, action, who);
        if (!r.ok) {
          setMotion(null);
          return onError(r.error);
        }
        speak(r.levelUp ? `🎉 Lv.${r.levelUp}!` : `+${r.xp} XP`, DO_MS);
        later(() => setMotion(null), DO_MS);
      },
      spot ? WALK_MS : 0,
    );
  }

  const lv = levelInfo(cat.xp).level;
  const stage = stageOf(lv);
  const size = Math.round(SPRITE * stage.scale);
  const need = urgent(cat, now);
  const doing = motion && !pos.moving ? motion : null;
  const mood: CatMood = doing === "pet" ? "happy" : sleeping && !busy ? "sleep" : "idle";
  const bodyAnim = pos.moving ? "animate-waddle" : doing === "feed" || doing === "water" ? "animate-munch" : "animate-breathe";
  // 고른 냥이가 화면 가장자리여도 아이콘 줄이 방 밖으로 안 나가게
  const menuShift = `calc(-50% + max(0px, 100px - ${pos.x}cqw) + min(0px, 100cqw - 100px - ${pos.x}cqw))`;

  return (
    <div
      className="absolute -translate-x-1/2 transition-[left,bottom] ease-in-out"
      style={{
        left: `${pos.x}%`,
        bottom: pos.y,
        zIndex: selected ? 150 : 100 - Math.round(pos.y),
        transitionDuration: `${pos.ms}ms`,
      }}
    >
      <div className="relative flex flex-col items-center">
        {/* 머리 위: 돌보기 아이콘 / 말풍선 / 상태 */}
        <div className="absolute bottom-full left-1/2 mb-0.5 flex w-max flex-col items-center" style={{ transform: selected ? `translateX(${menuShift})` : "translateX(-50%)" }}>
          {say ? (
            <span key={say.key} className="animate-pop whitespace-nowrap rounded-full bg-white px-2.5 py-1 font-cute text-xs text-rose shadow-soft ring-1 ring-line">
              {say.text}
            </span>
          ) : selected ? (
            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              {MENU.map((m, i) => {
                const why = blocker(cat, m.key, now);
                return (
                  <button
                    key={m.key}
                    onClick={() => care(m.key)}
                    aria-label={m.label}
                    title={why ?? m.label}
                    className={`press flex h-9 w-9 animate-pop items-center justify-center rounded-full bg-white text-lg shadow-pop ring-2 ${why ? "opacity-45 ring-line" : "ring-pink"}`}
                    style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
                  >
                    {m.emoji}
                  </button>
                );
              })}
              <button
                onClick={onInfo}
                aria-label={`${cat.name} 상태 보기`}
                className="press flex h-9 w-9 animate-pop items-center justify-center rounded-full bg-lilac text-base shadow-pop ring-2 ring-violet/50"
                style={{ animationDelay: "160ms", animationFillMode: "both" }}
              >
                📋
              </button>
            </div>
          ) : sleeping && !motion ? (
            <span className="animate-float text-sm text-white">Zzz</span>
          ) : need && !motion ? (
            <span className="animate-pop rounded-full bg-white px-1.5 py-0.5 text-sm shadow-soft ring-1 ring-line">{need}</span>
          ) : null}
        </div>

        {/* 하는 중인 동작 소품 */}
        {doing === "pet" && (
          <>
            <span className="absolute -top-5 left-1/2 z-10 -ml-3 animate-stroke text-xl">🤚</span>
            <span className="absolute left-1/4 top-2 animate-rise text-lg">💗</span>
            <span className="absolute right-1/4 top-4 animate-rise text-base [animation-delay:400ms]">💕</span>
          </>
        )}
        {doing === "clean" && (
          <>
            <span className="absolute -right-5 bottom-3 z-10 animate-sweep text-2xl" style={{ transformOrigin: "50% 100%" }}>
              🧹
            </span>
            <span className="absolute -right-8 top-1 animate-rise text-base">✨</span>
          </>
        )}
        {(doing === "feed" || doing === "water") && (
          <span className="absolute -left-2 top-1 animate-rise text-sm">{doing === "feed" ? "냠냠" : "할짝"}</span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!motion) onSelect();
          }}
          aria-label={`${cat.name} 돌보기`}
          className={`${bodyAnim} rounded-full ${selected ? "drop-shadow-[0_0_6px_rgba(255,179,199,0.95)]" : ""}`}
          style={{ transformOrigin: "50% 100%" }}
        >
          <div style={{ transform: pos.flip ? "scaleX(-1)" : undefined }}>
            <CatSprite look={cat.look} baby={stage.index < 2} mood={mood} size={size} />
          </div>
        </button>
        <span className="-mt-1 rounded-full bg-white/85 px-2 py-0.5 font-cute text-[11px] text-ink shadow-sm">
          {cat.name} <span className="text-rose">Lv.{lv}</span>
        </span>
      </div>
    </div>
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
              <CatSprite look={look} baby size={76} />
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
