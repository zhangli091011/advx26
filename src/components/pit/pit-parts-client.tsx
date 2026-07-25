"use client";

import { Panel, PitShell } from "@/components/pit/pit-shell";
import { pitControl, usePitState } from "@/components/pit/use-pit-state";

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
        <span className="pit-comp-note">库存计数来自设备长连接上报</span>
      </Panel>

      {/* 左下：采购清单 */}
      <Panel x={224} y={612} w={820} h={424} title="采购清单" en="PROCUREMENT">
        <EmptyState text="采购系统未配置" />
      </Panel>

      {/* 右下：维修临时收纳 */}
      <Panel x={1060} y={612} w={820} h={424} title="维修临时收纳" en="TEMP TRAYS · BY PROCESS">
        <EmptyState text="维修工单未配置" />
      </Panel>
    </PitShell>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ position: "absolute", inset: "58px 24px 24px", display: "grid", placeItems: "center", color: "var(--pit-text-2)", fontSize: 14 }}>{text}</div>;
}
