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

export type SharedPhotos = { photos: Blob[]; error?: string };

/**
 * 공유된 사진을 받아 온다. 서비스워커는 사진첩으로 먼저 보낸 뒤 사진을 읽으니, 다 읽을 때까지 기다렸다 받는다.
 * 그 사이 서비스워커가 다시 떴으면 메모리가 비어 있으니 캐시에 넣어 둔 사본을 쓴다.
 */
export async function takeSharedPhotos(): Promise<SharedPhotos> {
  const fromWorker = await askWorker();
  const fromCache = await takeFromCache();
  if (fromWorker && "files" in fromWorker && fromWorker.files.length) return { photos: fromWorker.files };
  if (fromCache.length) return { photos: fromCache };
  return { photos: [], error: fromWorker && "error" in fromWorker ? fromWorker.error : undefined };
}

type WorkerShare = { files: File[] } | { error: string } | null;

async function askWorker(): Promise<WorkerShare> {
  const worker = navigator.serviceWorker?.controller ?? (await navigator.serviceWorker?.ready)?.active;
  if (!worker) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    // 큰 사진 여러 장이면 읽는 데 시간이 걸린다
    const timer = setTimeout(() => resolve(null), 30_000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data as WorkerShare);
    };
    worker.postMessage("take-shared", [channel.port2]);
  });
}

async function takeFromCache(): Promise<Blob[]> {
  if (!("caches" in window) || !(await caches.has(SHARE_CACHE))) return [];
  const cache = await caches.open(SHARE_CACHE);
  const keys = [...(await cache.keys())];
  keys.sort((a, b) => Number(a.url.split("/").pop()) - Number(b.url.split("/").pop()));
  const blobs = await Promise.all(keys.map(async (k) => (await cache.match(k))!.blob()));
  await caches.delete(SHARE_CACHE);
  return blobs;
}
