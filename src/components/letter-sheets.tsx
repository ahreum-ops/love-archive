"use client";

import { useRef, useState } from "react";
import { PAPERS, paperOf } from "@/lib/content";
import { addDays, formatDate, today } from "@/lib/dates";
import { josa } from "@/lib/josa";
import { isLocked } from "@/lib/letters";
import { uid, update, useAppState } from "@/lib/store";
import { REMOTE } from "@/lib/supabase";
import type { Letter } from "@/lib/types";
import { AutoTextarea, LetterPaper, penText } from "./letter-paper";
import { Banner, Button, inputClass } from "./ui";

/** 편지 쓰기 */
export function WriteLetter({ onDone, onSent }: { onDone: () => void; onSent: () => void }) {
  const state = useAppState()!;
  const p = state.profile!;
  const partner = p.me === "a" ? "b" : "a";
  const [paper, setPaper] = useState<string>(PAPERS[0].id);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [useOpenAt, setUseOpenAt] = useState(false);
  const [openAt, setOpenAt] = useState(addDays(today(), 7));
  const [sent, setSent] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);

  const tomorrow = addDays(today(), 1);
  const valid = body.trim() && (!useOpenAt || openAt >= tomorrow);

  function send() {
    const letter: Letter = {
      id: uid(),
      from: p.me,
      title: title.trim() || undefined,
      body: body.trim(),
      paper,
      createdAt: new Date().toISOString(),
      openAt: useOpenAt ? openAt : undefined,
    };
    const r = update((s) => ({ ...s, letters: [...s.letters, letter] }));
    if (!r.ok) return setError(r.error);
    setSent(true);
    onSent();
  }

  if (sent) {
    return (
      <div className="py-8 text-center">
        <div className="animate-pop text-7xl">💌</div>
        <p className="mt-4 font-cute text-2xl text-rose">편지를 보냈어요</p>
        <p className="mt-1 text-sm text-ink-soft">
          {useOpenAt ? `${formatDate(openAt)}에 ${josa(p.names[partner], "이", "가")} 열어볼 수 있어요.` : `${josa(p.names[partner], "이", "가")} 열면 ‘읽음’으로 바뀌어요.`}
        </p>
        {!REMOTE && (
          <p className="mt-4 rounded-2xl bg-lilac/60 px-4 py-3 text-xs text-ink-soft">
            체험 모드: 위쪽 ‘지금 {p.names[p.me]} ⇄’ 버튼으로 {p.names[partner]} 시점으로 바꾸면 받은 편지를 볼 수 있어요.
          </p>
        )}
        <Button onClick={onDone} className="mt-6">
          닫기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError(null)} />
      <h2 className="font-cute text-xl">{p.names[partner]}에게 편지 쓰기</h2>

      <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5">
        {PAPERS.map((x) => (
          <button
            key={x.id}
            onClick={() => setPaper(x.id)}
            className={`press flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm ring-2 ${paper === x.id ? "ring-rose" : "ring-transparent"}`}
            style={{ backgroundColor: x.envelope }}
          >
            {x.deco} {x.name}
          </button>
        ))}
      </div>

      <LetterPaper paper={paper}>
        <p className={`${penText} text-rose`}>To. {p.names[partner]}</p>
        {/* 제목: 길면 자동 줄바꿈, 엔터는 본문으로 이동 */}
        <AutoTextarea
          value={title}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              bodyRef.current?.focus();
            }
          }}
          enterKeyHint="next"
          placeholder="제목 (선택)"
          maxLength={40}
          className={`${penText} font-bold`}
        />
        <AutoTextarea
          ref={bodyRef}
          autoFocus
          minLines={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          enterKeyHint="enter"
          placeholder="하고 싶은 말을 마음껏 써주세요. 엔터로 줄을 바꿀 수 있고, 글자 수 제한은 없어요."
          className={penText}
        />
        <p className={`${penText} text-right`}>From. {p.names[p.me]}</p>
      </LetterPaper>

      <div className="rounded-2xl bg-cream p-4">
        <label className="flex items-center justify-between">
          <span>
            <span className="block">🔒 열어볼 날 정하기</span>
            <span className="text-xs text-ink-soft">그날까지는 {josa(p.names[partner], "이", "가")} 열 수 없어요</span>
          </span>
          <input type="checkbox" checked={useOpenAt} onChange={(e) => setUseOpenAt(e.target.checked)} className="h-5 w-5 accent-rose" />
        </label>
        {useOpenAt && (
          <input type="date" min={tomorrow} value={openAt} onChange={(e) => setOpenAt(e.target.value)} className={`${inputClass} mt-3 bg-white`} />
        )}
        {useOpenAt && openAt < tomorrow && <p className="mt-2 pl-1 text-sm text-rose">내일 이후 날짜를 골라주세요</p>}
      </div>

      <Button onClick={send} disabled={!valid} className="w-full py-4">
        💌 보내기
      </Button>
    </div>
  );
}

/** 편지 열어보기 (안 읽은 받은 편지는 봉투부터) */
export function LetterView({ letter, onClose }: { letter: Letter; onClose: () => void }) {
  const state = useAppState()!;
  const p = state.profile!;
  const incoming = letter.from !== p.me;
  const to = letter.from === "a" ? "b" : "a";
  const [opened, setOpened] = useState(!incoming || !!letter.readAt);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paper = paperOf(letter.paper);

  // 받은 편지를 처음 펼치면 읽음 처리
  function open() {
    setOpened(true);
    if (incoming && !letter.readAt && !isLocked(letter)) {
      const r = update((s) => ({
        ...s,
        letters: s.letters.map((l) => (l.id === letter.id ? { ...l, readAt: new Date().toISOString() } : l)),
      }));
      if (!r.ok) setError(r.error);
    }
  }

  if (!opened) {
    return (
      <button onClick={open} className="block w-full py-8 text-center">
        <div className="relative mx-auto h-44 w-64 animate-pop rounded-[20px] shadow-pop" style={{ backgroundColor: paper.envelope }}>
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <path d="M0 0 L50 34 L100 0" fill="white" fillOpacity="0.5" />
            <path d="M0 60 L40 28 M100 60 L60 28" stroke="white" strokeOpacity="0.6" strokeWidth="0.8" fill="none" />
          </svg>
          <span className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 animate-float text-4xl">💌</span>
        </div>
        <p className="mt-6 font-cute text-xl text-ink">{josa(p.names[letter.from], "이", "가")} 보낸 편지</p>
        <p className="mt-1 text-sm text-ink-soft">톡 눌러서 열어보세요</p>
      </button>
    );
  }

  function remove() {
    const r = update((s) => ({ ...s, letters: s.letters.filter((l) => l.id !== letter.id) }));
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <div className="animate-flip space-y-4">
      <Banner message={error} onClose={() => setError(null)} />
      <LetterPaper paper={letter.paper}>
        <p className={`${penText} text-rose`}>To. {p.names[to]}</p>
        {letter.title && <p className={`${penText}`}>{letter.title}</p>}
        <p className={`${penText} whitespace-pre-wrap break-words`}>{letter.body}</p>
        <p className={`${penText} mt-[34px] text-right`}>From. {p.names[letter.from]}</p>
        <p className="text-right text-xs leading-[34px] text-ink/50">{formatDate(letter.createdAt.slice(0, 10))}</p>
      </LetterPaper>

      {!incoming && (
        <p className="text-center text-xs text-ink-soft">
          {isLocked(letter)
            ? `🔒 ${formatDate(letter.openAt!)}에 열려요`
            : letter.readAt
              ? `${josa(p.names[to], "이", "가")} ${formatDate(letter.readAt.slice(0, 10))}에 읽었어요 ✓`
              : `${josa(p.names[to], "이", "가")} 아직 안 읽었어요`}
        </p>
      )}

      {!incoming &&
        (confirmDelete ? (
          <div className="rounded-2xl bg-blush p-3 text-center text-sm">
            <p className="text-rose">이 편지를 지울까요? {p.names[to]}의 편지함에서도 사라져요.</p>
            <div className="mt-2 flex justify-center gap-4">
              <button onClick={() => setConfirmDelete(false)} className="text-ink-soft">
                취소
              </button>
              <button onClick={remove} className="font-cute text-rose">
                지우기
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="w-full text-center text-xs text-ink-soft">
            보낸 편지 지우기
          </button>
        ))}
    </div>
  );
}
