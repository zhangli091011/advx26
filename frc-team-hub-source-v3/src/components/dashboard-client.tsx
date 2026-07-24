"use client";

import {
  ArrowRight,
  Box,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Play,
  Square,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClockDialog } from "@/components/clock-dialog";
import { LoadingPanel, PageHeader, fetchJson } from "@/components/ui";
import { formatDateTime, formatSeconds } from "@/lib/format";

type DashboardData = {
  user: { displayName: string };
  serverNow: number;
  current: { id: string; clock_in_at: number; plan_task: string } | null;
  summary: {
    todaySeconds: number;
    weekSeconds: number;
    totalSeconds: number;
    tasks: number;
    rank: number;
    memberCount: number;
  };
  topThree: Array<{ rank: number; id: string; displayName: string; totalSeconds: number }>;
  recentDrawings: Array<Record<string, string | number | null>>;
  recentReports: Array<Record<string, string | number | null>>;
};

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setError("");
      setData(await fetchJson<DashboardData>("/api/dashboard"));
      setTick(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法加载工作台");
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

  const hour = new Date().getHours();
  const greeting = hour < 11 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

  if (!data) {
    return (
      <>
        <PageHeader eyebrow="TEAM OVERVIEW" title="工作台正在同步" description="正在读取你的工时和赛队仓库状态。" />
        {error ? <div className="alert error">{error}</div> : <LoadingPanel />}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="TEAM OVERVIEW / 2026 SEASON"
        title={`${greeting}，${data.user.displayName}`}
        description="今天的制造、调试和整理都会在这里汇总。先把任务写清楚，再开始这一段工作。"
        action={<span className="status-chip active">系统状态 · 正常</span>}
      />

      <div className="dashboard-left">
          <section className="panel clock-panel">
            <div>
              <div className="status-line">
                <span className={`status-chip ${data.current ? "active" : ""}`}>
                  {data.current ? "WORKING / 工作中" : "STANDBY / 未上班"}
                </span>
                {data.current ? `开始于 ${formatDateTime(data.current.clock_in_at)}` : "等待今天的第一条任务"}
              </div>
              <h2>{data.current ? "任务正在推进" : "准备好开始了吗？"}</h2>
              <p>
                {data.current
                  ? data.current.plan_task
                  : "点击开始工作并填写本次计划；结束工作时需要填写实际完成内容，系统会自动累计有效工时。"}
              </p>
              {data.current ? <div className="clock-time">{formatSeconds(elapsed, true)}</div> : null}
            </div>
            <button
              className={`button large ${data.current ? "danger" : "primary"}`}
              type="button"
              onClick={() => setDialogOpen(true)}
            >
              {data.current ? <Square size={17} /> : <Play size={18} />}
              {data.current ? "结束工作" : "开始工作"}
            </button>
          </section>

          <div className="stats-grid">
            <StatCard icon={<Clock3 size={16} />} label="今日工时" value={formatSeconds(data.summary.todaySeconds + elapsed)} hint="含当前进行中" />
            <StatCard icon={<CalendarClock size={16} />} label="本周工时" value={formatSeconds(data.summary.weekSeconds + elapsed)} hint="周一至今天" />
            <StatCard icon={<Trophy size={16} />} label="本周排名" value={`#${data.summary.rank}`} hint={`共 ${data.summary.memberCount} 名成员`} />
            <StatCard icon={<CheckCircle2 size={16} />} label="完成任务" value={String(data.summary.tasks)} hint="累计打卡段数" />
          </div>

          <div className="dashboard-split">
            <section className="panel panel-pad">
              <div className="panel-heading">
                <div><h2>最近图纸</h2><p>新上传的 STEP 设计文件</p></div>
                <Link href="/drawings" className="button ghost">全部图纸 <ArrowRight size={14} /></Link>
              </div>
              {data.recentDrawings.length ? (
                <div className="compact-list">
                  {data.recentDrawings.map((item) => (
                    <Link href="/drawings" className="compact-row" key={String(item.id)}>
                      <span className="compact-icon"><Box size={16} /></span>
                      <span><strong>{String(item.title)}</strong><small>{String(item.part_number)} · REV {String(item.revision)}</small></span>
                      <time>{formatDateTime(Number(item.created_at))}</time>
                    </Link>
                  ))}
                </div>
              ) : (
                <RepositoryEmpty icon={<Box size={18} />} text="还没有图纸，上传第一个 STEP 文件" href="/drawings" />
              )}
            </section>

            <section className="panel panel-pad">
              <div className="panel-heading">
                <div><h2>最近报表</h2><p>发票与购买记录 Excel</p></div>
                <Link href="/reports" className="button ghost">全部报表 <ArrowRight size={14} /></Link>
              </div>
              {data.recentReports.length ? (
                <div className="compact-list">
                  {data.recentReports.map((item) => (
                    <Link href="/reports" className="compact-row" key={String(item.id)}>
                      <span className="compact-icon"><FileSpreadsheet size={16} /></span>
                      <span><strong>{String(item.title)}</strong><small>{item.kind === "INVOICE" ? "发票" : "购买记录"} · {String(item.vendor || "未填写商家")}</small></span>
                      <time>{formatDateTime(Number(item.created_at))}</time>
                    </Link>
                  ))}
                </div>
              ) : (
                <RepositoryEmpty icon={<FileSpreadsheet size={18} />} text="还没有报表，上传第一份发票或 Excel" href="/reports" />
              )}
            </section>
          </div>

          <section className="panel panel-pad">
            <div className="panel-heading">
              <div><h2>本周苦力榜 · TOP 3</h2><p>只统计已经完成的打卡记录</p></div>
              <Link href="/leaderboard" className="button ghost">查看完整榜单 <ArrowRight size={14} /></Link>
            </div>
            <div className="mini-ranking">
              {data.topThree.map((entry) => (
                <div className="mini-rank-row" key={entry.id}>
                  <span className={`rank-number rank-${entry.rank}`}>{entry.rank.toString().padStart(2, "0")}</span>
                  <strong>{entry.displayName}</strong>
                  <span className="mono">{formatSeconds(entry.totalSeconds)}</span>
                </div>
              ))}
            </div>
          </section>
      </div>

      <ClockDialog
        open={dialogOpen}
        working={Boolean(data.current)}
        onClose={() => setDialogOpen(false)}
        onSuccess={load}
      />
    </>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <article className="stat-card">
      <div className="stat-card-top"><span>{label}</span><span>{icon}</span></div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function RepositoryEmpty({ icon, text, href }: { icon: React.ReactNode; text: string; href: string }) {
  return (
    <Link href={href} className="repository-empty">
      <span>{icon}</span>
      <span>{text}</span>
      <ArrowRight size={14} />
    </Link>
  );
}
