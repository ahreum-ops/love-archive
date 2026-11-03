"use client";

// 길쭉 냥이 경기 화면 (캔버스). 계산은 src/lib/snake.ts, 둘이 모드 연결은 src/lib/snake-room.ts.
// - solo: 이 기기에서 전부 계산 (컴퓨터 냥이들과)
// - host(a): 전부 계산해 스냅숏을 보내고, b 의 방향은 받아서 쓴다
// - guest(b): 받은 스냅숏으로 그리고, 내 방향만 보낸다 (사이사이는 혼자 굴려서 부드럽게)
// 조작: 화면 아무 데나 끌면 그쪽으로(조이스틱). 컴퓨터에선 마우스 방향, ← → 로도 돈다. 모두 같은 속도라 달리기는 없다.

import { useEffect, useRef, useState } from "react";
import {
  applySnapshot, ARENA, duoScore, emptyWorld, FOOD_COLORS, guestStep, lengthOf, newWorld, radius, RESPAWN, RIVAL_BONUS, ROUND, snapshot, step,
  type Control, type GameEvent, type Look, type Player, type Snake, type SnakeSnapshot, type World,
} from "@/lib/snake";
import { SNAKE_HZ, type InputMsg, type SnakeRoom } from "@/lib/snake-room";

export type SnakeMode = { kind: "solo" } | { kind: "host"; room: SnakeRoom } | { kind: "guest"; room: SnakeRoom };
/** 방(page)에서 받은 메시지를 경기 화면으로 넘기는 통로 */
export type SnakeInbox = { onState?: (s: SnakeSnapshot) => void; onInput?: (m: InputMsg) => void };
export type SnakeListen = (inbox: SnakeInbox) => () => void;

const STEP = 1 / 60;
const FULL_EVERY = 3; // 초마다 사료·이름 전체 다시 맞추기
const BOTS_SOLO = 9;
const BOTS_DUO = 7;
const BEST_KEY = "love-archive:snake-best:v1";

const INK = "#5b4760";
const PALETTE: Record<Look, { coat: string; stripe: string; face: string; eye: string; spot?: string }> = {
  tabby: { coat: "#9a8c7f", stripe: "#6a5c52", face: "#fffaf5", eye: "#9cc97f" },
  patch: { coat: "#fffaf5", stripe: "#968676", face: "#fffaf5", eye: "#c9d27a" },
  cheese: { coat: "#ffd29a", stripe: "#f2a65a", face: "#fff4e4", eye: "#8fc7a0" },
  gray: { coat: "#cdc8de", stripe: "#a29cbb", face: "#f4f1fb", eye: "#f5d76e" },
  black: { coat: "#5f5263", stripe: "#4a3f4d", face: "#6b5d6f", eye: "#ffd66b" },
  calico: { coat: "#fffaf5", stripe: "#f2a65a", face: "#fffaf5", eye: "#9cc97f", spot: "#6a5c52" },
  strawberry: { coat: "#ffc8d8", stripe: "#ff9fb6", face: "#ffeef3", eye: "#8a6fd6" },
  mint: { coat: "#c4ecd9", stripe: "#8fd3b6", face: "#f0fbf6", eye: "#ff9fb6" },
};

type Hud = {
  len: number;
  alive: boolean;
  rank: number;
  total: number;
  top: { id: number; name: string; len: number }[];
  left: number | null; // 남은 시간 (둘이 모드)
  over: boolean;
  respawnIn: number;
  kills: number;
  best: number;
  /** 경쟁 모드 점수 (최고 길이 + 연인 잡기 보너스) */
  score: number;
  rivalKills: number;
  partner: { len: number; best: number; kills: number; alive: boolean; score: number; rivalKills: number } | null;
  lost: boolean;
};

const EMPTY_HUD: Hud = {
  len: 10, alive: true, rank: 1, total: 1, top: [], left: null, over: false, respawnIn: 0, kills: 0, best: 10, score: 10, rivalKills: 0, partner: null, lost: false,
};

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
function saveBest(v: number) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    // 저장이 막힌 브라우저면 이번만 기억
  }
}

export default function SnakeGame({
  mode, me, partner, listen, onExit, onAgain,
}: {
  mode: SnakeMode;
  me: Player;
  /** 둘이 모드의 상대 */
  partner?: Player;
  listen: SnakeListen;
  /** finished: 판이 끝난 뒤 나감 */
  onExit: (finished?: boolean) => void;
  /** 혼자 모드: 다시 하기 · 경쟁 모드: 한 판 더(바로 준비) */
  onAgain?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const control = useRef<Control & { keyTurn: number }>({ angle: 0, keyTurn: 0 });
  const stick = useRef<{ id: number; x: number; y: number; kx: number; ky: number } | null>(null);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [record, setRecord] = useState(0);
  const [toast, setToast] = useState<{ text: string; good: boolean; at: number } | null>(null);

  // 잡았다·잡혔다 안내는 잠깐만
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    // 처음 그릴 때(서버 렌더링 포함)는 0 — 기록은 브라우저에서만 읽는다
    const t = setTimeout(() => setRecord(readBest()), 0);
    return () => clearTimeout(t);
  }, []);

  // 경기 화면이 화면을 꽉 채우도록 맨 위로
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // 키보드: ← → 로 돌기
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const c = control.current;
      if (e.key === "ArrowLeft" || e.key === "a") c.keyTurn = down ? -1 : c.keyTurn === -1 ? 0 : c.keyTurn;
      else if (e.key === "ArrowRight" || e.key === "d") c.keyTurn = down ? 1 : c.keyTurn === 1 ? 0 : c.keyTurn;
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
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const players = partner ? (me.id < partner.id ? [me, partner] : [partner, me]) : [me];
    const w: World = mode.kind === "guest" ? emptyWorld() : newWorld(mode.kind === "solo" ? "solo" : "duo", players, mode.kind === "solo" ? BOTS_SOLO : BOTS_DUO);
    const mine = w.snakes.find((s) => s.id === me.id);
    if (mine) control.current.angle = mine.angle;
    const font = getComputedStyle(cv).fontFamily;
    const cam = { x: mine?.pts[0]?.x ?? 0, y: mine?.pts[0]?.y ?? 0, zoom: 1 };
    let remote: Control | null = null;
    let pending: GameEvent[] = [];
    let last = performance.now();
    let acc = 0;
    let sendAcc = 0;
    let fullAcc = FULL_EVERY;
    let hudAcc = 1;
    let lastHeard = performance.now();
    let lastSent = "";
    let lastSentAt = 0;
    let overSent = 0;
    let diedAt = 0;
    let prevHud = "";
    let raf = 0;
    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = cv.clientWidth;
      cssH = cv.clientHeight;
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssH * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const onEvents = (evs: GameEvent[]) => {
      for (const e of evs) {
        if (e.t === "die" && e.id === me.id) {
          diedAt = performance.now();
          navigator.vibrate?.([30, 40, 30]);
        } else if (e.t === "die" && e.by === me.id) navigator.vibrate?.(20);
        // 경쟁 모드: 둘 사이에 일어난 일은 크게 알려 준다
        if (partner && e.t === "die" && e.by === me.id && e.id === partner.id) {
          setToast({ text: `${partner.name} 잡았다! +${RIVAL_BONUS}점 🎉`, good: true, at: performance.now() });
        } else if (partner && e.t === "die" && e.id === me.id && e.by === partner.id) {
          setToast({ text: `${partner.name}한테 잡혔어요 😿`, good: false, at: performance.now() });
        }
      }
    };

    const inbox: SnakeInbox = {};
    if (mode.kind === "host") {
      inbox.onInput = (m) => {
        lastHeard = performance.now();
        remote = { angle: m.a / 100 };
      };
    } else if (mode.kind === "guest") {
      inbox.onState = (s) => {
        lastHeard = performance.now();
        onEvents(applySnapshot(w, s, lastHeard));
      };
    }

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const c = control.current;
      if (c.keyTurn) c.angle += c.keyTurn * 3.2 * dt;
      const my: Control = { angle: c.angle };

      if (mode.kind === "guest") {
        guestStep(w, dt, now, me.id, my);
      } else {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const controls: Record<number, Control> = { [me.id]: my };
          if (partner && remote) controls[partner.id] = remote;
          step(w, STEP, controls);
          if (w.events.length) {
            onEvents(w.events);
            if (mode.kind === "host") pending.push(...w.events);
          }
        }
        if (mode.kind === "solo") {
          w.added = [];
          w.removed = [];
        }
      }

      // 보내기
      if (mode.kind !== "solo") {
        sendAcc += dt;
        fullAcc += dt;
        if (sendAcc >= 1 / SNAKE_HZ) {
          sendAcc = 0;
          if (mode.kind === "host") {
            // 끝난 뒤엔 몇 번만 더 보내고 멈춘다
            if (!w.over || overSent++ < 5) {
              const full = fullAcc >= FULL_EVERY;
              if (full) fullAcc = 0;
              mode.room.sendState(snapshot(w, full, pending));
              pending = [];
            }
          } else {
            const msg: InputMsg = { a: Math.round(my.angle * 100) };
            const key = String(msg.a);
            // 바뀔 때만 (가만히 있어도 1초에 한 번은 살아 있다고 알린다)
            if (key !== lastSent || now - lastSentAt > 1000) {
              lastSent = key;
              lastSentAt = now;
              mode.room.sendInput(msg);
            }
          }
        }
      }

      draw(now);

      // 점수판은 1초에 5번만 React 로
      hudAcc += dt;
      if (hudAcc >= 0.2) {
        hudAcc = 0;
        const s = w.snakes.find((x) => x.id === me.id);
        const p = partner ? w.snakes.find((x) => x.id === partner.id) : undefined;
        const alive = w.snakes.filter((x) => x.alive).sort((a, b) => b.mass - a.mass);
        const next: Hud = {
          len: s ? lengthOf(s) : 0,
          alive: s ? s.alive : mode.kind !== "guest",
          rank: s ? alive.indexOf(s) + 1 : 0,
          total: alive.length,
          top: alive.slice(0, 5).map((x) => ({ id: x.id, name: x.name, len: lengthOf(x) })),
          left: w.mode === "duo" ? Math.max(0, Math.ceil(ROUND - w.time)) : null,
          over: w.over || (mode.kind === "solo" && Boolean(s && !s.alive)),
          respawnIn: s && !s.alive && diedAt ? Math.max(0, Math.ceil(RESPAWN - (now - diedAt) / 1000)) : 0,
          kills: s?.kills ?? 0,
          best: s?.best ?? 0,
          score: s ? duoScore(s) : 0,
          rivalKills: s?.rivalKills ?? 0,
          partner: p ? { len: lengthOf(p), best: p.best, kills: p.kills, alive: p.alive, score: duoScore(p), rivalKills: p.rivalKills } : null,
          lost: mode.kind !== "solo" && !w.over && now - lastHeard > 4000,
        };
        const key = JSON.stringify(next);
        if (key !== prevHud) {
          prevHud = key;
          setHud(next);
        }
      }
      raf = requestAnimationFrame(frame);
    };

    // ---- 그리기 ----
    function draw(now: number) {
      if (!ctx || !cssW) return;
      const dpr = cv!.width / cssW;
      const s = w.snakes.find((x) => x.id === me.id);
      if (s?.alive && s.pts.length) {
        cam.x += (s.pts[0].x - cam.x) * 0.25;
        cam.y += (s.pts[0].y - cam.y) * 0.25;
      }
      const r = s ? radius(s.mass) : 11;
      const wantZoom = (Math.min(cssW, cssH) / 430) / (1 + (r - 11) / 30);
      cam.zoom += (wantZoom - cam.zoom) * 0.05;
      const z = cam.zoom;
      const halfW = cssW / 2 / z + 40;
      const halfH = cssH / 2 / z + 40;
      const inView = (x: number, y: number, m = 0) => Math.abs(x - cam.x) < halfW + m && Math.abs(y - cam.y) < halfH + m;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#ffd9e4";
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cssW / 2 - cam.x * z), dpr * (cssH / 2 - cam.y * z));

      // 바닥 + 물방울 무늬·발자국
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, ARENA, 0, Math.PI * 2);
      ctx.fillStyle = "#fff9f5";
      ctx.fill();
      ctx.clip();
      const G = 56;
      const gx0 = Math.floor((cam.x - halfW) / G);
      const gx1 = Math.ceil((cam.x + halfW) / G);
      const gy0 = Math.floor((cam.y - halfH) / G);
      const gy1 = Math.ceil((cam.y + halfH) / G);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const hash = Math.abs((gx * 73856093) ^ (gy * 19349663)) % 11;
          const x = gx * G + (gy % 2 ? G / 2 : 0);
          const y = gy * G;
          if (hash === 0) paw(ctx, x, y, gx + gy);
          else {
            ctx.fillStyle = hash < 4 ? "#f6e3ec" : "#f8ecf1";
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
      // 테두리
      ctx.lineWidth = 14;
      ctx.strokeStyle = "#ffb3c7";
      ctx.beginPath();
      ctx.arc(0, 0, ARENA + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 12]);
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.setLineDash([]);

      // 사료
      const t = now / 1000;
      for (const f of w.food) {
        if (!inView(f.x, f.y)) continue;
        const fr = Math.min(9, 3.2 + f.v * 1.3) * (1 + Math.sin(t * 4 + f.id) * 0.08);
        const col = FOOD_COLORS[f.c] ?? FOOD_COLORS[0];
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(f.x, f.y, fr * 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, fr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.arc(f.x - fr * 0.3, f.y - fr * 0.3, fr * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }

      // 냥이들 (작은 냥이부터 그려서 큰 냥이가 위로)
      const drawn = w.snakes.filter((x) => x.alive && x.pts.length).sort((a, b) => a.mass - b.mass);
      for (const sn of drawn) drawSnake(sn, t, inView);

      // 이름표
      ctx.font = `14px ${font}`;
      ctx.textAlign = "center";
      for (const sn of drawn) {
        const h = sn.pts[0];
        if (!inView(h.x, h.y)) continue;
        const rr = radius(sn.mass) * 1.3;
        const label = sn.id === me.id ? "나" : sn.name;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeText(label, h.x, h.y - rr * 1.25 - 6);
        ctx.fillStyle = sn.id === me.id ? "#e8648c" : partner && sn.id === partner.id ? "#a98bf0" : INK;
        ctx.fillText(label, h.x, h.y - rr * 1.25 - 6);
      }

      // 화면 고정: 조이스틱 · 작은 지도
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const st = stick.current;
      if (st) {
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffb3c7";
        ctx.beginPath();
        ctx.arc(st.x, st.y, 46, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.8;
        paw(ctx, st.kx, st.ky, 0, 2.2, "#ff9fb6");
        ctx.globalAlpha = 1;
      }
      // 경쟁 모드: 연인이 화면 밖이면 가장자리에 화살표
      const rival = partner ? w.snakes.find((x) => x.id === partner.id) : undefined;
      if (rival?.alive && rival.pts.length) {
        const sx = cssW / 2 + (rival.pts[0].x - cam.x) * z;
        const sy = cssH / 2 + (rival.pts[0].y - cam.y) * z;
        const pad = 30;
        const top = 120;
        if (sx < pad || sx > cssW - pad || sy < top || sy > cssH - pad) {
          const dx = sx - cssW / 2;
          const dy = sy - cssH / 2;
          const k = Math.min(
            Math.abs(((dx > 0 ? cssW - pad : pad) - cssW / 2) / (dx || 1e-6)),
            Math.abs(((dy > 0 ? cssH - pad : top) - cssH / 2) / (dy || 1e-6)),
          );
          const ax = cssW / 2 + dx * k;
          const ay = cssH / 2 + dy * k;
          ctx.save();
          ctx.translate(ax, ay);
          ctx.fillStyle = "#a98bf0";
          ctx.save();
          ctx.rotate(Math.atan2(dy, dx));
          ctx.beginPath();
          ctx.moveTo(24, 0);
          ctx.lineTo(12, -8);
          ctx.lineTo(12, 8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.beginPath();
          ctx.arc(0, 0, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.font = `12px ${font}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(lengthOf(rival)), 0, 1);
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = "#a98bf0";
          ctx.font = `11px ${font}`;
          ctx.fillText(partner!.name, 0, ay > cssH / 2 ? -19 : 28);
          ctx.restore();
        }
      }

      const mr = 36;
      const mx = 14 + mr;
      const my = cssH - 14 - mr;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.strokeStyle = "#ffb3c7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const sn of w.snakes) {
        if (!sn.alive || !sn.pts.length) continue;
        const isMe = sn.id === me.id;
        const isPartner = partner && sn.id === partner.id;
        ctx.fillStyle = isMe ? "#e8648c" : isPartner ? "#a98bf0" : "rgba(155,138,159,0.6)";
        ctx.beginPath();
        ctx.arc(mx + (sn.pts[0].x / ARENA) * mr, my + (sn.pts[0].y / ARENA) * mr, isMe || isPartner ? 3.5 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawSnake(sn: Snake, t: number, inView: (x: number, y: number, m?: number) => boolean) {
      const pal = PALETTE[sn.look] ?? PALETTE.gray;
      const r = radius(sn.mass);
      const n = sn.pts.length;
      const segR = (i: number) => r * (0.5 + 0.5 * Math.min(1, (n - 1 - i) / 12));
      // 외곽선 먼저 한 번에, 그 위에 털색
      ctx!.fillStyle = "rgba(91,71,96,0.28)";
      for (let i = n - 1; i >= 1; i -= 1) {
        const p = sn.pts[i];
        if (!inView(p.x, p.y, r)) continue;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, segR(i) + 1.6, 0, Math.PI * 2);
        ctx!.fill();
      }
      for (let i = n - 1; i >= 1; i -= 1) {
        const p = sn.pts[i];
        if (!inView(p.x, p.y, r)) continue;
        ctx!.fillStyle = coatAt(sn.look, i, pal);
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, segR(i), 0, Math.PI * 2);
        ctx!.fill();
      }
      const h = sn.pts[0];
      if (inView(h.x, h.y, r * 2)) drawHead(sn, h.x, h.y, r * 1.3, pal, t);
    }

    function drawHead(sn: Snake, x: number, y: number, R: number, pal: (typeof PALETTE)[Look], t: number) {
      const c = ctx!;
      c.save();
      c.translate(x, y);
      // 얼굴은 늘 똑바로, 가는 쪽으로 살짝 기울기만
      c.rotate(Math.cos(sn.angle) * 0.18);
      c.lineWidth = Math.max(1.5, R * 0.09);
      c.strokeStyle = INK;
      // 귀
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.moveTo(sx * R * 0.25, -R * 0.82);
        c.lineTo(sx * R * 0.82, -R * 1.18);
        c.lineTo(sx * R * 0.9, -R * 0.35);
        c.closePath();
        c.fillStyle = sn.look === "patch" && sx === 1 ? pal.stripe : pal.coat;
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(sx * R * 0.42, -R * 0.78);
        c.lineTo(sx * R * 0.76, -R * 0.98);
        c.lineTo(sx * R * 0.78, -R * 0.55);
        c.closePath();
        c.fillStyle = "#ffc2d4";
        c.fill();
      }
      // 머리
      c.beginPath();
      c.ellipse(0, 0, R, R * 0.9, 0, 0, Math.PI * 2);
      c.fillStyle = pal.coat;
      c.fill();
      c.stroke();
      // 이마 무늬 · 주둥이
      if (sn.look === "tabby" || sn.look === "cheese" || sn.look === "gray" || sn.look === "strawberry" || sn.look === "mint") {
        c.strokeStyle = pal.stripe;
        c.lineWidth = R * 0.1;
        for (const dx of [-0.22, 0, 0.22]) {
          c.beginPath();
          c.moveTo(dx * R, -R * 0.85);
          c.lineTo(dx * R * 0.8, -R * 0.55);
          c.stroke();
        }
        c.strokeStyle = INK;
        c.lineWidth = Math.max(1.5, R * 0.09);
      }
      if (sn.look === "calico") {
        c.fillStyle = pal.stripe;
        c.beginPath();
        c.ellipse(-R * 0.5, -R * 0.45, R * 0.38, R * 0.3, -0.4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = pal.spot!;
        c.beginPath();
        c.ellipse(R * 0.55, -R * 0.5, R * 0.3, R * 0.25, 0.4, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = pal.face;
      c.beginPath();
      c.ellipse(0, R * 0.38, R * 0.55, R * 0.38, 0, 0, Math.PI * 2);
      c.fill();
      // 볼터치
      c.fillStyle = "rgba(255,159,182,0.55)";
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.ellipse(sx * R * 0.6, R * 0.28, R * 0.17, R * 0.11, 0, 0, Math.PI * 2);
        c.fill();
      }
      // 눈 (가는 쪽을 보고, 가끔 눈을 깜빡인다)
      const ex = R * 0.36;
      const ey = -R * 0.12;
      const er = R * 0.2;
      const blink = Math.sin(t * 1.3 + sn.id * 7) > 0.985;
      for (const sx of [-1, 1]) {
        if (blink) {
          c.beginPath();
          c.moveTo(sx * ex - er, ey + er * 0.4);
          c.quadraticCurveTo(sx * ex, ey - er * 0.9, sx * ex + er, ey + er * 0.4);
          c.stroke();
          continue;
        }
        c.beginPath();
        c.arc(sx * ex, ey, er, 0, Math.PI * 2);
        c.fillStyle = pal.eye;
        c.fill();
        c.stroke();
        const lx = Math.cos(sn.angle) * er * 0.35;
        const ly = Math.sin(sn.angle) * er * 0.35;
        c.fillStyle = "#2f2730";
        c.beginPath();
        c.ellipse(sx * ex + lx, ey + ly, er * 0.5, er * 0.75, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#fff";
        c.beginPath();
        c.arc(sx * ex + lx + er * 0.25, ey + ly - er * 0.35, er * 0.25, 0, Math.PI * 2);
        c.fill();
      }
      // 코 · 입(ω)
      c.fillStyle = "#ff9fb6";
      c.beginPath();
      c.moveTo(-R * 0.09, R * 0.2);
      c.lineTo(R * 0.09, R * 0.2);
      c.lineTo(0, R * 0.3);
      c.closePath();
      c.fill();
      c.lineWidth = Math.max(1, R * 0.06);
      c.beginPath();
      c.moveTo(0, R * 0.3);
      c.quadraticCurveTo(-R * 0.08, R * 0.46, -R * 0.18, R * 0.36);
      c.moveTo(0, R * 0.3);
      c.quadraticCurveTo(R * 0.08, R * 0.46, R * 0.18, R * 0.36);
      c.stroke();
      // 수염
      c.globalAlpha = 0.6;
      for (const sx of [-1, 1]) {
        for (const dy of [-0.06, 0.1]) {
          c.beginPath();
          c.moveTo(sx * R * 0.5, R * (0.32 + dy));
          c.lineTo(sx * R * 1.15, R * (0.25 + dy * 2));
          c.stroke();
        }
      }
      c.globalAlpha = 1;
      c.restore();
    }

    raf = requestAnimationFrame(frame);
    const unlisten = listen(inbox);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unlisten();
    };
  }, [mode, me, partner, listen]);

  // 혼자 모드 최고 기록
  useEffect(() => {
    if (!hud.over || mode.kind !== "solo" || hud.best <= readBest()) return;
    saveBest(hud.best);
  }, [hud.over, hud.best, mode.kind]);

  // ---- 조작 ----
  const center = () => {
    const el = canvas.current!;
    const rect = el.getBoundingClientRect();
    return { rect, cx: rect.width / 2, cy: rect.height / 2 };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { rect } = center();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (e.pointerType === "mouse") return;
    if (stick.current) return;
    stick.current = { id: e.pointerId, x, y, kx: x, ky: y };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 이미 떨어진 손가락이면 잡지 못해도 괜찮다
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { rect, cx, cy } = center();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (e.pointerType === "mouse") {
      // 마우스: 화면 가운데(내 머리)에서 마우스 쪽으로
      if (Math.hypot(x - cx, y - cy) > 6) control.current.angle = Math.atan2(y - cy, x - cx);
      return;
    }
    const st = stick.current;
    if (!st || st.id !== e.pointerId) return;
    const dx = x - st.x;
    const dy = y - st.y;
    const d = Math.hypot(dx, dy);
    if (d > 8) control.current.angle = Math.atan2(dy, dx);
    const k = d > 46 ? 46 / d : 1;
    st.kx = st.x + dx * k;
    st.ky = st.y + dy * k;
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (stick.current?.id === e.pointerId) stick.current = null;
  };

  const duo = mode.kind !== "solo";
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  // 경쟁 모드 승부: 점수, 같으면 연인 잡은 횟수
  const iWin = hud.partner && (hud.score !== hud.partner.score ? hud.score > hud.partner.score : hud.rivalKills > hud.partner.rivalKills);
  const tie = hud.partner && hud.score === hud.partner.score && hud.rivalKills === hud.partner.rivalKills;

  return (
    <div className="select-none" style={{ WebkitUserSelect: "none" }}>
      <div
        className="relative w-full overflow-hidden rounded-[28px] shadow-pop ring-2 ring-white"
        style={{ height: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px)", minHeight: 420 }}
      >
        <canvas
          ref={canvas}
          className="absolute inset-0 h-full w-full font-cute"
          style={{ touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* 위: 나가기 · 내 길이 · 남은 시간 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <button onClick={() => onExit(hud.over)} className="press pointer-events-auto rounded-full bg-white/85 px-3 py-1.5 text-sm text-ink-soft shadow-soft ring-1 ring-line">
            ‹ 나가기
          </button>
          {duo && partner ? (
            <div className="rounded-2xl bg-white/90 px-3 py-1.5 text-center font-cute shadow-soft ring-1 ring-line">
              <p className="flex items-center justify-center gap-1.5 leading-tight">
                <span className="text-xs text-rose">나</span>
                <span className="text-xl text-rose">{hud.score}</span>
                <span className="text-sm">⚔️</span>
                <span className="text-xl text-violet">{hud.partner?.score ?? 0}</span>
                <span className="max-w-[4.5em] truncate text-xs text-violet">{partner.name}</span>
              </p>
              <p className="text-[11px] leading-tight text-ink-soft">
                지금 🐟 {hud.len}
                {hud.left !== null && ` · ⏱ ${mm(hud.left)}`}
              </p>
            </div>
          ) : (
          <div className="rounded-2xl bg-white/85 px-3 py-1.5 text-right font-cute shadow-soft ring-1 ring-line">
            <p className="text-lg leading-tight text-rose">🐟 {hud.len}</p>
            <p className="text-[11px] leading-tight text-ink-soft">
              {hud.alive ? `${hud.total}마리 중 ${hud.rank}등` : "쉬는 중"}
              {hud.left !== null && ` · ⏱ ${mm(hud.left)}`}
            </p>
          </div>
          )}
        </div>

        {/* 순위 */}
        <div className="pointer-events-none absolute right-3 top-[68px] w-32 rounded-2xl bg-white/70 px-2.5 py-1.5 text-[11px] text-ink-soft ring-1 ring-line">
          {hud.top.map((s, i) => (
            <p key={s.id} className={`flex justify-between gap-1 ${s.id === me.id ? "font-cute text-rose" : partner && s.id === partner.id ? "font-cute text-violet" : ""}`}>
              <span className="truncate">
                {i + 1}. {s.id === me.id ? "나" : s.name}
              </span>
              <span>{s.len}</span>
            </p>
          ))}
        </div>

        {/* 안내 */}
        {toast && (
          <p
            key={toast.at}
            className={`pointer-events-none absolute inset-x-6 top-[22%] animate-float rounded-full px-4 py-2 text-center font-cute text-lg shadow-pop ${
              toast.good ? "bg-gradient-to-br from-pink to-rose text-white" : "bg-white/90 text-ink"
            }`}
          >
            {toast.text}
          </p>
        )}
        {duo && !hud.over && hud.left !== null && hud.left <= 10 && hud.left > 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-[40%] text-center font-cute text-6xl text-rose/70 drop-shadow">{hud.left}</p>
        )}
        {hud.lost && (
          <p className="pointer-events-none absolute inset-x-0 top-[30%] text-center font-cute text-lg text-ink drop-shadow">연결이 끊겼어요 😿</p>
        )}
        {duo && !hud.over && !hud.alive && hud.respawnIn > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-[30%] text-center font-cute text-ink drop-shadow">
            <p className="text-xl">앗, 부딪혔어요 😿</p>
            <p className="text-4xl text-rose">{hud.respawnIn}</p>
          </div>
        )}

        {hud.over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/65 px-6 text-center font-cute backdrop-blur-[2px]">
            {duo && hud.partner ? (
              <>
                <p className="text-4xl">{tie ? "🤝" : iWin ? "🏆" : "🥈"}</p>
                <p className="mt-1 text-2xl text-ink">{tie ? "비겼어요!" : iWin ? "내가 이겼어요!" : "아쉽게 졌어요"}</p>
                <div className="mt-3 grid w-full max-w-xs grid-cols-2 gap-2 text-sm">
                  <div className="rounded-2xl bg-white/90 p-3 ring-1 ring-line">
                    <p className="text-rose">{me.name}</p>
                    <p className="text-3xl text-ink">{hud.score}<span className="text-sm text-ink-soft">점</span></p>
                    <p className="text-xs text-ink-soft">최고 길이 {hud.best}</p>
                    <p className="text-xs text-ink-soft">연인 잡기 {hud.rivalKills}번 (+{hud.rivalKills * RIVAL_BONUS})</p>
                  </div>
                  <div className="rounded-2xl bg-white/90 p-3 ring-1 ring-line">
                    <p className="text-violet">{partner?.name}</p>
                    <p className="text-3xl text-ink">{hud.partner.score}<span className="text-sm text-ink-soft">점</span></p>
                    <p className="text-xs text-ink-soft">최고 길이 {hud.partner.best}</p>
                    <p className="text-xs text-ink-soft">연인 잡기 {hud.partner.rivalKills}번 (+{hud.partner.rivalKills * RIVAL_BONUS})</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-4xl">😿</p>
                <p className="mt-1 text-2xl text-ink">부딪혀 버렸어요</p>
                <p className="mt-1 text-sm text-ink-soft">
                  최고 길이 <b className="text-rose">{hud.best}</b> · 잡은 냥이 {hud.kills}
                </p>
                <p className="text-xs text-ink-soft">{hud.best > record ? "🎉 내 최고 기록!" : `내 최고 기록 ${record}`}</p>
              </>
            )}
            <div className="mt-4 flex gap-2">
              {onAgain && (
                <button onClick={onAgain} className="press rounded-full bg-gradient-to-br from-pink to-rose px-6 py-2.5 text-white shadow-soft">
                  {duo ? "한 판 더" : "다시 하기"}
                </button>
              )}
              <button onClick={() => onExit(true)} className={`press rounded-full px-6 py-2.5 shadow-soft ${onAgain ? "bg-white text-ink-soft" : "bg-gradient-to-br from-pink to-rose text-white"}`}>
                대기실로
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 몸 마디 색: 고등어·치즈 등은 줄무늬, 젖소·삼색은 얼룩 */
function coatAt(look: Look, i: number, pal: (typeof PALETTE)[Look]) {
  if (look === "patch") return i % 18 >= 6 && i % 18 < 11 ? pal.stripe : pal.coat;
  if (look === "calico") {
    const k = i % 22;
    return k >= 4 && k < 9 ? pal.stripe : k >= 13 && k < 17 ? pal.spot! : pal.coat;
  }
  return i % 7 < 2 ? pal.stripe : pal.coat;
}

/** 발자국 무늬 */
function paw(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, k = 1, color = "#f7dbe6") {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((seed % 5) * 0.4 - 0.8);
  ctx.beginPath();
  ctx.ellipse(0, 2 * k, 6 * k, 5 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy] of [[-6, -5], [-2, -8.5], [2, -8.5], [6, -5]]) {
    ctx.beginPath();
    ctx.arc(dx * k, dy * k, 2.3 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
