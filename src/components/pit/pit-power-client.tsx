"use client";

import { useEffect, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import { pitControl, usePitState } from "@/components/pit/use-pit-state";

const RULES = [
  { t: "过流保护", d: "未收到分控能力配置", s: "未配置" },
  { t: "温度监控", d: "未收到分控能力配置", s: "未配置" },
  { t: "自动策略", d: "未接入赛事和策略配置", s: "未配置" },
  { t: "离场模式", d: "未接入批量控制策略", s: "未配置" },
];

type PowerSample = { at: number; watts: number | null; partial: boolean };
const POWER_HISTORY_MS = 2 * 60 * 1000;

export function PitPowerClient() {
  const { state } = usePitState();
  const [controlError, setControlError] = useState<string | null>(null);
  const [powerHistory, setPowerHistory] = useState<PowerSample[]>([]);
  const channels = state?.channels ?? [];
  const batteries = state?.batteries ?? [];

  const measuredChannels = channels.filter((channel) => channel.online && channel.watts !== null);
  const missingMeasurements = channels.some((channel) => channel.online && channel.on && channel.watts === null);
  const total = measuredChannels.reduce((sum, channel) => sum + (channel.on ? channel.watts ?? 0 : 0), 0);
  const powerUpdatedAt = Math.max(0, ...channels.map((channel) => channel.updatedAt));

  useEffect(() => {
    if (!powerUpdatedAt) return;
    const timer = window.setTimeout(() => {
      setPowerHistory((history) => {
        if (history.at(-1)?.at === powerUpdatedAt) return history;
        const sample = {
          at: powerUpdatedAt,
          watts: measuredChannels.length ? total : null,
          partial: missingMeasurements,
        };
        return [...history, sample].filter((item) => item.at >= powerUpdatedAt - POWER_HISTORY_MS).slice(-120);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [missingMeasurements, measuredChannels.length, powerUpdatedAt, total]);

  async function togglePower(id: string, on: boolean) {
    setControlError(null);
    try {
      await pitControl("power", id, on);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "控制指令发送失败");
    }
  }

  return (
    <PitShell title="POWER CONTROL" active={6}>
      {/* 供电通道 */}
      <Panel x={224} y={96} w={1080} h={640} title="供电通道" en="CHANNELS · REMOTE SWITCH">
        {channels.map((c, i) => (
          <div key={c.id} className={`pit-ch-row ${c.on ? "" : "off"}`} style={{ top: 63 + i * 70 }}>
            <span className="pit-ch-id" style={{ color: c.on ? "var(--pit-accent)" : "var(--pit-text-2)" }}>{c.id}</span>
            <span className="pit-ch-name" style={{ color: c.on ? "var(--pit-text)" : "var(--pit-text-2)" }}>{c.name}</span>
            <span className="pit-ch-spec">{`${measurement(c.volts, "V")} · ${measurement(c.amps, "A", 2)} · ${measurement(c.watts, "W")}`}</span>
            <span className="pit-ch-zone">{c.zone}</span>
            <span className="pit-ch-status" style={{ color: !c.online ? "var(--pit-err)" : c.on ? "var(--pit-ok)" : "var(--pit-text-2)" }}>
              {!c.online ? "OFFLINE" : c.on ? "ON" : "OFF"}
            </span>
            <button
              type="button"
              className={`pit-toggle lg ${c.on ? "on" : ""}`}
              aria-label={`${c.name} 电源开关`}
              disabled={!c.online}
              onClick={() => void togglePower(c.id, !c.on)}
            >
              <i />
            </button>
            {c.provider === "home-assistant" ? (
              <span style={{ position: "absolute", right: 18, top: 47, color: "var(--pit-blue)", fontSize: 9, letterSpacing: 1 }}>
                HA {c.transport?.toUpperCase() ?? "OFFLINE"} · {c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "无实时数据"}
              </span>
            ) : null}
          </div>
        ))}
        {channels.length === 0 ? (
          <div style={{ position: "absolute", left: 24, top: 200, color: "var(--pit-text-2)", fontSize: 13 }}>
            等待 Home Assistant 插座数据…（设置页一键发现并导入）
          </div>
        ) : null}
        {controlError ? (
          <div role="alert" style={{ position: "absolute", right: 24, top: 22, color: "var(--pit-err)", fontSize: 12 }}>
            {controlError}
          </div>
        ) : null}
      </Panel>

      {/* 总负载 */}
      <Panel x={1320} y={96} w={560} h={300} title="总负载" en="TOTAL LOAD">
        <span style={{ position: "absolute", left: 29, top: 63, color: "var(--pit-accent)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 64, lineHeight: 1 }}>
          {measuredChannels.length ? `${missingMeasurements ? "≥" : ""}${formatWatts(total)}W` : "—"}
        </span>
        <span style={{ position: "absolute", left: 31, top: 149, color: "var(--pit-text-2)", fontSize: 13 }}>
          {missingMeasurements ? "部分开启通道暂无实时功率，当前为已测量合计" : channels.length ? "所有可用通道的实时功率合计" : "电源数据未配置"}
        </span>
        <PowerLineChart samples={powerHistory} partial={missingMeasurements} />
      </Panel>

      {/* 机器人电池 */}
      <Panel x={1320} y={412} w={560} h={324} title="机器人电池" en="BATTERY CHARGING">
        {batteries.map((b, i) => (
          <div key={b.id} className="pit-bat-row" style={{ top: 63 + i * 62 }}>
            <span className="pit-bat-name">{b.id}</span>
            <span className="pit-bat-track">
              <i style={{ width: `${b.pct}%`, background: b.pct >= 80 ? "var(--pit-ok)" : b.pct >= 50 ? "var(--pit-accent)" : "var(--pit-warn)" }} />
            </span>
            <span className="pit-bat-pct" style={{ color: b.pct >= 80 ? "var(--pit-ok)" : b.pct >= 50 ? "var(--pit-accent)" : "var(--pit-warn)" }}>
              {b.pct}%
            </span>
            {b.charging ? <span className="pit-bat-chg">⚡充电中</span> : null}
          </div>
        ))}
        {batteries.length === 0 ? (
          <div style={{ position: "absolute", left: 24, top: 140, color: "var(--pit-text-2)", fontSize: 13 }}>
            等待电池检测数据…（pit/esp32-b/battery/*）
          </div>
        ) : null}
      </Panel>

      {/* 电源安全与自动化 */}
      <Panel x={224} y={752} w={1656} h={284} title="电源安全与自动化" en="SAFETY & AUTOMATION">
        {RULES.map((r, i) => (
          <div key={r.t} className="pit-rule-row" style={{ top: 63 + i * 52 }}>
            <span className="t">{r.t}</span>
            <span className="d">{r.d}</span>
            <span className="s" style={{ color: "var(--pit-warn)" }}>{r.s}</span>
          </div>
        ))}
      </Panel>
    </PitShell>
  );
}

function measurement(value: number | null, unit: string, digits = 0) {
  return value === null ? `—${unit}` : `${value.toFixed(digits)}${unit}`;
}

function formatWatts(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function PowerLineChart({ samples, partial }: { samples: PowerSample[]; partial: boolean }) {
  const width = 496;
  const height = 82;
  const left = 38;
  const right = 6;
  const top = 7;
  const bottom = 17;
  const usable = samples.filter((sample) => sample.watts !== null);
  const newestAt = samples.at(-1)?.at ?? POWER_HISTORY_MS;
  const oldestAt = newestAt - POWER_HISTORY_MS;
  const maxWatts = nicePowerMaximum(Math.max(0, ...usable.map((sample) => sample.watts ?? 0)));
  const x = (at: number) => left + ((at - oldestAt) / Math.max(1, newestAt - oldestAt)) * (width - left - right);
  const y = (watts: number) => top + (1 - watts / maxWatts) * (height - top - bottom);
  const paths: string[] = [];
  let current = "";
  for (const sample of samples) {
    if (sample.watts === null) {
      if (current) paths.push(current);
      current = "";
      continue;
    }
    current += `${current ? " L" : "M"}${x(sample.at).toFixed(1)} ${y(sample.watts).toFixed(1)}`;
  }
  if (current) paths.push(current);
  const latest = [...samples].reverse().find((sample) => sample.watts !== null);

  return (
    <div className="pit-power-chart">
      <div className="pit-power-chart-head">
        <span>LIVE · 2 MIN</span>
        <span className={partial ? "partial" : ""}>{partial ? "PARTIAL" : `${formatWatts(maxWatts)}W SCALE`}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="最近两分钟总功率折线图">
        <title>最近两分钟总功率</title>
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line className="pit-power-chart-grid" x1={left} x2={width - right} y1={top + ratio * (height - top - bottom)} y2={top + ratio * (height - top - bottom)} />
            <text className="pit-power-chart-axis" x={left - 5} y={top + ratio * (height - top - bottom) + 3} textAnchor="end">
              {formatWatts(maxWatts * (1 - ratio))}
            </text>
          </g>
        ))}
        {paths.map((path, index) => <path key={index} className="pit-power-chart-line" d={path} />)}
        {latest ? <circle className="pit-power-chart-dot" cx={x(latest.at)} cy={y(latest.watts ?? 0)} r="3" /> : null}
        <text className="pit-power-chart-axis" x={left} y={height - 2}>-2 MIN</text>
        <text className="pit-power-chart-axis" x={width - right} y={height - 2} textAnchor="end">NOW</text>
      </svg>
      {usable.length < 2 ? <span className="pit-power-chart-empty">正在收集实时功率样本…</span> : null}
    </div>
  );
}

function nicePowerMaximum(value: number) {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.max(10, Math.ceil(value / magnitude) * magnitude);
}
