// 우리가 간 곳: 카테고리 · 별점 문구 · 장소 검색(카카오 → 못 찾으면 OpenStreetMap Nominatim)

import { loadKakao, type KPlaceRow } from "./kakao";
import type { Place, Who } from "./types";

export const PLACE_CATEGORIES = [
  { id: "food", label: "맛집", emoji: "🍜", color: "#ffd2b8" },
  { id: "cafe", label: "카페", emoji: "☕", color: "#f0dcc8" },
  { id: "bar", label: "술집", emoji: "🍻", color: "#ffe9a8" },
  { id: "date", label: "놀거리", emoji: "🎡", color: "#ffc4d6" },
  { id: "culture", label: "전시·공연", emoji: "🎨", color: "#dccfff" },
  { id: "nature", label: "산책·자연", emoji: "🌳", color: "#c8efd9" },
  { id: "trip", label: "여행", emoji: "🧳", color: "#c9e2ff" },
  { id: "stay", label: "숙소", emoji: "🏨", color: "#e6d8f5" },
  { id: "etc", label: "기타", emoji: "📍", color: "#f3e6ec" },
] as const;

export function placeCategory(id: string) {
  return PLACE_CATEGORIES.find((c) => c.id === id) ?? PLACE_CATEGORIES[PLACE_CATEGORIES.length - 1];
}

/** 별점별 한마디 (0.5 단위는 내림해서 쓴다) */
export const STAR_LABELS: Record<number, string> = {
  1: "다신 안 갈래…",
  2: "그저 그랬어",
  3: "괜찮았어",
  4: "좋았어!",
  5: "인생 장소 💗",
};

export function starLabel(stars: number): string {
  return STAR_LABELS[Math.max(1, Math.floor(stars))] ?? "";
}

/** 후기 쓸 때 막막하지 않게 바꿔가며 보여주는 예시 */
export const REVIEW_HINTS = [
  "제일 맛있었던 메뉴는?",
  "그날 무슨 얘기 했더라?",
  "다음에 가면 꼭 해볼 것",
  "분위기 한 줄 요약",
  "여기서 찍은 사진 포즈는…",
];

/** 두 사람 별점 평균. 아무도 안 매겼으면 null */
export function averageStars(p: Place): number | null {
  const list = (["a", "b"] as Who[]).map((w) => p.reviews[w]?.stars).filter((s): s is number => !!s);
  if (!list.length) return null;
  return Math.round((list.reduce((x, y) => x + y, 0) / list.length) * 10) / 10;
}

/** 지도를 처음 열 때 보여줄 곳 (서울시청) */
export const DEFAULT_CENTER: [number, number] = [37.5665, 126.978];

export type SearchHit = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** 카카오가 알려준 종류로 고른 PLACE_CATEGORIES id */
  category?: string;
  /** 카카오 장소 id (place.map.kakao.com/{id}) */
  kakaoId?: string;
  /** "음식점 > 양식 > 이탈리안" 의 마지막 칸 */
  kind?: string;
};

/** 카카오 분류 → 우리 카테고리 */
function kakaoCategory(r: KPlaceRow): string {
  const c = r.category_name;
  if (r.category_group_code === "CE7" || c.includes("카페")) return "cafe";
  if (c.includes("술집")) return "bar";
  if (r.category_group_code === "FD6") return "food";
  if (r.category_group_code === "AD5") return "stay";
  if (r.category_group_code === "CT1") return "culture";
  if (/공원|산|숲|해수욕장|호수|수목원/.test(c)) return "nature";
  if (r.category_group_code === "AT4") return "date";
  if (/테마파크|놀이|오락|노래방|방탈출|볼링|스포츠/.test(c)) return "date";
  return "etc";
}

async function kakaoSearch(query: string, near?: [number, number]): Promise<SearchHit[]> {
  const maps = await loadKakao();
  const places = new maps.services.Places();
  return new Promise((resolve, reject) => {
    places.keywordSearch(
      query,
      (rows, status) => {
        if (status === maps.services.Status.ZERO_RESULT) return resolve([]);
        if (status !== maps.services.Status.OK) return reject(new Error("카카오 장소 검색 실패"));
        resolve(
          rows.map((r) => ({
            name: r.place_name,
            address: r.road_address_name || r.address_name,
            lat: Number(r.y),
            lng: Number(r.x),
            category: kakaoCategory(r),
            kakaoId: r.id,
            kind: r.category_name.split(">").pop()?.trim(),
          })),
        );
      },
      // 지금 보고 있는 곳 근처를 먼저 (정확도 순 안에서 가까운 곳 가산)
      { size: 15, ...(near ? { location: new maps.LatLng(near[0], near[1]) } : {}) },
    );
  });
}

/** 국내 가게는 카카오로, 카카오가 못 찾으면(해외 등) OpenStreetMap 으로 */
export async function searchPlaces(query: string, near?: [number, number]): Promise<SearchHit[]> {
  try {
    const hits = await kakaoSearch(query, near);
    if (hits.length) return hits;
  } catch (e) {
    console.warn("[places] kakao search unavailable, using OpenStreetMap", e);
  }
  return osmSearch(query, near);
}

// Nominatim 이용 규칙: 초당 1번 이하. 그래서 타이핑마다가 아니라 '검색' 누를 때만 부른다.
const NOMINATIM = "https://nominatim.openstreetmap.org";

async function osmSearch(query: string, near?: [number, number]): Promise<SearchHit[]> {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "8", "accept-language": "ko", addressdetails: "0" });
  if (near) {
    // 지금 보고 있는 곳 근처를 먼저 (제한은 안 함)
    const [lat, lng] = near;
    params.set("viewbox", `${lng - 0.5},${lat + 0.5},${lng + 0.5},${lat - 0.5}`);
  }
  const res = await fetch(`${NOMINATIM}/search?${params}`);
  if (!res.ok) throw new Error(`장소 검색이 잠깐 안 돼요 (${res.status}). 지도에서 직접 콕 찍어 주세요.`);
  const rows: { name?: string; display_name: string; lat: string; lon: string }[] = await res.json();
  return rows.map((r) => ({
    name: r.name || r.display_name.split(",")[0],
    address: shortAddress(r.display_name),
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}

/** 찍은 좌표의 주소 (실패하면 빈 문자열 — 주소는 없어도 저장할 수 있다) */
export async function reverseGeocode(lat: number, lng: number): Promise<{ name: string; address: string }> {
  try {
    const maps = await loadKakao();
    const found = await new Promise<{ name: string; address: string } | null>((resolve) =>
      new maps.services.Geocoder().coord2Address(lng, lat, (rows, status) => {
        const r = rows?.[0];
        if (status !== maps.services.Status.OK || !r) return resolve(null);
        resolve({ name: r.road_address?.building_name ?? "", address: r.road_address?.address_name || r.address?.address_name || "" });
      }),
    );
    if (found) return found;
  } catch {
    // 카카오를 못 쓰면 아래 OpenStreetMap 으로
  }
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "jsonv2", "accept-language": "ko", zoom: "18" });
    const res = await fetch(`${NOMINATIM}/reverse?${params}`);
    if (!res.ok) return { name: "", address: "" };
    const r: { name?: string; display_name?: string } = await res.json();
    return { name: r.name ?? "", address: r.display_name ? shortAddress(r.display_name) : "" };
  } catch (e) {
    console.error("[places] reverse geocode failed", e);
    return { name: "", address: "" };
  }
}

/** "건물, 번지, 동, 구, 시, 우편번호, 대한민국" → 큰 단위부터 읽기 좋게 */
function shortAddress(display: string): string {
  const parts = display
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "대한민국" && !/^\d{5}$/.test(s));
  return parts.slice(1).reverse().slice(0, 4).join(" ");
}
