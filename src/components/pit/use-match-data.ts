"use client";

import { useCallback, useEffect, useState } from "react";
import type { PitMatchData } from "@/lib/match-data";

export function useMatchData() {
  const [data, setData] = useState<PitMatchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/pit/matches", { cache: "no-store" });
      const result = await response.json() as { ok?: boolean; data?: PitMatchData; error?: string };
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error ?? "赛事数据加载失败");
      setData(result.data);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "赛事数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { data, error, loading, refresh };
}
