"use client";

// 길쭉 냥이 둘이 모드 방 (서버 모드). 냥이 배구(volley-room.ts)와 같은 방식으로 Supabase Realtime 채널 하나를 둘이 쓴다.
// - presence: 누가 들어와 있는지, 준비했는지
// - broadcast: a(호스트) → b 는 세계 스냅숏(10Hz), b → a 는 b 냥이의 방향(바뀔 때만, 최대 10Hz). DB 에는 저장하지 않는다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { SnakeSnapshot } from "./snake";
import { supabase } from "./supabase";
import type { Who } from "./types";

export const SNAKE_HZ = 10;

/** b → a: 방향(라디안*100) */
export type InputMsg = { a: number };

export type SnakeRoomEvents = {
  onPresence: (partner: { here: boolean; ready: boolean }) => void;
  onStart: () => void;
  onState: (s: SnakeSnapshot) => void;
  onInput: (m: InputMsg) => void;
  onLeave: () => void;
  onError: (message: string) => void;
};

export class SnakeRoom {
  private channel: RealtimeChannel;
  private subscribed = false;
  private ready = false;
  private partner: Who;

  constructor(coupleId: string, private who: Who, private ev: SnakeRoomEvents) {
    this.partner = who === "a" ? "b" : "a";
    this.channel = supabase()
      .channel(`snake-${coupleId}`, { config: { presence: { key: who }, broadcast: { self: false } } })
      .on("presence", { event: "sync" }, () => this.emitPresence())
      .on("broadcast", { event: "start" }, () => ev.onStart())
      .on("broadcast", { event: "state" }, ({ payload }) => ev.onState(payload as SnakeSnapshot))
      .on("broadcast", { event: "input" }, ({ payload }) => ev.onInput(payload as InputMsg))
      .on("broadcast", { event: "leave" }, () => ev.onLeave())
      .subscribe((status) => {
        this.subscribed = status === "SUBSCRIBED";
        if (this.subscribed) void this.track();
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") ev.onError("놀이방에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
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
      console.error("[snake] presence failed", e);
    }
  }

  setReady(ready: boolean) {
    this.ready = ready;
    void this.track();
  }

  private send(event: string, payload: object = {}) {
    if (!this.subscribed) return;
    void this.channel.send({ type: "broadcast", event, payload }).catch((e) => console.error("[snake] send failed", e));
  }

  start() {
    this.send("start");
  }
  sendState(s: SnakeSnapshot) {
    this.send("state", s);
  }
  sendInput(m: InputMsg) {
    this.send("input", m);
  }
  leave() {
    this.send("leave");
  }

  close() {
    void supabase().removeChannel(this.channel);
  }
}
