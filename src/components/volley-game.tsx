"use client";

// 냥이 배구 경기 화면. 물리는 src/lib/volley.ts, 실시간 연결은 src/lib/volley-room.ts.
// - practice: 이 기기에서 전부 계산 (상대는 컴퓨터)
// - host(a): 공·점수를 계산해서 상대에게 스냅숏을 보내고, 상대 냥이 위치는 받아서 쓴다
// - guest(b): 내 냥이만 직접 움직이고, 공·점수는 호스트 스냅숏을 따른다 (사이사이는 혼자 굴려서 부드럽게)
// 내 냥이가 늘 왼쪽에 보이도록 b 는 화면을 좌우로 뒤집어 그린다.

import { useEffect, useRef, useState } from "react";
import CatSprite from "./cat-sprite";
import { josa } from "@/lib/josa";
import type { CatLook } from "@/lib/types";
import {
  aiInput, applySnapshot, BALL_R, CAT_R, coastBall, FLOOR, H, NET_HALF, NET_TOP, NET_X, newWorld, NO_INPUT, snapshot, step, stepCat,
  W, WIN, type Input, type Phase, type Snapshot, type World,
} from "@/lib/volley";
import { SEND_HZ, type CatMsg, type VolleyRoom } from "@/lib/volley-room";

export type Side = 0 | 1;
export type GameMode = { kind: "practice" } | { kind: "host"; room: VolleyRoom } | { kind: "guest"; room: VolleyRoom };
/** 방(page)에서 받은 메시지를 경기 화면으로 넘기는 통로 */
export type NetInbox = { onState?: (s: Snapshot) => void; onCat?: (c: CatMsg) => void };
/** 받을 곳을 등록하고, 돌려준 함수로 해제 */
export type Listen = (inbox: NetInbox) => () => void;

const LOOK: Record<Side, CatLook> = { 0: "tabby", 1: "patch" };
const STEP = 1 / 60;
const SPRITE = 2.4 * CAT_R; // 그림 크기 (코트 좌표)

type Hud = { phase: Phase; score: [number, number]; count: number; lastPoint: Side | null };

export default function VolleyGame({
  mode, mySide, names, listen, onExit, onAgain,
}: {
  mode: GameMode;
  mySide: Side;
  /** 0·1 쪽 이름 */
  names: [string, string];
  listen: Listen;
  onExit: () => void;
  /** 연습 모드: 끝나고 한 판 더 */
  onAgain?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const catEls = useRef<(HTMLDivElement | null)[]>([null, null]);
  const ballEl = useRef<HTMLDivElement>(null);
  const yarnEl = useRef<HTMLSpanElement>(null);
  const shadowEl = useRef<HTMLDivElement>(null);
  const controls = useRef({ left: false, right: false, jump: false });
  const [scale, setScale] = useState(0);
  const scaleRef = useRef(0);
  const [hud, setHud] = useState<Hud>({ phase: "count", score: [0, 0], count: 3, lastPoint: null });
  const [lost, setLost] = useState(false);

  // 코트 크기에 맞춰 배율
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      scaleRef.current = el.clientWidth / W;
      setScale(scaleRef.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 키보드 (컴퓨터에서 해 볼 때): ← → 이동, 스페이스·↑ 점프
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const c = controls.current;
      if (e.key === "ArrowLeft" || e.key === "a") c.left = down;
      else if (e.key === "ArrowRight" || e.key === "d") c.right = down;
      else if (down && (e.key === " " || e.key === "ArrowUp" || e.key === "w") && !e.repeat) c.jump = true;
      else return;
      e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => set(e, true);
    const ku = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  // 경기 루프
  useEffect(() => {
    const w: World = newWorld();
    const other: Side = mySide === 0 ? 1 : 0;
    // 화면에 그리는 위치 (상대 냥이·공은 받은 값으로 부드럽게 따라간다)
    const shown = { cats: w.cats.map((c) => ({ x: c.x, y: c.y })), ball: { x: w.ball.x, y: w.ball.y } };
    let last = performance.now();
    let acc = 0;
    let sendAcc = 0;
    let lastHeard = performance.now();
    let prevHud = "";
    let raf = 0;

    const flip = (x: number) => (mySide === 1 ? W - x : x);
    // 화면 기준 ◀▶ 를 코트 기준으로 (b 는 뒤집혀 보이니 반대로)
    const readInput = (): Input => {
      const c = controls.current;
      const input = mySide === 1 ? { left: c.right, right: c.left, jump: c.jump } : { left: c.left, right: c.right, jump: c.jump };
      c.jump = false; // 점프는 누른 순간 한 번만
      return input;
    };

    const inbox: NetInbox = {};
    if (mode.kind === "host") {
      inbox.onCat = (m) => {
        lastHeard = performance.now();
        const c = w.cats[other];
        c.x = m.x;
        c.y = m.y;
        c.vx = m.vx;
        c.vy = m.vy;
        if (m.k && c.spike <= 0) c.spike = 0.28;
      };
    } else if (mode.kind === "guest") {
      inbox.onState = (s) => {
        lastHeard = performance.now();
        const before = w.phase;
        applySnapshot(w, s, mySide);
        if (s.h === mySide) navigator.vibrate?.(12);
        // 새 서브는 공을 바로 그 자리로
        if (before !== "play" && w.phase === "play") Object.assign(shown.ball, { x: w.ball.x, y: w.ball.y });
      };
    }

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        const mine = readInput();
        if (mode.kind === "practice") {
          const inputs: [Input, Input] = [NO_INPUT, NO_INPUT];
          inputs[mySide] = mine;
          inputs[other] = aiInput(w, other, 0.55);
          step(w, inputs, STEP);
          if (w.hit === mySide) navigator.vibrate?.(12);
        } else if (mode.kind === "host") {
          const inputs: [Input, Input] = [NO_INPUT, NO_INPUT];
          inputs[mySide] = mine;
          step(w, inputs, STEP, other);
          if (w.hit === mySide) navigator.vibrate?.(12);
        } else {
          stepCat(w.cats[mySide], mine, mySide, STEP, w.phase === "over");
          coastBall(w, STEP);
        }
      }

      // 보내기
      if (mode.kind !== "practice") {
        sendAcc += dt;
        if (sendAcc >= 1 / SEND_HZ) {
          sendAcc = 0;
          if (mode.kind === "host") mode.room.sendState(snapshot(w));
          else {
            const c = w.cats[mySide];
            mode.room.sendCat({ x: Math.round(c.x), y: Math.round(c.y), vx: Math.round(c.vx), vy: Math.round(c.vy), k: c.spike > 0 ? 1 : 0 });
          }
        }
        // 4초 넘게 아무것도 못 받으면 끊긴 것으로
        if (now - lastHeard > 4000) setLost(true);
      }

      // 그리기
      const k = scaleRef.current;
      const remote = mode.kind !== "practice";
      for (const side of [0, 1] as const) {
        const s = shown.cats[side];
        const c = w.cats[side];
        const smooth = remote && side === other ? 0.4 : 1;
        s.x += (c.x - s.x) * smooth;
        s.y += (c.y - s.y) * smooth;
        const el = catEls.current[side];
        if (el) el.style.transform = `translate3d(${(flip(s.x) - SPRITE / 2) * k}px, ${(s.y - SPRITE * (66 / 120)) * k}px, 0)`;
      }
      const bs = shown.ball;
      const far = Math.hypot(w.ball.x - bs.x, w.ball.y - bs.y) > 60;
      const smoothBall = mode.kind === "guest" && !far ? 0.5 : 1;
      bs.x += (w.ball.x - bs.x) * smoothBall;
      bs.y += (w.ball.y - bs.y) * smoothBall;
      if (ballEl.current) ballEl.current.style.transform = `translate3d(${(flip(bs.x) - BALL_R) * k}px, ${(bs.y - BALL_R) * k}px, 0)`;
      if (yarnEl.current) yarnEl.current.style.transform = `rotate(${(mySide === 1 ? -1 : 1) * w.ball.spin}rad)`;
      if (shadowEl.current) {
        const h = Math.max(0, Math.min(1, (FLOOR - bs.y) / FLOOR));
        shadowEl.current.style.transform = `translate3d(${(flip(bs.x) - BALL_R) * k}px, ${(FLOOR - 5) * k}px, 0) scale(${1 - h * 0.6})`;
        shadowEl.current.style.opacity = String(0.35 - h * 0.25);
      }

      // 점수·안내는 바뀔 때만 React 로
      const next: Hud = { phase: w.phase, score: [...w.score], count: Math.ceil(w.timer), lastPoint: w.lastPoint };
      const key = JSON.stringify(next);
      if (key !== prevHud) {
        prevHud = key;
        setHud(next);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const unlisten = listen(inbox);
    return () => {
      cancelAnimationFrame(raf);
      unlisten();
    };
  }, [mode, mySide, listen]);

  const me = mySide;
  const other: Side = me === 0 ? 1 : 0;
  const myWin = hud.phase === "over" && hud.score[me] > hud.score[other];
  const sprite = SPRITE * scale;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  const hold = (key: "left" | "right") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      controls.current[key] = true;
    },
    onPointerUp: () => (controls.current[key] = false),
    onPointerCancel: () => (controls.current[key] = false),
    onLostPointerCapture: () => (controls.current[key] = false),
  });

  return (
    <div className="select-none" style={{ WebkitUserSelect: "none" }}>
      <div className="mb-2 flex items-center justify-between px-1">
        <button onClick={onExit} className="press rounded-full bg-white/80 px-3 py-1.5 text-sm text-ink-soft ring-1 ring-line">
          ‹ 나가기
        </button>
        <p className="text-xs text-ink-soft">{WIN}점 먼저 내면 승리</p>
      </div>

      {/* 점수판: 내가 왼쪽 */}
      <div className="mb-2 flex items-center justify-center gap-3 font-cute">
        <span className="max-w-[35%] truncate text-sm text-ink">{names[me]}</span>
        <span className="rounded-2xl bg-white/90 px-4 py-1 text-3xl text-rose shadow-soft ring-1 ring-line">
          {hud.score[me]} <span className="text-ink-soft">:</span> {hud.score[other]}
        </span>
        <span className="max-w-[35%] truncate text-sm text-ink">{names[other]}</span>
      </div>

      <div ref={box} className="relative w-full overflow-hidden rounded-[28px] shadow-pop ring-2 ring-white" style={{ aspectRatio: `${W} / ${H}` }}>
        <div className="absolute inset-0 bg-gradient-to-b from-[#f3e8ff] via-[#fff0f6] to-[#fff6ec]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-[#ffe1cc] to-[#ffd2b8]" style={{ top: pct(FLOOR, H) }} />
        {/* 네트 */}
        <div
          className="absolute rounded-t-full bg-[repeating-linear-gradient(0deg,#fff_0_6px,#ffc2d4_6px_9px)] ring-1 ring-[#f5a9c0]"
          style={{ left: pct(NET_X - NET_HALF, W), width: pct(NET_HALF * 2, W), top: pct(NET_TOP, H), height: pct(FLOOR - NET_TOP, H) }}
        />
        <div ref={shadowEl} className="absolute left-0 top-0 rounded-full bg-ink" style={{ width: BALL_R * 2 * scale, height: 8 * scale }} />
        {([0, 1] as const).map((side) => (
          <div key={side} ref={(el) => { catEls.current[side] = el; }} className="absolute left-0 top-0 will-change-transform">
            {sprite > 0 && (
              <CatSprite
                look={LOOK[side]}
                size={sprite}
                mood={(hud.phase === "point" && hud.lastPoint === side) || (hud.phase === "over" && hud.score[side] >= WIN) ? "happy" : "idle"}
              />
            )}
          </div>
        ))}
        <div ref={ballEl} className="absolute left-0 top-0 flex items-center justify-center will-change-transform" style={{ width: BALL_R * 2 * scale, height: BALL_R * 2 * scale }}>
          <span ref={yarnEl} className="block leading-none" style={{ fontSize: BALL_R * 2 * scale * 0.9 }}>
            🧶
          </span>
        </div>

        {/* 안내 */}
        {(hud.phase === "count" || hud.phase === "point" || lost) && (
          <div className="pointer-events-none absolute inset-x-0 top-[16%] text-center font-cute text-ink drop-shadow">
            {lost ? (
              <p className="text-lg">연결이 끊겼어요 😿</p>
            ) : hud.phase === "count" ? (
              <p className="animate-float text-5xl text-rose">{hud.count}</p>
            ) : (
              hud.lastPoint !== null && <p className="text-xl">{josa(names[hud.lastPoint], "이", "가")} 1점! 🐾</p>
            )}
          </div>
        )}
        {hud.phase === "over" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 font-cute backdrop-blur-[2px]">
            <p className="text-4xl">{myWin ? "🏆" : "🥈"}</p>
            <p className="mt-1 text-2xl text-ink">{myWin ? "이겼어요!" : "아쉽게 졌어요"}</p>
            <p className="text-sm text-ink-soft">
              {hud.score[me]} : {hud.score[other]}
            </p>
            <div className="mt-3 flex gap-2">
              {onAgain && (
                <button onClick={onAgain} className="press rounded-full bg-gradient-to-br from-pink to-rose px-6 py-2.5 text-white shadow-soft">
                  한 판 더
                </button>
              )}
              <button onClick={onExit} className={`press rounded-full px-6 py-2.5 shadow-soft ${onAgain ? "bg-white text-ink-soft" : "bg-gradient-to-br from-pink to-rose text-white"}`}>
                대기실로
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 조작 버튼 */}
      <div className="mt-4 flex items-center justify-between gap-3" style={{ touchAction: "none" }}>
        <div className="flex gap-3">
          <button {...hold("left")} aria-label="왼쪽" className="h-20 w-20 rounded-full bg-white/90 text-3xl text-ink shadow-soft ring-1 ring-line active:bg-blush">
            ◀
          </button>
          <button {...hold("right")} aria-label="오른쪽" className="h-20 w-20 rounded-full bg-white/90 text-3xl text-ink shadow-soft ring-1 ring-line active:bg-blush">
            ▶
          </button>
        </div>
        <button
          onPointerDown={() => (controls.current.jump = true)}
          aria-label="점프, 공중에서 누르면 스파이크"
          className="h-24 w-24 rounded-full bg-gradient-to-br from-pink to-rose font-cute text-white shadow-pop active:scale-95"
        >
          <span className="block text-lg">점프</span>
          <span className="block text-[11px] opacity-90">공중에선 스파이크</span>
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-ink-soft">점프한 채로 한 번 더 누르면 공을 세게 내리꽂아요</p>
    </div>
  );
}
