"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import { KAKAO_KEY, loadKakao, zoomToLevel, type KMap, type KOverlay, type KakaoMaps } from "@/lib/kakao";
import { DEFAULT_CENTER, placeCategory } from "@/lib/places";
import type { Place } from "@/lib/types";

type LatLng = { lat: number; lng: number };

type Props = {
  places: Place[];
  className?: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** 위치 고르기 모드: 지도를 누르면 onPick, 고른 곳엔 큰 핀 */
  pick?: LatLng | null;
  onPick?: (p: LatLng) => void;
  /** 바뀔 때마다 그곳으로 이동 */
  focus?: (LatLng & { zoom?: number }) | null;
};

const pinHtml = (p: Place, selected: boolean) => {
  const c = placeCategory(p.category);
  return `<div class="place-pin${selected ? " is-selected" : ""}" style="--pin:${c.color}"><span>${c.emoji}</span></div>`;
};
const PICK_HTML = `<div class="place-pin is-pick"><span>💗</span></div>`;

/** 우리가 간 곳 핀을 찍는 지도. 카카오맵(가게 이름이 촘촘)이 기본이고, 못 쓰면 OpenStreetMap 으로 */
export default function PlaceMap(props: Props) {
  const [engine, setEngine] = useState<"kakao" | "osm">(KAKAO_KEY ? "kakao" : "osm");
  return engine === "kakao" ? <KakaoMap {...props} onFail={() => setEngine("osm")} /> : <LeafletMap {...props} />;
}

function KakaoMap({ places, className = "", selectedId, onSelect, pick, onPick, focus, onFail }: Props & { onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const K = useRef<KakaoMaps | null>(null);
  const map = useRef<KMap | null>(null);
  const pins = useRef<KOverlay[]>([]);
  const pickPin = useRef<KOverlay | null>(null);
  const handlers = useRef({ onSelect, onPick, onFail });
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    handlers.current = { onSelect, onPick, onFail };
  });

  // 지도 만들기 (한 번)
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    loadKakao()
      .then((maps) => {
        if (cancelled || !box.current) return;
        K.current = maps;
        const m = new maps.Map(box.current, { center: new maps.LatLng(...DEFAULT_CENTER), level: zoomToLevel(12) });
        m.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
        maps.event.addListener(m, "click", (e) => handlers.current.onPick?.({ lat: e.latLng.getLat(), lng: e.latLng.getLng() }));
        map.current = m;
        // 시트 애니메이션 등으로 크기가 바뀌면 다시 계산
        observer = new ResizeObserver(() => m.relayout());
        observer.observe(box.current);
        setReady(true);
      })
      .catch((e) => {
        console.warn("[place-map] kakao unavailable, using OpenStreetMap", e);
        if (!cancelled) handlers.current.onFail();
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current = null;
    };
  }, []);

  function overlay(maps: KakaoMaps, lat: number, lng: number, html: string, zIndex: number, onClick?: () => void) {
    // 핀 끝(아래 가운데)이 좌표에 오도록 감싼다
    const el = document.createElement("div");
    el.style.cssText = "width:44px;height:52px;display:flex;align-items:flex-start;justify-content:center;cursor:pointer";
    el.innerHTML = html;
    if (onClick) el.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return new maps.CustomOverlay({ position: new maps.LatLng(lat, lng), content: el, xAnchor: 0.5, yAnchor: 1, zIndex, clickable: true });
  }

  // 장소 핀
  useEffect(() => {
    const maps = K.current;
    const m = map.current;
    if (!ready || !maps || !m) return;
    pins.current.forEach((o) => o.setMap(null));
    pins.current = places.map((p) => {
      const o = overlay(maps, p.lat, p.lng, pinHtml(p, p.id === selectedId), p.id === selectedId ? 10 : 1, () => handlers.current.onSelect?.(p.id));
      o.setMap(m);
      return o;
    });
    // 처음 한 번만 전체가 보이게 맞춘다 (그 뒤엔 사용자가 움직인 화면 유지)
    if (!fitted.current && !pick && !focus && places.length) {
      fitted.current = true;
      if (places.length === 1) {
        m.setLevel(zoomToLevel(15));
        m.setCenter(new maps.LatLng(places[0].lat, places[0].lng));
      } else {
        const b = new maps.LatLngBounds();
        places.forEach((p) => b.extend(new maps.LatLng(p.lat, p.lng)));
        m.setBounds(b, 48, 36, 36, 36);
      }
    }
  }, [ready, places, selectedId, pick, focus]);

  // 고르는 중인 위치
  useEffect(() => {
    const maps = K.current;
    const m = map.current;
    if (!ready || !maps || !m) return;
    pickPin.current?.setMap(null);
    pickPin.current = null;
    if (!pick) return;
    pickPin.current = overlay(maps, pick.lat, pick.lng, PICK_HTML, 20);
    pickPin.current.setMap(m);
  }, [ready, pick]);

  useEffect(() => {
    const maps = K.current;
    const m = map.current;
    if (!ready || !maps || !m || !focus) return;
    m.setLevel(focus.zoom ? zoomToLevel(focus.zoom) : Math.min(m.getLevel(), zoomToLevel(16)));
    m.setCenter(new maps.LatLng(focus.lat, focus.lng));
  }, [ready, focus]);

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div ref={box} className="h-full w-full bg-sky/60" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="animate-float text-3xl">🗺️</span>
        </div>
      )}
    </div>
  );
}

/** 카카오 키가 없거나 카카오가 안 뜰 때 쓰는 OpenStreetMap 지도. Leaflet 은 브라우저에서만 불러온다. */
function LeafletMap({ places, className = "", selectedId, onSelect, pick, onPick, focus }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const pickMarker = useRef<Leaflet.Marker | null>(null);
  const handlers = useRef({ onSelect, onPick });
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    handlers.current = { onSelect, onPick };
  });

  // 지도 만들기 (한 번)
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    import("leaflet")
      .then((mod) => {
        if (cancelled || !box.current) return;
        const lib = (mod.default ?? mod) as typeof Leaflet;
        L.current = lib;
        const m = lib.map(box.current, { zoomControl: false, attributionControl: true }).setView(DEFAULT_CENTER, 12);
        lib
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          })
          .addTo(m);
        lib.control.zoom({ position: "bottomright" }).addTo(m);
        m.attributionControl.setPrefix(false);
        m.on("click", (e: Leaflet.LeafletMouseEvent) => handlers.current.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
        layer.current = lib.layerGroup().addTo(m);
        map.current = m;
        // 시트 애니메이션 등으로 크기가 바뀌면 다시 계산
        observer = new ResizeObserver(() => m.invalidateSize());
        observer.observe(box.current);
        setReady(true);
      })
      .catch((e) => {
        console.error("[place-map] leaflet load failed", e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // 장소 핀
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m || !layer.current) return;
    layer.current.clearLayers();
    for (const p of places) {
      const selected = p.id === selectedId;
      lib
        .marker([p.lat, p.lng], {
          icon: lib.divIcon({
            className: "",
            html: pinHtml(p, selected),
            iconSize: [38, 46],
            iconAnchor: [19, 44],
          }),
          zIndexOffset: selected ? 1000 : 0,
          title: p.name,
        })
        .on("click", () => handlers.current.onSelect?.(p.id))
        .addTo(layer.current);
    }
    // 처음 한 번만 전체가 보이게 맞춘다 (그 뒤엔 사용자가 움직인 화면 유지)
    if (!fitted.current && !pick && !focus && places.length) {
      fitted.current = true;
      if (places.length === 1) m.setView([places[0].lat, places[0].lng], 15);
      else m.fitBounds(lib.latLngBounds(places.map((p) => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 15 });
    }
  }, [ready, places, selectedId, pick, focus]);

  // 고르는 중인 위치
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    pickMarker.current?.remove();
    pickMarker.current = null;
    if (!pick) return;
    pickMarker.current = lib
      .marker([pick.lat, pick.lng], {
        icon: lib.divIcon({ className: "", html: PICK_HTML, iconSize: [44, 52], iconAnchor: [22, 50] }),
        zIndexOffset: 2000,
      })
      .addTo(m);
  }, [ready, pick]);

  useEffect(() => {
    if (!ready || !focus || !map.current) return;
    map.current.setView([focus.lat, focus.lng], focus.zoom ?? Math.max(map.current.getZoom(), 16));
  }, [ready, focus]);

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div ref={box} className="h-full w-full bg-sky/60" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-soft">
          {failed ? "지도를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요." : <span className="animate-float text-3xl">🗺️</span>}
        </div>
      )}
    </div>
  );
}
