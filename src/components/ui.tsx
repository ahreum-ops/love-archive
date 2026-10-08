"use client";

import { useEffect, type ReactNode } from "react";

export function Card({ className = "", children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[28px] bg-white/85 p-5 shadow-soft ring-1 ring-line backdrop-blur ${onClick ? "press cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-1 pb-4 pt-2">
      <div>
        <h1 className="font-cute text-[26px] leading-tight text-ink">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-soft">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

type BtnProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "soft" | "ghost";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
};

export function Button({ children, onClick, variant = "primary", className = "", disabled, type = "button" }: BtnProps) {
  const styles = {
    primary: "bg-gradient-to-br from-pink to-rose text-white shadow-soft",
    soft: "bg-blush text-rose",
    ghost: "bg-transparent text-ink-soft",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`press rounded-full px-5 py-3 font-cute text-[15px] disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block pl-1 text-sm text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl border-0 bg-cream px-4 py-3 text-[16px] text-ink ring-1 ring-line outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-pink";

/** 아래에서 올라오는 시트 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[88dvh] w-full max-w-md animate-[pop_0.3s_ease-out] overflow-y-auto rounded-t-[32px] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3 shadow-pop">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        {title && <h2 className="mb-4 font-cute text-xl text-ink">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** 저장 실패 등 사용자에게 꼭 보여야 하는 메시지 */
export function Banner({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[60] mx-auto w-[calc(100%-32px)] max-w-md animate-pop">
      <div className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-rose shadow-pop ring-1 ring-pink">
        <span className="flex-1">{message}</span>
        <button onClick={onClose} className="text-ink-soft" aria-label="닫기">
          ✕
        </button>
      </div>
    </div>
  );
}

export function Empty({ emoji, title, desc, action }: { emoji: string; title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 animate-float text-5xl">{emoji}</div>
      <p className="font-cute text-lg text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{desc}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
