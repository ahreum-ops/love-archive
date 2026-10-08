"use client";

import { useId } from "react";
import type { CatLook } from "@/lib/types";

const INK = "#5b4760";
const LOOKS = {
  // 고등어 + 흰 블레이즈 · 흰 주둥이 · 초록 눈
  tabby: { coat: "#8f8174", stripe: "#5f5249", face: "#fffaf5", eye: "#9cc97f" },
  // 흰 바탕 · 오른쪽 귀와 등에 고등어 얼룩 · 연두빛 노란 눈
  patch: { coat: "#fffaf5", stripe: "#5f5249", face: "#fffaf5", eye: "#c9d27a", spot: "#968676" },
} as const;

export type CatMood = "idle" | "happy" | "sleep";

/** 우리집 냥이 (앉은 정면). baby 면 몸이 작고 눈이 커진다 */
export default function CatSprite({ look, mood = "idle", baby = false, size = 80 }: { look: CatLook; mood?: CatMood; baby?: boolean; size?: number }) {
  const id = useId().replace(/:/g, "");
  const c = LOOKS[look];
  const spot = look === "patch" ? LOOKS.patch.spot : c.coat;
  const eyeR = baby ? 8 : 6.5;

  const eye = (cx: number) => {
    if (mood === "happy") return <path d={`M${cx - 6} 58 Q${cx} 51 ${cx + 6} 58`} stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />;
    if (mood === "sleep") return <path d={`M${cx - 6} 56 Q${cx} 61 ${cx + 6} 56`} stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />;
    return (
      <g>
        <ellipse cx={cx} cy={56} rx={eyeR} ry={eyeR + 1} fill={c.eye} stroke={INK} strokeWidth="1.6" />
        <ellipse cx={cx} cy={56.5} rx={eyeR * 0.45} ry={eyeR * 0.8} fill="#2f2730" />
        <circle cx={cx + eyeR * 0.35} cy={53} r={eyeR * 0.3} fill="#fff" />
      </g>
    );
  };

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <defs>
        <clipPath id={`head${id}`}>
          <ellipse cx="60" cy="56" rx="36" ry="30" />
        </clipPath>
        <clipPath id={`body${id}`}>
          <ellipse cx="60" cy="92" rx="30" ry="24" />
        </clipPath>
      </defs>

      {/* 꼬리 */}
      <path d="M82 104 C 106 106, 112 86, 101 74" stroke={INK} strokeWidth="11" fill="none" strokeLinecap="round" />
      <path d="M82 104 C 106 106, 112 86, 101 74" stroke={spot} strokeWidth="7" fill="none" strokeLinecap="round" />

      {/* 몸 (아기는 작게) */}
      <g transform={baby ? "translate(60 116) scale(0.78) translate(-60 -116)" : undefined}>
        <ellipse cx="60" cy="92" rx="30" ry="24" fill={c.coat} stroke={INK} strokeWidth="2.4" />
        <g clipPath={`url(#body${id})`}>
          {look === "tabby" ? (
            <>
              <path d="M32 84 L42 86 M30 94 L40 95 M88 84 L78 86 M90 94 L80 95" stroke={c.stripe} strokeWidth="2.4" strokeLinecap="round" />
              <ellipse cx="60" cy="98" rx="17" ry="20" fill={c.face} />
            </>
          ) : (
            <ellipse cx="81" cy="84" rx="7" ry="12" transform="rotate(-20 81 84)" fill={spot} />
          )}
        </g>
        <ellipse cx="60" cy="92" rx="30" ry="24" fill="none" stroke={INK} strokeWidth="2.4" />
        <ellipse cx="49" cy="113" rx="8" ry="5.5" fill={c.face} stroke={INK} strokeWidth="2" />
        <ellipse cx="71" cy="113" rx="8" ry="5.5" fill={c.face} stroke={INK} strokeWidth="2" />
      </g>

      {/* 귀 */}
      <path d="M27 44 L29 13 L53 31 Z" fill={c.coat} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M93 44 L91 13 L67 31 Z" fill={spot} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M33 36 L33 21 L46 31 Z" fill="#ffc6d3" />
      <path d="M87 36 L87 21 L74 31 Z" fill="#ffc6d3" />

      {/* 얼굴 */}
      <ellipse cx="60" cy="56" rx="36" ry="30" fill={c.coat} />
      <g clipPath={`url(#head${id})`}>
        {look === "tabby" ? (
          <>
            {/* 이마 줄무늬 + 볼 줄무늬 */}
            <path d="M46 28 Q47 36 45 42 M52 26 Q53 33 51 38 M74 28 Q73 36 75 42 M68 26 Q67 33 69 38" stroke={c.stripe} strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path d="M24 54 L35 56 M24 62 L34 62 M96 54 L85 56 M96 62 L86 62" stroke={c.stripe} strokeWidth="2.4" strokeLinecap="round" />
            {/* 흰 블레이즈 → 주둥이 */}
            <path d="M57 24 Q60 21 63 24 L67 52 Q60 48 53 52 Z" fill={c.face} />
            <ellipse cx="60" cy="69" rx="20" ry="15" fill={c.face} />
          </>
        ) : (
          <>
            {/* 오른쪽 귀 쪽 얼룩 */}
            <ellipse cx="92" cy="30" rx="26" ry="20" fill={spot} />
            <path d="M74 20 Q78 28 76 34 M82 18 Q86 26 84 32" stroke={c.stripe} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </>
        )}
      </g>
      <ellipse cx="60" cy="56" rx="36" ry="30" fill="none" stroke={INK} strokeWidth="2.4" />

      {eye(45)}
      {eye(75)}

      {/* 볼터치 · 코 · 입 · 수염 */}
      <ellipse cx="37" cy="68" rx="5.5" ry="3.2" fill="#ffb3c7" opacity="0.7" />
      <ellipse cx="83" cy="68" rx="5.5" ry="3.2" fill="#ffb3c7" opacity="0.7" />
      <path d="M56 64 L64 64 L60 68.5 Z" fill="#f4a3b6" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M60 68.5 Q57.5 72.5 54 70.5 M60 68.5 Q62.5 72.5 66 70.5" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M30 64 L14 61 M30 69 L15 71 M90 64 L106 61 M90 69 L105 71" stroke={INK} strokeOpacity="0.35" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
