"use client";

import { useEffect, useRef, useState } from "react";
import type { PitState } from "@/types/pit";

export type { PitState, PitTool, ToolState } from "@/types/pit";

/**
 * 统一数据源：优先 SSE 实时推送，失败时 3s 轮询回退。
 * 所有 PIT 页面读取同一份服务端状态（来自 MQTT 和 Home Assistant 实时订阅）。
 */
export function usePitState(): { state: PitState | null; live: boolean } {
  const [state, setState] = useState<PitState | null>(null);
  const [live, setLive] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let poll: number | undefined;
    let retry: number | undefined;
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
        retry = window.setTimeout(() => {
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
      window.clearTimeout(retry);
    };
  }, []);

  return { state, live };
}

/** 下发控制指令 */
export async function pitControl(action: string, target: string, on?: boolean) {
  const response = await fetch("/api/pit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, target, on }),
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error ?? "控制指令发送失败");
}
