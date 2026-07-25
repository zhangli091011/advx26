"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import { pitControl, usePitState } from "@/components/pit/use-pit-state";
import type { PitTool } from "@/types/pit";

const EMPTY_TOOLS: PitTool[] = [];

type ToolSlotConfig = {
  slot: string;
  ledIndex: number;
  enabled: boolean;
  name: string;
  qr: string;
  state: "in" | "out" | "lost";
};

type ToolAdminState = {
  slots: ToolSlotConfig[];
};

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
  const [admin, setAdmin] = useState<ToolAdminState | null>(null);
  const [editing, setEditing] = useState<ToolSlotConfig | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  const [pending, setPending] = useState(false);

  const allTools = state?.tools ?? EMPTY_TOOLS;
  const units = state?.units ?? [];

  const tools = useMemo(
    () =>
      allTools.filter(
        (t) =>
          (unit === "" || t.unit === unit) &&
          (query === "" || t.name.includes(query) || t.qr?.includes(query) || t.slot.toUpperCase().includes(query.toUpperCase())),
      ),
    [allTools, unit, query],
  );

  const scanLatest = state?.scanLog[0];
  const station = state?.toolStation;
  const activeSession = station?.activeSession;
  const remaining = activeSession ? Math.max(0, Math.ceil((activeSession.expiresAt - now) / 1000)) : 0;
  const sessionActive = Boolean(activeSession && remaining > 0);
  const vision = station?.vision;
  const visionReady = Boolean(vision?.online && vision.ready && vision.updatedAt && now - vision.updatedAt < 20_000);

  async function requestTools(body: Record<string, unknown>) {
    setMessage("");
    const response = await fetch("/api/pit/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!response.ok) throw new Error(result?.error ?? "工具操作失败");
    await refreshAdmin();
  }

  async function refreshAdmin() {
    const response = await fetch("/api/pit/tools", { cache: "no-store" });
    const result = await response.json() as { ok: boolean; data?: ToolAdminState; error?: string };
    if (!response.ok || !result.ok || !result.data) throw new Error(result.error ?? "工具配置读取失败");
    setAdmin(result.data);
  }

  async function run(body: Record<string, unknown>, success: string) {
    setPending(true);
    try {
      await requestTools(body);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      setNow(Date.now());
      void refreshAdmin().catch((error) => setMessage(error instanceof Error ? error.message : "工具配置读取失败"));
    }, 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <PitShell title="TOOL MANAGEMENT" active={1}>
      {/* 左：按单元筛选 */}
      <Panel x={224} y={96} w={300} h={620} title="工具位概览" en="10 LED SLOTS">
        {[{ label: "全部工具", count: `${allTools.length}/10`, unit: "" }, ...units.map((u) => ({
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
        <button type="button" className="pit-tbtn primary" style={{ left: 884, width: 92 }} disabled={sessionActive || pending || !visionReady} onClick={() => void run({ action: "start-session", operation: "checkout" }, "借出扫码已启动")}>借出</button>
        <button type="button" className="pit-tbtn" style={{ left: 984, width: 92 }} disabled={sessionActive || pending || !visionReady} onClick={() => void run({ action: "start-session", operation: "return" }, "归还扫码已启动")}>归还</button>
        <button type="button" className="pit-tbtn" style={{ left: 1084, width: 106 }} onClick={() => void run({ action: "sync-leds" }, "LED 状态已同步")}>同步 LED</button>
        <button type="button" className="pit-tbtn" style={{ left: 1198, width: 124 }} onClick={() => setEditing(admin?.slots[0] ?? null)}>配置 10 位</button>
        <div className="pit-th-bg" />
        {COLS.map((c) => (
          <span key={c.label} className="pit-th" style={{ left: c.x }}>{c.label}</span>
        ))}
        {tools.map((t, i) => {
          const [stTxt, stCol] = ST_MAP[t.state];
          return (
            <div key={t.slot} className="pit-td-row" style={{ top: 151 + i * 44, height: 40 }}>
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
                onClick={() => void pitControl("locate", t.slot).catch((error) => setMessage(error instanceof Error ? error.message : "定位失败"))}
              >
                ◉ 定位
              </button>
            </div>
          );
        })}
        {tools.length === 0 ? (
          <div style={{ position: "absolute", left: 24, top: 200, color: "var(--pit-text-2)", fontSize: 13 }}>
            尚未配置工具位，请点击“配置 10 位”登记工具和二维码。
          </div>
        ) : null}
      </Panel>

      {/* 左下：借还工位（视觉识别） */}
      <Panel x={224} y={732} w={820} h={304} title="借还工位" en="QR SCAN STATION">
        <h3 className="pit-station-title">
          {sessionActive && activeSession ? `${activeSession.operation === "checkout" ? "借出" : "归还"}模式 · 剩余 ${remaining}s` : "先选择借出或归还，再扫描工具二维码"}
        </h3>
        <p className="pit-station-sub">Dabai DC RGB · 明确借出/归还 · 会话绑定 · 状态持久化</p>
        {sessionActive ? <button type="button" className="pit-tbtn" style={{ left: 29, top: 132, width: 110 }} disabled={pending} onClick={() => void run({ action: "cancel-session" }, "扫码操作已取消")}>取消操作</button> : null}
        <div style={{ position: "absolute", left: 520, top: 58, width: 260, height: 164, border: `1px solid ${visionReady ? "var(--pit-ok)" : "var(--pit-err)"}`, padding: 18 }}>
          <strong style={{ color: visionReady ? "var(--pit-ok)" : "var(--pit-err)", fontFamily: "var(--font-tech)" }}>DABAI DC {visionReady ? "READY" : "OFFLINE"}</strong>
          <p style={{ fontSize: 11, overflowWrap: "anywhere" }}>{vision?.device || "等待 V4L2 RGB 设备"}</p>
          <p style={{ fontSize: 11 }}>{vision?.width && vision.height ? `${vision.width} × ${vision.height} · ${vision.backend.toUpperCase()}` : "尚未收到有效彩色帧"}</p>
          {vision?.error ? <p style={{ color: "var(--pit-err)", fontSize: 10 }}>{vision.error}</p> : null}
        </div>
        <div className="pit-scan-ok">
          {message || (scanLatest ? `${scanLatest.t} ${scanLatest.msg}` : "等待扫码事件…")}
        </div>
      </Panel>

      {/* 右下：今日统计 */}
      <Panel x={1060} y={732} w={820} h={304} title="今日统计" en="DAILY STATS">
        {[
          { v: String(station?.checkoutCount ?? 0), l: "今日借出", x: 40, c: "var(--pit-accent)" },
          { v: String(station?.returnCount ?? 0), l: "今日归还", x: 235, c: "var(--pit-ok)" },
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
          在位率 {allTools.length ? `${Math.round((allTools.filter((t) => t.state === "in").length / allTools.length) * 100)}%（${allTools.filter((t) => t.state === "in").length}/${allTools.length}）` : "未配置"}
          {station ? ` · LED REV ${station.appliedRevision ?? "—"}/${station.desiredRevision}` : ""}
        </span>
      </Panel>
      {editing && admin ? (
        <ToolConfigDialog
          slots={admin.slots}
          selected={editing.slot}
          onClose={() => setEditing(null)}
          onSave={async (slot) => {
            await requestTools({ action: "configure", slot });
            setMessage(`${slot.slot} 配置已保存`);
            setEditing(null);
          }}
        />
      ) : null}
    </PitShell>
  );
}

function ToolConfigDialog({ slots, selected, onClose, onSave }: {
  slots: ToolSlotConfig[];
  selected: string;
  onClose: () => void;
  onSave: (slot: ToolSlotConfig) => Promise<void>;
}) {
  const initial = slots.find((slot) => slot.slot === selected) ?? slots[0];
  const [draft, setDraft] = useState(() => initial);
  const [error, setError] = useState("");

  return (
    <div className="pit-tool-config-backdrop" role="dialog" aria-modal="true" aria-label="10 工具位配置">
      <div className="pit-tool-config-dialog">
        <h2>10 工具位与 LED 配置</h2>
        <button type="button" className="pit-tool-config-close" onClick={onClose}>×</button>
        <div className="pit-tool-slot-tabs">
          {slots.map((slot) => (
            <button key={slot.slot} type="button" className={slot.slot === draft.slot ? "active" : ""} onClick={() => setDraft(slot)}>
              {slot.slot.slice(-2)}<small>LED {slot.ledIndex + 1}</small>
            </button>
          ))}
        </div>
        <label className="pit-tool-config-check"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> 启用此工具位</label>
        <label className="pit-tool-config-field">工具名称<input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：活动扳手" /></label>
        <label className="pit-tool-config-field">二维码内容<input value={draft.qr} maxLength={160} onChange={(event) => setDraft({ ...draft, qr: event.target.value })} placeholder="例如：TOOL-U1-01" /></label>
        <p>状态：{draft.enabled ? ({ in: "在位", out: "借出", lost: "遗失" } as const)[draft.state] : "未配置"} · 对应第 {draft.ledIndex + 1} 颗灯</p>
        {error ? <div className="pit-tool-config-error">{error}</div> : null}
        <button type="button" className="pit-tool-config-save" onClick={() => void onSave(draft).catch((reason) => setError(reason instanceof Error ? reason.message : "保存失败"))}>保存此工具位</button>
      </div>
    </div>
  );
}
