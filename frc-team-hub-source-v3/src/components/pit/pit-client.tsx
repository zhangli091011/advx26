"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { pitControl, usePitState, type PitTool, type ToolState } from "@/components/pit/use-pit-state";

/* 静态导航与展示常量（非设备状态） */
const NAV = [
  { zh: "主控面板", en: "DASHBOARD", icon: "dash", href: "/pit" },
  { zh: "工具管理", en: "TOOLS", icon: "tool", href: "/pit/tools" },
  { zh: "零件库存", en: "PARTS", icon: "part", href: "/pit/parts" },
  { zh: "CAN 监控", en: "CAN BUS", icon: "can", href: "/pit/can" },
  { zh: "赛事信息", en: "MATCH", icon: "match", href: "/pit/match" },
  { zh: "电源控制", en: "POWER", icon: "power", href: "/pit/power" },
  { zh: "战队展示", en: "TEAM", icon: "team", href: "/pit/team" },
];
const EMPTY_TOOLS: PitTool[] = [];

const SCHEDULE = [
  { m: "Q-38", t: "10:24", pos: "BLUE 1", kind: "blue" },
  { m: "Q-40", t: "11:02", pos: "—", kind: "none" },
  { m: "Q-42", t: "14:40", pos: "RED 2", kind: "red", current: true },
  { m: "Q-47", t: "15:35", pos: "BLUE 3", kind: "blue" },
  { m: "Q-53", t: "16:50", pos: "待抽签", kind: "none" },
];

const LOW_STOCK = [
  { name: "M4 内六角螺丝 ×20mm", sub: "剩余 12  ·  建议补 100" },
  { name: "扎带 2.5×100mm", sub: "剩余 1 包  ·  建议补 10 包" },
  { name: "Anderson SB50 接头", sub: "剩余 3  ·  建议补 20" },
];

const TRAYS = [
  { t: "① 拆卸", c: "M4×8 弹垫×8" },
  { t: "② 待装", c: "链轮×1 卡簧×2" },
  { t: "③ 废件", c: "断裂扎带" },
];

const RFID_LOG = [
  { t: "13:58", msg: "张工 借出（未归还）", color: "var(--pit-err)" },
  { t: "12:31", msg: "归还 → 自动识别入位 U1-03", color: "var(--pit-ok)" },
  { t: "11:05", msg: "李工 借出", color: "var(--pit-accent)" },
  { t: "10:47", msg: "归还 → 自动识别入位 U1-03", color: "var(--pit-ok)" },
];

function NavIcon({ kind, active }: { kind: string; active: boolean }) {
  const c = active ? "var(--pit-accent)" : "var(--pit-text-2)";
  const rect = (x: number, y: number, w: number, h: number, rot = 0) => (
    <rect x={x} y={y} width={w} height={h} fill={c} transform={rot ? `rotate(${rot} ${x + w / 2} ${y + h / 2})` : undefined} />
  );
  const ring = (cx: number, cy: number, r: number) => (
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={2} />
  );
  return (
    <svg className="pit-nav-ico" viewBox="0 0 20 20" aria-hidden>
      {kind === "dash" && <>{rect(0, 0, 8, 8)}{rect(12, 0, 8, 8)}{rect(0, 12, 8, 8)}{rect(12, 12, 8, 8)}</>}
      {kind === "tool" && <>{rect(2, 8, 16, 4, -45)}{rect(8, 6, 4, 10, -45)}</>}
      {kind === "part" && <>{ring(10, 10, 6)}{rect(7, 7, 6, 6)}</>}
      {kind === "can" && <>{rect(1, 2, 18, 3)}{rect(1, 4, 3, 14)}{rect(16, 4, 3, 14)}{rect(1, 17, 18, 3)}</>}
      {kind === "match" && <>{rect(1, 1, 18, 10)}{rect(7, 14, 6, 3)}{rect(1, 8, 3, 6)}{rect(16, 8, 3, 6)}</>}
      {kind === "power" && <>{ring(10, 11, 7)}{rect(8, 0, 3, 10)}</>}
      {kind === "team" && <>{ring(4, 6, 3)}{ring(16, 6, 3)}{rect(1, 12, 6, 3)}{rect(13, 12, 6, 3)}</>}
    </svg>
  );
}

function Panel({
  x, y, w, h, title, en, children,
}: {
  x: number; y: number; w: number; h: number; title: string; en: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="pit-panel" style={{ left: x, top: y, width: w, height: h }}>
      <h2 className="pit-panel-title">{title}</h2>
      <span className="pit-panel-title-en" style={{ left: 29 + title.length * 17 + 20 }}>{en}</span>
      <div className="pit-panel-divider" />
      {children}
    </section>
  );
}

export function PitClient() {
  const { state, live } = usePitState();
  const [now, setNow] = useState<Date | null>(null);
  const [locating, setLocating] = useState<PitTool | null>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(new Date()), 0);
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(t);
    };
  }, []);

  const clock = useMemo(() => {
    if (!now) return "--:--:--";
    return [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  }, [now]);

  const countdown = useMemo(() => {
    if (!now) return "08:47";
    const target = new Date(now);
    target.setHours(14, 40, 0, 0);
    let diff = Math.floor((target.getTime() - now.getTime()) / 1000);
    if (diff < 0 || diff > 2 * 3600) diff = 8 * 60 + 47;
    return `${String(Math.floor(diff / 60)).padStart(2, "0")}:${String(diff % 60).padStart(2, "0")}`;
  }, [now]);

  /* 真实数据（无数据时显示空态） */
  const tools = state?.tools ?? EMPTY_TOOLS;
  const units = state?.units ?? [];
  const channels = state?.channels ?? [];
  const canDevices = state?.canDevices ?? [];
  const brokerOnline = live && state?.connection.brokerConnected === true;

  const stats = useMemo(() => ({
    inCount: tools.filter((t) => t.state === "in").length,
    outCount: tools.filter((t) => t.state === "out").length,
    lostCount: tools.filter((t) => t.state === "lost").length,
  }), [tools]);

  const totalWatts = channels.reduce((s, c) => s + (c.on ? c.watts : 0), 0);

  return (
    <div className="pit-stage">
      {/* 背景装饰 */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="pit-deco-stripe" style={{ left: 1560 + i * 60, top: 40 + i * 22 }} />
      ))}
      <div className="pit-corner tl" style={{ left: 24, top: 24 }} />
      <div className="pit-corner tr" style={{ right: 24, top: 24 }} />
      <div className="pit-corner bl" style={{ left: 24, bottom: 24 }} />
      <div className="pit-corner br" style={{ right: 24, bottom: 24 }} />
      <div className="pit-ticks" style={{ left: 40, bottom: 18 }}>
        {Array.from({ length: 24 }).map((_, i) => <i key={i} />)}
      </div>

      {/* 顶部栏 */}
      <header className="pit-header">
        <div className="pit-brand">FRC</div>
        <div className="pit-title">PIT-OS // SMART TOOLBOX</div>
        <div className="pit-subtitle">智能工具箱控制系统  V2.4.1</div>
        <div className="pit-chips">
          <div className="pit-chip">
            <i style={{ background: brokerOnline ? "var(--pit-ok)" : "var(--pit-err)" }} />
            <small>MQTT</small><strong>{brokerOnline ? "ONLINE" : "OFFLINE"}</strong>
          </div>
          <div className="pit-chip">
            <i style={{ background: "var(--pit-accent)" }} />
            <small>PWR</small><strong>{state ? `${state.env.tempC.toFixed(1)}°C` : "—"}</strong>
          </div>
          <div className="pit-chip">
            <i style={{ background: "var(--pit-ok)" }} />
            <small>BAT</small><strong>{state?.batteries[0] ? `${state.batteries[0].pct}%` : "—"}</strong>
          </div>
          <div className="pit-clock">{clock}</div>
        </div>
      </header>

      {/* 左侧导航 */}
      <nav className="pit-nav">
        {NAV.map((item, i) => (
          <Link key={item.en} href={item.href} className={`pit-nav-item ${i === 0 ? "active" : ""}`}>
            <NavIcon kind={item.icon} active={i === 0} />
            <span>
              <span className="zh">{item.zh}</span>
              <br />
              <span className="en">{item.en}</span>
            </span>
          </Link>
        ))}
        <div className="pit-mode-tag">
          <strong>PIT MODE</strong>
          <span>维修区模式</span>
        </div>
      </nav>

      {/* 下一场比赛 */}
      <Panel x={224} y={96} w={560} h={300} title="下一场比赛" en="NEXT MATCH">
        <div className="pit-match-label">QUALIFICATION</div>
        <div className="pit-match-num">Q-42</div>
        <div className="pit-countdown-label">倒计时</div>
        <div className="pit-countdown">{countdown}</div>
        <div className="pit-alliance">
          <strong>RED ALLIANCE</strong>
          <span className="pos">红方 · 2 号位</span>
          <span className="teams">8888  ·  6666  ·  2333</span>
          <span className="us">我方 8888（主队）</span>
        </div>
        <div className="pit-field-label">场地位置</div>
        {["S1", "S2", "S3"].map((s, i) => (
          <div key={s} className={`pit-field-cell ${i === 1 ? "us" : ""}`} style={{ left: 109 + i * 66 }}>{s}</div>
        ))}
      </Panel>

      {/* CAN 总线 */}
      <Panel x={800} y={96} w={540} h={300} title="CAN 总线状态" en="CAN BUS MONITOR">
        {canDevices.slice(0, 6).map((d, i) => (
          <div key={d.id} className={`pit-can-row ${d.on ? "" : "offline"}`} style={{ top: 61 + i * 36 }}>
            <span className="pit-can-dot" style={{ background: d.on ? "var(--pit-ok)" : "var(--pit-err)" }} />
            <span className="pit-can-id">ID {d.id}</span>
            <span className="pit-can-name" style={{ color: d.on ? "var(--pit-text)" : "var(--pit-err)" }}>{d.name}</span>
            <span className="pit-can-status" style={{ color: d.on ? "var(--pit-ok)" : "var(--pit-err)" }}>
              {d.on ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
        ))}
        {canDevices.length === 0 ? (
          <div style={{ position: "absolute", left: 29, top: 120, color: "var(--pit-text-2)", fontSize: 13 }}>
            等待 CAN 适配器数据…（pit/can/devices）
          </div>
        ) : null}
      </Panel>

      {/* 电源控制 */}
      <Panel x={1356} y={96} w={524} h={300} title="电源控制" en="POWER CHANNELS">
        {channels.slice(0, 4).map((c, i) => (
          <div key={c.id} className="pit-pwr-row" style={{ top: 61 + i * 56 }}>
            <span className="pit-pwr-name">{c.name}</span>
            <span className="pit-pwr-sub">{`${c.id}  ·  ${c.amps.toFixed(1)}A`}</span>
            <span className="pit-pwr-status" style={{ color: c.on ? "var(--pit-ok)" : "var(--pit-text-2)" }}>
              {c.on ? "ON" : "OFF"}
            </span>
            <button
              type="button"
              className={`pit-toggle ${c.on ? "on" : ""}`}
              aria-label={`${c.name} 电源开关`}
              onClick={() => void pitControl("power", c.id, !c.on)}
            >
              <i />
            </button>
          </div>
        ))}
        <div className="pit-pwr-total">{`TOTAL  ${totalWatts}W  /  LIMIT 1500W`}</div>
      </Panel>

      {/* 工具管理 */}
      <Panel x={224} y={412} w={560} h={624} title="工具管理" en="TOOL TRACKING · QR SCAN">
        <div className="pit-tool-stat" style={{ left: 27, color: "var(--pit-ok)" }}>在位 {stats.inCount}</div>
        <div className="pit-tool-stat" style={{ left: 139, color: "var(--pit-accent)" }}>借出 {stats.outCount}</div>
        <div className="pit-tool-stat" style={{ left: 239, color: "var(--pit-err)" }}>异常 {stats.lostCount}</div>
        <button
          type="button"
          className="pit-tool-locate-btn"
          onClick={() => setLocating(tools.find((t) => t.state === "lost") ?? tools[0] ?? null)}
        >
          ◉ 指示灯寻物
        </button>
        {tools.slice(0, 8).map((t, i) => (
          <button
            key={t.slot}
            type="button"
            className="pit-tool-row"
            style={{ top: 105 + i * 64 }}
            onClick={() => setLocating(t)}
          >
            <span className="pit-tool-slot">{t.slot}</span>
            <span className="pit-tool-name">{t.name}</span>
            <span className={`pit-pill ${t.state}`}>
              {t.state === "in" ? "在位" : t.state === "out" ? `借出 · ${t.who}` : "未归还"}
            </span>
            <span className="pit-led" />
          </button>
        ))}
        {tools.length === 0 ? (
          <div style={{ position: "absolute", left: 29, top: 200, color: "var(--pit-text-2)", fontSize: 13 }}>
            等待储存柜数据…（pit/esp32-a/tools/*）
          </div>
        ) : null}
      </Panel>

      {/* 零件库存 */}
      <Panel x={800} y={412} w={540} h={624} title="零件库存" en="PARTS INVENTORY">
        <div className="pit-parts-hint">16U 机柜 · 8 组储物单元（点击单元 → 指示灯亮）</div>
        {units.map((u, i) => (
          <button
            key={u.u}
            type="button"
            className={`pit-unit-row ${u.level === "low" ? "low" : ""} ${u.level === "active" ? "active" : ""}`}
            style={{ top: 59 + i * 30 }}
            onClick={() => void pitControl("locate-unit", u.u)}
          >
            <span className="u">{u.u}</span>
            <span className="nm">{u.name}</span>
            <span className="note">{u.note}</span>
            <span className="st" style={{ color: u.level === "ok" ? "var(--pit-ok)" : u.level === "low" ? "var(--pit-warn)" : undefined }}>
              {u.status}
              <i style={{ background: u.level === "ok" ? "var(--pit-ok)" : u.level === "low" ? "var(--pit-warn)" : undefined }} />
            </span>
          </button>
        ))}
        <div className="pit-panel-divider" style={{ top: 315 }} />
        <div className="pit-parts-warn">⚠ 低库存预警（同步采购清单）</div>
        {LOW_STOCK.map((l, i) => (
          <div key={l.name} className="pit-low-row" style={{ top: 357 + i * 52 }}>
            <span>
              <span className="nm">{l.name}</span>
              <br />
              <span className="sub">{l.sub}</span>
            </span>
            <button type="button" className="pit-buy-btn">+ 采购</button>
          </div>
        ))}
        <div className="pit-panel-divider" style={{ top: 529 }} />
        <div className="pit-tray-title">本次维修临时收纳 · 按工序分组</div>
        {TRAYS.map((t, i) => (
          <div key={t.t} className="pit-tray" style={{ left: 23 + i * 174 }}>
            <strong>{t.t}</strong>
            <span>{t.c}</span>
          </div>
        ))}
      </Panel>

      {/* CAD 快速查阅 */}
      <Panel x={1356} y={412} w={524} h={300} title="CAD 快速查阅" en="CAD VIEWER">
        <div className="pit-cad-viewport">
          {[52, 105, 158, 211, 264].map((l) => (
            <div key={l} style={{ position: "absolute", left: l, top: -1, width: 1, height: 224, background: "rgba(56,59,64,0.3)" }} />
          ))}
          {[44, 89, 134, 179].map((t) => (
            <div key={t} style={{ position: "absolute", left: -1, top: t, width: 320, height: 1, background: "rgba(56,59,64,0.3)" }} />
          ))}
          <svg style={{ position: "absolute", left: 0, top: 0 }} width="320" height="224" viewBox="0 0 320 224" aria-hidden>
            <g stroke="var(--pit-accent)" strokeWidth="1.5" fill="none">
              <path d="M70 130 L130 90 L250 90 L190 130 Z" />
              <path d="M70 130 L70 180 L190 180 L190 130" />
              <path d="M190 130 L250 90 L250 140 L190 180" />
            </g>
            <path d="M100 145 L160 145 L160 165 L100 165 Z" stroke="var(--pit-text-2)" strokeWidth="1.5" fill="none" />
          </svg>
          <div className="pit-cad-cross-h" />
          <div className="pit-cad-cross-v" />
          <span className="file">intake_assembly_v3.step</span>
        </div>
        <div className="pit-cad-tree-label">按组件浏览</div>
        {["底盘", "机械臂", "▶  intake 总成", "射手", "攀爬"].map((c, i) => (
          <button key={c} type="button" className={`pit-cad-tree-item ${i === 2 ? "active" : ""}`} style={{ top: 83 + i * 40 }}>
            {c}
          </button>
        ))}
        <div className="pit-cad-slider"><i /></div>
      </Panel>

      {/* 今日赛程 */}
      <Panel x={1356} y={728} w={524} h={308} title="今日赛程" en="SCHEDULE · OFFICIAL API">
        {SCHEDULE.map((s, i) => (
          <div key={s.m} className={`pit-sch-row ${s.current ? "current" : ""}`} style={{ top: 59 + i * 48 }}>
            <span className="m" style={{ color: s.current ? "var(--pit-accent)" : "var(--pit-text)" }}>{s.m}</span>
            <span className="t">{s.t}</span>
            <span className="p" style={{ color: s.kind === "red" ? "var(--pit-err)" : s.kind === "blue" ? "var(--pit-blue)" : "var(--pit-text-2)" }}>
              {s.pos}
            </span>
            {s.current ? <span className="tag">◀ 即将上场</span> : null}
          </div>
        ))}
      </Panel>

      {/* 底部 LIVE 滚动条 */}
      <div className="pit-ticker">
        <span className="live"><i>●</i> LIVE  Q-38  RED 128 — 121 BLUE</span>
        <span className="ai">
          {state?.scanLog[0]
            ? `│  最近扫码：${state.scanLog[0].msg}  │  API ${live ? "在线" : "离线"} · MQTT ${brokerOnline ? "在线" : "离线"}`
            : `│  等待视觉识别扫码事件…  │  API ${live ? "在线" : "离线"} · MQTT ${brokerOnline ? "在线" : "离线"}`}
        </span>
      </div>

      {/* 工具定位全屏覆盖层 */}
      {locating ? <LocateOverlay tool={locating} tools={tools} onClose={() => setLocating(null)} /> : null}
    </div>
  );
}

function LocateOverlay({ tool, tools, onClose }: { tool: PitTool; tools: PitTool[]; onClose: () => void }) {
  const targetUnit = tool.slot.split("-")[0];
  const unitNames: Record<string, { name: string; note: string }> = {
    U1: { name: "手动工具抽屉", note: "内六角 / 扳手 / 钳" },
    U2: { name: "电动工具抽屉", note: "电螺丝刀 / 热风枪" },
    U3: { name: "批头 · 钻头耗材", note: "PH / TX / 内六角批头" },
    U4: { name: "螺丝螺母格柜", note: "M3 / M4 / M5 / 垫片" },
    U5: { name: "接头 · 线材", note: "Anderson / XT60 / 线" },
    U6: { name: "扎带 · 耗材", note: "扎带 / 热缩管 / 胶带" },
    U7: { name: "电工仪表", note: "万用表 / 夹表" },
    U8: { name: "维修临时托盘", note: "按工序分组收纳" },
  };

  const slots = tools.filter((t) => t.slot.startsWith(targetUnit)).slice(0, 6);
  const slotCells: Array<{ code: string; name: string; state?: ToolState }> = [];
  for (let i = 1; i <= 6; i++) {
    const code = `${targetUnit}-0${i}`;
    const found = slots.find((s) => s.slot === code);
    slotCells.push({ code, name: found?.name ?? "", state: found?.state });
  }

  return (
    <div className="pit-locate" role="dialog" aria-modal="true" aria-label={`正在定位 ${tool.name}`}>
      <div className="pit-locate-banner">
        <h2>正在定位：{tool.name}</h2>
        <p>
          LOCATING TOOL  ·  16U RACK / UNIT {targetUnit} / SLOT {tool.slot}  ·  LED BLINKING <i>▮▮▮</i>
        </p>
        <button type="button" className="pit-locate-cancel" onClick={onClose}>✕ 取消</button>
      </div>

      <div className="pit-rack-label">16U RACK · FRONT VIEW</div>
      <div className="pit-rack-rail" style={{ left: 66 }} />
      <div className="pit-rack-rail" style={{ left: 1028 }} />
      {Object.entries(unitNames).map(([u, meta], i) => (
        <div key={u} className={`pit-rack-unit ${u === targetUnit ? "target" : ""}`} style={{ top: 160 + i * 104 }}>
          <span className="u">{u}</span>
          <span className="nm">{meta.name}</span>
          <span className="note">{meta.note}</span>
          {u === targetUnit ? <span className="here"><i>◉</i> 这个单元</span> : null}
          <span className="handle" />
        </div>
      ))}

      <div className="pit-locate-detail">
        <h3>{targetUnit} 单元内部 · 工具位</h3>
        {slotCells.map((c, i) => {
          const isTarget = c.code === tool.slot;
          return (
            <div
              key={c.code}
              className={`pit-slot ${c.name ? "" : "empty"} ${isTarget ? "target" : ""}`}
              style={{ left: 20 + (i % 3) * 236, top: 56 + Math.floor(i / 3) * 150 }}
            >
              <span className="code">{c.code}</span>
              {c.name ? (
                <>
                  <span className="nm">{c.name}</span>
                  <span className="st" style={isTarget ? undefined : { color: "var(--pit-ok)" }}>
                    {isTarget ? <><i>◉</i> 在这里！</> : c.state === "out" ? "借出" : "在位"}
                  </span>
                </>
              ) : (
                <span className="em">空格</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="pit-rfid-log">
        <h3>视觉识别记录</h3>
        {RFID_LOG.map((l, i) => (
          <div key={l.t + l.msg} className="pit-rfid-row" style={{ top: 56 + i * 34 }}>
            <time>{l.t}</time>
            <span style={{ color: l.color }}>{l.msg}</span>
          </div>
        ))}
        <div className="pit-rfid-tip">归还时摄像头扫码识别二维码标签，自动重新绑定位置</div>
      </div>
    </div>
  );
}
