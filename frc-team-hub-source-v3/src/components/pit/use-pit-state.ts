"use client";

import { useEffect, useRef, useState } from "react";

/* 与后端 pit-hub.ts 对应的类型 */
export type ToolState = "in" | "out" | "lost";
export interface PitTool { slot: string; name: string; unit: string; state: ToolState; who?: string; time?: string }
export interface RackUnit { u: string; name: string; note: string; status: string; level: "ok" | "low" | "active"; pct: number }
export interface Compartment { id: string; label: string; qty: number; state: "ok" | "low" | "empty" | "active" }
export interface PowerChannel { id: string; name: string; zone: string; volts: number; amps: number; watts: number; on: boolean }
export interface Battery { id: string; pct: number; charging: boolean; volts: number }
export interface CanDevice { id: string; name: string; model: string; mech: string; on: boolean; latencyMs: number | null; tempC: number | null; lastHeartbeat: number }
export interface PitState {
  updatedAt: number;
  tools: PitTool[];
  units: RackUnit[];
  compartments: Compartment[];
  channels: PowerChannel[];
  batteries: Battery[];
  canDevices: CanDevice[];
  env: { tempC: number; humidity: number };
  scanLog: Array<{ t: string; msg: string; kind: "ok" | "warn" | "err" }>;
}

/**
 * 统一数据源：优先 SSE 实时推送，失败时 3s 轮询回退。
 * 所有 PIT 页面共享同一份真实状态（来自树莓派 MQTT 聚合）。
 */
export function usePitState(): { state: PitState | null; live: boolean } {
  const [state, setState] = useState<PitState | null>(null);
  const [live, setLive] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let poll: number | undefined;
    let stopped = false;

    async function pollOnce() {
      try {
        const res = await fetch("/api/pit", { cache: "no-store" });
        const json = await res.json();
        if (!stopped && json.ok) setState(json.data);
      } catch {
        /* 网络错误时保持旧数据 */
      }
    }

    function startSse() {
      const es = new EventSource("/api/pit/stream");
      esRef.current = es;
      es.onopen = () => setLive(true);
      es.onmessage = (e) => {
        try {
          setState(JSON.parse(e.data));
          setLive(true);
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        setLive(false);
        es.close();
        // SSE 失败 → 轮询回退
        pollOnce();
        poll = window.setInterval(pollOnce, 3000);
        // 30s 后尝试重建 SSE
        window.setTimeout(() => {
          if (!stopped) {
            window.clearInterval(poll);
            startSse();
          }
        }, 30000);
      };
    }

    pollOnce();
    startSse();
    return () => {
      stopped = true;
      esRef.current?.close();
      window.clearInterval(poll);
    };
  }, []);

  return { state, live };
}

/** 下发控制指令 */
export async function pitControl(action: string, target: string, on?: boolean) {
  await fetch("/api/pit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, target, on }),
  });
}
