"use client";

import { useState } from "react";

type DesktopUpdateResult = {
  status: "available" | "current" | "error" | "unavailable";
  message: string;
};

type DesktopWindow = Window & {
  pitDesktop?: {
    checkForUpdates(): Promise<DesktopUpdateResult>;
  };
};

export function PitUpdateButton() {
  const [checking, setChecking] = useState(false);
  const [label, setLabel] = useState("检查更新");

  async function check() {
    const desktop = (window as DesktopWindow).pitDesktop;
    if (!desktop) {
      setLabel("仅桌面版可用");
      window.setTimeout(() => setLabel("检查更新"), 2500);
      return;
    }

    setChecking(true);
    setLabel("检查中...");
    try {
      const result = await desktop.checkForUpdates();
      setLabel(result.message);
    } catch {
      setLabel("检查失败");
    } finally {
      setChecking(false);
      window.setTimeout(() => setLabel("检查更新"), 4000);
    }
  }

  return (
    <button type="button" className="pit-update-btn" disabled={checking} onClick={() => void check()}>
      {checking ? "◐" : "↻"} {label}
    </button>
  );
}
