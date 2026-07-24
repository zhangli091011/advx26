"use client";

import { LoaderCircle, Play, Square } from "lucide-react";
import { useState } from "react";
import { Modal, fetchJson } from "@/components/ui";

export function ClockDialog({
  open,
  working,
  onClose,
  onSuccess,
}: {
  open: boolean;
  working: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [task, setTask] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await fetchJson("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: working ? "clock-out" : "clock-in", task }),
      });
      setTask("");
      await onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title={working ? "结束本次工作" : "开始本次工作"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="clock-task">{working ? "这次完成了什么？" : "这次准备完成什么？"}</label>
          <textarea
            id="clock-task"
            className="textarea"
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder={
              working
                ? "例如：完成升降机构装配，重新标注两处孔位，并记录干涉问题……"
                : "例如：完成升降机构第二版 CAD 并检查装配干涉……"
            }
            autoFocus
            required
            minLength={2}
            maxLength={working ? 4000 : 2000}
          />
          <span className="field-hint">任务内容会进入工时记录；上下班时间以服务器时间为准。</span>
        </div>
        {error ? <div className="alert error" style={{ marginTop: 14 }}>{error}</div> : null}
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose}>取消</button>
          <button className={`button ${working ? "danger" : "primary"}`} type="submit" disabled={submitting}>
            {submitting ? <LoaderCircle size={16} className="spin" /> : working ? <Square size={15} /> : <Play size={16} />}
            {submitting ? "正在提交" : working ? "确认下班" : "确认上班"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
