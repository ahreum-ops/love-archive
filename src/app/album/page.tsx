"use client";

import { useRef, useState } from "react";
import { PhotoUploadSheet, PhotoViewer } from "@/components/photo-sheets";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { albumItems, monthLabel, SOURCE_LABEL, type AlbumSource } from "@/lib/album";
import { compressImage } from "@/lib/image";
import { useAppState } from "@/lib/store";
import { REMOTE } from "@/lib/supabase";

type Filter = "all" | AlbumSource;

export default function AlbumPage() {
  const state = useAppState();
  const [filter, setFilter] = useState<Filter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!state?.profile) return null;

  const all = albumItems(state);
  const items = filter === "all" ? all : all.filter((p) => p.source === filter);
  const groups: { month: string; list: typeof items }[] = [];
  for (const p of items) {
    const month = monthLabel(p.date);
    if (groups.at(-1)?.month === month) groups.at(-1)!.list.push(p);
    else groups.push({ month, list: [p] });
  }
  const openIndex = items.findIndex((p) => p.key === openKey);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      // 서버 모드는 Storage 에 올라가니 조금 크게, 체험 모드는 브라우저 저장 공간이 작아서 작게
      const size = REMOTE ? 1280 : 720;
      setPicked(await Promise.all([...files].map((f) => compressImage(f, size, 0.8))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 불러오지 못했어요");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <Banner message={error} onClose={() => setError(null)} />
      <PageHeader
        title="사진첩"
        sub={all.length ? `우리 추억 ${all.length}장` : "둘이 함께한 순간을 모아 둬요"}
        right={
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-pink to-rose text-2xl text-white shadow-soft disabled:opacity-60"
            aria-label="사진 올리기"
          >
            {busy ? <span className="text-base">⏳</span> : "+"}
          </button>
        }
      />
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pick(e.target.files)} />

      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {(["all", "album", "bucket", "place"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`press shrink-0 rounded-full px-3.5 py-1.5 text-sm ring-1 ${
              filter === k ? "bg-ink text-white ring-ink" : "bg-white/70 text-ink-soft ring-line"
            }`}
          >
            {k === "all" ? "전체" : SOURCE_LABEL[k]}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <Empty
          emoji="📷"
          title={filter === "all" ? "아직 사진이 없어요" : `${SOURCE_LABEL[filter]} 사진이 없어요`}
          desc={
            filter === "bucket"
              ? "버킷리스트를 완료할 때 사진을 올리면 여기 모여요."
              : filter === "place"
                ? "장소 기록에 사진을 올리면 여기 모여요."
                : "오른쪽 위 + 버튼으로 함께 찍은 사진을 여러 장 한 번에 올려요."
          }
          action={
            (filter === "all" || filter === "album") && (
              <button onClick={() => fileRef.current?.click()} className="press rounded-full bg-blush px-5 py-2.5 font-cute text-rose">
                첫 사진 올리기
              </button>
            )
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.month}>
              <h2 className="mb-2 px-1 font-cute text-base text-ink">
                {g.month} <span className="text-sm text-ink-soft">{g.list.length}</span>
              </h2>
              <div className="grid grid-cols-3 gap-1.5">
                {g.list.map((p) => (
                  <button key={p.key} onClick={() => setOpenKey(p.key)} className="press relative aspect-square overflow-hidden rounded-2xl bg-cream ring-1 ring-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={p.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
                    {p.source !== "album" && (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-white/85 px-1.5 py-0.5 text-[10px] text-ink-soft">
                        {p.source === "bucket" ? "⭐" : "📍"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <PhotoViewer
        key={openKey ?? "closed"}
        item={openIndex >= 0 ? items[openIndex] : undefined}
        names={state.profile.names}
        onPrev={openIndex > 0 ? () => setOpenKey(items[openIndex - 1].key) : undefined}
        onNext={openIndex >= 0 && openIndex < items.length - 1 ? () => setOpenKey(items[openIndex + 1].key) : undefined}
        onClose={() => setOpenKey(null)}
      />
      <PhotoUploadSheet srcs={picked} me={state.profile.me} onClose={() => setPicked(null)} />
    </div>
  );
}
