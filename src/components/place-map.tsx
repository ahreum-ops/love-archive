"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
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

/** OpenStreetMap 위에 우리가 간 곳 핀을 찍는 지도. Leaflet 은 브라우저에서만 불러온다. */
export default function PlaceMap({ places, className = "", selectedId, onSelect, pick, onPick, focus }: Props) {
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
      const c = placeCategory(p.category);
      const selected = p.id === selectedId;
      lib
        .marker([p.lat, p.lng], {
          icon: lib.divIcon({
            className: "",
            html: `<div class="place-pin${selected ? " is-selected" : ""}" style="--pin:${c.color}"><span>${c.emoji}</span></div>`,
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
        icon: lib.divIcon({ className: "", html: `<div class="place-pin is-pick"><span>💗</span></div>`, iconSize: [44, 52], iconAnchor: [22, 50] }),
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
