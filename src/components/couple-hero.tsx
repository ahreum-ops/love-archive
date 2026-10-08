"use client";

import { useRef, useState } from "react";
import { formatDate } from "@/lib/dates";
import { compressImage } from "@/lib/image";
import { update } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { Banner, Button, Sheet } from "./ui";

/** 홈 맨 위: 커플 사진 + 함께한 날 */
export default function CoupleHero({ profile, days }: { profile: Profile; days: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setMenu(false);
    try {
      // 홈에 크게 보이니까 버킷리스트 사진보다 크게 저장
      const photo = await compressImage(file, 1280, 0.82);
      const r = update((s) => ({ ...s, profile: { ...s.profile!, photo } }));
      if (!r.ok) setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 불러오지 못했어요");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePhoto() {
    const r = update((s) => ({ ...s, profile: { ...s.profile!, photo: undefined } }));
    if (!r.ok) setError(r.error);
    setMenu(false);
  }

  const input = <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />;
  const count = (
    <>
      {days.toLocaleString()}
      <span className="ml-1 text-2xl">일째</span>
    </>
  );

  if (!profile.photo) {
    return (
      <div className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-blush via-white to-lilac px-6 pb-6 pt-8 text-center shadow-pop ring-1 ring-white">
        <Banner message={error} onClose={() => setError(null)} />
        {input}
        <Names profile={profile} className="text-ink" />
        <p className="mt-4 text-sm text-ink-soft">우리가 함께한 지</p>
        <p className="font-cute text-6xl leading-tight text-rose">{count}</p>
        <p className="mt-2 text-xs text-ink-soft">{formatDate(profile.startDate)} 부터</p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="press mt-5 inline-flex items-center gap-2 rounded-full border-2 border-dashed border-pink/70 bg-white/70 px-4 py-2 text-sm text-rose"
        >
          {busy ? "⏳ 사진 줄이는 중…" : "📷 우리 커플 사진 넣기"}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Banner message={error} onClose={() => setError(null)} />
      {input}
      {/* 폴라로이드 느낌의 흰 테두리 */}
      <div className="rounded-[36px] bg-white p-2.5 pb-0 shadow-pop ring-1 ring-line">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[28px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={profile.photo} alt="우리 커플 사진" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/70 via-ink/25 to-transparent" />
          <button
            onClick={() => setMenu(true)}
            className="press absolute right-3 top-3 rounded-full bg-white/80 px-3 py-1.5 text-xs text-ink backdrop-blur"
          >
            {busy ? "⏳" : "📷 사진 바꾸기"}
          </button>
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5 text-white">
            <p className="text-sm opacity-90">우리가 함께한 지</p>
            <p className="font-cute text-6xl leading-none drop-shadow">{count}</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-3">
          <Names profile={profile} className="text-ink" />
          <span className="text-xs text-ink-soft">{formatDate(profile.startDate)} 부터</span>
        </div>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title="커플 사진">
        <div className="space-y-2">
          <Button onClick={() => fileRef.current?.click()} className="w-full">
            다른 사진으로 바꾸기
          </Button>
          <Button variant="ghost" onClick={removePhoto} className="w-full bg-cream">
            사진 빼기
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Names({ profile, className = "" }: { profile: Profile; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 font-cute text-lg ${className}`}>
      <span>{profile.names.a}</span>
      <span className="animate-float text-xl">💗</span>
      <span>{profile.names.b}</span>
    </div>
  );
}
