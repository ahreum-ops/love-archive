"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 키가 없으면 체험 모드 (이 기기 localStorage 에만 저장) */
export const REMOTE = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

/** 브라우저에서만 만든다 (서버 렌더링 중엔 부르지 않기) */
export function supabase(): SupabaseClient {
  if (!client) client = createClient(URL!, KEY!);
  return client;
}
