// 길쭉 냥이 엔진 점검: 화면 없이 순수 계산만 돌려 본다.
// 실행: npm run check:snake

import { applySnapshot, duoScore, emptyWorld, guestStep, HEAD_BONUS, newWorld, RIVAL_BONUS, snapshot, step, type GameEvent, type Snake } from "../src/lib/snake.ts";

const DT = 1 / 60;
let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "통과" : "실패"} - ${name}`);
  if (!ok) failed++;
}

{
  // 컴퓨터 냥이 9마리를 2분 동안 굴려 본다
  const w = newWorld("solo", [], 9);
  check("컴퓨터 냥이도 모두 같은 크기로 시작", w.snakes.every((s) => s.mass === 10));
  let deaths = 0;
  let eats = 0;
  const t0 = performance.now();
  for (let i = 0; i < 60 * 120; i++) {
    step(w, DT, {});
    for (const e of w.events) {
      if (e.t === "die") deaths++;
      else eats++;
    }
  }
  const ms = (performance.now() - t0) / (60 * 120);
  check(`2분 동안 오류 없이 돎 (프레임당 ${ms.toFixed(2)}ms)`, ms < 4);
  check(`컴퓨터 냥이가 사료를 먹음 (${eats}번)`, eats > 200);
  check(`컴퓨터 냥이가 너무 자주 죽지 않음 (${deaths}번)`, deaths < 60);
  check(`사료가 바닥나지 않음 (${w.food.length}개)`, w.food.length > 200);
}

{
  // 벽으로 곧장 가면 죽는다 (혼자 모드의 나는 다시 안 태어남)
  const w = newWorld("solo", [{ id: 1, name: "나", look: "tabby" }], 0);
  const me = w.snakes[0];
  me.pts[0] = { x: 1200, y: 0 };
  let died = false;
  for (let i = 0; i < 120 && !died; i++) {
    step(w, DT, { 1: { angle: 0 } });
    died = w.events.some((e) => e.t === "die" && e.id === 1);
  }
  for (let i = 0; i < 300; i++) step(w, DT, {});
  check("벽에 닿으면 끝, 혼자 모드에선 다시 안 태어남", died && !me.alive);
}

{
  // 다른 냥이 몸에 머리를 박으면 죽고, 박힌 쪽은 잡은 수가 오른다
  const w = newWorld("duo", [{ id: 1, name: "a", look: "tabby" }, { id: 2, name: "b", look: "patch" }], 0);
  const [a, b] = w.snakes;
  // b 를 가로로 길게 눕히고, a 를 그 위에서 아래로 내려보낸다
  b.angle = 0;
  b.pts = b.pts.map((_, i) => ({ x: 100 - i * 6, y: 0 }));
  a.angle = Math.PI / 2;
  a.pts = a.pts.map((_, i) => ({ x: 40, y: -60 - i * 6 }));
  let by: number | null = null;
  for (let i = 0; i < 120 && by === null; i++) {
    step(w, DT, { 1: { angle: Math.PI / 2 }, 2: { angle: 0 } });
    for (const e of w.events) if (e.t === "die" && e.id === 1) by = e.by;
  }
  check("머리가 다른 냥이 몸에 닿으면 죽고, 잡은 냥이가 기록됨", by === 2 && b.kills === 1);
  check(`경쟁 모드: 연인을 잡으면 보너스 (b 점수 ${duoScore(b)} = 최고 길이 ${b.best} + ${RIVAL_BONUS})`, b.rivalKills === 1 && duoScore(b) === b.best + RIVAL_BONUS && a.rivalKills === 0);
  // 연인 잡기 횟수도 b 기기에 전해진다
  const g = emptyWorld();
  applySnapshot(g, JSON.parse(JSON.stringify(snapshot(w, true, []))), 0);
  check("연인 잡기 횟수가 스냅숏으로 전해짐", g.snakes.find((x) => x.id === 2)?.rivalKills === 1);
  for (let i = 0; i < 60 * 3; i++) step(w, DT, {});
  check("둘이 모드에선 잠깐 뒤 다시 태어남", a.alive);
}

/** b 를 가로로 눕히고 a 를 위에서 내려보내 a 머리가 b 몸에 닿게 한다. 죽은 냥이 id 를 돌려준다 */
function crash(aMass: number, bMass: number) {
  const w = newWorld("duo", [{ id: 1, name: "a", look: "tabby" }, { id: 2, name: "b", look: "patch" }, { id: 3, name: "c", look: "cheese" }], 0);
  const [a, b, c] = w.snakes;
  c.pts = c.pts.map((_, i) => ({ x: -900 - i * 6, y: 0 })); // 멀리 치워 둔다
  a.mass = aMass;
  b.mass = bMass;
  const lay = (s: Snake, n: number, at: (i: number) => { x: number; y: number }) => (s.pts = Array.from({ length: n }, (_, i) => at(i)));
  lay(b, 60, (i) => ({ x: 200 - i * 6, y: 0 }));
  lay(a, 60, (i) => ({ x: 40, y: -40 - i * 6 }));
  b.angle = 0;
  a.angle = Math.PI / 2;
  const died: GameEvent[] = [];
  const before = a.mass;
  for (let i = 0; i < 90 && !died.length; i++) {
    step(w, DT, { 1: { angle: Math.PI / 2 }, 2: { angle: 0 }, 3: { angle: Math.PI } });
    died.push(...w.events.filter((e) => e.t === "die"));
  }
  return { died, a, b, gained: a.mass - before };
}

{
  const big = crash(80, 20);
  check("큰 냥이가 작은 냥이 몸에 머리를 박으면 큰 냥이는 살고 작은 냥이가 먹힘", big.a.alive && !big.b.alive && big.died.some((e) => e.t === "die" && e.id === 2 && e.by === 1));
  check(`먹으면 바로 자람 (+${big.gained.toFixed(1)})`, big.gained >= 5);
  check(`연인 머리 점수 (${duoScore(big.a)} = ${big.a.best} + ${RIVAL_BONUS})`, duoScore(big.a) === big.a.best + RIVAL_BONUS);
  const small = crash(20, 80);
  check("작은 냥이가 큰 냥이 몸에 박으면 작은 냥이가 죽음", !small.a.alive && small.b.alive && small.b.kills === 1);
  const even = crash(20, 21);
  check("크기가 비슷하면 박은 쪽이 죽음", !even.a.alive && even.b.alive);
  // 컴퓨터 냥이 머리는 HEAD_BONUS
  check(`컴퓨터 냥이 머리 점수 ${HEAD_BONUS}`, duoScore({ best: 30, kills: 3, rivalKills: 1 }) === 30 + 2 * HEAD_BONUS + RIVAL_BONUS);
}

{
  // 스냅숏을 주고받으면 b 기기도 같은 세계를 그린다
  const host = newWorld("duo", [{ id: 1, name: "a", look: "tabby" }, { id: 2, name: "b", look: "patch" }], 7);
  const guest = emptyWorld();
  let pending: GameEvent[] = [];
  let size = 0;
  let now = 0;
  for (let i = 0; i < 60 * 10; i++) {
    step(host, DT, {});
    pending.push(...host.events);
    now += DT * 1000;
    guestStep(guest, DT, now, 2, { angle: 0 });
    if (i % 6 === 0) {
      const snap = JSON.parse(JSON.stringify(snapshot(host, i % 180 === 0, pending)));
      pending = [];
      if (i % 180 !== 0) size = Math.max(size, JSON.stringify(snap).length);
      applySnapshot(guest, snap, now);
    }
  }
  // 마지막 스냅숏 뒤에 호스트가 더 움직인 만큼도 보내고 나서 비교
  applySnapshot(guest, JSON.parse(JSON.stringify(snapshot(host, false, pending))), now);
  const sameFood = guest.food.length === host.food.length;
  const heads = host.snakes.filter((s) => s.alive).map((s) => {
    const g = guest.snakes.find((x) => x.id === s.id)!;
    return Math.hypot(g.pts[0].x - s.pts[0].x, g.pts[0].y - s.pts[0].y);
  });
  check(`b 기기 사료 수가 호스트와 같음 (${guest.food.length}/${host.food.length})`, sameFood);
  check(`b 기기 머리 위치가 호스트와 가까움 (최대 ${Math.max(...heads).toFixed(1)})`, Math.max(...heads) < 40);
  check(`평소 스냅숏이 작음 (최대 ${size} 바이트)`, size < 3000);
}

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n모두 통과");
