"use client";

import Link from "next/link";
import { useState } from "react";
import CoupleHero from "@/components/couple-hero";
import { Card } from "@/components/ui";
import SettingsSheet from "@/components/settings-sheet";
import WhoSwitch from "@/components/who-switch";
import { BALANCE } from "@/lib/content";
import { dayCount, dLabel, formatDate, upcoming } from "@/lib/dates";
import { josa } from "@/lib/josa";
import { isLocked } from "@/lib/letters";
import { useAppState } from "@/lib/store";

export default function Home() {
  const state = useAppState();
  const [settings, setSettings] = useState(false);
  if (!state?.profile) return null;
  const { profile, bucket, anniversaries, balance, letters } = state;
  const partner = profile.me === "a" ? "b" : "a";
  const unread = letters.filter((l) => l.from !== profile.me && !l.readAt && !isLocked(l)).length;
  const waiting = letters.filter((l) => l.from !== profile.me && isLocked(l)).length;

  const days = dayCount(profile.startDate);
  const next = upcoming(profile.startDate, anniversaries).slice(0, 3);
  const done = bucket.filter((b) => b.doneAt).length;
  const pct = bucket.length ? Math.round((done / bucket.length) * 100) : 0;
  const recent = bucket.filter((b) => b.doneAt).sort((x, y) => y.doneAt!.localeCompare(x.doneAt!)).slice(0, 3);

  // 둘 중 내가 아직 안 고른 첫 질문
  const nextQ = BALANCE.find((q) => balance[q.id]?.[profile.me] === undefined);
  const matched = BALANCE.filter((q) => {
    const r = balance[q.id];
    return r?.a !== undefined && r.a === r.b;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <WhoSwitch />
        <button onClick={() => setSettings(true)} className="press rounded-full bg-white/90 p-2 text-ink-soft shadow-soft ring-1 ring-line" aria-label="설정">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </div>

      <CoupleHero profile={profile} days={days} />

      {(unread > 0 || waiting > 0) && (
        <Link href="/letters" className="press flex items-center gap-3 rounded-[24px] bg-gradient-to-r from-pink to-violet px-5 py-4 text-white shadow-pop">
          <span className="animate-float text-3xl">{unread > 0 ? "💌" : "🔒"}</span>
          <div className="flex-1">
            <p className="font-cute text-lg">
              {unread > 0
                ? `${josa(profile.names[partner], "이", "가")} 보낸 편지가 ${unread}통 왔어요`
                : `열어볼 날을 기다리는 편지가 ${waiting}통 있어요`}
            </p>
            <p className="text-xs opacity-90">{unread > 0 ? "지금 열어보기 ›" : "편지함에서 남은 날을 확인해요 ›"}</p>
          </div>
        </Link>
      )}

      {/* 다가오는 기념일 */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-cute text-lg">다가오는 기념일</h2>
          <Link href="/days" className="text-xs text-ink-soft">
            전체 보기 ›
          </Link>
        </div>
        <ul className="space-y-2">
          {next.map((u) => (
            <li key={u.key} className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2.5">
              <span className="text-xl">{u.emoji}</span>
              <div className="flex-1">
                <p className="text-[15px]">{u.title}</p>
                <p className="text-xs text-ink-soft">{formatDate(u.date)}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 font-cute text-sm ${u.daysLeft <= 7 ? "bg-pink text-white" : "bg-blush text-rose"}`}>
                {dLabel(u.daysLeft)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {/* 버킷리스트 진행률 */}
        <Link href="/bucket" className="press rounded-[28px] bg-mint/90 p-5 shadow-soft ring-1 ring-white">
          <p className="text-xs text-ink-soft">버킷리스트</p>
          <p className="mt-1 font-cute text-3xl text-ink">
            {done}
            <span className="text-base text-ink-soft"> / {bucket.length}</span>
          </p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-gradient-to-r from-pink to-violet transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-right text-xs text-ink-soft">{pct}%</p>
        </Link>

        {/* 밸런스 게임 */}
        <Link href="/play/balance" className="press rounded-[28px] bg-lilac/90 p-5 shadow-soft ring-1 ring-white">
          <p className="text-xs text-ink-soft">밸런스 게임</p>
          <p className="mt-1 font-cute text-3xl text-ink">
            {matched}
            <span className="text-base text-ink-soft"> 번 통함</span>
          </p>
          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-ink">
            {nextQ ? `${nextQ.a} vs ${nextQ.b}` : "다 풀었어요! 🎉"}
          </p>
        </Link>
      </div>

      {/* 최근 추억 */}
      <Card>
        <h2 className="mb-3 font-cute text-lg">최근에 함께한 일</h2>
        {recent.length === 0 ? (
          <div className="rounded-2xl bg-cream px-4 py-5 text-center">
            <p className="text-sm text-ink-soft">아직 완료한 버킷리스트가 없어요.</p>
            <Link href="/bucket" className="press mt-3 inline-block rounded-full bg-blush px-4 py-2 font-cute text-sm text-rose">
              첫 번째 버킷리스트 고르기
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {recent.map((b) => (
              <li key={b.id} className="flex items-center gap-3">
                {b.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.photo} alt="" className="h-12 w-12 rounded-2xl object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-peach text-2xl">{b.emoji}</span>
                )}
                <div className="flex-1">
                  <p className="text-[15px]">{b.title}</p>
                  <p className="text-xs text-ink-soft">{formatDate(b.doneAt!)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
