"use client";

import { useMemo } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import { pitControl, usePitState } from "@/components/pit/use-pit-state";

const RULES = [
  { t: "⚡ 过流保护", d: "任意通道 > 16A 自动断电并告警", s: "启用", col: "var(--pit-ok)" },
  { t: "🌡 温度监控", d: "箱内 > 45°C 启动风扇 / > 60°C 断电", s: "启用", col: "var(--pit-ok)" },
  { t: "⏱ 自动策略", d: "比赛上场前 10 分钟：自动开启机器人调试电源 + 检修位照明", s: "启用", col: "var(--pit-ok)" },
  { t: "🔌 离场模式", d: "一键关闭全部通道（保留充电器 + 安防）", s: "手动触发", col: "var(--pit-warn)" },
];

const LIMIT = 1500;

export function PitPowerClient() {
  const { state } = usePitState();
  const channels = state?.channels ?? [];
  const batteries = state?.batteries ?? [];

  const total = useMemo(() => channels.reduce((s, c) => s + (c.on ? c.watts : 0), 0), [channels]);
  const pct = Math.round((total / LIMIT) * 100);

  return (
    <PitShell title="POWER CONTROL" active={5}>
      {/* 供电通道 */}
      <Panel x={224} y={96} w={1080} h={640} title="供电通道" en="CHANNELS · REMOTE SWITCH">
        {channels.map((c, i) => (
          <div key={c.id} className={`pit-ch-row ${c.on ? "" : "off"}`} style={{ top: 63 + i * 70 }}>
            <span className="pit-ch-id" style={{ color: c.on ? "var(--pit-accent)" : "var(--pit-text-2)" }}>{c.id}</span>
            <span className="pit-ch-name" style={{ color: c.on ? "var(--pit-text)" : "var(--pit-text-2)" }}>{c.name}</span>
            <span className="pit-ch-spec">{`${c.volts}V · ${c.amps.toFixed(1)}A · ${c.watts}W`}</span>
            <span className="pit-ch-zone">{c.zone}</span>
            <span className="pit-ch-status" style={{ color: c.on ? "var(--pit-ok)" : "var(--pit-text-2)" }}>{c.on ? "ON" : "OFF"}</span>
            <button
              type="button"
              className={`pit-toggle lg ${c.on ? "on" : ""}`}
              aria-label={`${c.name} 电源开关`}
              onClick={() => void pitControl("power", c.id, !c.on)}
            >
              <i />
            </button>
          </div>
        ))}
        {channels.length === 0 ? (
          <div style={{ position: "absolute", left: 24, top: 200, color: "var(--pit-text-2)", fontSize: 13 }}>
            等待配电箱数据…（pit/esp32-b/power/*）
          </div>
        ) : null}
      </Panel>

      {/* 总负载 */}
      <Panel x={1320} y={96} w={560} h={300} title="总负载" en="TOTAL LOAD">
        <span style={{ position: "absolute", left: 29, top: 63, color: "var(--pit-accent)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 64, lineHeight: 1 }}>
          {total}W
        </span>
        <span style={{ position: "absolute", left: 31, top: 149, color: "var(--pit-text-2)", fontSize: 13 }}>
          限额 {LIMIT}W · 峰值 1180W (13:20)
        </span>
        <div className="pit-bar" style={{ left: 31, top: 189, width: 496, height: 10 }}>
          <i style={{ width: `${pct}%`, background: "var(--pit-accent)" }} />
        </div>
        <span style={{ position: "absolute", left: 31, top: 211, color: "var(--pit-ok)", fontSize: 13, fontWeight: 500 }}>
          {pct}% · {pct < 80 ? "余量充足" : "接近限额"}
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
            <span className="s" style={{ color: r.col }}>{r.s}</span>
          </div>
        ))}
      </Panel>
    </PitShell>
  );
}
