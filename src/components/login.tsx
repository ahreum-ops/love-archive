"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/store";
import { Banner, Button, Field, inputClass } from "./ui";

/** 서버 모드에서 로그인 안 했을 때: 이메일 + 비밀번호 */
export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const ready = email.includes("@") && password.length >= 6 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const r = mode === "in" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else if ("needsConfirm" in r && r.needsConfirm) setSent(true);
  }

  return (
    <form onSubmit={submit} className="relative flex min-h-dvh flex-col px-6 pb-10 pt-[calc(env(safe-area-inset-top)+56px)]">
      <Banner message={error} onClose={() => setError(null)} />
      <div className="mb-10 text-center">
        <div className="mb-4 inline-block animate-float text-6xl">💞</div>
        <h1 className="font-cute text-3xl text-ink">러브아카이브</h1>
        <p className="mt-2 text-ink-soft">{mode === "in" ? "다시 만나서 반가워요" : "우리 둘만의 추억 보관함을 만들어요"}</p>
      </div>

      {sent ? (
        <div className="rounded-[32px] bg-white/85 p-6 text-center shadow-soft ring-1 ring-line">
          <p className="text-4xl">💌</p>
          <p className="mt-3 font-cute text-lg text-ink">메일함을 확인해 주세요</p>
          <p className="mt-1 text-sm text-ink-soft">{email} 로 보낸 인증 링크를 누르면 바로 시작돼요.</p>
          <Button variant="soft" onClick={() => { setSent(false); setMode("in"); }} className="mt-5">
            인증했어요, 로그인하기
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-4 rounded-[32px] bg-white/85 p-6 shadow-soft ring-1 ring-line backdrop-blur">
            <Field label="이메일">
              <input type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="love@example.com" />
            </Field>
            <Field label="비밀번호 (6자 이상)">
              <input
                type="password"
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-auto pt-8">
            <Button type="submit" disabled={!ready} className="w-full py-4 text-lg">
              {busy ? "잠깐만요…" : mode === "in" ? "로그인 💗" : "가입하기 💗"}
            </Button>
            <button
              type="button"
              onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }}
              className="mt-3 w-full py-2 text-center text-sm text-ink-soft"
            >
              {mode === "in" ? "처음이에요 → 가입하기" : "이미 계정이 있어요 → 로그인"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
