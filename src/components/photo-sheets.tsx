"use client";

import Link from "next/link";
import { useState } from "react";
import { SOURCE_HREF, SOURCE_LABEL, type AlbumItem } from "@/lib/album";
import { formatDate, today } from "@/lib/dates";
import { uid, update } from "@/lib/store";
import type { Photo, Who } from "@/lib/types";
import { Banner, Button, Field, Sheet, inputClass } from "./ui";

/** 고른 사진 여러 장을 날짜·한 줄과 함께 사진첩에 넣기 */
export function PhotoUploadSheet({ srcs, me, onClose }: { srcs: string[] | null; me: Who; onClose: () => void }) {
  return (
    <Sheet open={srcs !== null} onClose={onClose} title={srcs ? `사진 ${srcs.length}장 올리기` : undefined}>
      {srcs && <UploadForm key={srcs[0]} srcs={srcs} me={me} onClose={onClose} />}
    </Sheet>
  );
}

function UploadForm({ srcs, me, onClose }: { srcs: string[]; me: Who; onClose: () => void }) {
  const [list, setList] = useState(srcs);
  const [date, setDate] = useState(today());
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const createdAt = new Date().toISOString();
    const added: Photo[] = list.map((src) => ({ id: uid(), src, date, caption: caption.trim() || undefined, by: me, createdAt }));
    const r = update((s) => ({ ...s, photos: [...added, ...s.photos] }));
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError(null)} />
      <div className="grid grid-cols-4 gap-1.5">
        {list.map((src, i) => (
          <div key={i} className="relative aspect-square overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
            <button
              onClick={() => setList(list.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-[10px] text-ink"
              aria-label="이 사진 빼기"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <Field label="찍은 날">
        <input type="date" className={inputClass} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="한 줄 (선택)">
        <input className={inputClass} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="예) 첫 제주 여행 🍊" />
      </Field>
      <Button onClick={save} disabled={!list.length || !date} className="w-full py-4">
        {list.length ? `${list.length}장 올리기` : "올릴 사진이 없어요"}
      </Button>
    </div>
  );
}

/** 크게 보기. 사진첩에 직접 올린 사진만 고치거나 지울 수 있다 */
export function PhotoViewer({
  item,
  names,
  onPrev,
  onNext,
  onClose,
}: {
  item?: AlbumItem;
  names: Record<Who, string>;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(item?.date ?? today());
  const [caption, setCaption] = useState(item?.source === "album" ? (item.caption ?? "") : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);

  if (!item) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const own = item.source === "album";

  function patch(p: Partial<Photo> | null) {
    const r = update((s) => ({
      ...s,
      photos: p === null ? s.photos.filter((x) => x.id !== item!.id) : s.photos.map((x) => (x.id === item!.id ? { ...x, ...p } : x)),
    }));
    if (!r.ok) setError(r.error);
    return r.ok;
  }

  return (
    <Sheet open onClose={onClose}>
      <div className="space-y-3">
        <Banner message={error} onClose={() => setError(null)} />
        <div
          className="relative -mx-1 overflow-hidden rounded-3xl bg-ink/5"
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX === null) return;
            const dx = e.changedTouches[0].clientX - touchX;
            setTouchX(null);
            if (dx > 50) onPrev?.();
            else if (dx < -50) onNext?.();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.src} alt={item.caption ?? ""} className="mx-auto max-h-[60dvh] w-full object-contain" />
          {onPrev && (
            <button onClick={onPrev} className="press absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-white/85 text-lg text-ink shadow-soft" aria-label="이전 사진">
              ‹
            </button>
          )}
          {onNext && (
            <button onClick={onNext} className="press absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-white/85 text-lg text-ink shadow-soft" aria-label="다음 사진">
              ›
            </button>
          )}
        </div>

        {editing ? (
          <>
            <Field label="찍은 날">
              <input type="date" className={inputClass} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="한 줄">
              <input className={inputClass} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="그날 어땠는지 남겨두세요" />
            </Field>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)} className="flex-1 bg-cream">
                취소
              </Button>
              <Button
                onClick={() => patch({ date, caption: caption.trim() || undefined }) && setEditing(false)}
                disabled={!date}
                className="flex-1"
              >
                저장
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-cream p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-rose">{formatDate(item.date)}</p>
              <p className="text-xs text-ink-soft">{own ? (item.by ? `${names[item.by]} 올림` : "") : SOURCE_LABEL[item.source]}</p>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[15px]">{item.caption || "남긴 한 줄이 없어요."}</p>
          </div>
        )}

        {own ? (
          !editing && (
            <div className="flex items-center justify-between px-1 pt-1">
              <button onClick={() => setEditing(true)} className="text-sm text-ink-soft">
                ✏️ 날짜·한 줄 고치기
              </button>
              {confirmDelete ? (
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-rose">정말 지울까요?</span>
                  <button onClick={() => setConfirmDelete(false)} className="text-ink-soft">
                    취소
                  </button>
                  <button onClick={() => patch(null) && onClose()} className="font-cute text-rose">
                    지우기
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="text-sm text-ink-soft">
                  사진 지우기
                </button>
              )}
            </div>
          )
        ) : (
          <Link href={SOURCE_HREF[item.source]} className="press block rounded-full bg-blush py-3 text-center font-cute text-rose">
            {SOURCE_LABEL[item.source]}에서 보기 ›
          </Link>
        )}
      </div>
    </Sheet>
  );
}
