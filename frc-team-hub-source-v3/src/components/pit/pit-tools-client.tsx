"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import { pitControl, usePitState } from "@/components/pit/use-pit-state";
import type { PitTool } from "@/types/pit";

const EMPTY_TOOLS: PitTool[] = [];
const DRAWERS = ["D1", "D2", "D3", "D4", "D5"];

type ToolConfig = { slot: string; name: string; unit: string; qr?: string; state: "in" | "out" | "lost" };
type ToolAdminState = { tools: ToolConfig[]; drawers: string[] };

const COLS = [
  { label: "工具名称", x: 24 }, { label: "工具 ID", x: 410 }, { label: "抽屉", x: 550 },
  { label: "状态", x: 670 }, { label: "借出时间", x: 820 }, { label: "操作", x: 1110 },
];

const ST_MAP = {
  in: ["● 在库", "var(--pit-ok)"],
  out: ["◐ 已借出", "var(--pit-accent)"],
  lost: ["○ 未归还", "var(--pit-err)"],
} as const;

export function PitToolsClient() {
  const { state } = usePitState();
  const [drawer, setDrawer] = useState("");
  const [query, setQuery] = useState("");
  const [admin, setAdmin] = useState<ToolAdminState | null>(null);
  const [editing, setEditing] = useState<ToolConfig | "new" | null>(null);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [borrower, setBorrower] = useState("");
  const [now, setNow] = useState(0);
  const [pending, setPending] = useState(false);

  const allTools = state?.tools ?? EMPTY_TOOLS;
  const tools = useMemo(() => allTools.filter((tool) => (
    (!drawer || tool.unit === drawer)
    && (!query || `${tool.name} ${tool.qr ?? ""} ${tool.slot}`.toLowerCase().includes(query.toLowerCase()))
  )), [allTools, drawer, query]);
  const pageCount = Math.max(1, Math.ceil(tools.length / 9));
  const visiblePage = Math.min(page, pageCount - 1);
  const visibleTools = tools.slice(visiblePage * 9, visiblePage * 9 + 9);
  const station = state?.toolStation;
  const activeSession = station?.activeSession;
  const remaining = activeSession ? Math.max(0, Math.ceil((activeSession.expiresAt - now) / 1000)) : 0;
  const sessionActive = Boolean(activeSession && remaining > 0);
  const vision = station?.vision;
  const visionReady = Boolean(vision?.online && vision.ready && vision.updatedAt && now - vision.updatedAt < 20_000);

  async function requestTools(body: Record<string, unknown>) {
    setMessage("");
    const response = await fetch("/api/pit/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
    try { await requestTools(body); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { setPending(false); }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      setNow(Date.now());
      void refreshAdmin().catch((error) => setMessage(error instanceof Error ? error.message : "工具配置读取失败"));
    }, 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  return (
    <PitShell title="TOOL INVENTORY · CHECK IN / OUT" active={1}>
      <Panel x={224} y={96} w={300} h={620} title="五抽屉概览" en="5 TOOL DRAWERS">
        {[{ id: "", label: "全部工具" }, ...DRAWERS.map((id) => ({ id, label: `${id} 工具抽屉` }))].map((item, index) => {
          const drawerTools = item.id ? allTools.filter((tool) => tool.unit === item.id) : allTools;
          const out = drawerTools.filter((tool) => tool.state !== "in").length;
          return (
            <button key={item.id || "all"} type="button" className={`pit-filter-row ${drawer === item.id ? "active" : ""}`} style={{ top: 59 + index * 54 }} onClick={() => { setDrawer(item.id); setPage(0); }}>
              <span className="nm">{item.label}</span>
              <span className="cnt" style={{ color: out ? "var(--pit-warn)" : undefined }}>{drawerTools.length}{out ? ` · ${out} 外借` : ""}</span>
            </button>
          );
        })}
        <div className="pit-tool-drawer-note">每个抽屉可登记多件工具<br />每件工具使用独立二维码<br />每个抽屉对应一颗定位灯</div>
      </Panel>

      <Panel x={540} y={96} w={1340} h={620} title="工具台账" en="INVENTORY · QR BOUND">
        <div className="pit-table-search"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="⌕ 搜索名称 / 二维码 / 工具 ID…" style={{ background: "transparent", border: 0, outline: "none", color: "var(--pit-text)", width: "100%", font: "inherit" }} /></div>
        <button type="button" className="pit-tbtn primary" style={{ left: 790, width: 92 }} disabled={sessionActive || pending || !visionReady || !borrower.trim()} onClick={() => void run({ action: "start-session", operation: "checkout", borrower }, "借出扫码已启动")}>借出扫码</button>
        <button type="button" className="pit-tbtn" style={{ left: 890, width: 92 }} disabled={sessionActive || pending || !visionReady} onClick={() => void run({ action: "start-session", operation: "return" }, "归还扫码已启动")}>归还扫码</button>
        <button type="button" className="pit-tbtn" style={{ left: 990, width: 106 }} disabled={pending} onClick={() => void run({ action: "sync-leds" }, "抽屉灯状态已同步")}>同步抽屉灯</button>
        <button type="button" className="pit-tbtn" style={{ left: 1104, width: 104 }} onClick={() => setEditing("new")}>+ 新增工具</button>
        <button type="button" className="pit-tbtn" style={{ left: 1216, width: 106 }} disabled={!tools[0]} onClick={() => setEditing(tools[0] ?? null)}>编辑选中</button>
        <div className="pit-th-bg" />
        {COLS.map((column) => <span key={column.label} className="pit-th" style={{ left: column.x }}>{column.label}</span>)}
        {visibleTools.map((tool, index) => {
          const [status, color] = ST_MAP[tool.state];
          return (
            <div key={tool.slot} className="pit-td-row" style={{ top: 151 + index * 44, height: 40 }}>
              <button type="button" className="pit-tool-edit-name" onClick={() => setEditing(tool)}>{tool.name}</button>
              <span className="pit-td tech" style={{ left: 410, color: "var(--pit-accent)" }}>{tool.slot}</span>
              <span className="pit-td tech dim" style={{ left: 550 }}>{tool.unit}</span>
              <span className="pit-td" style={{ left: 670, color, fontSize: 13 }}>{status}</span>
              <span className="pit-td tech dim" style={{ left: 820 }}>{tool.time ?? "—"}</span>
              <button type="button" className="pit-locate-mini" style={{ left: 1110 }} onClick={() => void pitControl("locate", tool.slot).then(() => setMessage(`${tool.unit} 指示灯定位中`)).catch((error) => setMessage(error instanceof Error ? error.message : "定位失败"))}>◉ 定位抽屉</button>
              <button type="button" className="pit-tool-edit-mini" style={{ left: 1210 }} onClick={() => setEditing(tool)}>编辑</button>
            </div>
          );
        })}
        {tools.length === 0 ? <div className="pit-tools-empty">尚未登记工具。点击“新增工具”，选择 D1–D5 抽屉并绑定二维码。</div> : null}
        {tools.length > 9 ? <div className="pit-tool-pagination"><button type="button" disabled={visiblePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>← 上一页</button><span>{visiblePage + 1} / {pageCount} · 共 {tools.length} 件</span><button type="button" disabled={visiblePage + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>下一页 →</button></div> : null}
      </Panel>

      <Panel x={224} y={732} w={820} h={304} title="扫码出入库" en="CHECK OUT · CHECK IN">
        <h3 className="pit-station-title">{sessionActive && activeSession ? `${activeSession.operation === "checkout" ? "借出" : "归还"}模式 · 剩余 ${remaining}s` : "先选择借出或归还，再扫描工具二维码"}</h3>
        <p className="pit-station-sub">一次会话处理一件工具 · 服务端校验状态 · 成功后自动同步抽屉灯</p>
        <label className="pit-tool-borrower">借用人<input value={borrower} maxLength={40} disabled={sessionActive} onChange={(event) => setBorrower(event.target.value)} placeholder="借出前必填姓名" /></label>
        {sessionActive ? <button type="button" className="pit-tbtn" style={{ left: 29, top: 132, width: 110 }} disabled={pending} onClick={() => void run({ action: "cancel-session" }, "扫码操作已取消")}>取消操作</button> : null}
        <div className={`pit-tool-vision ${visionReady ? "ready" : ""}`}>
          <strong>DABAI DC {visionReady ? "READY" : "OFFLINE"}</strong>
          <p>{vision?.device || "等待 V4L2 RGB 设备"}</p>
          <p>{vision?.width && vision.height ? `${vision.width} × ${vision.height} · ${vision.backend.toUpperCase()}` : "尚未收到有效彩色帧"}</p>
        </div>
        <div className="pit-scan-ok">{message || (state?.scanLog[0] ? `${state.scanLog[0].t} ${state.scanLog[0].msg}` : "等待扫码事件…")}</div>
      </Panel>

      <Panel x={1060} y={732} w={820} h={304} title="出入库流水" en="RECENT TRANSACTIONS">
        <div className="pit-tool-stats">
          <span>今日借出 <strong>{station?.checkoutCount ?? 0}</strong></span>
          <span>今日归还 <strong>{station?.returnCount ?? 0}</strong></span>
          <span>当前在外 <strong>{allTools.filter((tool) => tool.state !== "in").length}</strong></span>
          <span>LED REV <strong>{station?.appliedRevision ?? "—"}/{station?.desiredRevision ?? "—"}</strong></span>
        </div>
        <div className="pit-tool-transactions">
          {(station?.recentTransactions ?? []).slice(0, 4).map((item) => (
            <div key={item.id}><time>{new Date(item.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}</time><strong>{item.operation === "checkout" ? "借出" : "归还"}</strong><span>{item.name}{item.borrower ? ` · ${item.borrower}` : ""}</span><code>{item.slot}</code></div>
          ))}
          {!station?.recentTransactions.length ? <p>暂无出入库记录</p> : null}
        </div>
      </Panel>

      {editing && admin ? <ToolDialog
        tool={editing === "new" ? null : editing}
        drawers={admin.drawers}
        onClose={() => setEditing(null)}
        onSave={async (tool) => { await requestTools({ action: "configure", tool }); setMessage(`${tool.name} 已保存`); setEditing(null); }}
        onRemove={editing === "new" ? undefined : async () => { await requestTools({ action: "remove", id: editing.slot }); setMessage(`${editing.name} 已删除`); setEditing(null); }}
      /> : null}
    </PitShell>
  );
}

function ToolDialog({ tool, drawers, onClose, onSave, onRemove }: { tool: ToolConfig | null; drawers: string[]; onClose: () => void; onSave: (tool: { id: string; name: string; drawer: string; qr: string }) => Promise<void>; onRemove?: () => Promise<void> }) {
  const [name, setName] = useState(tool?.name ?? "");
  const [drawer, setDrawer] = useState(tool?.unit ?? drawers[0] ?? "D1");
  const [qr, setQr] = useState(tool?.qr ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<void>) {
    setSaving(true); setError("");
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); setSaving(false); }
  }

  return <div className="pit-tool-config-backdrop" role="dialog" aria-modal="true" aria-label={tool ? "编辑工具" : "新增工具"}>
    <div className="pit-tool-config-dialog pit-tool-dialog">
      <h2>{tool ? `编辑工具 · ${tool.slot}` : "登记新工具"}</h2>
      <button type="button" className="pit-tool-config-close" onClick={onClose}>×</button>
      <div className="pit-tool-drawer-tabs">{drawers.map((id) => <button key={id} type="button" className={drawer === id ? "active" : ""} onClick={() => setDrawer(id)}>{id}<small>抽屉 {id.slice(1)}</small></button>)}</div>
      <label className="pit-tool-config-field">工具名称<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：活动扳手" /></label>
      <label className="pit-tool-config-field">二维码内容<input value={qr} maxLength={160} onChange={(event) => setQr(event.target.value)} placeholder="例如：TOOL-WRENCH-01" /></label>
      <p>所属位置：{drawer} 工具抽屉 · 一件工具绑定一个唯一二维码</p>
      {error ? <div className="pit-tool-config-error">{error}</div> : null}
      {onRemove ? <button type="button" className="pit-tool-remove" disabled={saving || tool?.state !== "in"} onClick={() => void run(onRemove)}>删除工具</button> : null}
      <button type="button" className="pit-tool-config-save" disabled={saving} onClick={() => void run(() => onSave({ id: tool?.slot ?? "", name, drawer, qr }))}>保存工具</button>
    </div>
  </div>;
}
