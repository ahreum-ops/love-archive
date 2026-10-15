// 러브아카이브 서비스워커 — 푸시 알림 + 갤러리 공유 받기 (오프라인 캐시 없음)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// 갤러리에서 '공유 → 러브아카이브' 하면 manifest 의 share_target 대로 /share 에 사진이 POST 된다.
// 받은 사진을 캐시에 잠깐 넣어 두고 사진첩으로 보내면, 사진첩이 꺼내서 올리기 시트를 띄우고 지운다.
// 캐시에 넣다 실패하면 메모리에 들고 있다가 사진첩이 메시지(take-shared)로 달라고 할 때 넘긴다.
const SHARE_CACHE = "shared-photos";
let sharedInMemory = [];

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/share") return;
  e.respondWith(receiveShare(e.request));
});

async function receiveShare(request) {
  const album = (params) => Response.redirect(new URL(`/album?${new URLSearchParams(params)}`, self.location.origin).href, 303);
  // 어느 단계에서 왜 실패했는지 사진첩 안내에 그대로 보여 준다
  const why = (step, err) => `${step}: ${(err && (err.name || "")) + " " + (err && err.message ? err.message : String(err))}`.slice(0, 160);

  let files;
  try {
    const form = await request.formData();
    // 갤러리에 따라 type 이 비어 오기도 해서 형식은 보지 않는다 (manifest accept 가 이미 사진만 고름)
    files = [...form.values()].filter((f) => typeof f === "object" && f.size > 0);
  } catch (err) {
    console.error("[sw] share formData failed", err);
    return album({ shared: "error", why: why("form", err) });
  }

  sharedInMemory = files;
  try {
    await caches.delete(SHARE_CACHE);
    const cache = await caches.open(SHARE_CACHE);
    for (let i = 0; i < files.length; i++) {
      // 파일을 먼저 다 읽어서 넣는다 (갤러리 파일을 나중에 읽으면 실패하는 기기가 있음)
      const body = await files[i].arrayBuffer();
      await cache.put(`/shared/${i}`, new Response(body, { headers: { "content-type": files[i].type || "image/jpeg" } }));
    }
    sharedInMemory = [];
    return album({ shared: String(files.length) });
  } catch (err) {
    console.error("[sw] share cache failed", err);
    await caches.delete(SHARE_CACHE).catch(() => undefined);
    return album({ shared: String(files.length), why: why("cache", err) });
  }
}

self.addEventListener("message", (e) => {
  if (e.data !== "take-shared" || !e.ports[0]) return;
  e.ports[0].postMessage(sharedInMemory);
  sharedInMemory = [];
});

self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { body: e.data && e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "러브아카이브", {
      body: data.body || "",
      icon: "/apple-icon",
      // 같은 종류는 하나로 합쳐서 알림이 쌓이지 않게 (renotify 로 소리는 다시)
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    }),
  );
});

// 알림을 누르면 열려 있는 앱 창으로 가서 그 화면을 보여 주고, 없으면 새로 연다
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        await win.focus();
        return win.navigate(url).catch(() => undefined);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
