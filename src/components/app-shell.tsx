"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAppState } from "@/lib/store";
import Setup from "./setup";

const TABS = [
  { href: "/", label: "홈", icon: HomeIcon },
  { href: "/bucket", label: "버킷리스트", icon: StarIcon },
  { href: "/play", label: "놀이", icon: GameIcon },
  { href: "/days", label: "기념일", icon: CalIcon },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const state = useAppState();
  const pathname = usePathname();

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-hidden">
      <Blobs />
      {state?.profile === null ? (
        <Setup />
      ) : (
        <>
          {/* 서버 렌더링 때도 페이지를 그려야 하므로 children 은 항상 둔다 (데이터가 없으면 각 페이지가 비워 둠) */}
          <main className="relative px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-[calc(env(safe-area-inset-top)+16px)]">
            {children}
          </main>
          {state === null && <Splash />}
          {state && <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <div className="flex rounded-[26px] bg-white/90 p-1.5 shadow-pop ring-1 ring-line backdrop-blur">
              {TABS.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`press flex flex-1 flex-col items-center gap-0.5 rounded-[20px] py-2 text-[11px] ${
                      active ? "bg-blush text-rose" : "text-ink-soft"
                    }`}
                  >
                    <Icon active={active} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>}
        </>
      )}
    </div>
  );
}

function Splash() {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="animate-float text-5xl">💗</div>
    </div>
  );
}

/** 배경의 몽글몽글한 색 덩어리 */
function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 mx-auto max-w-md overflow-hidden">
      <div className="absolute -left-20 -top-16 h-64 w-64 rounded-full bg-blush blur-3xl" />
      <div className="absolute -right-24 top-40 h-72 w-72 rounded-full bg-lilac blur-3xl" />
      <div className="absolute -bottom-10 -left-10 h-64 w-64 rounded-full bg-peach blur-3xl" />
      <div className="absolute bottom-40 right-0 h-40 w-40 rounded-full bg-mint blur-3xl" />
    </div>
  );
}

type IconProps = { active: boolean };
const stroke = (active: boolean) => ({
  fill: active ? "currentColor" : "none",
  fillOpacity: active ? 0.2 : 0,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

function HomeIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M12 20.5c-.5 0-8-4.6-8-10.2C4 7.4 6.1 5.5 8.5 5.5c1.6 0 2.9.8 3.5 2.2.6-1.4 1.9-2.2 3.5-2.2 2.4 0 4.5 1.9 4.5 4.8 0 5.6-7.5 10.2-8 10.2z" />
    </svg>
  );
}
function StarIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M12 3.5l2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.7z" />
    </svg>
  );
}
function GameIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke(active)}>
      <rect x="3" y="7" width="18" height="11" rx="5.5" />
      <path d="M8 10.5v4M6 12.5h4" />
      <circle cx="15.5" cy="11.5" r=".6" fill="currentColor" />
      <circle cx="17.5" cy="13.5" r=".6" fill="currentColor" />
    </svg>
  );
}
function CalIcon({ active }: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke(active)}>
      <rect x="4" y="5.5" width="16" height="14" rx="4" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
    </svg>
  );
}
