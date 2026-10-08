"use client";

// 체험 모드 저장소: 이 기기 브라우저(localStorage)에만 저장한다.
// Supabase 를 붙이면 이 파일의 load/save 만 서버 쪽으로 바꾸면 된다.

import { useSyncExternalStore } from "react";
import { DEFAULT_BUCKET } from "./content";
import type { AppState, Profile } from "./types";

const KEY = "love-archive:v1";

const EMPTY: AppState = {
  version: 1,
  profile: null,
  anniversaries: [],
  bucket: [],
  balance: {},
  survey: {},
  letters: [],
};

let state: AppState | null = null;
const listeners = new Set<() => void>();

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch (e) {
    console.error("[store] load failed", e);
  }
  return EMPTY;
}

function getSnapshot(): AppState {
  if (!state) state = load();
  return state;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // 다른 탭에서 바꾼 것도 반영 (한 폰에서 두 사람 역할 테스트할 때)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = load();
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** 서버 렌더링 중에는 null (아직 불러오기 전) */
export function useAppState(): AppState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export function update(fn: (s: AppState) => AppState): SaveResult {
  const next = fn(getSnapshot());
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.error("[store] save failed", e);
    return {
      ok: false,
      error: "저장 공간이 부족해서 저장하지 못했어요. 사진 몇 장을 지우고 다시 시도해 주세요.",
    };
  }
  state = next;
  listeners.forEach((l) => l());
  return { ok: true };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createCouple(profile: Profile): SaveResult {
  return update(() => ({
    ...EMPTY,
    profile,
    bucket: DEFAULT_BUCKET.map((b) => ({ ...b, id: uid() })),
  }));
}

export function resetAll(): SaveResult {
  return update(() => EMPTY);
}
