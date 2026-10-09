// 카카오맵 JavaScript SDK 불러오기 + 이 앱에서 쓰는 만큼의 타입.
// 키가 없거나 도메인이 등록 안 돼 있으면 loadKakao() 가 실패 → 지도는 OpenStreetMap 으로 대신 그린다.

export const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";

export type KLatLng = { getLat(): number; getLng(): number };
export type KMap = {
  setCenter(p: KLatLng): void;
  setLevel(level: number): void;
  getLevel(): number;
  setBounds(b: KLatLngBounds, top?: number, right?: number, bottom?: number, left?: number): void;
  relayout(): void;
  addControl(c: unknown, pos: number): void;
};
export type KLatLngBounds = { extend(p: KLatLng): void };
export type KOverlay = { setMap(m: KMap | null): void };

type KPlaceRow = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
};
type KAddressRow = { address?: { address_name: string }; road_address?: { address_name: string; building_name?: string } | null };

export type KakaoMaps = {
  load(cb: () => void): void;
  LatLng: new (lat: number, lng: number) => KLatLng;
  LatLngBounds: new () => KLatLngBounds;
  Map: new (el: HTMLElement, opts: { center: KLatLng; level: number }) => KMap;
  CustomOverlay: new (opts: { position: KLatLng; content: HTMLElement; xAnchor?: number; yAnchor?: number; zIndex?: number; clickable?: boolean }) => KOverlay;
  ZoomControl: new () => unknown;
  ControlPosition: { RIGHT: number; BOTTOMRIGHT: number };
  event: { addListener(target: unknown, type: string, fn: (e: { latLng: KLatLng }) => void): void };
  services: {
    Status: { OK: string; ZERO_RESULT: string; ERROR: string };
    Places: new () => {
      keywordSearch(q: string, cb: (rows: KPlaceRow[], status: string) => void, opts?: { location?: KLatLng; size?: number }): void;
    };
    Geocoder: new () => {
      coord2Address(lng: number, lat: number, cb: (rows: KAddressRow[], status: string) => void): void;
    };
  };
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

let loading: Promise<KakaoMaps> | null = null;

/** SDK 를 한 번만 불러온다. 실패하면 다음 호출 때 다시 시도 */
export function loadKakao(): Promise<KakaoMaps> {
  if (!KAKAO_KEY) return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 가 없어요"));
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao.maps);
  loading ??= new Promise<KakaoMaps>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=services`;
    s.async = true;
    // 도메인 미등록·카카오맵 미사용 설정이면 스크립트는 받아져도 load 가 안 불린다 → 시간 제한
    const timer = setTimeout(() => reject(new Error("카카오맵 응답이 없어요 (도메인 등록·카카오맵 사용 설정 확인)")), 8000);
    s.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps) {
        clearTimeout(timer);
        return reject(new Error("카카오맵 SDK 를 불러오지 못했어요"));
      }
      maps.load(() => {
        clearTimeout(timer);
        resolve(maps);
      });
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error("카카오맵 SDK 를 불러오지 못했어요 (키·도메인 확인)"));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Leaflet 줌(0~19) ↔ 카카오 레벨(1이 가장 가까움) 대략 변환 */
export const zoomToLevel = (zoom: number) => Math.min(14, Math.max(1, 20 - zoom));

export type { KPlaceRow, KAddressRow };
