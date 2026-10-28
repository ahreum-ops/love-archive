"use client";

import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Banner } from "@/components/ui";
import WhoSwitch from "@/components/who-switch";
import {
  clearChatError,
  clockLabel,
  dayLabel,
  discardMessage,
  isJumboEmoji,
  loadOlder,
  localDay,
  markRead,
  react,
  retryMessage,
  sendMessage,
  unsend,
  useChat,
  type Message,
} from "@/lib/chat";
import { compressImage } from "@/lib/image";
import { useAppState } from "@/lib/store";
import { REMOTE } from "@/lib/supabase";
import type { Who } from "@/lib/types";

const REACTIONS = ["❤️", "🥰", "😂", "😮", "😢", "👍"];
const EMOJIS = ["❤️", "💕", "💗", "🥰", "😘", "😍", "🤗", "😊", "😆", "😂", "🥹", "😭", "😢", "😴", "🤔", "😳", "🙏", "👍", "👏", "🎉", "✨", "🌸", "🍀", "☕", "🍰", "🍜", "🐱", "🐶", "🌙", "⭐"];

export default function ChatPage() {
  const state = useAppState();
  const chat = useChat();
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const prevRef = useRef<{ count: number; last?: string; first?: string; height: number }>({ count: 0, height: 0 });
  const box = useVisualViewport();

  const me = state?.profile?.me;
  const messages = chat.messages;

  // 이 화면을 보는 동안 상대 메시지는 읽음으로
  useEffect(() => {
    if (!me) return;
    const read = () => document.visibilityState === "visible" && void markRead(me);
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [me, messages]);

  // 새 메시지가 오면 아래로. 위에서 이전 대화를 붙였으면 보던 자리를 지킨다
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const prev = prevRef.current;
    const last = messages.at(-1);
    if (prev.first && messages[0]?.id !== prev.first && last?.id === prev.last) {
      el.scrollTop += el.scrollHeight - prev.height;
    } else if (last && last.id !== prev.last) {
      if (prev.count === 0 || atBottom.current || last.from === me) el.scrollTop = el.scrollHeight;
      else setNewBelow(true);
    }
    prevRef.current = { count: messages.length, last: last?.id, first: messages[0]?.id, height: el.scrollHeight };
  }, [messages, me]);

  // 들어올 때마다 맨 아래부터. Next 가 전에 본 화면을 숨겨 뒀다 다시 보여 줄 때도 이 effect 가 다시 돌고,
  // 숨겨진 동안 스크롤이 0 으로 돌아가 있어서 여기서 다시 내린다
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = true;
    el.scrollTop = el.scrollHeight;
    const raf = requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
    return () => cancelAnimationFrame(raf);
  }, []);

  // 키보드가 올라와 화면이 줄어도 마지막 메시지가 보이게
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [box.height, emojiOpen]);

  if (!state?.profile || !me) return null;
  const { names } = state.profile;
  const partner: Who = me === "a" ? "b" : "a";
  const lastReadMine = [...messages].reverse().find((m) => m.from === me && m.readAt && !m.status)?.id;

  function onScroll() {
    const el = listRef.current!;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setNewBelow(false);
    if (el.scrollTop < 40 && chat.hasMore && !chat.loadingOlder) void loadOlder();
  }

  function send(body = text) {
    if (!body.trim()) return;
    void sendMessage(me!, body);
    if (body === text) setText("");
    setEmojiOpen(false);
    atBottom.current = true;
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 한글 조합 중 Enter 는 글자 확정용. 폰에선 Enter 가 줄바꿈
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || matchMedia("(pointer: coarse)").matches) return;
    e.preventDefault();
    send();
  }

  async function pickPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      // 체험 모드는 브라우저 저장 공간이 작아서 더 작게
      const size = REMOTE ? 1280 : 480;
      const srcs = await Promise.all(Array.from(files, (f) => compressImage(f, size, REMOTE ? 0.8 : 0.7)));
      atBottom.current = true;
      for (const src of srcs) await sendMessage(me!, "", src);
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 불러오지 못했어요");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function tap(m: Message, now: number) {
    if (m.deleted || m.status) return;
    setEmojiOpen(false);
    // 두 번 톡톡 → 하트
    if (lastTap.current?.id === m.id && now - lastTap.current.at < 350) {
      lastTap.current = null;
      setSelected(null);
      void react(me!, m.id, m.reactions[me!] === "❤️" ? null : "❤️");
      return;
    }
    lastTap.current = { id: m.id, at: now };
    setSelected(selected === m.id ? null : m.id);
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 mx-auto flex w-full max-w-md flex-col"
      style={{ height: box.height ? `${box.height}px` : "100dvh", transform: box.top ? `translateY(${box.top}px)` : undefined }}
    >
      <Banner message={error ?? chat.error} onClose={() => (error ? setError(null) : clearChatError())} />

      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+12px)]">
        <Link href="/" className="press flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xl text-ink-soft shadow-soft ring-1 ring-line" aria-label="홈으로">
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-cute text-xl text-ink">{names[partner]}</h1>
          <p className="text-[11px] text-ink-soft">우리 둘만의 대화 💗</p>
        </div>
        <WhoSwitch />
      </header>

      <div ref={listRef} onScroll={onScroll} className="scrollbar-none flex-1 overflow-y-auto overscroll-contain px-3 pb-2" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
        {chat.loading ? (
          <p className="py-16 text-center text-sm text-ink-soft">대화를 불러오는 중…</p>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-3 animate-float text-5xl">💬</div>
            <p className="font-cute text-lg text-ink">아직 나눈 대화가 없어요</p>
            <p className="mt-1 text-sm text-ink-soft">
              {names[partner]}에게 첫 마디를 건네 볼까요?
              {!REMOTE && " 체험 모드에선 위의 ⇄ 버튼으로 상대가 되어 답장해 볼 수 있어요."}
            </p>
            <button onClick={() => send("💗")} className="press mt-5 rounded-full bg-blush px-5 py-2.5 font-cute text-rose">
              💗 하트 보내기
            </button>
          </div>
        ) : (
          <>
            {chat.hasMore && (
              <button onClick={() => void loadOlder()} disabled={chat.loadingOlder} className="press mx-auto my-2 block rounded-full bg-white/80 px-4 py-1.5 text-xs text-ink-soft ring-1 ring-line">
                {chat.loadingOlder ? "불러오는 중…" : "이전 대화 더 보기"}
              </button>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const newDay = !prev || localDay(prev.createdAt) !== localDay(m.createdAt);
              const sameMinute = (a?: Message) => a && a.from === m.from && clockLabel(a.createdAt) === clockLabel(m.createdAt) && localDay(a.createdAt) === localDay(m.createdAt);
              const firstOfGroup = newDay || !sameMinute(prev);
              const lastOfGroup = !sameMinute(next) || Boolean(next?.status) !== Boolean(m.status);
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="my-4 flex justify-center">
                      <span className="rounded-full bg-white/75 px-3 py-1 text-[11px] text-ink-soft ring-1 ring-line">{dayLabel(m.createdAt)}</span>
                    </div>
                  )}
                  <Bubble
                    m={m}
                    mine={m.from === me}
                    me={me}
                    name={names[m.from]}
                    firstOfGroup={firstOfGroup}
                    lastOfGroup={lastOfGroup}
                    showRead={m.id === lastReadMine}
                    selected={selected === m.id}
                    onTap={(at) => tap(m, at)}
                    onReact={(emoji) => {
                      setSelected(null);
                      void react(me, m.id, m.reactions[me] === emoji ? null : emoji);
                    }}
                    onUnsend={() => {
                      setSelected(null);
                      if (confirm("이 메시지를 보내기 취소할까요? 상대 화면에서도 사라져요.")) void unsend(m.id);
                    }}
                    onPhoto={() => m.photo && setViewer(m.photo)}
                    onPhotoLoad={() => {
                      // 서버 사진은 늦게 떠서 높이가 바뀐다 → 맨 아래를 보고 있었으면 계속 아래로
                      if (atBottom.current) listRef.current!.scrollTop = listRef.current!.scrollHeight;
                    }}
                  />
                </Fragment>
              );
            })}
          </>
        )}
      </div>

      {newBelow && (
        <button
          onClick={() => {
            listRef.current!.scrollTop = listRef.current!.scrollHeight;
            setNewBelow(false);
          }}
          className="press absolute bottom-24 left-1/2 -translate-x-1/2 animate-pop rounded-full bg-white px-4 py-2 text-xs text-rose shadow-pop ring-1 ring-pink"
        >
          새 메시지 ↓
        </button>
      )}

      {/* 입력창 */}
      <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1">
        {emojiOpen && (
          <div className="mb-2 grid animate-pop grid-cols-8 gap-1 rounded-[22px] bg-white/95 p-2 shadow-pop ring-1 ring-line">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setText((t) => t + e)} className="press rounded-xl py-1.5 text-2xl hover:bg-blush" aria-label={`${e} 넣기`}>
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5 rounded-[26px] bg-white/95 p-1.5 shadow-pop ring-1 ring-line backdrop-blur">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-peach text-lg disabled:opacity-50"
            aria-label="사진 보내기"
          >
            {busy ? "⏳" : "📷"}
          </button>
          <button
            onClick={() => setEmojiOpen((o) => !o)}
            className={`press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${emojiOpen ? "bg-pink" : "bg-lemon"}`}
            aria-label="이모티콘"
          >
            😊
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setEmojiOpen(false)}
            rows={1}
            maxLength={2000}
            placeholder="메시지 보내기"
            className="field-sizing-content max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[16px] leading-6 text-ink outline-none placeholder:text-ink-soft/60"
          />
          <button
            onClick={() => (text.trim() ? send() : send("💗"))}
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink to-rose text-white shadow-soft"
            aria-label={text.trim() ? "보내기" : "하트 보내기"}
          >
            {text.trim() ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
              </svg>
            ) : (
              <span className="text-lg">💗</span>
            )}
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pickPhotos(e.target.files)} />

      {viewer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/80 p-4" onClick={() => setViewer(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="" className="max-h-full max-w-full animate-pop rounded-3xl object-contain" />
        </div>
      )}
    </div>
  );
}

function Bubble({
  m,
  mine,
  me,
  name,
  firstOfGroup,
  lastOfGroup,
  showRead,
  selected,
  onTap,
  onReact,
  onUnsend,
  onPhoto,
  onPhotoLoad,
}: {
  m: Message;
  mine: boolean;
  me: Who;
  name: string;
  firstOfGroup: boolean;
  lastOfGroup: boolean;
  showRead: boolean;
  selected: boolean;
  /** 누른 시각 (두 번 톡톡 판별용) */
  onTap: (at: number) => void;
  onReact: (emoji: string) => void;
  onUnsend: () => void;
  onPhoto: () => void;
  onPhotoLoad: () => void;
}) {
  const jumbo = !m.deleted && !m.photo && isJumboEmoji(m.body);
  const reactions = Object.entries(m.reactions) as [Who, string][];
  const meta = (
    <div className={`flex shrink-0 flex-col justify-end pb-0.5 text-[10px] leading-tight ${mine ? "items-end" : "items-start"}`}>
      {m.status === "sending" && <span className="text-ink-soft">보내는 중</span>}
      {m.status === "failed" && <span className="text-rose">못 보냄</span>}
      {!m.status && mine && !m.readAt && <span className="font-cute text-rose">1</span>}
      {!m.status && showRead && <span className="text-violet">읽음</span>}
      {!m.status && lastOfGroup && <span className="whitespace-nowrap text-ink-soft">{clockLabel(m.createdAt)}</span>}
    </div>
  );

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} ${firstOfGroup ? "mt-3" : "mt-1"}`}>
      {!mine && firstOfGroup && <span className="mb-1 ml-11 text-[11px] text-ink-soft">{name}</span>}
      <div className={`flex max-w-[85%] items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
        {!mine && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full bg-lilac font-cute text-sm text-violet ${firstOfGroup ? "" : "invisible"}`}>
            {name.slice(0, 1)}
          </span>
        )}
        <div className={`relative min-w-0 ${reactions.length ? "mb-3" : ""}`}>
          <button onClick={(e) => onTap(e.timeStamp)} className={`block text-left ${m.status === "sending" ? "opacity-60" : ""}`}>
            {m.deleted ? (
              <span className="block rounded-[20px] bg-white/60 px-3.5 py-2 text-sm italic text-ink-soft ring-1 ring-line">보내기를 취소한 메시지예요</span>
            ) : m.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.photo}
                alt="보낸 사진"
                onLoad={onPhotoLoad}
                onClick={(e) => {
                  if (selected || m.status) return;
                  e.stopPropagation();
                  onPhoto();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onTap(e.timeStamp);
                }}
                className="max-h-72 max-w-[220px] rounded-[20px] object-cover shadow-soft ring-2 ring-white"
              />
            ) : jumbo ? (
              <span className="block text-5xl leading-tight">{m.body}</span>
            ) : (
              <span
                className={`block whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug shadow-soft ${
                  mine
                    ? `bg-gradient-to-br from-pink to-rose text-white ${firstOfGroup ? "rounded-[20px] rounded-tr-md" : "rounded-[20px]"}`
                    : `bg-white text-ink ring-1 ring-line ${firstOfGroup ? "rounded-[20px] rounded-tl-md" : "rounded-[20px]"}`
                }`}
              >
                {m.body}
              </span>
            )}
          </button>
          {reactions.length > 0 && (
            <span className={`absolute -bottom-3.5 flex gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-xs shadow-soft ring-1 ring-line ${mine ? "right-2" : "left-2"}`}>
              {reactions.map(([who, e]) => (
                <span key={who} className={who === me ? "" : "opacity-90"}>
                  {e}
                </span>
              ))}
            </span>
          )}
        </div>
        {meta}
      </div>

      {selected && (
        <div className={`mt-2 flex animate-pop items-center gap-0.5 rounded-full bg-white p-1 shadow-pop ring-1 ring-line ${mine ? "" : "ml-11"}`}>
          {REACTIONS.map((e) => (
            <button key={e} onClick={() => onReact(e)} className={`press rounded-full px-1.5 py-1 text-xl ${m.reactions[me] === e ? "bg-blush" : ""}`} aria-label={`${e} 반응`}>
              {e}
            </button>
          ))}
          {mine && (
            <button onClick={onUnsend} className="press ml-1 rounded-full bg-cream px-2.5 py-1.5 text-xs text-ink-soft">
              보내기 취소
            </button>
          )}
        </div>
      )}

      {m.status === "failed" && (
        <div className="mt-1 flex gap-1.5 text-xs">
          <button onClick={() => void retryMessage(m.id)} className="press rounded-full bg-blush px-3 py-1 text-rose">
            다시 보내기
          </button>
          <button onClick={() => discardMessage(m.id)} className="press rounded-full bg-white/80 px-3 py-1 text-ink-soft ring-1 ring-line">
            지우기
          </button>
        </div>
      )}
    </div>
  );
}

/** 폰 키보드가 올라오면 보이는 영역만큼만 쓰도록 (입력창이 키보드에 가리지 않게) */
function useVisualViewport() {
  const [box, setBox] = useState({ height: 0, top: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setBox({ height: vv.height, top: vv.offsetTop });
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  return box;
}
