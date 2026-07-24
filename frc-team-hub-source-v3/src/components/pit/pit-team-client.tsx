"use client";

import { useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";

const CAPS = [
  { t: "自动阶段", d: "A-3 程序 · 3 枚得分 · 命中率 92%", col: "var(--pit-accent)" },
  { t: "得分循环", d: "场均 14.2 枚 · 最快循环 6.8s", col: "var(--pit-ok)" },
  { t: "射手系统", d: "双飞轮 · 射程 2.2-5.5m · 自适应调速", col: "var(--pit-ok)" },
  { t: "攀爬", d: "Level 2 · 成功率 86%（当前待修复 ⚠）", col: "var(--pit-err)", alert: true },
  { t: "防守", d: "低重心底盘 · 抗撞强化保险杠", col: "var(--pit-text-2)" },
];

const STEPS = [
  { num: "01", t: "开场介绍", d: "队号 · 队名 · 学校 · 建队年份", dur: "30s", done: true },
  { num: "02", t: "机器展示", d: "三大机构讲解 + 现场演示得分循环", dur: "2min", done: true },
  { num: "03", t: "技术亮点", d: "自适应射手调速 · 快拆机构 · 智能工具箱（指屏幕）", dur: "1min", done: true },
  { num: "04", t: "团队文化", d: "分工 · 赞助商 · 社区活动", dur: "1min", done: false },
  { num: "05", t: "Q&A", d: "评委提问 · 记录反馈", dur: "—", done: false },
];

export function PitTeamClient() {
  const [steps, setSteps] = useState(STEPS);

  return (
    <PitShell title="TEAM SHOWCASE" active={6}>
      {/* 形象墙 */}
      <section className="pit-panel" style={{ left: 224, top: 96, width: 820, height: 940 }}>
        <h1 className="pit-hero-num">8888</h1>
        <h2 className="pit-hero-name">星火机器人队</h2>
        <span className="pit-hero-en">SPARK ROBOTICS · SHANGHAI</span>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="pit-hero-stripe" style={{ left: 58 + i * 8, top: 410 + i * 16, background: `rgba(255,199,0,${0.9 - i * 0.2})` }} />
        ))}
        {/* 机器人线框（按 Figma 矢量还原的等距视图） */}
        <svg style={{ position: "absolute", left: 180, top: 540 }} width="440" height="220" viewBox="0 0 440 220" aria-hidden>
          <g stroke="var(--pit-accent)" strokeWidth="2" fill="none">
            <path d="M0 60 L140 0 L440 0 L300 60 Z" />
            <path d="M0 60 L0 180 L300 180 L300 60" />
            <path d="M300 60 L440 0 L440 120 L300 180" />
            <path d="M340 70 L400 35" />
          </g>
          <path d="M60 100 L240 100 L240 150 L60 150 Z" stroke="var(--pit-text-2)" strokeWidth="1.5" fill="none" />
          <g stroke="var(--pit-accent)" strokeWidth="2.5" fill="none">
            <circle cx="50" cy="185" r="28" />
            <circle cx="150" cy="185" r="28" />
            <circle cx="250" cy="185" r="28" />
          </g>
          <g stroke="var(--pit-text-2)" strokeWidth="1.5" fill="none">
            <circle cx="50" cy="185" r="12" />
            <circle cx="150" cy="185" r="12" />
            <circle cx="250" cy="185" r="12" />
          </g>
        </svg>
        <span className="pit-hero-robot-lb">2026 ROBOT · 「SPARK-III」</span>
        <span className="pit-hero-record">本赛季战绩：资格赛 5 胜 2 负 · 当前排名 #7 · 最佳单场 156 分</span>
      </section>

      {/* 机器能力 */}
      <Panel x={1060} y={96} w={820} h={460} title="机器能力一览" en="ROBOT CAPABILITIES">
        {CAPS.map((c, i) => (
          <div key={c.t} className="pit-cap-row" style={{ top: 63 + i * 78, ["--cap-col" as string]: c.col }}>
            <span className="t" style={{ color: c.alert ? "var(--pit-err)" : "var(--pit-text)" }}>{c.t}</span>
            <span className="d">{c.d}</span>
          </div>
        ))}
      </Panel>

      {/* Pit Interview 流程 */}
      <Panel x={1060} y={572} w={820} h={464} title="Pit Interview 展示流程" en="INTERVIEW SCRIPT">
        {steps.map((s, i) => (
          <button
            key={s.num}
            type="button"
            className={`pit-itv-row ${s.done ? "" : "todo"}`}
            style={{ top: 63 + i * 74 }}
            onClick={() => setSteps((prev) => prev.map((p, j) => (j === i ? { ...p, done: !p.done } : p)))}
          >
            <span className="pit-itv-num" style={{ color: s.done ? "var(--pit-accent)" : "var(--pit-text-2)" }}>{s.num}</span>
            <span className="t">{s.t}</span>
            <span className="d">{s.d}</span>
            <span className="pit-itv-dur">{s.dur}</span>
            <span className={`pit-itv-check ${s.done ? "done" : ""}`}>{s.done ? "✓" : ""}</span>
          </button>
        ))}
      </Panel>
    </PitShell>
  );
}
