"use client";

import { Panel, PitShell } from "@/components/pit/pit-shell";
import { StepViewer } from "@/components/pit/step-viewer";

function Unconfigured({ text }: { text: string }) {
  return <div style={{ position: "absolute", inset: "58px 24px 24px", display: "grid", placeItems: "center", color: "var(--pit-text-2)", fontSize: 14 }}>{text}</div>;
}

export function PitTeamClient() {
  return (
    <PitShell title="TEAM SHOWCASE" active={6}>
      <section className="pit-panel" style={{ left: 224, top: 96, width: 820, height: 940, position: "absolute" }}>
        <h1 className="pit-hero-num">----</h1>
        <h2 className="pit-hero-name">战队资料未配置</h2>
        <span className="pit-hero-en">TEAM PROFILE · NOT CONFIGURED</span>
        <div style={{ position: "absolute", left: 24, top: 480, width: 772, height: 300 }}>
          <StepViewer />
        </div>
        <span className="pit-hero-robot-lb">机器人资料未配置 · 可导入本地 STEP 文件预览</span>
        <span className="pit-hero-record">赛季战绩未配置</span>
      </section>
      <Panel x={1060} y={96} w={820} h={460} title="机器能力一览" en="ROBOT CAPABILITIES">
        <Unconfigured text="机器人能力资料未配置" />
      </Panel>
      <Panel x={1060} y={572} w={820} h={464} title="Pit Interview 展示流程" en="INTERVIEW SCRIPT">
        <Unconfigured text="展示流程未配置" />
      </Panel>
    </PitShell>
  );
}
