// 냥이 배구 — 물리 엔진 (화면·네트워크와 무관한 순수 계산)
// 좌표: 코트 W×H, 왼쪽 위가 (0,0). 0번 냥이는 왼쪽(a), 1번은 오른쪽(b).
// 실시간 대결에선 a 기기(호스트)가 공·점수를 계산하고, 각자 자기 냥이는 자기 기기에서 움직여 위치를 보낸다.

export const W = 480;
export const H = 300;
export const FLOOR = 272;
export const NET_X = W / 2;
export const NET_HALF = 5;
export const NET_TOP = 176;
export const CAT_R = 30;
export const BALL_R = 17;
export const WIN = 11;

const GRAVITY = 1500;
const BALL_GRAVITY = 560;
const MOVE = 270;
const JUMP = 600;
const HIT = 470;
const SPIKE = 720;
const MAX_BALL = 760;
const PAUSE_AFTER_POINT = 1.3;
const SPIKE_WINDOW = 0.28;

export type Input = { left: boolean; right: boolean; jump: boolean };
export const NO_INPUT: Input = { left: false, right: false, jump: false };

export type Cat = { x: number; y: number; vx: number; vy: number; spike: number; cool: number };
export type Phase = "count" | "play" | "point" | "over";

export type World = {
  cats: [Cat, Cat];
  ball: { x: number; y: number; vx: number; vy: number; spin: number };
  score: [number, number];
  phase: Phase;
  timer: number; // count·point 남은 시간
  server: 0 | 1; // 다음에 서브하는 쪽
  lastPoint: 0 | 1 | null;
  /** 이번 프레임에 공을 친 냥이 (효과음·흔들림용) */
  hit: 0 | 1 | null;
};

const ground = FLOOR - CAT_R;

function newCat(side: 0 | 1): Cat {
  return { x: side === 0 ? W * 0.22 : W * 0.78, y: ground, vx: 0, vy: 0, spike: 0, cool: 0 };
}

function serveBall(server: 0 | 1): World["ball"] {
  return { x: server === 0 ? W * 0.22 : W * 0.78, y: 60, vx: 0, vy: 0, spin: 0 };
}

export function newWorld(): World {
  return {
    cats: [newCat(0), newCat(1)],
    ball: serveBall(0),
    score: [0, 0],
    phase: "count",
    timer: 3,
    server: 0,
    lastPoint: null,
    hit: null,
  };
}

/** 냥이 한 마리 움직이기 (자기 쪽 코트 안에서만). 공중에서 점프 버튼 = 스파이크 */
export function stepCat(c: Cat, input: Input, side: 0 | 1, dt: number, frozen = false) {
  const onGround = c.y >= ground - 0.5;
  const dir = frozen ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  c.vx = dir * MOVE;
  if (!frozen && input.jump) {
    if (onGround) c.vy = -JUMP;
    else if (c.spike <= 0 && c.cool <= 0) c.spike = SPIKE_WINDOW;
  }
  c.vy += GRAVITY * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  if (c.y > ground) {
    c.y = ground;
    c.vy = 0;
  }
  const min = side === 0 ? CAT_R : NET_X + NET_HALF + CAT_R;
  const max = side === 0 ? NET_X - NET_HALF - CAT_R : W - CAT_R;
  c.x = Math.min(max, Math.max(min, c.x));
  c.spike = Math.max(0, c.spike - dt);
  c.cool = Math.max(0, c.cool - dt);
}

/**
 * 한 프레임 진행 (호스트·연습 모드). inputs 는 냥이별 입력.
 * remote 로 준 냥이는 상대 기기가 보내 준 위치를 그대로 쓰므로 여기서 움직이지 않는다.
 */
export function step(w: World, inputs: [Input, Input], dt: number, remote?: 0 | 1) {
  w.hit = null;
  const frozen = w.phase === "over";
  for (const side of [0, 1] as const) {
    if (side !== remote) stepCat(w.cats[side], inputs[side], side, dt, frozen);
  }

  if (w.phase === "count" || w.phase === "point") {
    w.timer -= dt;
    if (w.timer <= 0) {
      w.phase = "play";
      w.ball = serveBall(w.server);
    }
    return;
  }
  if (w.phase === "over") return;

  const b = w.ball;
  b.vy += BALL_GRAVITY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.spin += (b.vx / 40) * dt;

  // 벽·천장
  if (b.x < BALL_R) {
    b.x = BALL_R;
    b.vx = Math.abs(b.vx);
  } else if (b.x > W - BALL_R) {
    b.x = W - BALL_R;
    b.vx = -Math.abs(b.vx);
  }
  if (b.y < BALL_R) {
    b.y = BALL_R;
    b.vy = Math.abs(b.vy) * 0.8;
  }

  // 네트: 위쪽 끝에 맞으면 튀어 오르고, 옆면에 맞으면 되돌아간다
  if (Math.abs(b.x - NET_X) < NET_HALF + BALL_R && b.y + BALL_R > NET_TOP) {
    if (b.y < NET_TOP && b.vy > 0) {
      b.y = NET_TOP - BALL_R;
      b.vy = -Math.abs(b.vy) * 0.7;
    } else {
      b.x = b.x < NET_X ? NET_X - NET_HALF - BALL_R : NET_X + NET_HALF + BALL_R;
      b.vx = (b.x < NET_X ? -1 : 1) * Math.max(120, Math.abs(b.vx) * 0.7);
    }
  }

  // 냥이와 부딪힘
  for (const side of [0, 1] as const) {
    const c = w.cats[side];
    const dx = b.x - c.x;
    const dy = b.y - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= CAT_R + BALL_R || c.cool > 0) continue;
    if (c.spike > 0 && c.y < ground - 20) {
      // 스파이크: 상대 코트로 비스듬히 내리꽂기
      const v = spikeVelocity(b.x, b.y, side);
      b.vx = v.vx;
      b.vy = v.vy;
      c.spike = 0;
    } else {
      const nx = dist ? dx / dist : 0;
      const ny = dist ? dy / dist : -1;
      // 늘 조금은 위로 뜨게 해서 받아 올리기 쉽게
      b.vx = nx * HIT + c.vx * 0.35;
      b.vy = Math.min(ny * HIT, -260) + c.vy * 0.2;
      // 머리 한가운데 맞으면 제자리에서 끝없이 튀니, 조금은 네트 쪽으로 보낸다
      const toward = side === 0 ? 1 : -1;
      if (Math.abs(b.vx) < 90) b.vx = toward * (90 + Math.random() * 90);
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_BALL) {
      b.vx *= MAX_BALL / sp;
      b.vy *= MAX_BALL / sp;
    }
    // 겹친 만큼 밀어내기
    const push = CAT_R + BALL_R + 1;
    b.x = c.x + (dist ? dx / dist : 0) * push;
    b.y = c.y + (dist ? dy / dist : -1) * push;
    c.cool = 0.12;
    w.hit = side;
  }

  // 바닥에 닿으면 반대쪽 점수
  if (b.y + BALL_R >= FLOOR) {
    b.y = FLOOR - BALL_R;
    const scorer: 0 | 1 = b.x < NET_X ? 1 : 0;
    w.score[scorer]++;
    w.lastPoint = scorer;
    w.server = scorer;
    b.vx = 0;
    b.vy = 0;
    if (w.score[scorer] >= WIN) {
      w.phase = "over";
    } else {
      w.phase = "point";
      w.timer = PAUSE_AFTER_POINT;
    }
  }
}

/**
 * 스파이크: 상대 코트 안 아무 데나 떨어지게 꽂는다. 네트는 넘겨야 하니
 * 가장 센 속도부터 줄여 가며 '네트를 넘으면서 그 자리에 떨어지는' 속도를 찾는다 (멀리서 치면 자연히 약해짐)
 */
function spikeVelocity(x: number, y: number, side: 0 | 1) {
  const toward = side === 0 ? 1 : -1;
  const depth = 0.25 + Math.random() * 0.6;
  const land = side === 0 ? NET_X + 30 + depth * (W - NET_X - 60) : NET_X - 30 - depth * (NET_X - 60);
  const fall = FLOOR - BALL_R - y;
  for (let speed = SPIKE; speed >= 260; speed -= 40) {
    const tLand = Math.abs(land - x) / speed;
    const tNet = Math.abs(NET_X - x) / speed;
    const vy = (fall - 0.5 * BALL_GRAVITY * tLand * tLand) / tLand;
    const atNet = y + vy * tNet + 0.5 * BALL_GRAVITY * tNet * tNet;
    if (atNet < NET_TOP - BALL_R - 6) return { vx: toward * speed, vy };
  }
  return { vx: toward * 300, vy: -420 }; // 너무 낮으면 높이 띄워 넘긴다
}

export function winner(w: World): 0 | 1 | null {
  if (w.phase !== "over") return null;
  return w.score[0] > w.score[1] ? 0 : 1;
}

/** 컴퓨터 냥이: 공이 떨어질 곳으로 가서, 가까워지면 뛰고, 높이 있으면 스파이크 */
export function aiInput(w: World, side: 0 | 1, level = 0.8): Input {
  const c = w.cats[side];
  const b = w.ball;
  const mine = side === 0 ? b.x < NET_X : b.x > NET_X;
  const home = side === 0 ? W * 0.22 : W * 0.78;
  // 공이 내 쪽 바닥에 닿을 x 를 대충 예측 (벽 반사 무시)
  let target = home;
  if (w.phase === "play" && (mine || (side === 0 ? b.vx < 0 : b.vx > 0))) {
    const t = Math.max(0, (-b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * BALL_GRAVITY * (FLOOR - CAT_R * 1.6 - b.y)))) / BALL_GRAVITY);
    target = b.x + b.vx * t;
    // 네트 쪽으로 보내려고 공보다 살짝 바깥에 선다
    target += side === 0 ? -10 : 10;
  }
  const dx = target - c.x;
  const slack = 8 + (1 - level) * 30;
  const near = Math.hypot(b.x - c.x, b.y - c.y);
  const jump =
    w.phase === "play" && mine && near < 150 && b.y < c.y - 30 && b.vy > -100 && Math.random() < level * 0.5;
  const spike = c.y < ground - 40 && near < 80 && Math.random() < level * 0.6;
  return { left: dx < -slack, right: dx > slack, jump: jump || spike };
}

// ---- 네트워크로 보내는 모양 (숫자는 정수로 줄여서) ----

export type Snapshot = {
  c: [number, number, number, number][]; // x, y, spike>0?1:0, (예약)
  b: [number, number, number, number, number]; // x, y, vx, vy, spin*100
  s: [number, number];
  p: Phase;
  t: number; // timer*100
  v: 0 | 1;
  h: 0 | 1 | -1;
  l: 0 | 1 | -1;
};

export function snapshot(w: World): Snapshot {
  const r = Math.round;
  return {
    c: w.cats.map((c) => [r(c.x), r(c.y), c.spike > 0 ? 1 : 0, 0]),
    b: [r(w.ball.x), r(w.ball.y), r(w.ball.vx), r(w.ball.vy), r(w.ball.spin * 100)],
    s: [...w.score],
    p: w.phase,
    t: r(w.timer * 100),
    v: w.server,
    h: w.hit ?? -1,
    l: w.lastPoint ?? -1,
  };
}

/** 받은 스냅숏을 world 에 덮어쓴다. keep 으로 준 냥이(내 냥이)는 내 기기 값을 그대로 둔다 */
export function applySnapshot(w: World, s: Snapshot, keep?: 0 | 1) {
  for (const side of [0, 1] as const) {
    if (side === keep) continue;
    const c = w.cats[side];
    c.x = s.c[side][0];
    c.y = s.c[side][1];
    c.spike = s.c[side][2] ? SPIKE_WINDOW : 0;
  }
  w.ball = { x: s.b[0], y: s.b[1], vx: s.b[2], vy: s.b[3], spin: s.b[4] / 100 };
  w.score = [...s.s];
  w.phase = s.p;
  w.timer = s.t / 100;
  w.server = s.v;
  w.hit = s.h === -1 ? null : s.h;
  w.lastPoint = s.l === -1 ? null : s.l;
}

/** 스냅숏 사이에 공을 혼자 굴려서 끊겨 보이지 않게 (바닥·벽은 대충만) */
export function coastBall(w: World, dt: number) {
  if (w.phase !== "play") return;
  const b = w.ball;
  b.vy += BALL_GRAVITY * dt;
  b.x = Math.min(W - BALL_R, Math.max(BALL_R, b.x + b.vx * dt));
  b.y = Math.min(FLOOR - BALL_R, Math.max(BALL_R, b.y + b.vy * dt));
  b.spin += (b.vx / 40) * dt;
}
