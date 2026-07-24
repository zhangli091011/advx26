"use client";

import { Box, Database, Download, FileCog, HardDrive, LoaderCircle, Search, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingPanel, Modal, PageHeader, fetchJson } from "@/components/ui";
import { formatBytes, formatDateTime } from "@/lib/format";

type Drawing = {
  id: string;
  title: string;
  partNumber: string;
  subsystem: string;
  revision: string;
  description: string | null;
  originalName: string;
  sizeBytes: number;
  uploader: string;
  createdAt: number;
};

export function DrawingsClient() {
  const [items, setItems] = useState<Drawing[] | null>(null);
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [fileName, setFileName] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await fetchJson<{ items: Drawing[] }>(`/api/drawings?q=${encodeURIComponent(query)}`);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法加载图纸");
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData(event.currentTarget);
      await fetchJson("/api/drawings", { method: "POST", body: form });
      setUploadOpen(false);
      setFileName("");
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  const totalBytes = items?.reduce((sum, item) => sum + item.sizeBytes, 0) || 0;
  const subsystemCount = new Set(items?.map((item) => item.subsystem)).size;

  return (
    <>
      <PageHeader
        eyebrow="ENGINEERING REPOSITORY"
        title="STEP 图纸仓库"
        description="集中保存机器的 STEP 文件、零件编号、模块和版本。文件通过登录接口下载，不会直接暴露在公开静态目录。"
        action={<button className="button primary" onClick={() => setUploadOpen(true)}><Upload size={16} />上传图纸</button>}
      />

      <div className="repo-summary">
        <RepoStat icon={<Database size={17} />} label="文件总数" value={String(items?.length || 0)} />
        <RepoStat icon={<FileCog size={17} />} label="机器人模块" value={String(subsystemCount)} />
        <RepoStat icon={<HardDrive size={17} />} label="已用空间" value={formatBytes(totalBytes)} />
      </div>

      <section className="panel panel-pad" style={{ marginTop: 20 }}>
        <div className="toolbar">
          <div className="search-box">
            <Search size={16} />
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索图纸名称、编号或模块……" />
          </div>
          <div className="toolbar-group">
            <span className="status-chip"><Box size={13} /> STEP / STP</span>
            <span className="status-chip">MAX 100 MiB</span>
          </div>
        </div>

        {!items ? (
          error ? <div className="alert error">{error}</div> : <LoadingPanel />
        ) : items.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>图纸</th><th>零件编号</th><th>版本</th><th>模块</th><th>上传者</th><th>更新时间</th><th>大小</th><th /></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><span className="cell-primary">{item.title}</span><span className="cell-sub">{item.originalName}</span></td>
                    <td className="mono">{item.partNumber}</td>
                    <td><span className="status-chip">REV {item.revision}</span></td>
                    <td>{item.subsystem}</td>
                    <td>{item.uploader}</td>
                    <td className="mono">{formatDateTime(item.createdAt)}</td>
                    <td className="mono">{formatBytes(item.sizeBytes)}</td>
                    <td><a className="icon-button" href={`/api/drawings/${item.id}/download`} aria-label={`下载 ${item.title}`}><Download size={16} /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Box size={21} />}
            title={query ? "没有匹配的图纸" : "图纸仓库还是空的"}
            description={query ? "换一个名称、零件编号或模块关键词试试。" : "上传第一个 STEP 文件，为它填写零件编号、机器人模块和版本号。"}
            action={!query ? <button className="button primary" onClick={() => setUploadOpen(true)}><Upload size={15} />上传第一张图纸</button> : undefined}
          />
        )}
      </section>

      <Modal open={uploadOpen} title="上传 STEP 图纸" onClose={() => setUploadOpen(false)}>
        <form onSubmit={upload}>
          <div className="form-grid">
            <div className="field span-2">
              <label>STEP 文件</label>
              <label className="file-drop">
                <input
                  type="file"
                  name="file"
                  accept=".step,.stp"
                  required
                  onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
                />
                <Upload size={22} />
                <strong>{fileName || "点击选择 .step / .stp 文件"}</strong>
                <span>服务器会检查 ISO-10303-21 文件头，最大 100 MiB</span>
              </label>
            </div>
            <div className="field span-2"><label htmlFor="drawing-title">图纸名称</label><input className="input" id="drawing-title" name="title" placeholder="例如：升降机构总装" required /></div>
            <div className="field"><label htmlFor="part-number">零件编号</label><input className="input mono" id="part-number" name="partNumber" placeholder="INTAKE-ASM-001" required /></div>
            <div className="field"><label htmlFor="revision">版本号</label><input className="input mono" id="revision" name="revision" placeholder="A.02" required /></div>
            <div className="field span-2">
              <label htmlFor="subsystem">机器人模块</label>
              <select className="select" id="subsystem" name="subsystem" defaultValue="" required>
                <option value="" disabled>选择所属模块</option>
                <option>底盘 / Drivetrain</option><option>进料 / Intake</option><option>发射 / Shooter</option><option>升降 / Elevator</option><option>攀爬 / Climber</option><option>电控 / Electronics</option><option>其他 / Other</option>
              </select>
            </div>
            <div className="field span-2"><label htmlFor="drawing-description">变更说明（可选）</label><textarea className="textarea" id="drawing-description" name="description" placeholder="记录这一版调整了什么，以及需要评审的风险。" /></div>
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
