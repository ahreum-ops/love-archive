"use client";

import { useState } from "react";
import PlaceMap from "@/components/place-map";
import PlaceSheet from "@/components/place-sheet";
import { Stars } from "@/components/stars";
import { Empty, PageHeader } from "@/components/ui";
import WhoSwitch from "@/components/who-switch";
import { formatDate } from "@/lib/dates";
import { PLACE_CATEGORIES, averageStars, placeCategory } from "@/lib/places";
import { useAppState } from "@/lib/store";
import type { Place } from "@/lib/types";

type Sort = "recent" | "stars" | "again";

export default function PlacesPage() {
  const state = useAppState();
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("recent");
  const [openId, setOpenId] = useState<string | "new" | null>(null);
  if (!state?.profile) return null;
  const { profile, places } = state;

  const rated = places.map(averageStars).filter((v): v is number => v !== null);
  const avgAll = rated.length ? (rated.reduce((x, y) => x + y, 0) / rated.length).toFixed(1) : "-";
  const againCount = places.filter((p) => p.reviews.a?.again || p.reviews.b?.again).length;
  const usedCats = PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c.id));

  const shown = places
    .filter((p) => !cat || p.category === cat)
    .filter((p) => sort !== "again" || p.reviews.a?.again || p.reviews.b?.again)
    .sort((x, y) =>
      sort === "stars" ? (averageStars(y) ?? 0) - (averageStars(x) ?? 0) || y.visitedAt.localeCompare(x.visitedAt) : y.visitedAt.localeCompare(x.visitedAt),
    );

  const opened = openId && openId !== "new" ? places.find((p) => p.id === openId) : undefined;

  return (
    <div>
      <PageHeader title="우리의 장소" sub={places.length ? `함께 간 곳 ${places.length}곳` : "함께 간 곳을 지도에 모아요"} right={<WhoSwitch />} />

      {places.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="다녀온 곳" value={`${places.length}`} unit="곳" bg="bg-peach/90" />
          <Stat label="평균 별점" value={avgAll} unit="★" bg="bg-lemon/90" />
          <Stat label="또 갈 곳" value={`${againCount}`} unit="곳" bg="bg-mint/90" />
        </div>
      )}

      <PlaceMap places={shown} selectedId={opened?.id} onSelect={setOpenId} className="mb-4 h-72 rounded-[28px] shadow-soft ring-1 ring-white" />

      {places.length === 0 ? (
        <Empty
          emoji="🗺️"
          title="아직 기록한 곳이 없어요"
          desc="오늘 간 카페, 기념일에 간 식당… 아래 버튼으로 첫 장소를 핀으로 꽂고 둘이 별점을 매겨봐요."
        />
      ) : (
        <>
          <div className="mb-3 flex rounded-full bg-white/85 p-1 shadow-soft ring-1 ring-line">
            {(
              [
                ["recent", "최근 간 순"],
                ["stars", "별점 높은 순"],
                ["again", "또 갈 곳"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`press flex-1 rounded-full py-1.5 text-sm ${sort === k ? "bg-blush font-cute text-rose" : "text-ink-soft"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {usedCats.length > 1 && (
            <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
              {[null, ...usedCats].map((c) => (
                <button
                  key={c?.id ?? "all"}
                  onClick={() => setCat(c?.id ?? null)}
                  className={`press shrink-0 rounded-full px-3.5 py-1.5 text-sm ring-1 ${
                    cat === (c?.id ?? null) ? "bg-ink text-white ring-ink" : "bg-white/70 text-ink-soft ring-line"
                  }`}
                >
                  {c ? `${c.emoji} ${c.label}` : "전체"}
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <Empty
              emoji="🔁"
              title="여기는 비어 있어요"
              desc={sort === "again" ? "장소를 눌러 별점을 고칠 때 ‘또 가고 싶어’를 체크하면 여기 모여요." : "다른 종류를 골라 보세요."}
            />
          ) : (
            <ul className="space-y-2.5">
              {shown.map((p) => (
                <li key={p.id}>
                  <PlaceRow place={p} names={profile.names} onClick={() => setOpenId(p.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <button
        onClick={() => setOpenId("new")}
        className="press fixed bottom-[calc(env(safe-area-inset-bottom)+96px)] right-[max(16px,calc(50%-208px))] z-30 flex items-center gap-1.5 rounded-full bg-gradient-to-br from-pink to-rose px-5 py-3.5 font-cute text-white shadow-pop"
      >
        📍 장소 기록
      </button>

      <PlaceSheet key={openId ?? "closed"} open={openId !== null} place={opened} profile={profile} onClose={() => setOpenId(null)} />
    </div>
  );
}

function Stat({ label, value, unit, bg }: { label: string; value: string; unit: string; bg: string }) {
  return (
    <div className={`rounded-[22px] py-3 shadow-soft ring-1 ring-white ${bg}`}>
      <p className="text-[11px] text-ink-soft">{label}</p>
      <p className="font-cute text-2xl text-ink">
        {value}
        <span className="ml-0.5 text-xs text-ink-soft">{unit}</span>
      </p>
    </div>
  );
}

function PlaceRow({ place, names, onClick }: { place: Place; names: Record<"a" | "b", string>; onClick: () => void }) {
  const c = placeCategory(place.category);
  const avg = averageStars(place);
  return (
    <button onClick={onClick} className="press flex w-full items-center gap-3 rounded-[22px] bg-white/85 p-3 text-left shadow-soft ring-1 ring-line">
      {place.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={place.photo} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl" style={{ background: c.color }}>
          {c.emoji}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-cute text-[16px]">{place.name}</p>
        <p className="text-xs text-ink-soft">
          {c.label} · {formatDate(place.visitedAt)}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
          {avg !== null ? (
            <>
              <Stars value={avg} size={13} />
              <span className="font-cute text-sm text-rose">{avg.toFixed(1)}</span>
            </>
          ) : (
            <span>아직 별점 없음</span>
          )}
          {(["a", "b"] as const).map(
            (w) => place.reviews[w] && (
              <span key={w} className="truncate">
                {names[w]} {place.reviews[w]!.stars}
              </span>
            ),
          )}
        </div>
      </div>
      {(place.reviews.a?.again || place.reviews.b?.again) && <span className="shrink-0 text-lg" title="또 가고 싶어">🔁</span>}
    </button>
  );
}
