"use client";

import { useRef, useState } from "react";
import { BUCKET_CATEGORIES } from "@/lib/content";
import { formatDate, today } from "@/lib/dates";
import { compressImage } from "@/lib/image";
import { uid, update } from "@/lib/store";
import type { BucketItem } from "@/lib/types";
import { Banner, Button, Field, Sheet, inputClass } from "./ui";

const EMOJIS = ["💗", "✨", "🌷", "🍰", "☕", "🎡", "🏖️", "🎮", "📚", "🍜", "🐶", "🎁", "🌈", "🚗", "🎸", "🧁"];

/** 버킷리스트 추가 / 상세 / 완료 기록 */
export default function BucketSheet({ open, item, onClose }: { open: boolean; item?: BucketItem; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose}>
      {open && (item ? <Detail item={item} onClose={onClose} /> : <AddForm onClose={onClose} />)}
    </Sheet>
  );
}

function AddForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [category, setCategory] = useState<string>("데이트");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const r = update((s) => ({ ...s, bucket: [...s.bucket, { id: uid(), title: title.trim(), emoji, category, custom: true }] }));
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError(null)} />
      <h2 className="font-cute text-xl">우리만의 버킷리스트 추가</h2>
      <Field label="하고 싶은 것">
        <input autoFocus className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 같이 스쿠버다이빙 배우기" />
      </Field>
      <Field label="아이콘">
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`press aspect-square rounded-xl text-xl ${emoji === e ? "bg-blush ring-2 ring-pink" : "bg-cream"}`}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>
      <Field label="카테고리">
        <div className="flex flex-wrap gap-1.5">
          {BUCKET_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`press rounded-full px-3.5 py-1.5 text-sm ${category === c ? "bg-ink text-white" : "bg-cream text-ink-soft"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>
      <Button onClick={add} disabled={!title.trim()} className="w-full">
        추가하기
      </Button>
    </div>
  );
}

function Detail({ item, onClose }: { item: BucketItem; onClose: () => void }) {
  const [editing, setEditing] = useState(!item.doneAt);
  const [date, setDate] = useState(item.doneAt ?? today());
  const [memo, setMemo] = useState(item.memo ?? "");
  const [photo, setPhoto] = useState(item.photo);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function patch(p: Partial<BucketItem>) {
    return update((s) => ({ ...s, bucket: s.bucket.map((b) => (b.id === item.id ? { ...b, ...p } : b)) }));
  }

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      setPhoto(await compressImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 불러오지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  function complete() {
    const first = !item.doneAt;
    const r = patch({ doneAt: date, memo: memo.trim() || undefined, photo });
    if (!r.ok) return setError(r.error);
    if (first) setCelebrate(true);
    else onClose();
  }

  if (celebrate) {
    return (
      <div className="py-8 text-center">
        <div className="animate-pop text-7xl">🎉</div>
        <p className="mt-4 font-cute text-2xl text-rose">완료!</p>
        <p className="mt-1 text-ink-soft">‘{item.title}’ 추억이 하나 쌓였어요</p>
        <Button onClick={onClose} className="mt-6">
          좋아요 💗
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError(null)} />
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-peach text-3xl">{item.emoji}</span>
        <div className="flex-1">
          <p className="text-xs text-ink-soft">{item.category}</p>
          <h2 className="font-cute text-xl leading-snug">{item.title}</h2>
        </div>
      </div>

      {!editing && item.doneAt ? (
        <>
          {item.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photo} alt="" className="w-full rounded-3xl object-cover" />
          )}
          <div className="rounded-2xl bg-cream p-4">
            <p className="text-sm text-rose">{formatDate(item.doneAt)} 완료</p>
            <p className="mt-1 whitespace-pre-wrap text-[15px]">{item.memo || "남긴 메모가 없어요."}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => setEditing(true)} className="flex-1">
              기록 고치기
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const r = patch({ doneAt: undefined, memo: undefined, photo: undefined });
                if (r.ok) onClose();
                else setError(r.error);
              }}
              className="flex-1 bg-cream"
            >
              완료 취소
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field label="함께한 날">
            <input type="date" className={inputClass} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="사진 (선택)">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {photo ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="" className="w-full rounded-3xl object-cover" />
                <button onClick={() => setPhoto(undefined)} className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs text-ink">
                  사진 빼기
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="press flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-pink/60 bg-blush/40 py-8 text-sm text-rose"
              >
                <span className="text-3xl">{busy ? "⏳" : "📷"}</span>
                <span className="mt-1">{busy ? "사진 줄이는 중…" : "그날의 사진 올리기"}</span>
              </button>
            )}
          </Field>
          <Field label="한 줄 기록 (선택)">
            <textarea className={`${inputClass} min-h-24 resize-none`} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="그날 어땠는지 남겨두세요" />
          </Field>
          <Button onClick={complete} disabled={busy || !date} className="w-full py-4">
            {item.doneAt ? "기록 저장" : "완료했어요! 💗"}
          </Button>
        </>
      )}

      <div className="pt-2 text-center">
        {confirmDelete ? (
          <div className="rounded-2xl bg-blush p-3 text-sm">
            <p className="text-rose">이 버킷리스트를 목록에서 지울까요? 기록과 사진도 같이 사라져요.</p>
            <div className="mt-2 flex justify-center gap-4">
              <button onClick={() => setConfirmDelete(false)} className="text-ink-soft">
                취소
              </button>
              <button
                onClick={() => {
                  const r = update((s) => ({ ...s, bucket: s.bucket.filter((b) => b.id !== item.id) }));
                  if (r.ok) onClose();
                  else setError(r.error);
                }}
                className="font-cute text-rose"
              >
                지우기
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-ink-soft">
            목록에서 지우기
          </button>
        )}
      </div>
    </div>
  );
}
