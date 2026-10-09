// 사진첩: 직접 올린 사진 + 버킷리스트 완료 사진 + 장소 사진을 한데 모아 최신순으로 보여준다.
// 버킷·장소 사진은 원래 화면에서 고치고, 사진첩에선 보기만 한다.

import type { AppState, Who } from "./types";

export type AlbumSource = "album" | "bucket" | "place";

export type AlbumItem = {
  /** 출처 + 원래 id (화면 key 용) */
  key: string;
  id: string;
  source: AlbumSource;
  src: string;
  /** YYYY-MM-DD */
  date: string;
  caption?: string;
  by?: Who;
  /** 정렬용: 같은 날이면 나중에 올린 게 앞 */
  createdAt?: string;
};

export const SOURCE_LABEL: Record<AlbumSource, string> = { album: "사진첩", bucket: "버킷리스트", place: "장소" };
export const SOURCE_HREF: Record<AlbumSource, string> = { album: "/album", bucket: "/bucket", place: "/places" };

export function albumItems(s: AppState): AlbumItem[] {
  const items: AlbumItem[] = [
    ...s.photos.map((p) => ({ key: `album-${p.id}`, id: p.id, source: "album" as const, src: p.src, date: p.date, caption: p.caption, by: p.by, createdAt: p.createdAt })),
    ...s.bucket
      .filter((b) => b.photo && b.doneAt)
      .map((b) => ({ key: `bucket-${b.id}`, id: b.id, source: "bucket" as const, src: b.photo!, date: b.doneAt!, caption: `${b.emoji} ${b.title}` })),
    ...s.places
      .filter((p) => p.photo)
      .map((p) => ({ key: `place-${p.id}`, id: p.id, source: "place" as const, src: p.photo!, date: p.visitedAt, caption: `📍 ${p.name}` })),
  ];
  return items.sort((x, y) => y.date.localeCompare(x.date) || (y.createdAt ?? "").localeCompare(x.createdAt ?? ""));
}

/** "2026-10-09" → "2026년 10월" */
export function monthLabel(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${y}년 ${m}월`;
}
