import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// 아이폰 홈 화면 아이콘 (SVG 를 못 쓰므로 PNG 로 생성)
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #ffe0e9, #ebe2ff)",
        }}
      >
        <svg width="120" height="120" viewBox="100 130 312 280">
          <path
            d="M256 400c-14 0-150-82-150-180 0-48 36-84 80-84 30 0 56 16 70 42 14-26 40-42 70-42 44 0 80 36 80 84 0 98-136 180-150 180z"
            fill="#f08aa8"
          />
        </svg>
      </div>
    ),
    size,
  );
}
