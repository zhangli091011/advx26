"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";

const SCHEDULE = [
  { m: "Q-36", t: "09:48", pos: "BLUE 2", res: "W 96-88", col: "var(--pit-ok)" },
  { m: "Q-38", t: "10:24", pos: "BLUE 1", res: "进行中", col: "var(--pit-accent)" },
  { m: "Q-40", t: "11:02", pos: "—", res: "—", col: "var(--pit-text-2)" },
  { m: "Q-42", t: "14:40", pos: "RED 2", res: "即将上场", col: "var(--pit-warn)", current: true },
  { m: "Q-47", t: "15:35", pos: "BLUE 3", res: "—", col: "var(--pit-text-2)" },
  { m: "Q-53", t: "16:50", pos: "待抽签", res: "—", col: "var(--pit-text-2)" },
  { m: "Q-58", t: "17:45", pos: "RED 1", res: "—", col: "var(--pit-text-2)" },
];

const INSIGHTS = [
  {
    who: "对手 #2333（蓝方）",
    txt: "近 3 场射手命中率 78% → 64%，呈下降趋势；攀爬成功率高（3/3）。建议：优先防守其射手位，逼迫其走低位得分。",
    col: "var(--pit-warn)",
  },
  {
    who: "盟友 #6666",
    txt: "进气速度快（场均 14 枚），但防守弱。建议我方承担主防守任务，让 #6666 专注得分循环。",
    col: "var(--pit-ok)",
  },
  {
    who: "我方数据",
    txt: "自动阶段命中率 92%（高于赛事均值 71%）。建议 Q-42 继续执行 A-3 自动程序。",
    col: "var(--pit-accent)",
  },
];

const SCH_COLS = [
  { label: "场次", x: 24 }, { label: "时间", x: 138 }, { label: "站位", x: 258 }, { label: "结果/状态", x: 428 },
];

export function PitMatchClient() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const countdown = useMemo(() => {
    const target = new Date(now);
    target.setHours(14, 40, 0, 0);
    let diff = Math.floor((target.getTime() - now.getTime()) / 1000);
    if (diff < 0 || diff > 2 * 3600) diff = 8 * 60 + 47;
    const mm = String(Math.floor(diff / 60)).padStart(2, "0");
    const ss = String(diff % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [now]);

  return (
    <PitShell title="MATCH CENTER" active={4}>
      {/* 实时比分 */}
      <Panel x={224} y={96} w={820} h={280} title="实时比分" en="LIVE · Q-38">
        <span className="pit-score-tag" style={{ left: 47, color: "var(--pit-red)" }}>RED</span>
        <span className="pit-score" style={{ left: 39, color: "var(--pit-red)" }}>128</span>
        <span className="pit-score-tag" style={{ left: 279, color: "var(--pit-blue)" }}>BLUE</span>
        <span className="pit-score" style={{ left: 279, color: "var(--pit-blue)" }}>121</span>
        {[["AUTO", true], ["TELEOP", true], ["ENDGAME", false]].map(([ph, done], i) => (
          <span key={ph as string}>
            <span className="pit-phase" style={{ left: 559 + i * 84, color: done ? "var(--pit-ok)" : "var(--pit-text-2)" }}>{ph}</span>
            <span className="pit-phase-bar" style={{ left: 559 + i * 84, background: done ? "var(--pit-ok)" : "var(--pit-line)" }} />
          </span>
        ))}
        <span className="pit-live-time">剩余 0:42</span>
        <div className="pit-bar" style={{ left: 31, top: 209, width: 756, height: 6 }}>
          <i style={{ width: "72%", background: "var(--pit-accent)" }} />
        </div>
        <span className="pit-live-note">TELEOP · 比赛进行中 · 数据来源：官方赛事 API（10s 刷新）</span>
      </Panel>

      {/* 我方下一场 */}
      <Panel x={1060} y={96} w={820} h={280} title="我方下一场" en="OUR NEXT · Q-42">
        <span className="pit-next-cd">{countdown}</span>
        <span className="pit-next-cd-lb">上场倒计时</span>
        <div className="pit-ally-box" style={{ left: 379, background: "rgba(242,77,64,0.1)", border: "1px solid rgba(242,77,64,0.6)" }}>
          <strong style={{ color: "var(--pit-red)" }}>RED（我方）</strong>
          <span className="teams">8888 · 6666 · 2333</span>
          <span className="pos">红方 2 号位</span>
        </div>
        <div className="pit-ally-box" style={{ left: 595, background: "rgba(64,140,255,0.1)", border: "1px solid rgba(64,140,255,0.6)" }}>
          <strong style={{ color: "var(--pit-blue)" }}>BLUE</strong>
          <span className="teams">1234 · 5678 · 9012</span>
          <span className="pos">蓝方 1 号位</span>
        </div>
        <span className="pit-next-check">✓ 上场检查：电池 100% · 保险杠红色 · 攀爬机构待修复 ⚠</span>
      </Panel>

      {/* 完整赛程 */}
      <Panel x={224} y={392} w={820} h={644} title="完整赛程" en="SCHEDULE · QUALIFICATION">
        <div className="pit-th-bg" style={{ top: 59, height: 32 }} />
        {SCH_COLS.map((c) => (
          <span key={c.label} className="pit-th" style={{ left: c.x, top: 68 }}>{c.label}</span>
        ))}
        {SCHEDULE.map((s, i) => (
          <div key={s.m} className={`pit-sch2-row ${s.current ? "current" : ""}`} style={{ top: 97 + i * 68 }}>
            <span className="pit-td tech" style={{ left: 24, top: 19, fontSize: 16, color: s.current ? "var(--pit-accent)" : "var(--pit-text)" }}>{s.m}</span>
            <span className="pit-td tech dim" style={{ left: 138, top: 21 }}>{s.t}</span>
            <span className="pit-td tech" style={{ left: 258, top: 21, color: s.pos.startsWith("RED") ? "var(--pit-red)" : s.pos.startsWith("BLUE") ? "var(--pit-blue)" : "var(--pit-text-2)", fontSize: 14 }}>{s.pos}</span>
            <span className="pit-td" style={{ left: 428, top: 20, color: s.col }}>{s.res}</span>
          </div>
        ))}
        <span style={{ position: "absolute", left: 23, bottom: 24, color: "var(--pit-text-2)", fontSize: 13 }}>
          当前排名：#7 / 38 队 · RP 2.1 · 预计晋级线 RP 1.8
        </span>
      </Panel>

      {/* AI 云端战略分析 */}
      <Panel x={1060} y={392} w={820} h={644} title="AI 云端战略分析" en="AI STRATEGY · CLOUD">
        <div className="pit-perm">权限：全体队员</div>
        {INSIGHTS.map((ins, i) => (
          <div key={ins.who} className="pit-ai-card" style={{ top: 63 + i * 134, ["--ai-col" as string]: ins.col }}>
            <h4>{ins.who}</h4>
            <p>{ins.txt}</p>
          </div>
        ))}
        <div className="pit-scout-box" style={{ top: 471 }}>
          ＋ 手机端采集：拍照上传对手机器人 → 云端 AI 自动识别机构并更新分析
        </div>
        <span className="pit-ai-src">DATA: TBA API + SCOUTING APP · UPDATED 14:30 · MODEL v3</span>
      </Panel>
    </PitShell>
  );
}
