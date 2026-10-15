"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import CatSprite from "@/components/cat-sprite";
import { Banner, PageHeader } from "@/components/ui";
import VolleyGame, { type GameMode, type Listen, type NetInbox, type Side } from "@/components/volley-game";
import { josa } from "@/lib/josa";
import { sendPush } from "@/lib/push";
import { useAppState, useSession } from "@/lib/store";
import { REMOTE } from "@/lib/supabase";
import { WIN } from "@/lib/volley";
import { VolleyRoom } from "@/lib/volley-room";

type Partner = { here: boolean; ready: boolean };

export default function VolleyPage() {
  const state = useAppState();
  const session = useSession();
  const [play, setPlay] = useState<{ mode: GameMode; round: number } | null>(null);
  const [partner, setPartner] = useState<Partner>({ here: false, ready: false });
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);
  const inbox = useRef<NetInbox>({});
  const listen = useCallback<Listen>((box) => {
    inbox.current = box;
    return () => {
      if (inbox.current === box) inbox.current = {};
    };
  }, []);
  const room = useRef<VolleyRoom | null>(null);
  const tryStartRef = useRef<() => void>(() => {});
  // 방 이벤트 콜백에서 최신 값을 보려고
  const live = useRef({ ready: false, partner: { here: false, ready: false } as Partner, playing: false });

  const who = session.status === "ready" ? session.who : null;
  const coupleId = session.status === "ready" ? session.coupleId : null;
  const online = REMOTE && Boolean(coupleId && who);

  useEffect(() => {
    live.current.playing = Boolean(play && play.mode.kind !== "practice");
  }, [play]);

  // 실시간 대결방 (화면에 있는 동안만 연결)
  useEffect(() => {
    if (!REMOTE || !coupleId || !who) return;
    const r: VolleyRoom = new VolleyRoom(coupleId, who, {
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
      onCat: (c) => inbox.current.onCat?.(c),
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
      setPlay({ mode: { kind: "host", room: r }, round: Date.now() });
    }
    function enterGuest() {
      if (who !== "b" || live.current.playing || !live.current.ready) return;
      live.current.playing = true;
      setPlay({ mode: { kind: "guest", room: r }, round: Date.now() });
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

  if (!state?.profile) return null;
  const names = state.profile.names;
  const me = state.profile.me;
  const mySide: Side = me === "a" ? 0 : 1;
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
    await sendPush({ title: "🧶 냥이 배구", body: `${josa(names[me], "이", "가")} 냥이 배구 한 판 하재요!`, url: "/play/volley", tag: "volley" });
  }

  function exitGame() {
    if (play && play.mode.kind !== "practice") {
      room.current?.leave();
      live.current.playing = false;
      live.current.ready = false;
      room.current?.setReady(false);
      setReady(false);
    }
    setPlay(null);
  }

  if (play) {
    const practice = play.mode.kind === "practice";
    const sideNames: [string, string] = practice
      ? mySide === 0 ? [names.a, "컴퓨터 냥이"] : ["컴퓨터 냥이", names.b]
      : [names.a, names.b];
    return (
      <VolleyGame
        key={play.round}
        mode={play.mode}
        mySide={mySide}
        names={sideNames}
        listen={listen}
        onExit={exitGame}
        onAgain={practice ? () => setPlay({ mode: { kind: "practice" }, round: Date.now() }) : undefined}
      />
    );
  }

  return (
    <div>
      <Banner message={error} onClose={() => setError(null)} />
      <PageHeader title="냥이 배구" sub={`털실공을 네트 너머로! ${WIN}점 먼저 내면 승리`} />
      <Link href="/play" className="mb-3 inline-block px-1 text-sm text-ink-soft">
        ‹ 놀이로
      </Link>

      <div className="rounded-[32px] bg-gradient-to-br from-lilac to-peach p-5 shadow-pop ring-1 ring-white">
        <div className="flex items-end justify-around">
          <div className="text-center">
            <CatSprite look="tabby" size={88} mood={me === "a" ? "happy" : "idle"} />
            <p className="font-cute text-ink">{names.a}</p>
          </div>
          <p className="mb-8 font-cute text-2xl text-rose">VS</p>
          <div className="text-center">
            <CatSprite look="patch" size={88} mood={me === "b" ? "happy" : "idle"} />
            <p className="font-cute text-ink">{names.b}</p>
          </div>
        </div>

        {online ? (
          <div className="mt-4 rounded-3xl bg-white/85 p-4 text-center">
            {!partnerJoined ? (
              <p className="text-sm text-ink-soft">연인이 아직 초대 코드로 들어오지 않았어요. 커플 연결이 끝나면 대결할 수 있어요.</p>
            ) : (
              <>
                <p className="font-cute text-ink">
                  {!connected
                    ? "대결방에 들어가는 중…"
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
                    <button
                      onClick={invite}
                      disabled={invited}
                      className="press rounded-full bg-blush px-4 py-2.5 font-cute text-rose disabled:opacity-50"
                    >
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
          <p className="mt-4 rounded-3xl bg-white/85 p-4 text-center text-sm text-ink-soft">
            {REMOTE ? "로그인 정보를 불러오는 중이에요." : "체험 모드에선 컴퓨터 냥이랑 연습할 수 있어요. 서버에 연결하면 각자 폰으로 실시간 대결해요."}
          </p>
        )}
      </div>

      <button
        onClick={() => setPlay({ mode: { kind: "practice" }, round: Date.now() })}
        className="press mt-4 w-full rounded-[28px] bg-white/85 p-4 text-left shadow-soft ring-1 ring-line"
      >
        <p className="font-cute text-lg text-ink">🤖 컴퓨터 냥이랑 연습하기</p>
        <p className="text-sm text-ink-soft">혼자서 감 잡기</p>
      </button>

      <div className="mt-4 rounded-[28px] border-2 border-dashed border-line bg-white/50 p-4 text-sm text-ink-soft">
        <p className="mb-1 font-cute text-base text-ink">하는 법</p>
        <p>◀ ▶ 로 움직이고, 점프로 털실공을 받아 넘겨요.</p>
        <p>점프한 채로 한 번 더 누르면 스파이크! 공이 내 쪽 바닥에 떨어지면 상대 점수예요.</p>
        <p>컴퓨터에선 ← → 와 스페이스바로도 할 수 있어요.</p>
      </div>
    </div>
  );
}
