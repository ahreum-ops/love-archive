"use client";

// 냥이 배구 실시간 대결방 (서버 모드). Supabase Realtime 채널 하나를 둘이 같이 쓴다.
// - presence: 누가 들어와 있는지, 준비했는지
// - broadcast: a(호스트) → b 는 경기 상태 스냅숏, b → a 는 b 냥이 위치. DB 에는 아무것도 저장하지 않는다.
// 무료 요금제 메시지 한도를 넉넉히 지키려고 서로 1초에 15번씩만 보낸다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Who } from "./types";
import type { Snapshot } from "./volley";

export const SEND_HZ = 15;

export type CatMsg = { x: number; y: number; vx: number; vy: number; k: 0 | 1 };

export type RoomEvents = {
  onPresence: (partner: { here: boolean; ready: boolean }) => void;
  onStart: () => void;
  onState: (s: Snapshot) => void;
  onCat: (c: CatMsg) => void;
  onLeave: () => void;
  onError: (message: string) => void;
};

export class VolleyRoom {
  private channel: RealtimeChannel;
  private subscribed = false;
  private ready = false;
  private partner: Who;

  constructor(coupleId: string, private who: Who, private ev: RoomEvents) {
    this.partner = who === "a" ? "b" : "a";
    this.channel = supabase()
      .channel(`volley-${coupleId}`, { config: { presence: { key: who }, broadcast: { self: false } } })
      .on("presence", { event: "sync" }, () => this.emitPresence())
      .on("broadcast", { event: "start" }, () => ev.onStart())
      .on("broadcast", { event: "state" }, ({ payload }) => ev.onState(payload as Snapshot))
      .on("broadcast", { event: "cat" }, ({ payload }) => ev.onCat(payload as CatMsg))
      .on("broadcast", { event: "leave" }, () => ev.onLeave())
      .subscribe((status) => {
        this.subscribed = status === "SUBSCRIBED";
        if (this.subscribed) void this.track();
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") ev.onError("대결방에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
      });
  }

  private emitPresence() {
    const list = this.channel.presenceState<{ ready?: boolean }>()[this.partner] ?? [];
    this.ev.onPresence({ here: list.length > 0, ready: list.some((p) => p.ready) });
  }

  private async track() {
    if (!this.subscribed) return;
    try {
      await this.channel.track({ ready: this.ready });
    } catch (e) {
      console.error("[volley] presence failed", e);
    }
  }

  setReady(ready: boolean) {
    this.ready = ready;
    void this.track();
  }

  private send(event: string, payload: object = {}) {
    if (!this.subscribed) return;
    void this.channel.send({ type: "broadcast", event, payload }).catch((e) => console.error("[volley] send failed", e));
  }

  start() {
    this.send("start");
  }
  sendState(s: Snapshot) {
    this.send("state", s);
  }
  sendCat(c: CatMsg) {
    this.send("cat", c);
  }
  leave() {
    this.send("leave");
  }

  close() {
    void supabase().removeChannel(this.channel);
  }
}
