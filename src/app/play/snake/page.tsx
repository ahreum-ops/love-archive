"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, PageHeader } from "@/components/ui";
import SnakeGame, { type SnakeInbox, type SnakeListen, type SnakeMode } from "@/components/snake-game";
import { josa } from "@/lib/josa";
import { pushProblem, sendPush } from "@/lib/push";
import { HEAD_BONUS, RIVAL_BONUS, ROUND, type Player } from "@/lib/snake";
import { SnakeRoom } from "@/lib/snake-room";
import { useAppState, useSession } from "@/lib/store";
import { REMOTE } from "@/lib/supabase";

type Partner = { here: boolean; ready: boolean };

export default function SnakePage() {
  const state = useAppState();
  const session = useSession();
  const [play, setPlay] = useState<{ mode: SnakeMode; round: number } | null>(null);
  const [partner, setPartner] = useState<Partner>({ here: false, ready: false });
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);
  const inbox = useRef<SnakeInbox>({});
  const listen = useCallback<SnakeListen>((box) => {
    inbox.current = box;
    return () => {
      if (inbox.current === box) inbox.current = {};
    };
  }, []);
  const room = useRef<SnakeRoom | null>(null);
  const tryStartRef = useRef<() => void>(() => {});
  // 방 이벤트 콜백에서 최신 값을 보려고
  const live = useRef({ ready: false, partner: { here: false, ready: false } as Partner, playing: false });

  const who = session.status === "ready" ? session.who : null;
  const coupleId = session.status === "ready" ? session.coupleId : null;
  const online = REMOTE && Boolean(coupleId && who);

  const names = state?.profile?.names;
  const me = state?.profile?.me ?? "a";
  // 사람 냥이: a 는 고등어(1번), b 는 젖소(2번) — 냥이 배구와 같은 생김새
  const players = useMemo(() => {
    const a: Player = { id: 1, name: names?.a ?? "", look: "tabby" };
    const b: Player = { id: 2, name: names?.b ?? "", look: "patch" };
    return me === "a" ? { mine: a, theirs: b } : { mine: b, theirs: a };
  }, [names?.a, names?.b, me]);

  useEffect(() => {
    live.current.playing = Boolean(play && play.mode.kind !== "solo");
  }, [play]);

  // 실시간 놀이방 (화면에 있는 동안만 연결)
  useEffect(() => {
    if (!REMOTE || !coupleId || !who) return;
    const r: SnakeRoom = new SnakeRoom(coupleId, who, {
      onPresence: (p) => {
        setConnected(true);
        live.current.partner = p;
        setPartner(p);
        tryStart();
        if (!p.here && live.current.playing) endOnline("연인과 연결이 끊겼어요. 대기실에서 다시 만나요.");
      },
      onStart: () => enterGuest(),
      onState: (s) => {
        // 시작 신호를 놓쳤어도 경기 상태가 오면 들어간다
        if (!live.current.playing) enterGuest();
        inbox.current.onState?.(s);
      },
      onInput: (m) => inbox.current.onInput?.(m),
      onLeave: () => {
        if (live.current.playing) endOnline("연인이 대기실로 나갔어요.");
      },
      onError: (m) => setError(m),
    });
    room.current = r;

    function tryStart() {
      // a 가 호스트: 둘 다 준비되면 a 가 시작 신호를 보낸다
      if (who !== "a" || live.current.playing || !live.current.ready || !live.current.partner.ready) return;
      r.start();
      live.current.playing = true;
      unready();
      setPlay({ mode: { kind: "host", room: r }, round: Date.now() });
    }
    function enterGuest() {
      if (who !== "b" || live.current.playing || !live.current.ready) return;
      live.current.playing = true;
      unready();
      setPlay({ mode: { kind: "guest", room: r }, round: Date.now() });
    }
    // 판이 시작되면 준비를 풀어 둔다 — 끝나고 '한 판 더'를 둘 다 눌러야 다음 판이 시작되게
    function unready() {
      live.current.ready = false;
      r.setReady(false);
      setReady(false);
    }
    function endOnline(message: string) {
      live.current.playing = false;
      live.current.ready = false;
      r.setReady(false);
      setReady(false);
      setPlay(null);
      setError(message);
    }
    tryStartRef.current = tryStart;

    return () => {
      r.leave();
      r.close();
      room.current = null;
    };
  }, [coupleId, who]);

  if (!state?.profile || !names) return null;
  const partnerName = names[me === "a" ? "b" : "a"];
  const partnerJoined = session.status !== "ready" || session.partnerJoined;

  function toggleReady() {
    const next = !ready;
    setReady(next);
    live.current.ready = next;
    room.current?.setReady(next);
    if (next) tryStartRef.current();
  }

  async function invite() {
    setInvited(true);
    setTimeout(() => setInvited(false), 30_000);
    const problem = pushProblem(await sendPush({ title: "🐟 길쭉 냥이", body: `${josa(names![me], "이", "가")} 길쭉 냥이 한 판 겨루재요! ⚔️`, url: "/play/snake", tag: "snake" }));
    if (problem) {
      setInvited(false);
      setError(`알림을 못 보냈어요. ${problem}`);
    }
  }

  /** finished: 판이 끝난 뒤 결과 화면에서 나감 (상대를 쫓아내지 않는다) */
  function exitGame(finished = false) {
    if (play && play.mode.kind !== "solo") {
      if (!finished) room.current?.leave();
      live.current.playing = false;
      live.current.ready = false;
      room.current?.setReady(false);
      setReady(false);
    }
    setPlay(null);
  }

  /** 경쟁 모드 '한 판 더': 대기실로 돌아가 바로 준비 — 연인도 누르면 시작 */
  function rematch() {
    exitGame(true);
    setReady(true);
    live.current.ready = true;
    room.current?.setReady(true);
    tryStartRef.current();
  }

  if (play) {
    const solo = play.mode.kind === "solo";
    return (
      <SnakeGame
        key={play.round}
        mode={play.mode}
        me={players.mine}
        partner={solo ? undefined : players.theirs}
        listen={listen}
        onExit={exitGame}
        onAgain={solo ? () => setPlay({ mode: { kind: "solo" }, round: Date.now() }) : rematch}
      />
    );
  }

  return (
    <div>
      <Banner message={error} onClose={() => setError(null)} />
      <PageHeader title="길쭉 냥이" sub="사료를 먹고 길쭉하게! 작은 냥이는 꿀꺽, 큰 냥이는 조심" />
      <Link href="/play" className="mb-3 inline-block px-1 text-sm text-ink-soft">
        ‹ 놀이로
      </Link>

      <button
        onClick={() => setPlay({ mode: { kind: "solo" }, round: Date.now() })}
        className="press block w-full overflow-hidden rounded-[32px] bg-gradient-to-br from-peach to-blush p-5 text-left shadow-pop ring-1 ring-white"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-cute text-2xl text-ink">🐾 혼자 하기</p>
            <p className="mt-1 text-sm text-ink-soft">컴퓨터 냥이들 사이에서 누가 제일 길쭉해질까?</p>
          </div>
          <span className="text-5xl">🐟</span>
        </div>
      </button>

      <div className="mt-4 rounded-[32px] bg-gradient-to-br from-lilac to-mint p-5 shadow-pop ring-1 ring-white">
        <div className="flex items-center justify-between">
          <p className="font-cute text-xl text-ink">⚔️ 둘이 경쟁하기</p>
          <span className="rounded-full bg-white/80 px-2.5 py-0.5 font-cute text-xs text-violet">{ROUND / 60}분 대결</span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">같은 맵에서 각자 폰으로 겨뤄요. 컴퓨터 냥이들도 같이 돌아다녀요.</p>
        <ul className="mt-2 space-y-0.5 text-sm text-ink">
          <li>🐟 점수 = 이번 판에서 가장 길었을 때 길이 + 잡은 머리</li>
          <li>😋 냥이 머리 하나에 <b className="text-rose">+{HEAD_BONUS}점</b>, 연인 머리는 <b className="text-rose">+{RIVAL_BONUS}점</b></li>
          <li>😿 부딪혀도 2초 반 뒤에 작게 다시 태어나요</li>
        </ul>
        {online ? (
          <div className="mt-3 rounded-3xl bg-white/85 p-4 text-center">
            {!partnerJoined ? (
              <p className="text-sm text-ink-soft">연인이 아직 초대 코드로 들어오지 않았어요. 커플 연결이 끝나면 같이 할 수 있어요.</p>
            ) : (
              <>
                <p className="font-cute text-ink">
                  {!connected
                    ? "놀이방에 들어가는 중…"
                    : !partner.here
                      ? `${josa(partnerName, "이", "가")} 아직 안 들어왔어요`
                      : partner.ready
                        ? `${josa(partnerName, "이", "가")} 준비됐어요! 💗`
                        : `${josa(partnerName, "이", "가")} 들어왔어요`}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {partner.here ? "둘 다 준비를 누르면 바로 시작해요" : "알림을 보내서 이 화면으로 불러 보세요"}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  {!partner.here && (
                    <button onClick={invite} disabled={invited} className="press rounded-full bg-blush px-4 py-2.5 font-cute text-rose disabled:opacity-50">
                      {invited ? "알림 보냈어요" : "🔔 같이 하자고 부르기"}
                    </button>
                  )}
                  <button
                    onClick={toggleReady}
                    disabled={!connected}
                    className={`press rounded-full px-6 py-2.5 font-cute shadow-soft disabled:opacity-50 ${
                      ready ? "bg-white text-rose ring-2 ring-rose" : "bg-gradient-to-br from-pink to-rose text-white"
                    }`}
                  >
                    {ready ? "준비 완료 ✓" : "준비"}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="mt-3 rounded-3xl bg-white/85 p-4 text-center text-sm text-ink-soft">
            {REMOTE ? "로그인 정보를 불러오는 중이에요." : "체험 모드에선 혼자 하기만 돼요. 서버에 연결하면 둘이 각자 폰으로 겨룰 수 있어요."}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-[28px] border-2 border-dashed border-line bg-white/50 p-4 text-sm text-ink-soft">
        <p className="mb-1 font-cute text-base text-ink">하는 법</p>
        <p>화면 아무 데나 손가락을 대고 끌면 그쪽으로 가요.</p>
        <p>모두 같은 속도, 같은 크기로 시작해요. 먼저 많이 먹는 냥이가 커져요.</p>
        <p>내 머리가 벽이나 나보다 크거나 비슷한 냥이 몸에 닿으면 끝!</p>
        <p>내가 훨씬 크면(이름 옆 😋) 작은 냥이와 부딪혀도 안 죽고 꿀꺽 먹어요. 머리 하나에 +{HEAD_BONUS}점, 먹힌 냥이 몸은 반짝이 사료로 쏟아져요. 이름 옆 ⚠️ 는 나를 먹을 수 있는 냥이예요.</p>
        <p>경쟁할 땐 연인이 화면 밖에 있으면 가장자리 보라색 화살표가 어디 있는지 알려 줘요.</p>
        <p>컴퓨터에선 마우스 쪽으로 가요.</p>
      </div>
    </div>
  );
}
