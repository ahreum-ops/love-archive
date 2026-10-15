// 러브아카이브 서비스워커 — 푸시 알림 + 갤러리 공유 받기 (오프라인 캐시 없음)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// 갤러리에서 '공유 → 러브아카이브' 하면 manifest 의 share_target 대로 /share 에 사진이 POST 된다.
// 안드로이드 크롬은 응답을 기다리는 동안 본문을 읽으면 'Failed to fetch' 가 나는 경우가 있어서
// (구글 Squoosh 와 같은 방식) 먼저 사진첩으로 보내 놓고, 사진은 그 뒤에 읽는다.
// 읽은 사진은 메모리(sharePending)에 두고 사진첩이 메시지(take-shared)로 받아 간다.
// 그 사이 서비스워커가 다시 뜨면 메모리가 날아가니 캐시에도 한 벌 넣어 둔다.
const SHARE_CACHE = "shared-photos";
let sharePending = null; // Promise<{ files: File[] } | { error: string }>

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/share") return;
  sharePending = readShare(e.request);
  e.waitUntil(sharePending);
  e.respondWith(Response.redirect(new URL("/album?shared=wait", self.location.origin).href, 303));
});

// 어느 단계에서 왜 실패했는지 사진첩 안내에 그대로 보여 준다
const why = (step, err) => `${step}: ${(err && err.name) || ""} ${(err && err.message) || String(err)}`.slice(0, 160);

async function readShare(request) {
  const copy = request.clone();
  let files;
  try {
    const form = await request.formData();
    // 갤러리에 따라 type 이 비어 오기도 해서 형식은 보지 않는다 (manifest accept 가 이미 사진만 고름)
    files = [...form.values()].filter((f) => typeof f === "object" && f.size > 0);
  } catch (err) {
    console.error("[sw] share formData failed", err);
    // 두 번째 시도: 본문을 바이트로 받아 직접 나눈다
    try {
      files = parseMultipart(new Uint8Array(await copy.arrayBuffer()), request.headers.get("content-type") || "");
    } catch (err2) {
      console.error("[sw] share raw read failed", err2);
      return { error: `${why("form", err)} / ${why("raw", err2)}` };
    }
  }
  try {
    await caches.delete(SHARE_CACHE);
    const cache = await caches.open(SHARE_CACHE);
    for (let i = 0; i < files.length; i++) {
      await cache.put(`/shared/${i}`, new Response(files[i], { headers: { "content-type": files[i].type || "image/jpeg" } }));
    }
  } catch (err) {
    console.error("[sw] share cache failed", err); // 메모리에 있으니 계속
  }
  return { files };
}

/** multipart/form-data 본문에서 파일 부분만 꺼낸다 */
function parseMultipart(bytes, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) throw new Error("boundary 없음");
  const enc = new TextEncoder();
  const delim = enc.encode(`--${m[1] || m[2]}`);
  const find = (from, pat) => {
    outer: for (let i = from; i <= bytes.length - pat.length; i++) {
      for (let j = 0; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer;
      return i;
    }
    return -1;
  };
  const crlf2 = enc.encode("\r\n\r\n");
  const files = [];
  let at = find(0, delim);
  while (at >= 0) {
    const start = at + delim.length + 2; // 경계 뒤 \r\n
    const next = find(start, delim);
    if (next < 0) break;
    const headEnd = find(start, crlf2);
    if (headEnd > 0 && headEnd < next) {
      const head = new TextDecoder().decode(bytes.subarray(start, headEnd));
      const body = bytes.slice(headEnd + 4, next - 2); // 다음 경계 앞 \r\n 제외
      if (/filename=/i.test(head) && body.length > 0) {
        const type = (/content-type:\s*([^\r\n]+)/i.exec(head) || [])[1] || "";
        files.push(new File([body], `shared-${files.length}`, { type: type.trim() }));
      }
    }
    at = next;
  }
  return files;
}

self.addEventListener("message", (e) => {
  if (e.data !== "take-shared" || !e.ports[0]) return;
  const port = e.ports[0];
  const pending = sharePending;
  sharePending = null;
  e.waitUntil((async () => port.postMessage(pending ? await pending : null))());
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
