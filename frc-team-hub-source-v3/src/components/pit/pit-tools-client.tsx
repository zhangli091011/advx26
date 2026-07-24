"use client";

import { useMemo, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import { pitControl, usePitState } from "@/components/pit/use-pit-state";

const COLS = [
  { label: "工具名称", x: 24 },
  { label: "位号", x: 428 },
  { label: "单元", x: 548 },
  { label: "状态", x: 688 },
  { label: "借出人", x: 868 },
  { label: "借出时间", x: 1028 },
  { label: "操作", x: 1188 },
];

const ST_MAP = {
  in: ["● 在位", "var(--pit-ok)"],
  out: ["◐ 借出", "var(--pit-accent)"],
  lost: ["○ 未归还", "var(--pit-err)"],
} as const;

export function PitToolsClient() {
  const { state } = usePitState();
  const [unit, setUnit] = useState("");
  const [query, setQuery] = useState("");

  const allTools = state?.tools ?? [];
  const units = state?.units ?? [];

  const tools = useMemo(
    () =>
      allTools.filter(
        (t) =>
          (unit === "" || t.unit === unit) &&
          (query === "" || t.name.includes(query) || t.slot.toUpperCase().includes(query.toUpperCase())),
      ),
    [allTools, unit, query],
  );

  const scanLatest = state?.scanLog[0];

  return (
    <PitShell title="TOOL MANAGEMENT" active={1}>
      {/* 左：按单元筛选 */}
      <Panel x={224} y={96} w={300} h={620} title="按单元筛选" en="16U UNITS">
        {[{ label: "全部单元", count: `${allTools.length} 件`, unit: "" }, ...units.map((u) => ({
          label: `${u.u} ${u.name.replace(/^(手动|电动|批头|螺丝|接头|扎带|电工|维修)/, "").slice(0, 4)}`,
          count: String(allTools.filter((t) => t.unit === u.u).length || "—"),
          unit: u.u,
        }))].map((f, i) => (
          <button
            key={f.label}
            type="button"
            className={`pit-filter-row ${unit === f.unit ? "active" : ""}`}
            style={{ top: 59 + i * 54 }}
            onClick={() => setUnit(f.unit)}
          >
            <span className="nm">{f.label}</span>
            <span className="cnt">{f.count}</span>
          </button>
        ))}
      </Panel>

      {/* 右：工具清单 */}
      <Panel x={540} y={96} w={1340} h={620} title="工具清单" en="ALL TOOLS · QR BOUND">
        <div className="pit-table-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="⌕ 搜索工具名称 / 二维码 / 位号…"
            style={{ background: "transparent", border: 0, outline: "none", color: "var(--pit-text)", width: "100%", font: "inherit" }}
          />
        </div>
        <button type="button" className="pit-tbtn primary" style={{ left: 978, width: 108 }}>+ 登记新工具</button>
        <button type="button" className="pit-tbtn" style={{ left: 1098, width: 100 }}>⇲ 批量归还</button>
        <button type="button" className="pit-tbtn" style={{ left: 1210, width: 113 }}>◉ 指示灯寻物</button>
        <div className="pit-th-bg" />
        {COLS.map((c) => (
          <span key={c.label} className="pit-th" style={{ left: c.x }}>{c.label}</span>
        ))}
        {tools.map((t, i) => {
          const [stTxt, stCol] = ST_MAP[t.state];
          return (
            <div key={t.slot} className="pit-td-row" style={{ top: 155 + i * 54 }}>
              <span className="pit-td" style={{ left: 24 }}>{t.name}</span>
              <span className="pit-td tech" style={{ left: 428, color: "var(--pit-accent)" }}>{t.slot}</span>
              <span className="pit-td tech dim" style={{ left: 548 }}>{t.unit}</span>
              <span className="pit-td" style={{ left: 688, color: stCol, fontSize: 13 }}>{stTxt}</span>
              <span className="pit-td dim" style={{ left: 868, color: t.who ? "var(--pit-text)" : undefined }}>{t.who ?? "—"}</span>
              <span className="pit-td tech dim" style={{ left: 1028 }}>{t.time ?? "—"}</span>
              <button
                type="button"
                className="pit-locate-mini"
                style={{ left: 1188 }}
                onClick={() => void pitControl("locate", t.slot)}
              >
                ◉ 定位
              </button>
            </div>
          );
        })}
        {tools.length === 0 ? (
          <div style={{ position: "absolute", left: 24, top: 200, color: "var(--pit-text-2)", fontSize: 13 }}>
            等待储存柜数据…（pit/esp32-a/tools/*）
          </div>
        ) : null}
      </Panel>

      {/* 左下：借还工位（视觉识别） */}
      <Panel x={224} y={732} w={820} h={304} title="借还工位" en="QR SCAN STATION">
        <h3 className="pit-station-title">将工具二维码对准摄像头</h3>
        <p className="pit-station-sub">视觉识别 · 借出/归还一步完成 · 任意空位放入即重新绑定位号</p>
        {/* 摄像头取景框 */}
        <div style={{ position: "absolute", left: 560, top: 60, width: 220, height: 160, border: "2px dashed var(--pit-accent)", display: "grid", placeItems: "center" }}>
          <span style={{ color: "var(--pit-accent)", fontFamily: "var(--font-tech)", fontWeight: 700, fontSize: 15 }}>CAM</span>
        </div>
        <div className="pit-scan-ok">
          {scanLatest ? `✓ ${scanLatest.t} ${scanLatest.msg}` : "等待扫码事件…"}
        </div>
      </Panel>

      {/* 右下：今日统计 */}
      <Panel x={1060} y={732} w={820} h={304} title="今日统计" en="DAILY STATS">
        {[
          { v: "27", l: "借出次数", x: 40, c: "var(--pit-accent)" },
          { v: "25", l: "归还次数", x: 235, c: "var(--pit-ok)" },
          { v: String(allTools.filter((t) => t.state === "out").length), l: "当前在外", x: 430, c: "var(--pit-warn)" },
          { v: String(allTools.filter((t) => t.state === "lost").length), l: "超时未还", x: 625, c: "var(--pit-err)" },
        ].map((s) => (
          <div key={s.l} className="pit-big-stat">
            <span className="vl" style={{ left: s.x, color: s.c }}>{s.v}</span>
            <span className="lb" style={{ left: s.x + 2 }}>{s.l}</span>
          </div>
        ))}
        <div className="pit-bar" style={{ left: 31, top: 229, width: 756, height: 8 }}>
          <i style={{ width: allTools.length ? `${(allTools.filter((t) => t.state === "in").length / allTools.length) * 100}%` : "0%", background: "var(--pit-ok)" }} />
        </div>
        <span style={{ position: "absolute", left: 31, top: 249, color: "var(--pit-text-2)", fontSize: 13 }}>
          在位率 {allTools.length ? Math.round((allTools.filter((t) => t.state === "in").length / allTools.length) * 100) : 0}%
          （{allTools.filter((t) => t.state === "in").length}/{allTools.length}）· 目标 ≥ 95%
        </span>
      </Panel>
    </PitShell>
  );
}
