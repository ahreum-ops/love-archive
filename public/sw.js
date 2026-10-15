// 러브아카이브 서비스워커 — 푸시 알림 + 갤러리 공유 받기 (오프라인 캐시 없음)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// 갤러리에서 '공유 → 러브아카이브' 하면 manifest 의 share_target 대로 /share 에 사진이 POST 된다.
// 받은 사진을 캐시에 잠깐 넣어 두고 사진첩으로 보내면, 사진첩이 꺼내서 올리기 시트를 띄우고 지운다.
const SHARE_CACHE = "shared-photos";

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/share") return;
  e.respondWith(
    (async () => {
      try {
        const form = await e.request.formData();
        // 갤러리에 따라 type 이 비어 오기도 해서 형식은 보지 않는다 (manifest accept 가 이미 사진만 고름)
        const files = form.getAll("photos").filter((f) => f instanceof File && f.size > 0);
        await caches.delete(SHARE_CACHE);
        const cache = await caches.open(SHARE_CACHE);
        await Promise.all(
          files.map((f, i) => cache.put(`/shared/${i}`, new Response(f, { headers: { "content-type": f.type } }))),
        );
        return Response.redirect(`/album?shared=${files.length}`, 303);
      } catch (err) {
        console.error("[sw] share failed", err);
        return Response.redirect("/album?shared=error", 303);
      }
    })(),
  );
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
