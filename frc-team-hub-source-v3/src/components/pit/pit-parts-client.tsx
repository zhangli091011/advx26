"use client";

import { Panel, PitShell } from "@/components/pit/pit-shell";
import { pitControl, usePitState } from "@/components/pit/use-pit-state";

const PROCUREMENT = [
  { name: "M4 内六角螺丝 ×20mm", rem: "剩 12", sug: "补 100", pri: "紧急", col: "var(--pit-err)" },
  { name: "扎带 2.5×100mm", rem: "剩 1 包", sug: "补 10 包", pri: "紧急", col: "var(--pit-err)" },
  { name: "Anderson SB50 接头", rem: "剩 3", sug: "补 20", pri: "常规", col: "var(--pit-warn)" },
  { name: "铆钉 4×10", rem: "缺货", sug: "补 200", pri: "紧急", col: "var(--pit-err)" },
  { name: "热缩管 Φ6 黑", rem: "剩 0.5 米", sug: "补 10 米", pri: "常规", col: "var(--pit-warn)" },
];

const TRAYS = [
  { t: "① 拆卸件", d: "进气辊轮 · M4×8 螺丝×8 · 弹垫×8", n: "来自：intake 总成", col: "var(--pit-accent)" },
  { t: "② 清洗/检查", d: "轴承×2 · 待测", n: "质检中", col: "var(--pit-warn)" },
  { t: "③ 待装回", d: "新链轮×1 · 卡簧×2 · 润滑脂", n: "等待装配", col: "var(--pit-ok)" },
  { t: "④ 废件", d: "断裂扎带 · 滑丝 M4×2", n: "下场后丢弃", col: "var(--pit-err)" },
];

const PROC_COLS = [
  { label: "物料名称", x: 24 }, { label: "库存", x: 368 }, { label: "建议采购", x: 478 },
  { label: "优先级", x: 628 }, { label: "操作", x: 708 },
];

export function PitPartsClient() {
  const { state } = usePitState();
  const units = (state?.units ?? []).filter((u) => ["U3", "U4", "U5", "U6"].includes(u.u));
  const compartments = state?.compartments ?? [];

  // U4 格位按 2 行 8 列排布
  const grid: typeof compartments[] = [compartments.slice(0, 8), compartments.slice(8, 16)];

  return (
    <PitShell title="PARTS INVENTORY" active={2}>
      {/* 左：储物单元状态 */}
      <Panel x={224} y={96} w={560} h={500} title="储物单元状态" en="STORAGE UNITS">
        {units.map((u, i) => (
          <button key={u.u} type="button" className={`pit-su-card ${u.level === "low" ? "low" : ""}`} style={{ top: 63 + i * 106 }}>
            <span className="u">{u.u}</span>
            <span className="nm">{u.name}</span>
            <span className="note">{u.note}</span>
            <span className="st" style={{ color: u.level === "low" ? "var(--pit-warn)" : "var(--pit-ok)" }}>{u.status}</span>
            <span className="track"><i style={{ width: `${u.pct}%`, background: u.level === "low" ? "var(--pit-warn)" : "var(--pit-ok)" }} /></span>
          </button>
        ))}
        {units.length === 0 ? (
          <div style={{ position: "absolute", left: 29, top: 200, color: "var(--pit-text-2)", fontSize: 13 }}>
            等待储存柜数据…（pit/esp32-a/units/*）
          </div>
        ) : null}
      </Panel>

      {/* 右：U4 内部格位 */}
      <Panel x={800} y={96} w={1080} h={500} title="U4 螺丝螺母格柜 · 内部格位" en="COMPARTMENTS · LED GUIDE">
        {grid.map((row, r) =>
          row.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={`pit-comp ${c.state === "low" ? "low" : ""} ${c.state === "empty" ? "empty" : ""} ${c.state === "active" ? "active" : ""}`}
              style={{ left: 23 + i * 132, top: 63 + r * 102 }}
              onClick={() => void pitControl("locate", c.id)}
            >
              <span className="t">{c.label}</span>
              {c.state === "ok" ? <span className="dot" /> : null}
              {c.state === "active" ? <span className="st">◉ 取件中</span> : null}
              {c.state === "low" ? <span className="st" style={{ color: "var(--pit-warn)" }}>剩 {c.qty}</span> : null}
              {c.state === "empty" ? <span className="st" style={{ color: "var(--pit-err)" }}>缺货</span> : null}
            </button>
          )),
        )}
        <span className="pit-comp-note">库存计数方式：称重传感器估算 · 误差 ±5% · 取件后自动扣减</span>
      </Panel>

      {/* 左下：采购清单 */}
      <Panel x={224} y={612} w={820} h={424} title="采购清单" en="PROCUREMENT · AUTO-SYNC">
        <div className="pit-th-bg" style={{ top: 59, height: 32 }} />
        {PROC_COLS.map((c) => (
          <span key={c.label} className="pit-th" style={{ left: c.x, top: 68 }}>{c.label}</span>
        ))}
        {PROCUREMENT.map((p, i) => (
          <div key={p.name} className="pit-td-row" style={{ top: 97 + i * 58, height: 50 }}>
            <span className="pit-td" style={{ left: 24, top: 15 }}>{p.name}</span>
            <span className="pit-td dim" style={{ left: 368, top: 15, color: p.col }}>{p.rem}</span>
            <span className="pit-td dim" style={{ left: 478, top: 15 }}>{p.sug}</span>
            <span className="pit-td" style={{ left: 628, top: 15, color: p.col, fontSize: 12 }}>{p.pri}</span>
            <button type="button" className="pit-bought-btn" style={{ left: 700 }}>已购</button>
          </div>
        ))}
        <button type="button" className="pit-export-btn">⤓ 导出采购单</button>
      </Panel>

      {/* 右下：维修临时收纳 */}
      <Panel x={1060} y={612} w={820} h={424} title="维修临时收纳" en="TEMP TRAYS · BY PROCESS">
        {TRAYS.map((t, i) => (
          <div key={t.t} className="pit-tray2-row" style={{ top: 63 + i * 84, ["--tray-col" as string]: t.col }}>
            <span className="t">{t.t}</span>
            <span className="d">{t.d}</span>
            <span className="n">{t.n}</span>
          </div>
        ))}
      </Panel>
    </PitShell>
  );
}
