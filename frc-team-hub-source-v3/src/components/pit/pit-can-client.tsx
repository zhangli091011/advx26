"use client";

import { Panel, PitShell } from "@/components/pit/pit-shell";
import { usePitState } from "@/components/pit/use-pit-state";

const DEV_COLS = [
  { label: "ID", x: 24 }, { label: "设备", x: 88 }, { label: "型号", x: 338 }, { label: "机构", x: 568 },
  { label: "状态", x: 748 }, { label: "延迟", x: 868 }, { label: "温度", x: 968 },
];

const BARS = [12, 18, 15, 22, 19, 25, 21, 28, 23, 30, 26, 20, 24, 27, 22, 18, 25, 29, 23, 19];

const LOGS = [
  { t: "14:32:06.412", lv: "INFO", col: "var(--pit-text-2)", msg: "[DRIVE-L1] velocity loop ok, 2.31 m/s" },
  { t: "14:32:05.988", lv: "INFO", col: "var(--pit-ok)", msg: "[SHOOTER] flywheel 4820 rpm, ready" },
  { t: "14:32:04.130", lv: "WARN", col: "var(--pit-warn)", msg: "[CLIMB] no heartbeat for 60000ms, marking offline" },
  { t: "14:32:03.771", lv: "INFO", col: "var(--pit-text-2)", msg: "[PDH] channel 7 current 6.2A" },
  { t: "14:32:02.554", lv: "ERROR", col: "var(--pit-err)", msg: "[CAN] device ID 31 unresponsive — check wiring" },
  { t: "14:32:01.902", lv: "INFO", col: "var(--pit-text-2)", msg: "[INTAKE] note detected, beam break CH2" },
];

export function PitCanClient() {
  const { state } = usePitState();
  const devices = state?.canDevices ?? [];
  const online = devices.filter((d) => d.on).length;
  const offline = devices.find((d) => !d.on);

  const SUMMARY = [
    { lb: "总线负载", vl: devices.length ? "23%" : "—", col: "var(--pit-ok)" },
    { lb: "在线设备", vl: devices.length ? `${online}/${devices.length}` : "—", col: online === devices.length && devices.length ? "var(--pit-ok)" : "var(--pit-warn)" },
    { lb: "错误帧", vl: "0", col: "var(--pit-ok)" },
    { lb: "电压轨", vl: devices.length ? "12.4V" : "—", col: "var(--pit-ok)" },
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
            等待 CAN 适配器数据…（pit/can/devices · USB-CAN + TunerX）
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
        <span className="pit-topo-chart-lb">总线负载 · 近 60s</span>
        {BARS.map((h, i) => (
          <div key={i} className="pit-topo-bar" style={{ left: 29 + i * 25, top: 469 - h * 4, height: h * 4, background: `rgba(255,199,0,${0.35 + (h / 30) * 0.5})` }} />
        ))}
      </Panel>

      {/* 串口日志 */}
      <Panel x={224} y={738} w={1656} h={298} title="串口 / 日志监视" en="SERIAL LOG · roboRIO">
        {LOGS.map((l, i) => (
          <div key={l.t} className="pit-log-row" style={{ top: 59 + i * 36 }}>
            <time>{l.t}</time>
            <span className="lv" style={{ color: l.col }}>{l.lv}</span>
            <span className="msg">{l.msg}</span>
          </div>
        ))}
      </Panel>
    </PitShell>
  );
}
