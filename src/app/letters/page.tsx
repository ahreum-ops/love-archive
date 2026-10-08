"use client";

import { useState } from "react";
import { LetterView, WriteLetter } from "@/components/letter-sheets";
import { Button, Empty, PageHeader, Sheet } from "@/components/ui";
import WhoSwitch from "@/components/who-switch";
import { paperOf } from "@/lib/content";
import { diffDays, today } from "@/lib/dates";
import { josa } from "@/lib/josa";
import { isLocked } from "@/lib/letters";
import { useAppState } from "@/lib/store";
import type { Letter } from "@/lib/types";

export default function LettersPage() {
  const state = useAppState();
  const [box, setBox] = useState<"in" | "out">("in");
  const [writing, setWriting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!state?.profile) return null;

  const { profile, letters } = state;
  const me = profile.me;
  const partner = me === "a" ? "b" : "a";
  const received = letters.filter((l) => l.from !== me).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const sent = letters.filter((l) => l.from === me).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const unread = received.filter((l) => !l.readAt && !isLocked(l)).length;
  const list = box === "in" ? received : sent;
  const opened = letters.find((l) => l.id === openId);

  return (
    <div>
      <PageHeader title="편지함" sub={unread ? `안 읽은 편지 ${unread}통` : "마음을 꾹꾹 눌러 담아요"} right={<WhoSwitch />} />

      <div className="mb-4 flex rounded-full bg-white/85 p-1 shadow-soft ring-1 ring-line">
        {(
          [
            ["in", `받은 편지 ${received.length}`],
            ["out", `보낸 편지 ${sent.length}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setBox(k)}
            className={`press relative flex-1 rounded-full py-2 text-sm ${box === k ? "bg-blush font-cute text-rose" : "text-ink-soft"}`}
          >
            {label}
            {k === "in" && unread > 0 && <span className="absolute right-4 top-2 h-2 w-2 rounded-full bg-rose" />}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty
          emoji={box === "in" ? "📭" : "✍️"}
          title={box === "in" ? "아직 받은 편지가 없어요" : "아직 보낸 편지가 없어요"}
          desc={
            box === "in"
              ? `${josa(profile.names[partner], "이", "가")} 편지를 쓰면 여기로 도착해요. 먼저 써보는 건 어때요?`
              : `${profile.names[partner]}에게 첫 편지를 써보세요.`
          }
          action={<Button onClick={() => setWriting(true)}>💌 편지 쓰기</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {list.map((l) => (
            <li key={l.id}>
              <Envelope letter={l} incoming={box === "in"} fromName={profile.names[l.from]} toName={profile.names[l.from === "a" ? "b" : "a"]} onOpen={() => setOpenId(l.id)} />
            </li>
          ))}
        </ul>
      )}

      {list.length > 0 && (
        <button
          onClick={() => setWriting(true)}
          className="press fixed bottom-[calc(env(safe-area-inset-bottom)+96px)] right-[max(16px,calc(50%-208px))] z-30 flex items-center gap-1.5 rounded-full bg-gradient-to-br from-pink to-rose px-5 py-3.5 font-cute text-white shadow-pop"
        >
          ✍️ 편지 쓰기
        </button>
      )}

      <Sheet open={writing} onClose={() => setWriting(false)}>
        {writing && <WriteLetter onDone={() => setWriting(false)} onSent={() => setBox("out")} />}
      </Sheet>
      <Sheet open={!!opened} onClose={() => setOpenId(null)}>
        {opened && <LetterView key={opened.id} letter={opened} onClose={() => setOpenId(null)} />}
      </Sheet>
    </div>
  );
}

function Envelope({ letter, incoming, fromName, toName, onOpen }: { letter: Letter; incoming: boolean; fromName: string; toName: string; onOpen: () => void }) {
  const p = paperOf(letter.paper);
  const locked = isLocked(letter);
  const isNew = incoming && !letter.readAt && !locked;
  const date = letter.createdAt.slice(0, 10).split("-").map(Number);

  return (
    <button
      onClick={onOpen}
      disabled={incoming && locked}
      className="press relative block w-full overflow-hidden rounded-[24px] text-left shadow-soft ring-1 ring-white disabled:cursor-not-allowed"
      style={{ backgroundColor: p.envelope }}
    >
      {/* 봉투 뚜껑 */}
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-12 w-full">
        <path d="M0 0 L50 28 L100 0 Z" fill="white" fillOpacity="0.45" />
      </svg>
      <div className="relative flex items-center gap-3 px-5 pb-4 pt-9">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-soft ${isNew ? "animate-float" : ""}`}>
          {locked ? "🔒" : isNew ? "💌" : p.deco}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-cute text-[17px] text-ink">{letter.title || (incoming ? `${fromName}의 편지` : `${toName}에게`)}</p>
          <p className="text-xs text-ink/60">
            {incoming ? `From. ${fromName}` : `To. ${toName}`} · {date[0]}.{date[1]}.{date[2]}
          </p>
        </div>
        <span className="shrink-0 text-right text-xs">
          {locked ? (
            <span className="rounded-full bg-white/80 px-2 py-1 text-violet">{diffDays(today(), letter.openAt!)}일 뒤 열림</span>
          ) : isNew ? (
            <span className="rounded-full bg-rose px-2 py-1 text-white">NEW</span>
          ) : !incoming ? (
            <span className="text-ink/60">{letter.readAt ? "읽음 ✓" : "아직 안 읽음"}</span>
          ) : null}
        </span>
      </div>
    </button>
  );
}
