"use client";

import { useState } from "react";
import {
  MAX_POOP,
  PET_LIMIT,
  blocker,
  careFor,
  fullness,
  levelInfo,
  logText,
  petsToday,
  poops,
  renameCat,
  stageOf,
  useNow,
  water,
} from "@/lib/cats";
import { useAppState } from "@/lib/store";
import type { Cat, CatAction } from "@/lib/types";
import CatSprite, { type CatMood } from "./cat-sprite";
import { Banner, Button, Sheet, inputClass } from "./ui";

type Care = Exclude<CatAction, "checkin">;
const ACTIONS: { key: Care; emoji: string; label: string; reward: string }[] = [
  { key: "feed", emoji: "🍚", label: "밥 주기", reward: "+10 XP" },
  { key: "water", emoji: "💧", label: "물 주기", reward: "+8 XP" },
  { key: "clean", emoji: "🧹", label: "똥 치우기", reward: "똥 하나당 +5 XP" },
  { key: "pet", emoji: "🤲", label: "쓰다듬기", reward: "+3 XP · 💗+2" },
];

export default function CatSheet({ catId, onClose }: { catId: string | null; onClose: () => void }) {
  return <Sheet open={!!catId} onClose={onClose}>{catId && <CatCare key={catId} catId={catId} />}</Sheet>;
}

function CatCare({ catId }: { catId: string }) {
  const state = useAppState();
  const now = useNow();
  const [mood, setMood] = useState<CatMood>("idle");
  const [pop, setPop] = useState<{ key: number; text: string } | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const cat = state?.cats.find((c) => c.id === catId);
  if (!state?.profile || !cat || !now) return null;
  const { profile } = state;

  const { level, into, need } = levelInfo(cat.xp);
  const stage = stageOf(level);
  const logs = state.catLog.filter((l) => !l.catId || l.catId === catId).slice(0, 5);

  function act(action: Care) {
    const r = careFor(catId, action, profile.me);
    if (!r.ok) return setError(r.error);
    setMood("happy");
    setTimeout(() => setMood("idle"), 1200);
    setPop((p) => ({ key: (p?.key ?? 0) + 1, text: `${action === "pet" ? "💗 " : ""}+${r.xp} XP` }));
    if (r.levelUp) setLevelUp(r.levelUp);
  }

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError(null)} />

      <div className="relative flex flex-col items-center">
        {/* 누르면 손 들어서 젤리 보여주기 */}
        <button
          onClick={() => {
            setMood("happy");
            setTimeout(() => setMood("idle"), 1500);
          }}
          className="animate-breathe"
          style={{ transformOrigin: "50% 100%" }}
          aria-label="젤리 보기"
        >
          <CatSprite look={cat.look} baby={stage.index < 2} mood={mood} size={Math.round(60 + 80 * stage.scale)} />
        </button>
        {pop && (
          <span key={pop.key} className="pointer-events-none absolute top-6 animate-rise font-cute text-xl text-rose">
            {pop.text}
          </span>
        )}
        {renaming ? (
          <Rename cat={cat} onDone={(e) => (e ? setError(e) : setRenaming(false))} />
        ) : (
          <button onClick={() => setRenaming(true)} className="mt-1 font-cute text-2xl text-ink">
            {cat.name} <span className="text-sm text-ink-soft">✏️</span>
          </button>
        )}
        <p className="mt-0.5 text-sm text-ink-soft">
          <b className="font-cute text-rose">Lv.{level}</b> · {stage.emoji} {stage.label}
        </p>
      </div>

      {levelUp && (
        <button onClick={() => setLevelUp(null)} className="w-full animate-pop rounded-2xl bg-gradient-to-r from-pink to-violet px-4 py-3 text-center text-white shadow-pop">
          <p className="font-cute text-lg">🎉 Lv.{levelUp} 달성!</p>
          {stageOf(levelUp).from === levelUp && <p className="text-sm">{cat.name} 이제 {stageOf(levelUp).label}가 되었어요</p>}
        </button>
      )}

      <div className="space-y-2.5 rounded-2xl bg-cream p-4">
        <Meter label="경험치" value={(into / need) * 100} right={`${into} / ${need}`} color="from-violet to-pink" />
        <Meter label="💗 애정도" value={cat.affection} right={cat.affection >= 100 ? "찰떡 사이 💞" : `${cat.affection}`} color="from-pink to-rose" />
        <Meter label="🍚 배부름" value={fullness(cat, now)} right={`${fullness(cat, now)}%`} color="from-peach to-[#f2b48a]" />
        <Meter label="💧 물" value={water(cat, now)} right={`${water(cat, now)}%`} color="from-sky to-[#8cc6f0]" />
        <div className="flex items-center justify-between text-sm">
          <span>🚽 화장실</span>
          <span className="text-ink-soft">{poops(cat, now) ? `${"💩".repeat(poops(cat, now))} ${poops(cat, now)}/${MAX_POOP}` : "깨끗해요 ✨"}</span>
        </div>
        {stage.next && <p className="pt-1 text-center text-xs text-ink-soft">Lv.{stage.next.from}부터 {stage.next.label}로 자라요</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => {
          const why = blocker(cat, a.key, now);
          const sub = a.key === "pet" && !why ? `${a.reward} (${petsToday(cat)}/${PET_LIMIT})` : (why ?? a.reward);
          return (
            <button
              key={a.key}
              onClick={() => act(a.key)}
              disabled={!!why}
              className="press flex flex-col items-center rounded-2xl bg-blush px-2 py-3 text-rose disabled:bg-cream disabled:text-ink-soft"
            >
              <span className="text-2xl">{a.emoji}</span>
              <span className="font-cute text-[15px]">{a.label}</span>
              <span className="text-[11px] opacity-80">{sub}</span>
            </button>
          );
        })}
      </div>

      {logs.length > 0 && (
        <div>
          <p className="mb-1.5 pl-1 text-sm text-ink-soft">최근 돌봄</p>
          <ul className="space-y-1 text-sm">
            {logs.map((l) => (
              <li key={l.at + l.action + l.by} className="flex justify-between gap-2 rounded-xl bg-cream px-3 py-2">
                <span>{logText(l.action, profile.names[l.by], cat.name)}</span>
                <span className="shrink-0 text-xs text-ink-soft">{ago(now, l.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Meter({ label, value, right, color }: { label: string; value: number; right: string; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-ink-soft">{right}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function Rename({ cat, onDone }: { cat: Cat; onDone: (error?: string) => void }) {
  const [name, setName] = useState(cat.name);
  function save() {
    const r = renameCat(cat.id, name);
    onDone(r.ok ? undefined : r.error);
  }
  return (
    <div className="mt-2 flex w-full gap-2">
      <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={8} onKeyDown={(e) => e.key === "Enter" && name.trim() && save()} />
      <Button onClick={save} disabled={!name.trim()} className="shrink-0">
        저장
      </Button>
    </div>
  );
}

function ago(now: number, at: number) {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}
