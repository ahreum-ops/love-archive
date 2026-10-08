"use client";

import type { ReactNode } from "react";
import { paperOf } from "@/lib/content";

/** 줄 그어진 편지지 바탕 */
export function LetterPaper({ paper, children, className = "" }: { paper: string; children: ReactNode; className?: string }) {
  const p = paperOf(paper);
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] px-5 pb-6 pt-5 shadow-soft ring-1 ring-white ${className}`}
      style={{
        backgroundColor: p.bg,
        // 줄 간격 = 본문 line-height(34px) 와 맞춤
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 33px, ${p.line} 33px, ${p.line} 34px)`,
        backgroundPosition: "0 18px",
      }}
    >
      <span className="pointer-events-none absolute right-4 top-3 text-2xl opacity-70">{p.deco}</span>
      {children}
    </div>
  );
}

/** 편지 본문 글씨 (손글씨체, 줄 간격 34px) */
export const penText = "font-pen text-[23px] leading-[34px] text-ink";
