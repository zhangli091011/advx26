"use client";

import { Award, Crown, Medal, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Avatar, LoadingPanel, PageHeader, fetchJson } from "@/components/ui";
import { formatSeconds, roleLabel } from "@/lib/format";

type LeaderboardEntry = {
  rank: number;
  id: string;
  displayName: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  totalSeconds: number;
  tasks: number;
};

type LeaderboardData = {
  period: string;
  currentUserId: string;
  entries: LeaderboardEntry[];
};

const periods = [
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "all", label: "本赛季" },
];

export function LeaderboardClient() {
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setData(await fetchJson<LeaderboardData>(`/api/leaderboard?period=${period}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法加载排行榜");
    }
  }, [period]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <>
      <PageHeader
        eyebrow="CONTRIBUTION INDEX"
        title="苦力排行榜"
        description="用一点赛队内部玩笑记录真实贡献。榜单只统计已经下班的有效工时，不鼓励为了排名无意义地刷时长。"
        action={
          <div className="segmented">
            {periods.map((item) => (
              <button key={item.value} className={period === item.value ? "active" : ""} onClick={() => setPeriod(item.value)}>{item.label}</button>
            ))}
          </div>
        }
      />

      {!data ? (
        error ? <div className="alert error">{error}</div> : <LoadingPanel />
      ) : (
        <>
          <div className="podium-grid">
            {data.entries.slice(0, 3).map((entry) => (
              <PodiumCard key={entry.id} entry={entry} current={entry.id === data.currentUserId} />
            ))}
          </div>

          <section className="panel panel-pad leaderboard-table" style={{ marginTop: 20 }}>
            <div className="panel-heading">
              <div><h2>完整排名</h2><p>按有效工时排序，相同时按昵称排序</p></div>
              <span className="status-chip"><Trophy size={13} /> {data.entries.length} MEMBERS</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>排名</th><th>成员</th><th>身份</th><th>完成任务</th><th>累计工时</th><th>贡献进度</th></tr></thead>
                <tbody>
                  {data.entries.map((entry) => {
                    const max = data.entries[0]?.totalSeconds || 1;
                    return (
                      <tr key={entry.id} className={entry.id === data.currentUserId ? "current-user-row" : ""}>
                        <td><span className={`rank-number rank-${entry.rank}`}>{entry.rank.toString().padStart(2, "0")}</span></td>
                        <td>
                          <div className="member-cell">
                            <Avatar name={entry.displayName} src={entry.avatarUrl} />
                            <span><strong>{entry.displayName}</strong><small>@{entry.username}{entry.id === data.currentUserId ? " · 你" : ""}</small></span>
                          </div>
                        </td>
                        <td><span className="status-chip">{roleLabel(entry.role)}</span></td>
                        <td className="mono">{entry.tasks}</td>
                        <td className="mono cell-primary">{formatSeconds(entry.totalSeconds)}</td>
                        <td><div className="progress-line"><span style={{ width: `${Math.max(2, (entry.totalSeconds / max) * 100)}%` }} /></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function PodiumCard({ entry, current }: { entry: LeaderboardEntry; current: boolean }) {
  const Icon = entry.rank === 1 ? Crown : entry.rank === 2 ? Medal : Award;
  return (
    <article className={`panel podium-card podium-${entry.rank} ${current ? "current" : ""}`}>
      <div className="podium-index mono">RANK / {entry.rank.toString().padStart(2, "0")}</div>
      <Icon size={24} strokeWidth={1.5} />
      <Avatar name={entry.displayName} src={entry.avatarUrl} className="podium-avatar" />
      <h2>{entry.displayName}</h2>
      <p>{roleLabel(entry.role)}{current ? " · 你" : ""}</p>
      <strong className="podium-time">{formatSeconds(entry.totalSeconds)}</strong>
      <span>{entry.tasks} 条已完成任务</span>
    </article>
  );
}
