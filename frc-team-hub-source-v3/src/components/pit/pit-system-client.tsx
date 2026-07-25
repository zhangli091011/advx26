"use client";

import { useEffect, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import type { SystemMetrics } from "@/lib/system-metrics";

type Sample = { at: number; cpu: number | null; temperature: number | null };

const HISTORY_LIMIT = 90;

export function PitSystemClient() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    let busy = false;

    async function refresh() {
      if (busy || document.hidden) return;
      busy = true;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/pit/system", { cache: "no-store", signal: controller.signal });
        const result = await response.json() as { ok?: boolean; data?: SystemMetrics; error?: string };
        if (!response.ok || !result.ok || !result.data) throw new Error(result.error ?? "系统性能数据加载失败");
        const data = result.data;
        setMetrics(data);
        setHistory((current) => [...current, {
          at: data.sampledAt,
          cpu: data.cpu.usagePct,
          temperature: data.thermal.temperatureC,
        }].slice(-HISTORY_LIMIT));
        setError(null);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "系统性能数据加载失败");
        }
      } finally {
        busy = false;
      }
    }

    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 2000);
    const onVisibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      controller?.abort();
    };
  }, []);

  const temperature = metrics?.thermal.temperatureC ?? null;
  const thermalColor = temperature === null ? "var(--pit-text-2)" : temperature >= 80 ? "var(--pit-err)" : temperature >= 70 ? "var(--pit-warn)" : "var(--pit-ok)";
  const throttlingActive = (metrics?.thermal.activeFlags.length ?? 0) > 0;
  const summary = [
    { label: "CPU 使用率", value: formatPct(metrics?.cpu.usagePct), color: usageColor(metrics?.cpu.usagePct) },
    { label: "内存使用率", value: formatPct(metrics?.memory.usagePct), color: usageColor(metrics?.memory.usagePct) },
    { label: "核心温度", value: temperature === null ? "—" : `${temperature.toFixed(1)}°C`, color: thermalColor },
    { label: "根分区使用率", value: formatPct(metrics?.storage?.usagePct), color: usageColor(metrics?.storage?.usagePct) },
  ];

  return (
    <PitShell title="RASPBERRY PI SYSTEM MONITOR" active={8}>
      {summary.map((item, index) => (
        <div key={item.label} className="pit-stat-card" style={{ left: 224 + index * 420 }}>
          <span className="lb">{item.label}</span>
          <span className="vl" style={{ color: item.color }}>{item.value}</span>
        </div>
      ))}

      <Panel x={224} y={222} w={1080} h={500} title="实时负载" en="CPU · THERMAL · 3 MIN HISTORY">
        <SystemChart samples={history} />
        <div className="pit-system-gauges">
          <Gauge label="CPU" value={metrics?.cpu.usagePct ?? null} color={usageColor(metrics?.cpu.usagePct)} />
          <Gauge label="MEM" value={metrics?.memory.usagePct ?? null} color={usageColor(metrics?.memory.usagePct)} />
          <Gauge label="DISK" value={metrics?.storage?.usagePct ?? null} color={usageColor(metrics?.storage?.usagePct)} />
        </div>
        <div className="pit-system-loads">
          <Metric label="LOAD 1M" value={formatNumber(metrics?.cpu.load[0])} />
          <Metric label="LOAD 5M" value={formatNumber(metrics?.cpu.load[1])} />
          <Metric label="LOAD 15M" value={formatNumber(metrics?.cpu.load[2])} />
          <Metric label="CLOCK" value={metrics?.cpu.frequencyMhz == null ? "—" : `${metrics.cpu.frequencyMhz.toFixed(0)} MHz`} />
        </div>
      </Panel>

      <Panel x={1320} y={222} w={560} h={500} title="主机状态" en="HOST HEALTH">
        <div className={`pit-system-health ${throttlingActive ? "error" : "ok"}`}>
          <i />
          <strong>{throttlingActive ? "需要检查" : "运行正常"}</strong>
          <span>{throttlingActive ? metrics?.thermal.activeFlags.join(" · ") : "NO ACTIVE THROTTLING"}</span>
        </div>
        <InfoRow label="主机名" value={metrics?.identity.hostname ?? "—"} />
        <InfoRow label="硬件" value={metrics?.identity.model ?? "非 Raspberry Pi / 未识别"} />
        <InfoRow label="平台" value={metrics ? `${metrics.identity.platform} · ${metrics.identity.arch}` : "—"} />
        <InfoRow label="CPU" value={metrics ? `${metrics.cpu.cores} cores` : "—"} />
        <InfoRow label="运行时间" value={formatDuration(metrics?.uptimeSec)} />
        <InfoRow label="降频状态" value={metrics?.thermal.throttledRaw ?? "不可用"} tone={throttlingActive ? "error" : "ok"} />
        <InfoRow label="历史告警" value={metrics?.thermal.historicalFlags.join(" · ") || "无"} tone={(metrics?.thermal.historicalFlags.length ?? 0) ? "warn" : undefined} />
      </Panel>

      <Panel x={224} y={738} w={1656} h={298} title="资源明细" en="SYSTEM RESOURCE INVENTORY">
        <div className="pit-system-details">
          <DetailBlock label="SYSTEM MEMORY" primary={`${formatBytes(metrics?.memory.usedBytes)} / ${formatBytes(metrics?.memory.totalBytes)}`} secondary={`${formatBytes(metrics?.memory.availableBytes)} available`} />
          <DetailBlock label="ROOT STORAGE" primary={metrics?.storage ? `${formatBytes(metrics.storage.usedBytes)} / ${formatBytes(metrics.storage.totalBytes)}` : "—"} secondary={metrics?.storage ? `${formatBytes(metrics.storage.availableBytes)} available` : "filesystem stats unavailable"} />
          <DetailBlock label="PIT-OS PROCESS" primary={`${formatBytes(metrics?.process.rssBytes)} RSS`} secondary={`${formatBytes(metrics?.process.heapUsedBytes)} JavaScript heap`} />
          <DetailBlock label="SAMPLE STATUS" primary={error ? "DEGRADED" : metrics ? "LIVE · 2 SEC" : "CONNECTING"} secondary={error ?? (metrics ? `updated ${new Date(metrics.sampledAt).toLocaleTimeString("zh-CN", { hour12: false })}` : "waiting for first sample")} tone={error ? "error" : "ok"} />
        </div>
      </Panel>
    </PitShell>
  );
}

function SystemChart({ samples }: { samples: Sample[] }) {
  const points = (key: "cpu" | "temperature") => samples.flatMap((sample, index) => {
    const value = sample[key];
    if (value === null) return [];
    const x = samples.length <= 1 ? 0 : index / (samples.length - 1) * 930;
    return `${x.toFixed(1)},${(220 - Math.min(100, Math.max(0, value)) * 2.2).toFixed(1)}`;
  }).join(" ");

  return (
    <div className="pit-system-chart">
      <div className="pit-system-chart-head"><span>100%</span><strong>CPU</strong><strong className="temp">TEMP °C</strong><span>0%</span></div>
      <svg viewBox="0 0 930 220" preserveAspectRatio="none" role="img" aria-label="CPU 和温度历史曲线">
        {[0, 55, 110, 165, 220].map((y) => <line key={y} x1="0" x2="930" y1={y} y2={y} className="pit-system-chart-grid" />)}
        <polyline points={points("temperature")} className="pit-system-chart-temp" />
        <polyline points={points("cpu")} className="pit-system-chart-cpu" />
      </svg>
      {samples.length < 2 ? <div className="pit-system-chart-empty">正在建立性能历史…</div> : null}
    </div>
  );
}

function Gauge({ label, value, color }: { label: string; value: number | null; color: string }) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <div className="pit-system-gauge"><span>{label}</span><div><i style={{ width: `${width}%`, background: color }} /></div><strong style={{ color }}>{formatPct(value)}</strong></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "error" }) {
  return <div className="pit-system-info"><span>{label}</span><strong className={tone}>{value}</strong></div>;
}

function DetailBlock({ label, primary, secondary, tone }: { label: string; primary: string; secondary: string; tone?: "ok" | "error" }) {
  return <article><span>{label}</span><strong className={tone}>{primary}</strong><small>{secondary}</small></article>;
}

function formatPct(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function formatNumber(value: number | undefined) {
  return value == null ? "—" : value.toFixed(2);
}

function formatBytes(value: number | undefined) {
  if (value == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(unit >= 3 ? 1 : 0)} ${units[unit]}`;
}

function formatDuration(value: number | undefined) {
  if (value == null) return "—";
  const days = Math.floor(value / 86400);
  const hours = Math.floor(value % 86400 / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function usageColor(value: number | null | undefined) {
  if (value == null) return "var(--pit-text-2)";
  if (value >= 90) return "var(--pit-err)";
  if (value >= 75) return "var(--pit-warn)";
  return "var(--pit-ok)";
}
