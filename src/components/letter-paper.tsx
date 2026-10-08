"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from "react";
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

/** 편지 본문 글씨 (손글씨체, 줄 간격 34px, 긴 단어도 줄바꿈) */
export const penText = "font-pen text-[23px] leading-[34px] text-ink [overflow-wrap:anywhere]";

const LINE = 34;

/**
 * 쓰는 만큼 높이가 늘어나는 textarea.
 * (CSS field-sizing 은 아이폰 사파리가 지원하지 않아서 직접 높이를 맞춘다)
 */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { minLines?: number }>(
  function AutoTextarea({ minLines = 1, className = "", value, ...rest }, ref) {
    const inner = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => inner.current!);

    useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, minLines * LINE)}px`;
    }, [value, minLines]);

    return (
      <textarea
        ref={inner}
        rows={minLines}
        value={value}
        className={`block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-ink/30 ${className}`}
        {...rest}
      />
    );
  },
);
