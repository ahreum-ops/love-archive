// 냥이 배구 실시간 대결 점검: 호스트(a) 기기에서 b 냥이(원격)가 공을 계속 받아 낼 수 있는지 순수 계산으로 확인한다.
// 실행: node scripts/volley-check.ts   (Node 23.6+ 는 타입을 지우고 바로 실행)
// 예전 버그: 원격 냥이는 stepCat 을 안 거쳐서 공을 한 번 치고 생긴 쿨타임(cool)이 영영 안 줄었다 → b 는 두 번째부터 공을 못 막음.

import { CAT_R, FLOOR, NO_INPUT, newWorld, step, syncRemoteCat, type World } from "../src/lib/volley.ts";

const DT = 1 / 60;
let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "통과" : "실패"} - ${name}`);
  if (!ok) failed++;
}

/** b 냥이 바로 위에서 공을 떨어뜨리고, 호스트가 b 를 원격 냥이로 계산할 때 b 가 공을 쳐 내는지 */
function dropOnB(w: World): boolean {
  const c = w.cats[1];
  w.phase = "play";
  w.ball = { x: c.x - 4, y: c.y - CAT_R - 60, vx: 0, vy: 0, spin: 0 };
  for (let i = 0; i < 90; i++) {
    // 실제 경기처럼 b 기기가 보낸 위치가 15Hz 로 들어온다 (b 는 가만히 서 있음)
    if (i % 4 === 0) syncRemoteCat(c, { x: c.x, y: c.y, vx: 0, vy: 0, k: 0 });
    step(w, [NO_INPUT, NO_INPUT], DT, 1);
    if (w.hit === 1) return true;
    if (w.phase !== "play") return false;
  }
  return false;
}

{
  const w = newWorld();
  const hits = [0, 1, 2, 3, 4].map(() => {
    const ok = dropOnB(w);
    // 다음 공까지 잠깐 쉬는 동안에도 호스트는 계속 돌아간다
    for (let i = 0; i < 30; i++) step(w, [NO_INPUT, NO_INPUT], DT, 1);
    return ok;
  });
  check(`원격 b 냥이가 공 다섯 개를 모두 받음 (${hits.map((h) => (h ? "O" : "X")).join("")})`, hits.every(Boolean));
  check("원격 b 냥이의 쿨타임이 다시 0 으로 돌아옴", w.cats[1].cool === 0);
}

{
  // 받은 위치 사이(1/15초)에도 원격 냥이가 받은 속도로 앞으로 나아가는지 — 늦게 반응하는 느낌을 줄인다
  const w = newWorld();
  const c = w.cats[1];
  syncRemoteCat(c, { x: 300, y: FLOOR - CAT_R, vx: 270, vy: 0, k: 0 });
  for (let i = 0; i < 4; i++) step(w, [NO_INPUT, NO_INPUT], DT, 1);
  check(`받은 속도로 위치를 이어 감 (x=${c.x.toFixed(1)})`, c.x > 315 && c.x < 320);
}

{
  // 스파이크는 버튼을 누른 순간 한 번만 켜지고, 계속 k=1 이 와도 친 뒤 다시 켜지지 않는다
  const w = newWorld();
  const c = w.cats[1];
  syncRemoteCat(c, { x: 360, y: 150, vx: 0, vy: 0, k: 1 });
  const first = c.spike > 0;
  c.spike = 0; // 공을 쳐서 스파이크를 썼다고 치고
  syncRemoteCat(c, { x: 360, y: 150, vx: 0, vy: 0, k: 1 });
  check("스파이크는 누른 순간 한 번만", first && c.spike === 0);
}

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n모두 통과");
