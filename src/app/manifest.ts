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
  };
}
