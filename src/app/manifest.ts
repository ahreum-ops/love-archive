import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "러브아카이브",
    short_name: "러브아카이브",
    description: "우리 둘만의 추억 보관함",
    start_url: "/",
    display: "standalone",
    background_color: "#fff9f5",
    theme_color: "#fff9f5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
    // 갤러리 → 공유 → 러브아카이브. 설치된 앱(안드로이드 크롬·삼성 인터넷)에서만 공유 목록에 뜬다.
    // POST 는 서비스워커(public/sw.js)가 받아 사진을 잠깐 보관하고 /album?shared 로 넘긴다.
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { files: [{ name: "photos", accept: ["image/*"] }] },
    },
  };
}
