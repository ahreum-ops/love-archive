// 길쭉 냥이 — slither.io 같은 뱀 게임 엔진 (화면·네트워크와 무관한 순수 계산)
// 둥근 맵(중심 0,0 · 반지름 ARENA)을 돌아다니며 사료를 먹고 길어진다. 내 머리가 다른 냥이 몸에 닿거나 벽에 닿으면 끝.
// - 혼자 모드: 이 기기에서 전부 계산 (상대는 컴퓨터 냥이들)
// - 둘이 모드: a 기기(호스트)가 전부 계산해 스냅숏을 보내고, b 는 자기 방향·달리기만 보낸다. b 는 받은 머리 위치로 몸을 그려 낸다.

export const ARENA = 1250;
export const SPACING = 6; // 몸 마디 사이 간격
export const ROUND = 180; // 둘이 모드 한 판 (초)
export const RESPAWN = 2.5;
export const RIVAL_BONUS = 20; // 경쟁 모드: 연인을 내 몸에 부딪히게 하면 더해 주는 점수
const SPEED = 135;
const BOOST_SPEED = 260;
const TURN = 4.8; // 초당 회전 (길어지면 느려짐)
const START_MASS = 10;
const MIN_BOOST_MASS = 14;
const BOOST_COST = 4; // 달리는 동안 초당 줄어드는 길이
const FOOD_COUNT = 380;
const MAGNET = 16; // 사료를 끌어당기는 거리

export const LOOKS = ["tabby", "patch", "cheese", "gray", "black", "calico", "strawberry", "mint"] as const;
export type Look = (typeof LOOKS)[number];
export const FOOD_COLORS = ["#ffb3c7", "#a8e6cf", "#ffe28a", "#a9d4ff", "#cdb8ff", "#ffc9a3"];

export type Pt = { x: number; y: number };
export type Snake = {
  id: number;
  name: string;
  look: Look;
  ai: boolean;
  pts: Pt[]; // 0 이 머리
  angle: number;
  target: number;
  boost: boolean;
  mass: number;
  alive: boolean;
  /** 죽은 뒤 다시 태어나기까지 남은 시간 (Infinity 면 안 태어남 — 혼자 모드의 나) */
  respawn: number;
  best: number;
  kills: number;
  deaths: number;
  /** 경쟁 모드: 연인(사람 냥이)을 잡은 횟수 */
  rivalKills: number;
  dropT: number;
  brain: number; // 컴퓨터 냥이가 다음에 생각할 때까지
  /** 둘이 모드 b 기기: 호스트가 마지막으로 알려 준 머리 */
  net?: { x: number; y: number; a: number; at: number };
};
export type Food = { id: number; x: number; y: number; v: number; c: number };
export type Control = { angle: number; boost: boolean };
export type GameEvent = { t: "eat"; id: number; v: number } | { t: "die"; id: number; by: number | null };
export type Player = { id: number; name: string; look: Look };

export type World = {
  mode: "solo" | "duo";
  snakes: Snake[];
  food: Food[];
  nextFood: number;
  time: number;
  over: boolean;
  /** 이번 step 에서 일어난 일 (진동·안내용) */
  events: GameEvent[];
  /** 마지막으로 보낸 뒤 생기고 없어진 사료 (호스트가 스냅숏에 담고 비운다) */
  added: Food[];
  removed: number[];
};

const BOT_NAMES = ["치즈냥", "까망이", "회색이", "삼색이", "딸기냥", "민트냥", "보리", "두부", "모찌", "호떡"];

export const radius = (mass: number) => 8 + Math.min(16, Math.sqrt(mass) * 0.95);
export const segCount = (mass: number) => Math.min(520, Math.round(8 + mass * 1.1));
/** 화면에 보여 주는 길이 */
export const lengthOf = (s: Snake) => Math.floor(s.mass);

function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function randomInArena(margin: number): Pt {
  const r = Math.sqrt(Math.random()) * (ARENA - margin);
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

function addFood(w: World, x: number, y: number, v: number, c = Math.floor(Math.random() * FOOD_COLORS.length)) {
  if (Math.hypot(x, y) > ARENA - 8) return;
  const f = { id: w.nextFood++, x, y, v, c };
  w.food.push(f);
  w.added.push(f);
}

function newSnake(p: Player, ai: boolean): Snake {
  return {
    ...p, ai, pts: [], angle: 0, target: 0, boost: false, mass: START_MASS, alive: false,
    respawn: 0, best: 0, kills: 0, deaths: 0, rivalKills: 0, dropT: 0, brain: 0,
  };
}

/** 다른 냥이들과 멀리 떨어진 곳에 태어나게 */
function spawn(w: World, s: Snake, mass: number) {
  let best = randomInArena(250);
  let bestGap = -1;
  for (let i = 0; i < 24; i++) {
    const p = randomInArena(250);
    let gap = Infinity;
    for (const o of w.snakes) {
      if (o === s || !o.alive) continue;
      for (let j = 0; j < o.pts.length; j += 6) gap = Math.min(gap, Math.hypot(o.pts[j].x - p.x, o.pts[j].y - p.y));
    }
    if (gap > bestGap) {
      bestGap = gap;
      best = p;
    }
    if (gap > 400) break;
  }
  // 맵 가운데를 바라보고 태어난다
  const a = Math.atan2(-best.y, -best.x) + (Math.random() - 0.5);
  s.angle = s.target = a;
  s.mass = mass;
  s.alive = true;
  s.boost = false;
  s.pts = [];
  for (let i = 0; i < segCount(mass); i++) s.pts.push({ x: best.x - Math.cos(a) * i * SPACING, y: best.y - Math.sin(a) * i * SPACING });
}

export function newWorld(mode: World["mode"], players: Player[], bots: number): World {
  const w: World = { mode, snakes: [], food: [], nextFood: 1, time: 0, over: false, events: [], added: [], removed: [] };
  for (const p of players) {
    const s = newSnake(p, false);
    w.snakes.push(s);
    spawn(w, s, START_MASS);
  }
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const looks = LOOKS.filter((l) => !players.some((p) => p.look === l));
  for (let i = 0; i < bots; i++) {
    const s = newSnake({ id: 10 + i, name: names[i % names.length], look: looks[i % looks.length] }, true);
    w.snakes.push(s);
    spawn(w, s, START_MASS + Math.random() * 60);
  }
  for (let i = 0; i < FOOD_COUNT; i++) {
    const p = randomInArena(20);
    addFood(w, p.x, p.y, 1);
  }
  return w;
}

/** 둘이 모드 b 기기: 비어 있는 세계 (스냅숏으로 채운다) */
export function emptyWorld(): World {
  return { mode: "duo", snakes: [], food: [], nextFood: 1, time: 0, over: false, events: [], added: [], removed: [] };
}

function kill(w: World, s: Snake, by: Snake | null) {
  s.alive = false;
  s.deaths++;
  s.boost = false;
  s.respawn = s.ai || w.mode === "duo" ? RESPAWN : Infinity;
  if (by) by.kills++;
  if (by && !by.ai && !s.ai) by.rivalKills++;
  w.events.push({ t: "die", id: s.id, by: by?.id ?? null });
  // 몸이 반짝이는 사료로 변한다
  const n = Math.max(1, Math.ceil(s.pts.length / 3));
  const v = Math.max(1, Math.round((s.mass * 0.75) / n));
  for (let i = 0; i < s.pts.length; i += 3) {
    const p = s.pts[i];
    addFood(w, p.x + (Math.random() - 0.5) * 14, p.y + (Math.random() - 0.5) * 14, v);
  }
  s.pts = [];
}

/** 머리를 앞으로 보내고 몸 마디가 차례로 따라오게. 길이(mass)에 맞춰 마디 수도 맞춘다 */
export function moveSnake(s: Snake, dist: number) {
  const h = s.pts[0];
  h.x += Math.cos(s.angle) * dist;
  h.y += Math.sin(s.angle) * dist;
  followBody(s);
}

function followBody(s: Snake) {
  const pts = s.pts;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[i - 1];
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const d = Math.hypot(dx, dy);
    if (d > SPACING) {
      p.x = q.x + (dx / d) * SPACING;
      p.y = q.y + (dy / d) * SPACING;
    }
  }
  const want = segCount(s.mass);
  while (pts.length < want) pts.push({ ...pts[pts.length - 1] });
  if (pts.length > want) pts.length = want;
}

function turn(s: Snake, dt: number) {
  const rate = TURN / (1 + s.mass / 260);
  const d = angleDiff(s.angle, s.target);
  s.angle += Math.max(-rate * dt, Math.min(rate * dt, d));
}

type Box = { x0: number; y0: number; x1: number; y1: number };
function bbox(s: Snake): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s.pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/**
 * 한 프레임 진행 (혼자 모드·호스트). controls 는 사람 냥이 id 별 방향·달리기.
 * 컴퓨터 냥이는 스스로 생각한다.
 */
export function step(w: World, dt: number, controls: Record<number, Control>) {
  w.events = [];
  if (w.over) return;
  w.time += dt;
  if (w.mode === "duo" && w.time >= ROUND) {
    w.over = true;
    return;
  }

  for (const s of w.snakes) {
    if (!s.alive) {
      s.respawn -= dt;
      if (s.respawn <= 0) spawn(w, s, s.ai ? START_MASS + Math.random() * 30 : START_MASS);
      continue;
    }
    if (s.ai) think(w, s, dt);
    else if (controls[s.id]) {
      s.target = controls[s.id].angle;
      s.boost = controls[s.id].boost;
    }
    turn(s, dt);
    const boosting = s.boost && s.mass > MIN_BOOST_MASS;
    if (boosting) {
      s.mass -= BOOST_COST * dt;
      s.dropT -= dt;
      if (s.dropT <= 0) {
        s.dropT = 0.22;
        const tail = s.pts[s.pts.length - 1];
        addFood(w, tail.x, tail.y, 0.6);
      }
    }
    moveSnake(s, (boosting ? BOOST_SPEED : SPEED) * dt);
    s.best = Math.max(s.best, lengthOf(s));

    // 사료 먹기
    const h = s.pts[0];
    const reach = radius(s.mass) + MAGNET;
    for (let i = w.food.length - 1; i >= 0; i--) {
      const f = w.food[i];
      const dx = f.x - h.x;
      const dy = f.y - h.y;
      if (dx * dx + dy * dy < reach * reach) {
        s.mass += f.v;
        w.removed.push(f.id);
        w.food[i] = w.food[w.food.length - 1];
        w.food.pop();
        w.events.push({ t: "eat", id: s.id, v: f.v });
      }
    }
  }

  // 부딪힘 (다 움직인 뒤 한꺼번에 — 머리끼리 박으면 둘 다)
  const alive = w.snakes.filter((s) => s.alive);
  const boxes = new Map(alive.map((s) => [s, bbox(s)]));
  const dead: [Snake, Snake | null][] = [];
  for (const a of alive) {
    const h = a.pts[0];
    const ra = radius(a.mass);
    if (Math.hypot(h.x, h.y) > ARENA - ra * 0.6) {
      dead.push([a, null]);
      continue;
    }
    for (const b of alive) {
      if (b === a) continue;
      const rb = radius(b.mass);
      const box = boxes.get(b)!;
      const m = ra + rb;
      if (h.x < box.x0 - m || h.x > box.x1 + m || h.y < box.y0 - m || h.y > box.y1 + m) continue;
      const hit = (ra * 0.55 + rb * 0.85) ** 2;
      if (b.pts.some((p) => (p.x - h.x) ** 2 + (p.y - h.y) ** 2 < hit)) {
        dead.push([a, b]);
        break;
      }
    }
  }
  for (const [s, by] of dead) kill(w, s, by);

  // 사료 채우기 (조금씩)
  for (let i = 0; i < 4 && w.food.length < FOOD_COUNT; i++) {
    const p = randomInArena(20);
    addFood(w, p.x, p.y, 1);
  }
}

/** 컴퓨터 냥이: 앞에 몸이나 벽이 있으면 피하고, 아니면 가까운 사료를 쫓는다 */
function think(w: World, s: Snake, dt: number) {
  s.brain -= dt;
  if (s.brain > 0) return;
  s.brain = 0.1 + Math.random() * 0.12;
  const h = s.pts[0];
  const r = radius(s.mass);

  // 주변 몸 마디만 추려 두기
  const near: { x: number; y: number; r: number }[] = [];
  for (const o of w.snakes) {
    if (o === s || !o.alive) continue;
    const ro = radius(o.mass);
    for (let j = 0; j < o.pts.length; j += 2) {
      const p = o.pts[j];
      if (Math.abs(p.x - h.x) < 160 && Math.abs(p.y - h.y) < 160) near.push({ x: p.x, y: p.y, r: ro });
    }
  }
  const danger = (a: number) => {
    let d = 0;
    for (const [k, dist] of [[3, 22], [2, 50], [1, 90]]) {
      const x = h.x + Math.cos(a) * (dist + r);
      const y = h.y + Math.sin(a) * (dist + r);
      if (Math.hypot(x, y) > ARENA - r - 6) d += k;
      for (const p of near) if ((p.x - x) ** 2 + (p.y - y) ** 2 < (p.r + r + 4) ** 2) {
        d += k;
        break;
      }
    }
    return d;
  };

  const ahead = danger(s.angle);
  if (ahead > 0) {
    let bestA = s.angle;
    let bestD = Infinity;
    for (const off of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
      const d = danger(s.angle + off) + Math.abs(off) * 0.1;
      if (d < bestD) {
        bestD = d;
        bestA = s.angle + off;
      }
    }
    s.target = bestA;
    s.boost = ahead >= 3 && s.mass > 30 && Math.random() < 0.3;
    return;
  }

  // 사료 쫓기 (큰 사료일수록 좋아함)
  let best: Food | null = null;
  let bestScore = 0;
  for (const f of w.food) {
    const dx = f.x - h.x;
    const dy = f.y - h.y;
    if (Math.abs(dx) > 260 || Math.abs(dy) > 260) continue;
    const score = (f.v + 0.5) / (Math.hypot(dx, dy) + 30);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  if (best) s.target = Math.atan2(best.y - h.y, best.x - h.x);
  else s.target = s.angle + (Math.random() - 0.5) * 1.2;
  s.boost = Boolean(best && best.v >= 3 && s.mass > 25 && Math.random() < 0.4);
}

/** 경쟁 모드 점수 = 이번 판 최고 길이 + 연인 잡은 횟수 × RIVAL_BONUS */
export const duoScore = (s: Pick<Snake, "best" | "rivalKills">) => s.best + s.rivalKills * RIVAL_BONUS;

/** 순위 (길이 순) */
export function ranking(w: World) {
  return w.snakes.filter((s) => s.alive).sort((a, b) => b.mass - a.mass);
}

// ---- 둘이 모드 네트워크 (숫자는 정수로 줄여서) ----

export type SnakeSnapshot = {
  t: number; // 경과 시간 * 10
  o: 0 | 1; // 끝났나
  /** id, x, y, angle*100, mass*10, 달리기, 살아 있음, best, kills, deaths, rivalKills */
  s: number[][];
  fa: number[][]; // 새 사료 id, x, y, v*10, c
  fr: number[]; // 없어진 사료 id
  /** 전체 다시 맞추기 (처음·몇 초마다): 사료 전부 + 냥이 이름·생김새 */
  f?: number[][];
  m?: [number, string, Look][];
  e?: [number, number][]; // 죽음: id, 잡은 냥이 id(-1 = 벽)
};

const packFood = (f: Food) => [f.id, Math.round(f.x), Math.round(f.y), Math.round(f.v * 10), f.c];
const unpackFood = (a: number[]): Food => ({ id: a[0], x: a[1], y: a[2], v: a[3] / 10, c: a[4] });

/** 호스트: 스냅숏을 만들고, 그동안 쌓인 사료 변화·사건을 비운다 */
export function snapshot(w: World, full: boolean, events: GameEvent[]): SnakeSnapshot {
  const r = Math.round;
  const snap: SnakeSnapshot = {
    t: r(w.time * 10),
    o: w.over ? 1 : 0,
    s: w.snakes.map((s) => {
      const h = s.pts[0] ?? { x: 0, y: 0 };
      return [s.id, r(h.x), r(h.y), r(s.angle * 100), r(s.mass * 10), s.boost ? 1 : 0, s.alive ? 1 : 0, s.best, s.kills, s.deaths, s.rivalKills];
    }),
    fa: full ? [] : w.added.map(packFood),
    fr: full ? [] : w.removed,
  };
  if (full) {
    snap.f = w.food.map(packFood);
    snap.m = w.snakes.map((s) => [s.id, s.name, s.look]);
  }
  const deaths = events.filter((e) => e.t === "die").map((e) => [e.id, e.by ?? -1] as [number, number]);
  if (deaths.length) snap.e = deaths;
  w.added = [];
  w.removed = [];
  return snap;
}

/** b 기기: 받은 스냅숏을 세계에 반영한다. 머리는 net 에 두고 guestStep 이 부드럽게 따라간다 */
export function applySnapshot(w: World, snap: SnakeSnapshot, now: number): GameEvent[] {
  w.time = snap.t / 10;
  w.over = snap.o === 1;
  if (snap.m) {
    for (const [id, name, look] of snap.m) {
      const s = w.snakes.find((x) => x.id === id);
      if (s) Object.assign(s, { name, look });
      else w.snakes.push(newSnake({ id, name, look }, id >= 10));
    }
  }
  if (snap.f) w.food = snap.f.map(unpackFood);
  else {
    // 생기자마자 먹힌 사료도 있으니 먼저 넣고 나서 지운다
    for (const a of snap.fa) w.food.push(unpackFood(a));
    if (snap.fr.length) {
      const gone = new Set(snap.fr);
      w.food = w.food.filter((f) => !gone.has(f.id));
    }
  }
  for (const [id, x, y, a, mass, boost, alive, best, kills, deaths, rivalKills = 0] of snap.s) {
    const s = w.snakes.find((o) => o.id === id);
    if (!s) continue; // 이름·생김새를 아직 못 받음 — 다음 전체 맞추기 때
    const angle = a / 100;
    const reborn = alive === 1 && (!s.alive || !s.pts.length || Math.hypot(s.pts[0].x - x, s.pts[0].y - y) > 200);
    Object.assign(s, { mass: mass / 10, boost: boost === 1, alive: alive === 1, best, kills, deaths, rivalKills });
    s.net = { x, y, a: angle, at: now };
    if (!s.alive) s.pts = [];
    else if (reborn) {
      s.angle = s.target = angle;
      s.pts = [{ x, y }];
      for (let i = 1; i < segCount(s.mass); i++) s.pts.push({ x: x - Math.cos(angle) * i * SPACING, y: y - Math.sin(angle) * i * SPACING });
    }
  }
  return (snap.e ?? []).map(([id, by]) => ({ t: "die", id, by: by === -1 ? null : by }));
}

/**
 * b 기기: 받은 머리 위치 사이를 혼자 굴려서 부드럽게. 내 냥이는 내 조작대로 먼저 돌려 보고(바로 반응하는 느낌),
 * 위치는 호스트 값 쪽으로 조금씩 당긴다.
 */
export function guestStep(w: World, dt: number, now: number, myId: number, mine: Control) {
  for (const s of w.snakes) {
    if (!s.alive || !s.net || !s.pts.length) continue;
    const n = s.net;
    if (s.id === myId) {
      s.target = mine.angle;
      turn(s, dt);
      s.angle += angleDiff(s.angle, n.a) * 0.05;
    } else {
      s.angle += angleDiff(s.angle, n.a) * 0.3;
    }
    const speed = s.boost && s.mass > MIN_BOOST_MASS ? BOOST_SPEED : SPEED;
    const age = Math.min(0.3, (now - n.at) / 1000);
    const px = n.x + Math.cos(n.a) * speed * age;
    const py = n.y + Math.sin(n.a) * speed * age;
    const h = s.pts[0];
    h.x += Math.cos(s.angle) * speed * dt;
    h.y += Math.sin(s.angle) * speed * dt;
    const pull = s.id === myId ? 0.08 : 0.2;
    h.x += (px - h.x) * pull;
    h.y += (py - h.y) * pull;
    followBody(s);
  }
}
