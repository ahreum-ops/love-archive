"use client";

import { useRef, useState } from "react";
import { formatDate, today } from "@/lib/dates";
import { compressImage } from "@/lib/image";
import { josa } from "@/lib/josa";
import { PLACE_CATEGORIES, REVIEW_HINTS, averageStars, placeCategory, reverseGeocode, searchPlaces, starLabel, type SearchHit } from "@/lib/places";
import { uid, update } from "@/lib/store";
import type { Place, PlaceReview, Profile, Who } from "@/lib/types";
import PlaceMap from "./place-map";
import { StarInput, Stars } from "./stars";
import { Banner, Button, Field, Sheet, inputClass } from "./ui";

type Mode = { kind: "new" } | { kind: "view"; place: Place } | { kind: "edit"; place: Place };

/** 장소 기록 추가 / 상세 / 고치기 */
export default function PlaceSheet({ open, place, profile, onClose }: { open: boolean; place?: Place; profile: Profile; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const mode: Mode = !place ? { kind: "new" } : editing ? { kind: "edit", place } : { kind: "view", place };
  return (
    <Sheet open={open} onClose={onClose}>
      {open &&
        (mode.kind === "view" ? (
          <Detail place={mode.place} profile={profile} onEdit={() => setEditing(true)} onClose={onClose} />
        ) : (
          <PlaceForm place={mode.kind === "edit" ? mode.place : undefined} profile={profile} onDone={mode.kind === "edit" ? () => setEditing(false) : onClose} />
        ))}
    </Sheet>
  );
}

type LatLng = { lat: number; lng: number };

function PlaceForm({ place, profile, onDone }: { place?: Place; profile: Profile; onDone: () => void }) {
  const me = profile.me;
  const mine = place?.reviews[me];
  const [pick, setPick] = useState<LatLng | null>(place ? { lat: place.lat, lng: place.lng } : null);
  const [focus, setFocus] = useState<(LatLng & { zoom?: number }) | null>(place ? { lat: place.lat, lng: place.lng, zoom: 16 } : null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [name, setName] = useState(place?.name ?? "");
  const [address, setAddress] = useState(place?.address ?? "");
  const [kakaoId, setKakaoId] = useState(place?.kakaoId);
  const [category, setCategory] = useState(place?.category ?? "food");
  const [date, setDate] = useState(place?.visitedAt ?? today());
  const [photo, setPhoto] = useState(place?.photo);
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(mine?.stars ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [again, setAgain] = useState(mine?.again ?? false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      setHits(await searchPlaces(q, focus ? [focus.lat, focus.lng] : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "장소 검색에 실패했어요. 지도에서 직접 콕 찍어 주세요.");
    } finally {
      setSearching(false);
    }
  }

  function choose(h: SearchHit) {
    setPick({ lat: h.lat, lng: h.lng });
    setFocus({ lat: h.lat, lng: h.lng, zoom: 16 });
    setName(h.name);
    setAddress(h.address);
    setKakaoId(h.kakaoId);
    if (h.category) setCategory(h.category);
    setHits(null);
  }

  async function dropPin(p: LatLng) {
    setPick(p);
    setKakaoId(undefined);
    const r = await reverseGeocode(p.lat, p.lng);
    setAddress(r.address);
    setName((n) => n || r.name);
  }

  function locate() {
    if (!navigator.geolocation) return setError("이 브라우저는 위치를 알려주지 않아요. 검색하거나 지도에서 콕 찍어 주세요.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setFocus({ ...p, zoom: 17 });
        dropPin(p);
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "위치 권한이 꺼져 있어요. 브라우저 설정에서 허용하거나, 검색·지도 콕 찍기로 골라 주세요."
            : "지금 위치를 찾지 못했어요. 검색하거나 지도에서 콕 찍어 주세요.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function pickPhoto(file?: File) {
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

  function save() {
    if (!pick) return;
    const review: PlaceReview | undefined = stars > 0 ? { stars, comment: comment.trim() || undefined, again: again || undefined } : undefined;
    const basics = { name: name.trim(), category, lat: pick.lat, lng: pick.lng, address: address.trim() || undefined, visitedAt: date, photo, kakaoId };
    const r = update((s) => {
      if (!place) {
        const created: Place = { id: uid(), ...basics, reviews: review ? { [me]: review } : {}, createdBy: me };
        return { ...s, places: [created, ...s.places] };
      }
      return {
        ...s,
        places: s.places.map((p) => {
          if (p.id !== place.id) return p;
          const reviews = { ...p.reviews };
          if (review) reviews[me] = review;
          else delete reviews[me];
          return { ...p, ...basics, reviews };
        }),
      };
    });
    if (r.ok) onDone();
    else setError(r.error);
  }

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError(null)} />
      <h2 className="font-cute text-xl">{place ? "기록 고치기" : "우리가 간 곳 기록하기"}</h2>

      {/* 위치 고르기 */}
      <div className="space-y-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="가게 이름이나 주소로 찾기" enterKeyHint="search" />
          <button type="submit" disabled={!query.trim() || searching} className="press shrink-0 rounded-2xl bg-ink px-4 font-cute text-sm text-white disabled:opacity-40">
            {searching ? "…" : "검색"}
          </button>
        </form>
        {hits && (
          <ul className="max-h-56 overflow-y-auto rounded-2xl bg-cream p-1 ring-1 ring-line">
            {hits.length === 0 ? (
              <li className="px-3 py-3 text-sm text-ink-soft">
                검색 결과가 없어요. 동네 이름을 같이 넣어 보거나(예: <b>성수 카페</b>), 지도에서 직접 콕 찍어 주세요.
              </li>
            ) : (
              hits.map((h, i) => (
                <li key={i}>
                  <button onClick={() => choose(h)} className="press w-full rounded-xl px-3 py-2 text-left hover:bg-white">
                    <p className="text-[15px]">{h.name}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {h.kind && <span className="mr-1 text-rose">{h.kind}</span>}
                      {h.address}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        <div className="relative">
          <PlaceMap places={[]} pick={pick} onPick={dropPin} focus={focus} className="h-56 rounded-3xl ring-1 ring-line" />
          <button
            onClick={locate}
            className="press absolute left-2 top-2 z-[500] rounded-full bg-white/95 px-3 py-1.5 text-xs text-ink shadow-soft ring-1 ring-line"
          >
            {locating ? "찾는 중…" : "📍 지금 여기"}
          </button>
        </div>
        <p className="pl-1 text-xs text-ink-soft">{pick ? (address || "핀을 꽂았어요. 이름만 적어 주세요.") : "검색하거나, 지도를 콕 눌러서 핀을 꽂아 주세요."}</p>
      </div>

      <Field label="장소 이름">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 연남동 그 파스타집" />
      </Field>

      <Field label="종류">
        <div className="flex flex-wrap gap-1.5">
          {PLACE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`press rounded-full px-3 py-1.5 text-sm ${category === c.id ? "bg-ink text-white" : "bg-cream text-ink-soft"}`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="간 날">
        <input type="date" className={inputClass} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <Field label="사진 (선택)">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
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
            className="press flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-pink/60 bg-blush/40 py-5 text-sm text-rose"
          >
            <span className="text-2xl">{busy ? "⏳" : "📷"}</span>
            {busy ? "사진 줄이는 중…" : "그날의 사진 올리기"}
          </button>
        )}
      </Field>

      {/* 내 별점 */}
      <div className="rounded-3xl bg-lemon/70 p-4">
        <p className="text-sm text-ink-soft">
          <b className="font-cute text-rose">{profile.names[me]}</b>의 별점
        </p>
        <ReviewFields stars={stars} setStars={setStars} comment={comment} setComment={setComment} again={again} setAgain={setAgain} />
      </div>

      <Button onClick={save} disabled={!pick || !name.trim() || busy || !date} className="w-full py-4">
        {!pick ? "먼저 위치를 골라 주세요" : place ? "저장" : "기록하기 💗"}
      </Button>
      {place && (
        <button onClick={onDone} className="block w-full text-center text-sm text-ink-soft">
          취소
        </button>
      )}
    </div>
  );
}

type ReviewState = { stars: number; setStars: (v: number) => void; comment: string; setComment: (v: string) => void; again: boolean; setAgain: (v: boolean) => void };

/** 별점 · 한 줄 후기 · 또 가고 싶어 */
function ReviewFields({ stars, setStars, comment, setComment, again, setAgain }: ReviewState) {
  const [hint] = useState(() => REVIEW_HINTS[Math.floor(Math.random() * REVIEW_HINTS.length)]);
  return (
    <>
      <div className="mt-2">
        <StarInput value={stars} onChange={setStars} />
      </div>
      <p className="mt-1 h-5 font-cute text-sm text-ink">{stars > 0 ? `${stars}점 · ${starLabel(stars)}` : "별을 눌러 매겨요 (왼쪽 반 = 반 개)"}</p>
      <textarea
        className={`${inputClass} mt-2 min-h-20 resize-none bg-white`}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={`한 줄 후기 — ${hint}`}
      />
      <label className="mt-2 flex items-center gap-2 pl-1 text-sm">
        <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} className="h-4 w-4 accent-rose" />또 가고 싶어
      </label>
    </>
  );
}

/** 상세 화면에서 내 별점만 바로 남기기 / 고치기 */
function MyReviewEditor({ place, me, onDone, onError }: { place: Place; me: Who; onDone: () => void; onError: (e: string) => void }) {
  const mine = place.reviews[me];
  const [stars, setStars] = useState(mine?.stars ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [again, setAgain] = useState(mine?.again ?? false);

  function save() {
    const r = update((s) => ({
      ...s,
      places: s.places.map((p) =>
        p.id === place.id ? { ...p, reviews: { ...p.reviews, [me]: { stars, comment: comment.trim() || undefined, again: again || undefined } } } : p,
      ),
    }));
    if (r.ok) onDone();
    else onError(r.error);
  }

  return (
    <div>
      <ReviewFields stars={stars} setStars={setStars} comment={comment} setComment={setComment} again={again} setAgain={setAgain} />
      <div className="mt-3 flex gap-2">
        <Button onClick={save} disabled={stars === 0} className="flex-1 py-2.5">
          별점 저장
        </Button>
        <Button variant="ghost" onClick={onDone} className="bg-white py-2.5">
          취소
        </Button>
      </div>
    </div>
  );
}

function Detail({ place, profile, onEdit, onClose }: { place: Place; profile: Profile; onEdit: () => void; onClose: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = placeCategory(place.category);
  const avg = averageStars(place);
  const both = place.reviews.a?.again && place.reviews.b?.again;
  const order: Who[] = profile.me === "a" ? ["a", "b"] : ["b", "a"];

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError(null)} />
      {place.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={place.photo} alt="" className="max-h-72 w-full rounded-3xl object-cover" />
      )}
      <div className="flex items-start gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl" style={{ background: c.color }}>
          {c.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-soft">
            {c.label} · {formatDate(place.visitedAt)}
          </p>
          <h2 className="font-cute text-xl leading-snug">{place.name}</h2>
          {place.address && <p className="mt-0.5 text-xs text-ink-soft">{place.address}</p>}
        </div>
        {avg !== null && (
          <div className="shrink-0 text-center">
            <p className="font-cute text-2xl leading-none text-rose">{avg.toFixed(1)}</p>
            <p className="text-[10px] text-ink-soft">우리 평균</p>
          </div>
        )}
      </div>

      {both && <p className="rounded-2xl bg-blush px-4 py-2.5 text-center font-cute text-rose">둘 다 또 가고 싶대요 💞</p>}

      <div className="space-y-2">
        {order.map((w) => {
          const r = place.reviews[w];
          const isMe = w === profile.me;
          return (
            <div key={w} className={`rounded-2xl p-4 ${isMe ? "bg-lemon/70" : "bg-lilac/60"}`}>
              <div className="flex items-center justify-between">
                <p className="font-cute text-[15px]">
                  {profile.names[w]}
                  {isMe && <span className="ml-1 text-xs text-ink-soft">(나)</span>}
                </p>
                {isMe && r && !reviewing ? (
                  <button onClick={() => setReviewing(true)} className="flex items-center gap-1.5" aria-label="내 별점 고치기">
                    <Stars value={r.stars} />
                    <span className="text-xs text-ink-soft">✎</span>
                  </button>
                ) : (
                  r && !(isMe && reviewing) && <Stars value={r.stars} />
                )}
              </div>
              {isMe && reviewing ? (
                <MyReviewEditor place={place} me={w} onDone={() => setReviewing(false)} onError={setError} />
              ) : r ? (
                <>
                  <p className="mt-1 text-xs text-ink-soft">
                    {starLabel(r.stars)}
                    {r.again && " · 또 가고 싶어 🔁"}
                  </p>
                  {r.comment && <p className="mt-2 whitespace-pre-wrap text-[15px]">{r.comment}</p>}
                </>
              ) : isMe ? (
                <button onClick={() => setReviewing(true)} className="press mt-2 rounded-full bg-white px-4 py-1.5 font-cute text-sm text-rose">
                  내 별점 남기기 ⭐
                </button>
              ) : (
                <p className="mt-1 text-sm text-ink-soft">아직 {josa(profile.names[w], "이", "가")} 별점을 안 남겼어요.</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button variant="soft" onClick={onEdit} className="flex-1">
          기록 고치기
        </Button>
        <a
          href={place.kakaoId ? `https://place.map.kakao.com/${place.kakaoId}` : `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`}
          target="_blank"
          rel="noreferrer"
          className="press flex items-center rounded-full bg-cream px-5 font-cute text-[15px] text-ink-soft"
        >
          지도 앱 ↗
        </a>
      </div>

      <div className="pt-2 text-center">
        {confirmDelete ? (
          <div className="rounded-2xl bg-blush p-3 text-sm">
            <p className="text-rose">이 장소 기록을 지울까요? 두 사람의 별점·후기와 사진도 같이 사라져요.</p>
            <div className="mt-2 flex justify-center gap-4">
              <button onClick={() => setConfirmDelete(false)} className="text-ink-soft">
                취소
              </button>
              <button
                onClick={() => {
                  const r = update((s) => ({ ...s, places: s.places.filter((p) => p.id !== place.id) }));
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
            기록 지우기
          </button>
        )}
      </div>
    </div>
  );
}
