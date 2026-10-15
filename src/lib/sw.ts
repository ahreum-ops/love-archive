"use client";

// 서비스워커 등록 — 푸시 알림과 갤러리 공유 받기(share_target)가 같이 쓴다.
// 공유 목록에 뜨려면 앱 설치 전부터 등록돼 있어야 해서 앱이 열릴 때마다 등록해 둔다.

let registration: Promise<ServiceWorkerRegistration> | null = null;

export function registerSW(): Promise<ServiceWorkerRegistration> {
  registration ??= navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return registration;
}

export function swSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

const SHARE_CACHE = "shared-photos"; // public/sw.js 와 같은 이름

/** 서비스워커가 받아 둔 공유 사진을 꺼내고 비운다 */
export async function takeSharedPhotos(): Promise<Blob[]> {
  if (!("caches" in window) || !(await caches.has(SHARE_CACHE))) return [];
  const cache = await caches.open(SHARE_CACHE);
  const keys = [...(await cache.keys())];
  keys.sort((a, b) => Number(a.url.split("/").pop()) - Number(b.url.split("/").pop()));
  const blobs = await Promise.all(keys.map(async (k) => (await cache.match(k))!.blob()));
  await caches.delete(SHARE_CACHE);
  return blobs;
}
