"use client";

import { CalendarDays, Clock3, ListChecks, Play, Square, TimerReset } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ClockDialog } from "@/components/clock-dialog";
import { LoadingPanel, PageHeader, fetchJson } from "@/components/ui";
import { formatDateTime, formatSeconds } from "@/lib/format";

type WorkRecord = {
  id: string;
  clock_in_at: number;
  plan_task: string;
  clock_out_at: number | null;
  completed_task: string | null;
  duration_seconds: number | null;
};

type AttendanceData = {
  current: WorkRecord | null;
  records: WorkRecord[];
  summary: {
    todaySeconds: number;
    weekSeconds: number;
    monthSeconds: number;
    allSeconds: number;
    currentSeconds: number;
  };
  weeklyBars: Array<{ start: number; seconds: number }>;
};

export function AttendanceClient() {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setError("");
      setData(await fetchJson<AttendanceData>("/api/attendance"));
      setTick(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法加载工时记录");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = data?.current
    ? Math.max(0, Math.floor((tick - data.current.clock_in_at) / 1000))
    : 0;
  const maxBar = Math.max(1, ...(data?.weeklyBars.map((bar) => bar.seconds) || [1]));

  if (!data) {
    return (
      <>
        <PageHeader eyebrow="TIMEKEEPING" title="打卡与工时" description="正在同步你的工时记录。" />
        {error ? <div className="alert error">{error}</div> : <LoadingPanel />}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="TIMEKEEPING / SERVER CLOCK"
        title="打卡与工时"
        description="每一次上班都写清计划，每一次下班都留下完成结果。支持一天多段工作，工时由服务器自动累计。"
        action={
          <button className={`button ${data.current ? "danger" : "primary"}`} onClick={() => setDialogOpen(true)}>
            {data.current ? <Square size={16} /> : <Play size={17} />}
            {data.current ? "结束工作" : "开始工作"}
          </button>
        }
      />

      <section className="panel attendance-status">
        <div>
          <span className={`status-chip ${data.current ? "active" : ""}`}>
            {data.current ? "WORK SESSION ACTIVE" : "NO ACTIVE SESSION"}
          </span>
          <h2>{data.current ? formatSeconds(elapsed, true) : "00:00:00"}</h2>
          <p>{data.current ? data.current.plan_task : "当前没有进行中的任务。开始工作后，计时器会持续运行，即使关闭浏览器也不会自动下班。"}</p>
        </div>
        <div className="status-deco mono">
          <span>TIME SOURCE</span>
          <strong>SERVER / UTC+8</strong>
          <small>{data.current ? `IN ${formatDateTime(data.current.clock_in_at)}` : "READY"}</small>
        </div>
      </section>

      <div className="stats-grid attendance-stats">
        <TimeStat icon={<Clock3 size={16} />} label="今日累计" value={data.summary.todaySeconds + elapsed} />
        <TimeStat icon={<CalendarDays size={16} />} label="本周累计" value={data.summary.weekSeconds + elapsed} />
        <TimeStat icon={<TimerReset size={16} />} label="本月累计" value={data.summary.monthSeconds + elapsed} />
        <TimeStat icon={<ListChecks size={16} />} label="赛季累计" value={data.summary.allSeconds + elapsed} />
      </div>

      <div className="attendance-layout">
        <section className="panel panel-pad">
          <div className="panel-heading">
            <div><h2>最近七天工时</h2><p>已完成的打卡段，不含当前进行中</p></div>
            <span className="status-chip">7 DAYS</span>
          </div>
          <div className="bar-chart">
            {data.weeklyBars.map((bar) => {
              const label = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(new Date(bar.start));
              const height = Math.max(4, (bar.seconds / maxBar) * 100);
              return (
                <div className="bar-column" key={bar.start}>
                  <span className="bar-value mono">{bar.seconds ? formatSeconds(bar.seconds) : "—"}</span>
                  <div className="bar-track"><span style={{ height: `${height}%` }} /></div>
                  <strong>{label}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel panel-pad contribution-note">
          <div className="eyebrow">WORK NOTE</div>
          <h2>记录不是为了卷工时，<br />而是为了让协作可追踪。</h2>
          <p>排行榜只统计已经结束的打卡。忘记下班不会立即进入排名；如果出现异常超长记录，管理员可以在后续版本中进行审计和修正。</p>
          <div className="note-grid">
            <span><strong>{data.records.length}</strong><small>最近记录</small></span>
            <span><strong>{formatSeconds(data.summary.allSeconds)}</strong><small>有效总工时</small></span>
          </div>
        </section>
      </div>

      <section className="panel panel-pad" style={{ marginTop: 20 }}>
        <div className="panel-heading">
          <div><h2>工时记录</h2><p>最近 40 条个人打卡</p></div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>开始时间</th><th>计划任务</th><th>完成任务</th><th>结束时间</th><th>时长</th><th>状态</th></tr></thead>
            <tbody>
              {data.records.map((record) => (
                <tr key={record.id}>
                  <td className="mono">{formatDateTime(record.clock_in_at)}</td>
                  <td><span className="cell-primary task-cell">{record.plan_task}</span></td>
                  <td><span className="task-cell">{record.completed_task || "—"}</span></td>
                  <td className="mono">{record.clock_out_at ? formatDateTime(record.clock_out_at) : "—"}</td>
                  <td className="mono">{record.duration_seconds === null ? formatSeconds(elapsed) : formatSeconds(record.duration_seconds)}</td>
                  <td><span className={`status-chip ${record.clock_out_at ? "" : "active"}`}>{record.clock_out_at ? "已完成" : "工作中"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ClockDialog open={dialogOpen} working={Boolean(data.current)} onClose={() => setDialogOpen(false)} onSuccess={load} />
    </>
  );
}

function TimeStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <article className="stat-card">
      <div className="stat-card-top"><span>{label}</span>{icon}</div>
      <strong>{formatSeconds(value)}</strong>
      <small>有效工作时间</small>
    </article>
  );
}
