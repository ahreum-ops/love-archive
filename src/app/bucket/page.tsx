"use client";

import { useState } from "react";
import BucketSheet from "@/components/bucket-sheet";
import { Empty, PageHeader } from "@/components/ui";
import { BUCKET_CATEGORIES, PASTELS } from "@/lib/content";
import { formatDate } from "@/lib/dates";
import { useAppState } from "@/lib/store";
import type { BucketItem } from "@/lib/types";

type Filter = "all" | "todo" | "done";

export default function BucketPage() {
  const state = useAppState();
  const [filter, setFilter] = useState<Filter>("all");
  const [cat, setCat] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openId, setOpenId] = useState<string | "new" | null>(null);
  if (!state?.profile) return null;

  const all = state.bucket;
  const done = all.filter((b) => b.doneAt).length;
  const items = all
    .map((b, i) => ({ ...b, no: i + 1 }))
    .filter((b) => (filter === "todo" ? !b.doneAt : filter === "done" ? !!b.doneAt : true))
    .filter((b) => !cat || b.category === cat);

  const opened = openId && openId !== "new" ? all.find((b) => b.id === openId) : undefined;

  return (
    <div>
      <PageHeader
        title="버킷리스트"
        sub={`${all.length}개 중 ${done}개 완료했어요`}
        right={
          <button
            onClick={() => setOpenId("new")}
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-pink to-rose text-2xl text-white shadow-soft"
            aria-label="버킷리스트 추가"
          >
            +
          </button>
        }
      />

      {/* 필터 */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 rounded-full bg-white/85 p-1 shadow-soft ring-1 ring-line">
          {(
            [
              ["all", "전체"],
              ["todo", "할 것"],
              ["done", "완료"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`press flex-1 rounded-full py-1.5 text-sm ${filter === k ? "bg-blush font-cute text-rose" : "text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setView(view === "grid" ? "list" : "grid")}
          className="press rounded-full bg-white/85 px-3 py-2 text-xs text-ink-soft shadow-soft ring-1 ring-line"
          aria-label="보기 방식 바꾸기"
        >
          {view === "grid" ? "☰ 목록" : "▦ 카드"}
        </button>
      </div>

      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {[null, ...BUCKET_CATEGORIES].map((c) => (
          <button
            key={c ?? "all"}
            onClick={() => setCat(c)}
            className={`press shrink-0 rounded-full px-3.5 py-1.5 text-sm ring-1 ${
              cat === c ? "bg-ink text-white ring-ink" : "bg-white/70 text-ink-soft ring-line"
            }`}
          >
            {c ?? "모든 카테고리"}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <Empty
          emoji={filter === "done" ? "🌱" : "✨"}
          title={filter === "done" ? "아직 완료한 게 없어요" : "여기는 비어 있어요"}
          desc={filter === "done" ? "‘할 것’에서 하나 골라 함께 해보고 완료를 눌러주세요." : "오른쪽 위 + 버튼으로 우리만의 버킷리스트를 추가해요."}
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-3 gap-2.5">
          {items.map((b) => (
            <GridItem key={b.id} item={b} no={b.no} onClick={() => setOpenId(b.id)} />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => setOpenId(b.id)}
                className="press flex w-full items-center gap-3 rounded-2xl bg-white/85 px-3 py-2.5 text-left shadow-soft ring-1 ring-line"
              >
                <span className="w-7 text-center font-cute text-xs text-ink-soft">{b.no}</span>
                <span className="text-xl">{b.emoji}</span>
                <span className={`flex-1 text-[15px] ${b.doneAt ? "text-ink-soft line-through decoration-pink decoration-2" : ""}`}>{b.title}</span>
                {b.doneAt ? <span className="text-xs text-rose">{formatDate(b.doneAt).slice(2, -4)}</span> : <span className="h-5 w-5 rounded-full ring-2 ring-line" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <BucketSheet
        key={openId ?? "closed"}
        open={openId !== null}
        item={opened}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function GridItem({ item, no, onClick }: { item: BucketItem; no: number; onClick: () => void }) {
  const bg = PASTELS[no % PASTELS.length];
  return (
    <button
      onClick={onClick}
      className={`press relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-[22px] p-2 text-center shadow-soft ring-1 ring-white ${
        item.doneAt ? "bg-white" : bg
      }`}
    >
      {item.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {item.photo && <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />}
      <span className="absolute left-2 top-1.5 font-cute text-[11px] text-ink-soft/80">{no}</span>
      {item.doneAt && <span className="absolute right-1.5 top-1.5 rounded-full bg-rose px-1.5 py-0.5 text-[10px] text-white">완료</span>}
      {!item.photo && <span className={`text-3xl ${item.doneAt ? "" : "opacity-90"}`}>{item.emoji}</span>}
      <span className={`relative mt-2 line-clamp-2 text-[12px] leading-snug ${item.photo ? "mt-auto text-white" : "text-ink"}`}>{item.title}</span>
    </button>
  );
}
