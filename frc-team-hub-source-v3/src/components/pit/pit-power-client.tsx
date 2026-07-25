"use client";

import { useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import { pitControl, usePitState } from "@/components/pit/use-pit-state";

const RULES = [
  { t: "过流保护", d: "未收到分控能力配置", s: "未配置" },
  { t: "温度监控", d: "未收到分控能力配置", s: "未配置" },
  { t: "自动策略", d: "未接入赛事和策略配置", s: "未配置" },
  { t: "离场模式", d: "未接入批量控制策略", s: "未配置" },
];

export function PitPowerClient() {
  const { state } = usePitState();
  const [controlError, setControlError] = useState<string | null>(null);
  const channels = state?.channels ?? [];
  const batteries = state?.batteries ?? [];

  const measuredChannels = channels.filter((channel) => channel.online && channel.watts !== null);
  const missingMeasurements = channels.some((channel) => channel.online && channel.on && channel.watts === null);
  const total = measuredChannels.reduce((sum, channel) => sum + (channel.on ? channel.watts ?? 0 : 0), 0);

  async function togglePower(id: string, on: boolean) {
    setControlError(null);
    try {
      await pitControl("power", id, on);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "控制指令发送失败");
    }
  }

  return (
    <PitShell title="POWER CONTROL" active={5}>
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
        <div className="pit-bar" style={{ left: 31, top: 189, width: 496, height: 10 }}>
          <i style={{ width: "0%", background: "var(--pit-accent)" }} />
        </div>
        <span style={{ position: "absolute", left: 31, top: 211, color: "var(--pit-ok)", fontSize: 13, fontWeight: 500 }}>
          负载阈值未配置
        </span>
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
