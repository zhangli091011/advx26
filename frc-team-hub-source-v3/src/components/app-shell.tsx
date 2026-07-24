"use client";

import {
  Bell,
  Box,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  ScanSearch,
  Trophy,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionUser } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { Avatar } from "@/components/ui";

const navItems = [
  { href: "/", label: "工作台", icon: LayoutDashboard },
  { href: "/hardware-scanner", label: "AI 硬件识别", icon: ScanSearch },
  { href: "/attendance", label: "打卡与工时", icon: Clock3 },
  { href: "/leaderboard", label: "苦力排行榜", icon: Trophy },
  { href: "/drawings", label: "图纸仓库", icon: Box },
  { href: "/reports", label: "报表仓库", icon: ReceiptText },
  { href: "/profile", label: "个人资料", icon: UserRound },
];

function routeTitle(pathname: string) {
  return navItems.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  )?.label;
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const time = useMemo(
    () => now
      ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now)
      : "--:--:--",
    [now],
  );
  const date = useMemo(
    () => now
      ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(now)
      : "时间同步中",
    [now],
  );

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <div className={`mobile-overlay ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <Link href="/" className="brand" aria-label="NEXUS 工作台首页">
          <span className="brand-mark">NX</span>
          <span className="brand-copy">
            <strong>NEXUS // FRC</strong>
            <span>TEAM OPERATIONS SYSTEM</span>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="主导航">
          <div className="nav-label">Operations</div>
          {navItems.slice(0, 4).map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={`nav-item ${active ? "active" : ""}`}>
                <Icon size={17} strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
          <div className="nav-label">Repositories</div>
          {navItems.slice(4, 6).map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={`nav-item ${active ? "active" : ""}`}>
                <Icon size={17} strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
          <div className="nav-label">Account</div>
          {navItems.slice(6).map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={`nav-item ${active ? "active" : ""}`}>
                <Icon size={17} strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <Avatar name={user.displayName} src={user.avatarUrl} />
          <Link href="/profile" className="sidebar-user-copy">
            <strong>{user.displayName}</strong>
            <span>{roleLabel(user.role)}</span>
          </Link>
          <button
            className="icon-button"
            type="button"
            onClick={logout}
            disabled={loggingOut}
            aria-label="退出登录"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="icon-button mobile-menu"
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="打开导航"
            >
              <Menu size={19} />
            </button>
            <span className="pulse-dot" />
            <span>{routeTitle(pathname) || "工作台"}</span>
            <span style={{ color: "#4e5d69" }}>/</span>
            <span style={{ color: "#71808d" }}>系统在线</span>
          </div>
          <div className="topbar-meta">
            <button className="icon-button" type="button" aria-label="通知">
              <Bell size={17} />
            </button>
            <div className="topbar-clock">
              <strong>{time}</strong>
              <span>{date} · Asia/Shanghai</span>
            </div>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
