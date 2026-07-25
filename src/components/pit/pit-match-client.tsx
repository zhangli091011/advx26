"use client";

import { Panel, PitShell } from "@/components/pit/pit-shell";

function Unconfigured({ text }: { text: string }) {
  return (
    <div style={{ position: "absolute", inset: "58px 24px 24px", display: "grid", placeItems: "center", color: "var(--pit-text-2)", fontSize: 14 }}>
      {text}
    </div>
  );
}

export function PitMatchClient() {
  return (
    <PitShell title="MATCH CENTER" active={4}>
      <Panel x={224} y={96} w={820} h={280} title="实时比分" en="LIVE SCORE">
        <Unconfigured text="官方赛事 API 未配置" />
      </Panel>
      <Panel x={1060} y={96} w={820} h={280} title="我方下一场" en="OUR NEXT">
        <Unconfigured text="赛事与战队资料未配置" />
      </Panel>
      <Panel x={224} y={392} w={820} h={644} title="完整赛程" en="SCHEDULE">
        <Unconfigured text="赛事 API 未配置" />
      </Panel>
      <Panel x={1060} y={392} w={820} h={644} title="战略分析" en="STRATEGY">
        <Unconfigured text="战略分析服务未配置" />
      </Panel>
    </PitShell>
  );
}
