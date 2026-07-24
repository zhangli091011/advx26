"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/* ---------- shared shell for all PIT-OS sub-pages ---------- */

export function usePitClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return useMemo(
    () =>
      [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((n) => String(n).padStart(2, "0"))
        .join(":"),
    [now],
  );
}

const NAV_ITEMS = [
  { zh: "主控面板", en: "DASHBOARD", href: "/pit", icon: "dash" },
  { zh: "工具管理", en: "TOOLS", href: "/pit/tools", icon: "tool" },
  { zh: "零件库存", en: "PARTS", href: "/pit/parts", icon: "part" },
  { zh: "CAN 监控", en: "CAN BUS", href: "/pit/can", icon: "can" },
  { zh: "赛事信息", en: "MATCH", href: "/pit/match", icon: "match" },
  { zh: "电源控制", en: "POWER", href: "/pit/power", icon: "power" },
  { zh: "战队展示", en: "TEAM", href: "/pit/team", icon: "team" },
];

function NavIcon({ kind, active }: { kind: string; active: boolean }) {
  const c = active ? "var(--pit-accent)" : "var(--pit-text-2)";
  const rect = (x: number, y: number, w: number, h: number, rot = 0) => (
    <rect x={x} y={y} width={w} height={h} fill={c} transform={rot ? `rotate(${rot} ${x + w / 2} ${y + h / 2})` : undefined} />
  );
  const ring = (cx: number, cy: number, r: number) => (
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={2} />
  );
  return (
    <svg className="pit-nav-ico" viewBox="0 0 20 20" aria-hidden>
      {kind === "dash" && <>{rect(0, 0, 8, 8)}{rect(12, 0, 8, 8)}{rect(0, 12, 8, 8)}{rect(12, 12, 8, 8)}</>}
      {kind === "tool" && <>{rect(2, 8, 16, 4, -45)}{rect(8, 6, 4, 10, -45)}</>}
      {kind === "part" && <>{ring(10, 10, 6)}{rect(7, 7, 6, 6)}</>}
      {kind === "can" && <>{rect(1, 2, 18, 3)}{rect(1, 4, 3, 14)}{rect(16, 4, 3, 14)}{rect(1, 17, 18, 3)}</>}
      {kind === "match" && <>{rect(1, 1, 18, 10)}{rect(7, 14, 6, 3)}{rect(1, 8, 3, 6)}{rect(16, 8, 3, 6)}</>}
      {kind === "power" && <>{ring(10, 11, 7)}{rect(8, 0, 3, 10)}</>}
      {kind === "team" && <>{ring(4, 6, 3)}{ring(16, 6, 3)}{rect(1, 12, 6, 3)}{rect(13, 12, 6, 3)}</>}
    </svg>
  );
}

export function PitShell({
  title,
  active,
  children,
}: {
  title: string;
  active: number;
  children: React.ReactNode;
}) {
  const clock = usePitClock();
  return (
    <div className="pit-stage">
      <header className="pit-header center-title">
        <div className="pit-brand">FRC</div>
        <div className="pit-title">PIT-OS // {title}</div>
        <div className="pit-chips">
          <div className="pit-clock">{clock}</div>
        </div>
      </header>
      <nav className="pit-nav">
        {NAV_ITEMS.map((item, i) => (
          <Link key={item.en} href={item.href} className={`pit-nav-item ${i === active ? "active" : ""}`}>
            <NavIcon kind={item.icon} active={i === active} />
            <span>
              <span className="zh">{item.zh}</span>
              <br />
              <span className="en">{item.en}</span>
            </span>
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function Panel({
  x, y, w, h, title, en, children,
}: {
  x: number; y: number; w: number; h: number; title: string; en: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="pit-panel" style={{ left: x, top: y, width: w, height: h }}>
      <h2 className="pit-panel-title">{title}</h2>
      <span className="pit-panel-title-en" style={{ left: 29 + title.length * 17 + 20 }}>{en}</span>
      <div className="pit-panel-divider" />
      {children}
    </section>
  );
}
