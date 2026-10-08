// 연인 기기로 푸시 알림 보내기.
// 앱이 저장에 성공하면 로그인 토큰과 함께 { title, body, url, tag } 를 보낸다.
// 그 토큰으로 Supabase 를 불러서 RLS 가 허락하는 것(같은 커플의 구독)만 읽으니 서비스 키가 필요 없다.

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type Payload = { title: string; body: string; url: string; tag?: string };

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!url || !anon || !vapidPublic || !vapidPrivate) return Response.json({ error: "push_not_configured" }, { status: 501 });

  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return Response.json({ error: "not_signed_in" }, { status: 401 });

  const payload = clean(await req.json().catch(() => null));
  if (!payload) return Response.json({ error: "bad_payload" }, { status: 400 });

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user, error: userError } = await sb.auth.getUser(token);
  if (userError || !user.user) return Response.json({ error: "not_signed_in" }, { status: 401 });

  // 내 커플의 구독 중 내 것이 아닌 것 = 연인 기기들
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .neq("user_id", user.user.id);
  if (error) {
    console.error("[push] read subscriptions failed", error);
    return Response.json({ error: "read_failed" }, { status: 500 });
  }

  webpush.setVapidDetails(new URL(req.url).origin, vapidPublic, vapidPrivate);
  const body = JSON.stringify(payload);
  const results = await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 24,
          urgency: "high",
        });
        return true;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 알림을 끄거나 앱 데이터를 지운 기기 → 구독 정리
        if (status === 404 || status === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        else console.error("[push] send failed", status, e);
        return false;
      }
    }),
  );
  return Response.json({ sent: results.filter(Boolean).length });
}

function clean(x: unknown): Payload | null {
  if (!x || typeof x !== "object") return null;
  const { title, body, url, tag } = x as Record<string, unknown>;
  if (typeof title !== "string" || typeof body !== "string" || typeof url !== "string") return null;
  // 앱 안 경로로만 이동하게
  if (!url.startsWith("/") || url.startsWith("//")) return null;
  return {
    title: title.slice(0, 80),
    body: body.slice(0, 200),
    url,
    tag: typeof tag === "string" ? tag.slice(0, 40) : undefined,
  };
}
