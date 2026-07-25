"use client";

import { useEffect, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import { sendCanSerialCommand, usePitState } from "@/components/pit/use-pit-state";

const DEV_COLS = [
  { label: "ID", x: 24 }, { label: "设备", x: 88 }, { label: "型号", x: 338 }, { label: "机构", x: 568 },
  { label: "状态", x: 748 }, { label: "延迟", x: 868 }, { label: "温度", x: 968 },
];

export function PitCanClient() {
  const { state } = usePitState();
  const [now, setNow] = useState(0);
  const [serialBusy, setSerialBusy] = useState(false);
  const [serialMessage, setSerialMessage] = useState<string | null>(null);
  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);
  const devices = state?.canDevices ?? [];
  const bus = state?.canBus;
  const logs = state?.canLog ?? [];
  const online = devices.filter((d) => d.on).length;
  const offline = devices.find((d) => !d.on);
  const probeOnline = Boolean(bus?.online && now - bus.updatedAt < 3000);
  const busHealthy = probeOnline && bus?.controllerState === "running" && bus.busErrors === 0;

  async function runSerialCommand(command: string) {
    setSerialBusy(true);
    setSerialMessage(null);
    try {
      await sendCanSerialCommand(command);
      setSerialMessage(`${command.toUpperCase()} 已发送`);
    } catch (error) {
      setSerialMessage(error instanceof Error ? error.message : "串口指令发送失败");
    } finally {
      setSerialBusy(false);
    }
  }

  const SUMMARY = [
    { lb: "总线负载", vl: probeOnline && bus ? `${bus.utilizationPct.toFixed(1)}%` : "—", col: !probeOnline ? "var(--pit-text-2)" : bus!.utilizationPct >= 85 ? "var(--pit-err)" : bus!.utilizationPct >= 70 ? "var(--pit-warn)" : "var(--pit-ok)" },
    { lb: "在线设备", vl: devices.length ? `${online}/${devices.length}` : "—", col: online === devices.length && devices.length ? "var(--pit-ok)" : "var(--pit-warn)" },
    { lb: "帧率", vl: probeOnline && bus ? `${Math.round(bus.frameRate)}` : "—", col: probeOnline ? "var(--pit-accent)" : "var(--pit-text-2)" },
    { lb: "接收丢帧", vl: probeOnline && bus ? `${bus.rxDropped}` : "—", col: bus?.rxDropped ? "var(--pit-err)" : probeOnline ? "var(--pit-ok)" : "var(--pit-text-2)" },
  ];

  return (
    <PitShell title="CAN BUS MONITOR" active={3}>
      {SUMMARY.map((s, i) => (
        <div key={s.lb} className="pit-stat-card" style={{ left: 224 + i * 420 }}>
          <span className="lb">{s.lb}</span>
          <span className="vl" style={{ color: s.col }}>{s.vl}</span>
        </div>
      ))}

      {/* 设备清单 */}
      <Panel x={224} y={222} w={1080} h={500} title="设备清单" en="CAN DEVICES · LIVE">
        <div className="pit-th-bg" style={{ top: 59, height: 32 }} />
        {DEV_COLS.map((c) => (
          <span key={c.label} className="pit-th" style={{ left: c.x, top: 68 }}>{c.label}</span>
        ))}
        {devices.map((d, i) => (
          <div key={d.id} className={`pit-dev-row ${d.on ? "" : "off"}`} style={{ top: 97 + i * 60 }}>
            <span className="pit-td tech" style={{ left: 24, top: 16, color: d.on ? "var(--pit-accent)" : "var(--pit-err)", fontSize: 15 }}>{d.id}</span>
            <span className="pit-td tech" style={{ left: 88, top: 16, fontSize: 15 }}>{d.name}</span>
            <span className="pit-td tech dim" style={{ left: 338, top: 17 }}>{d.model}</span>
            <span className="pit-td dim" style={{ left: 568, top: 16 }}>{d.mech}</span>
            <span className="pit-td tech" style={{ left: 748, top: 16, color: d.on ? "var(--pit-ok)" : "var(--pit-err)", fontWeight: 700 }}>
              {d.on ? "● ONLINE" : "○ OFFLINE"}
            </span>
            <span className="pit-td tech dim" style={{ left: 868, top: 17 }}>{d.latencyMs == null ? "—" : `${d.latencyMs}ms`}</span>
            <span className="pit-td tech dim" style={{ left: 968, top: 17, color: d.tempC != null && d.tempC >= 50 ? "var(--pit-warn)" : undefined }}>
              {d.tempC == null ? "—" : `${d.tempC}°C`}
            </span>
          </div>
        ))}
        {devices.length === 0 ? (
          <div style={{ position: "absolute", left: 24, top: 160, color: "var(--pit-text-2)", fontSize: 13 }}>
            等待 ESP32-S3 CAN 探针数据…（pit/can/devices）
          </div>
        ) : null}
        {offline ? (
          <div className="pit-can-alert" style={{ top: 463 }}>
            ⚠ ID {offline.id} {offline.name} 离线 · 建议：检查 CAN 线接头 / 设备供电 / 终端电阻
          </div>
        ) : null}
      </Panel>

      {/* 总线拓扑 */}
      <Panel x={1320} y={222} w={560} h={500} title="总线拓扑" en="TOPOLOGY">
        <div className="pit-topo-bus" />
        <div className="pit-topo-term" style={{ left: 44 }} />
        <div className="pit-topo-term" style={{ left: 511 }} />
        <span className="pit-topo-tl" style={{ left: 31 }}>120Ω</span>
        <span className="pit-topo-tl" style={{ left: 497 }}>120Ω</span>
        {devices.slice(0, 6).map((d, i) => {
          const nx = 80 + i * 80;
          const col = d.on ? "var(--pit-ok)" : "var(--pit-err)";
          return (
            <span key={d.id}>
              <span className="pit-topo-stub" style={{ left: nx, background: col }} />
              <span className="pit-topo-node" style={{ left: nx - 23, borderColor: col, background: d.on ? "rgba(77,217,115,0.15)" : "rgba(242,77,64,0.15)", color: col }}>
                {d.id}
              </span>
              {!d.on ? <span className="pit-topo-x" style={{ left: nx - 5 }}>✕</span> : null}
            </span>
          );
        })}
        <div className="pit-topo-rio-link" />
        <div className="pit-topo-rio">roboRIO</div>
        <span className="pit-topo-chart-lb" style={{ color: busHealthy ? "var(--pit-ok)" : "var(--pit-warn)" }}>
          {probeOnline && bus
            ? `ESP32-S3 · ${bus.controllerState.toUpperCase()} · ${Math.round(bus.bitrate / 1000)} kbps · RSSI ${bus.wifiRssi ?? "—"} dBm`
            : "等待 ESP32-S3 CAN 探针…"}
        </span>
        <div className="pit-can-probe-stats">
          <span>RX TOTAL<strong>{bus?.rxFrames ?? 0}</strong></span>
          <span>BUS ERROR<strong style={{ color: bus?.busErrors ? "var(--pit-err)" : "var(--pit-ok)" }}>{bus?.busErrors ?? 0}</strong></span>
          <span>MODE<strong>LISTEN ONLY</strong></span>
        </div>
      </Panel>

      {/* 串口日志 */}
      <Panel x={224} y={738} w={1656} h={298} title="串口调试与监测" en="ESP32-S3 USB CDC · 115200 8N1">
        <div className="pit-serial-status">
          <span className={probeOnline && bus?.serialConnected ? "online" : ""}>{probeOnline && bus?.serialConnected ? "● USB SERIAL READY" : "○ USB SERIAL OFFLINE"}</span>
          <span>{bus?.serialBaud ?? 115200} BAUD</span>
          <span>CMD {bus?.serialCommands ?? 0}</span>
          <span>LINES {bus?.serialLines ?? 0}</span>
          <small className={serialMessage?.includes("失败") || serialMessage?.includes("离线") ? "error" : ""}>{serialMessage ?? "远程命令结果会镜像到下方日志"}</small>
        </div>
        <div className="pit-serial-actions">
          {[
            ["status", "状态"], ["stats", "统计"], ["devices", "设备"], ["trace-10", "抓取 10 帧"], ["clear", "清零"],
          ].map(([command, label]) => (
            <button key={command} type="button" disabled={!probeOnline || serialBusy} onClick={() => void runSerialCommand(command)}>{label}</button>
          ))}
        </div>
        {logs.slice(0, 6).map((entry, index) => (
          <div key={`${entry.at}-${index}`} className="pit-log-row" style={{ top: 105 + index * 28 }}>
            <time>{new Date(entry.at).toLocaleTimeString("zh-CN", { hour12: false })}</time>
            <span className="lv" style={{ color: entry.level === "error" ? "var(--pit-err)" : entry.level === "warn" ? "var(--pit-warn)" : "var(--pit-ok)" }}>{entry.source === "serial" ? "SER" : entry.level.toUpperCase()}</span>
            <span className="msg">{entry.message}</span>
          </div>
        ))}
        {logs.length === 0 ? <div style={{ position: "absolute", left: 24, top: 142, color: "var(--pit-text-2)", fontSize: 13 }}>等待 ESP32-S3 串口与系统诊断事件</div> : null}
      </Panel>
    </PitShell>
  );
}
