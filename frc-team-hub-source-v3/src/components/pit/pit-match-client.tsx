"use client";

import { useEffect, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import { useMatchData } from "@/components/pit/use-match-data";
import type { PitMatch } from "@/lib/match-data";

function includesTeam(match: PitMatch, teamNumber: number) {
  return match.red.teams.includes(teamNumber) || match.blue.teams.includes(teamNumber);
}

function allianceText(teams: number[]) {
  return teams.join(" · ");
}

function matchTime(match: PitMatch) {
  const timestamp = match.actualTime ?? match.estimatedTime;
  return timestamp ? new Date(timestamp * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "待定";
}

function Empty({ text }: { text: string }) {
  return <div className="pit-match-empty">{text}</div>;
}

function ScoreCard({ match }: { match: PitMatch }) {
  return (
    <div className="pit-live-score-card">
      <div className="pit-live-score-meta"><strong>{match.label}</strong><span>{matchTime(match)}</span></div>
      <div className="pit-live-score-side red"><span>RED</span><strong>{match.red.score ?? "—"}</strong><small>{allianceText(match.red.teams)}</small></div>
      <div className="pit-live-score-vs">FINAL</div>
      <div className="pit-live-score-side blue"><span>BLUE</span><strong>{match.blue.score ?? "—"}</strong><small>{allianceText(match.blue.teams)}</small></div>
    </div>
  );
}

function NextMatch({ match, now, teamNumber, teamName }: { match: PitMatch; now: number; teamNumber: number; teamName: string }) {
  const timestamp = match.estimatedTime;
  const remaining = timestamp ? Math.max(0, timestamp * 1000 - now) : null;
  const minutes = remaining === null ? "--:--" : `${String(Math.floor(remaining / 60_000)).padStart(2, "0")}:${String(Math.floor(remaining % 60_000 / 1000)).padStart(2, "0")}`;
  const oursRed = match.red.teams.includes(teamNumber);
  return (
    <div className="pit-next-match-card">
      <div className="pit-next-match-id"><span>TEAM {teamNumber} NEXT</span><strong>{match.label}</strong><small>{teamName ? `${teamName} · ` : ""}{matchTime(match)} 预计开始</small></div>
      <div className={`pit-next-alliance ${oursRed ? "red" : "blue"}`}>
        <span>{oursRed ? "RED ALLIANCE" : "BLUE ALLIANCE"}</span>
        <strong>{allianceText(oursRed ? match.red.teams : match.blue.teams)}</strong>
      </div>
      <div className="pit-next-clock"><span>COUNTDOWN</span><strong>{minutes}</strong></div>
    </div>
  );
}

export function PitMatchClient() {
  const { data, error, loading, refresh } = useMatchData();
  const [now, setNow] = useState(0);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const played = data?.matches.filter((match) => match.played) ?? [];
  const latest = played.at(-1) ?? null;
  const teamNumber = data?.teamNumber ?? 8214;
  const next = data?.matches.find((match) => includesTeam(match, teamNumber) && !match.played && match.estimatedTime !== null) ?? null;
  const teamRank = data?.rankings.find((ranking) => ranking.team === teamNumber) ?? null;

  return (
    <PitShell title="MATCH CENTER" active={4}>
      <div className="pit-match-source">
        <span className={error ? "degraded" : "online"} />
        {data ? `${data.event.name} · ${data.event.key}` : loading ? "正在连接赛事数据源" : "赛事数据不可用"}
        <button type="button" onClick={() => void refresh()}>刷新</button>
      </div>
      <Panel x={224} y={96} w={820} h={280} title="最近比分" en="LATEST SCORE">
        {latest ? <ScoreCard match={latest} /> : <Empty text={loading ? "正在加载真实比分…" : error ?? "暂无已完成场次"} />}
      </Panel>
      <Panel x={1060} y={96} w={820} h={280} title="我方下一场" en="OUR NEXT">
        {next ? <NextMatch match={next} now={now} teamNumber={teamNumber} teamName={data?.teamName ?? ""} /> : <Empty text={loading ? "正在加载我方赛程…" : data ? `TEAM ${teamNumber} 当前赛事没有未完成场次` : error ?? "暂无赛事数据"} />}
      </Panel>
      <Panel x={224} y={392} w={820} h={644} title="完整赛程" en="SCHEDULE">
        {data?.matches.length ? (
          <div className="pit-match-schedule">
            <div className="pit-match-table-head"><span>场次</span><span>时间</span><span>红方</span><span>比分</span><span>蓝方</span></div>
            {data.matches.map((match) => (
              <div key={match.key} className={`pit-match-table-row ${includesTeam(match, teamNumber) ? "ours" : ""}`}>
                <strong>{match.label}</strong><time>{matchTime(match)}</time>
                <span className="red">{allianceText(match.red.teams)}</span>
                <b>{match.played ? `${match.red.score} : ${match.blue.score}` : "— : —"}</b>
                <span className="blue">{allianceText(match.blue.teams)}</span>
              </div>
            ))}
          </div>
        ) : <Empty text={loading ? "正在加载完整赛程…" : error ?? "暂无赛程"} />}
      </Panel>
      <Panel x={1060} y={392} w={820} h={644} title="赛区排名" en="RANKINGS">
        {data?.rankings.length ? (
          <div className="pit-match-rankings">
            {teamRank ? <div className="pit-own-rank"><span>TEAM {teamNumber}{data.teamName ? ` · ${data.teamName}` : ""}</span><strong>#{teamRank.rank}</strong><small>{teamRank.wins}-{teamRank.losses}-{teamRank.ties} · RS {teamRank.rankingScore?.toFixed(2) ?? "—"}</small></div> : <div className="pit-own-rank missing"><span>TEAM {teamNumber}{data.teamName ? ` · ${data.teamName}` : ""}</span><strong>—</strong><small>当前排名中未找到该赛队</small></div>}
            <div className="pit-rank-head"><span>#</span><span>TEAM</span><span>W-L-T</span><span>RS</span></div>
            {data.rankings.map((ranking) => (
              <div key={ranking.team} className={`pit-rank-row ${ranking.team === teamNumber ? "ours" : ""}`}>
                <strong>{ranking.rank}</strong><span>{ranking.team}</span><span>{ranking.wins}-{ranking.losses}-{ranking.ties}</span><span>{ranking.rankingScore?.toFixed(2) ?? "—"}</span>
              </div>
            ))}
          </div>
        ) : <Empty text={loading ? "正在加载排名…" : error ?? "暂无排名数据"} />}
      </Panel>
    </PitShell>
  );
}
