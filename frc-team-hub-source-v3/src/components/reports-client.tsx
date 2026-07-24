"use client";

import { Download, FileImage, FileSpreadsheet, LoaderCircle, ReceiptText, Search, Upload, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingPanel, Modal, PageHeader, fetchJson } from "@/components/ui";
import { formatBytes, formatDateTime } from "@/lib/format";

type FinanceDocument = {
  id: string;
  kind: "INVOICE" | "PURCHASE";
  title: string;
  vendor: string | null;
  amountCents: number | null;
  documentDate: string | null;
  notes: string | null;
  originalName: string;
  sizeBytes: number;
  uploader: string;
  createdAt: number;
};

type FilterKind = "" | "INVOICE" | "PURCHASE";

export function ReportsClient() {
  const [items, setItems] = useState<FinanceDocument[] | null>(null);
  const [kind, setKind] = useState<FilterKind>("");
  const [query, setQuery] = useState("");
  const [uploadKind, setUploadKind] = useState<"INVOICE" | "PURCHASE">("INVOICE");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await fetchJson<{ items: FinanceDocument[] }>(`/api/finance?kind=${kind}&q=${encodeURIComponent(query)}`);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法加载报表");
    }
  }, [kind, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  function openUpload(nextKind: "INVOICE" | "PURCHASE" = "INVOICE") {
    setUploadKind(nextKind);
    setFileName("");
    setUploadError("");
    setUploadOpen(true);
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData(event.currentTarget);
      form.set("kind", uploadKind);
      await fetchJson("/api/finance", { method: "POST", body: form });
      event.currentTarget.reset();
      setUploadOpen(false);
      setFileName("");
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  const visible = items || [];
  const amount = visible.reduce((sum, item) => sum + (item.amountCents || 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="FINANCE REPOSITORY"
        title="报表与发票仓库"
        description="保存所有发票、报销凭证和购买记录 Excel。金额使用整数分存储，下载必须通过登录权限验证。"
        action={<button className="button primary" onClick={() => openUpload(kind === "PURCHASE" ? "PURCHASE" : "INVOICE")}><Upload size={16} />上传文档</button>}
      />

      <div className="repo-summary">
        <RepoStat icon={<ReceiptText size={17} />} label="当前文档" value={String(visible.length)} />
        <RepoStat icon={<WalletCards size={17} />} label="已登记金额" value={`¥${(amount / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`} />
        <RepoStat icon={<FileSpreadsheet size={17} />} label="Excel 记录" value={String(visible.filter((item) => item.kind === "PURCHASE").length)} />
      </div>

      <section className="panel panel-pad" style={{ marginTop: 20 }}>
        <div className="toolbar">
          <div className="toolbar-group">
            <div className="segmented">
              <button className={kind === "" ? "active" : ""} onClick={() => setKind("")}>全部</button>
              <button className={kind === "INVOICE" ? "active" : ""} onClick={() => setKind("INVOICE")}>发票</button>
              <button className={kind === "PURCHASE" ? "active" : ""} onClick={() => setKind("PURCHASE")}>购买记录 Excel</button>
            </div>
          </div>
          <div className="search-box">
            <Search size={16} />
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或商家……" />
          </div>
        </div>

        {!items ? (
          error ? <div className="alert error">{error}</div> : <LoadingPanel />
        ) : items.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>类型</th><th>文档</th><th>商家</th><th>单据日期</th><th>金额</th><th>上传者</th><th>上传时间</th><th>大小</th><th /></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><span className={`status-chip ${item.kind === "PURCHASE" ? "active" : ""}`}>{item.kind === "INVOICE" ? "发票" : "Excel"}</span></td>
                    <td><span className="cell-primary">{item.title}</span><span className="cell-sub">{item.originalName}</span></td>
                    <td>{item.vendor || "—"}</td>
                    <td className="mono">{item.documentDate || "—"}</td>
                    <td className="mono amount-cell">{item.amountCents === null ? "—" : `¥${(item.amountCents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`}</td>
                    <td>{item.uploader}</td>
                    <td className="mono">{formatDateTime(item.createdAt)}</td>
                    <td className="mono">{formatBytes(item.sizeBytes)}</td>
                    <td><a className="icon-button" href={`/api/finance/${item.id}/download`} aria-label={`下载 ${item.title}`}><Download size={16} /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={kind === "PURCHASE" ? <FileSpreadsheet size={21} /> : <ReceiptText size={21} />}
            title={query ? "没有匹配的文档" : kind === "PURCHASE" ? "还没有购买记录 Excel" : kind === "INVOICE" ? "还没有发票" : "财务仓库还是空的"}
            description={query ? "换一个标题或商家关键词试试。" : "上传第一份发票或购买记录表，并补充商家、金额和日期，后续查账会轻松很多。"}
            action={!query ? <button className="button primary" onClick={() => openUpload(kind === "PURCHASE" ? "PURCHASE" : "INVOICE")}><Upload size={15} />上传第一份文档</button> : undefined}
          />
        )}
      </section>

      <Modal open={uploadOpen} title={uploadKind === "INVOICE" ? "上传发票或凭证" : "上传购买记录 Excel"} onClose={() => setUploadOpen(false)}>
        <form onSubmit={upload}>
          <div className="segmented" style={{ marginBottom: 16 }}>
            <button type="button" className={uploadKind === "INVOICE" ? "active" : ""} onClick={() => { setUploadKind("INVOICE"); setFileName(""); }}>发票</button>
            <button type="button" className={uploadKind === "PURCHASE" ? "active" : ""} onClick={() => { setUploadKind("PURCHASE"); setFileName(""); }}>购买记录 Excel</button>
          </div>
          <div className="form-grid">
            <div className="field span-2">
              <label>{uploadKind === "INVOICE" ? "发票文件" : "Excel 文件"}</label>
              <label className="file-drop">
                <input type="file" name="file" accept={uploadKind === "INVOICE" ? ".pdf,.png,.jpg,.jpeg,.webp" : ".xlsx"} required onChange={(event) => setFileName(event.target.files?.[0]?.name || "")} />
                {uploadKind === "INVOICE" ? <FileImage size={22} /> : <FileSpreadsheet size={22} />}
                <strong>{fileName || (uploadKind === "INVOICE" ? "选择 PDF 或图片发票" : "选择 .xlsx 购买记录")}</strong>
                <span>{uploadKind === "INVOICE" ? "PDF / PNG / JPEG / WebP，最大 25 MiB" : "仅支持无宏的 .xlsx，最大 50 MiB"}</span>
              </label>
            </div>
            <div className="field span-2"><label htmlFor="finance-title">文档名称</label><input className="input" id="finance-title" name="title" placeholder={uploadKind === "INVOICE" ? "例如：麦克纳姆轮采购发票" : "例如：2026 赛季 7 月采购记录"} required /></div>
            <div className="field"><label htmlFor="vendor">商家</label><input className="input" id="vendor" name="vendor" placeholder="商家或供应商" /></div>
            <div className="field"><label htmlFor="amount">总金额（人民币）</label><input className="input mono" id="amount" name="amount" type="number" min="0" step="0.01" placeholder="0.00" /></div>
            <div className="field span-2"><label htmlFor="document-date">单据日期</label><input className="input" id="document-date" name="documentDate" type="date" /></div>
            <div className="field span-2"><label htmlFor="finance-notes">备注（可选）</label><textarea className="textarea" id="finance-notes" name="notes" placeholder="关联机器人模块、报销状态或其他说明。" /></div>
          </div>
          {uploadError ? <div className="alert error" style={{ marginTop: 14 }}>{uploadError}</div> : null}
          <div className="form-actions"><button className="button" type="button" onClick={() => setUploadOpen(false)}>取消</button><button className="button primary" disabled={uploading}>{uploading ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}{uploading ? "正在上传" : "保存到仓库"}</button></div>
        </form>
      </Modal>
    </>
  );
}

function RepoStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="repo-stat"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>;
}
