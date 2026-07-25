"use client";

import { useEffect, useState } from "react";

type DesktopWindow = Window & {
  pitDesktop?: {
    getFullscreen?(): Promise<boolean>;
    toggleFullscreen?(): Promise<boolean>;
    onFullscreenChange?(callback: (fullscreen: boolean) => void): () => void;
  };
};

export function PitFullscreenButton() {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const desktop = (window as DesktopWindow).pitDesktop;
    if (desktop?.getFullscreen) void desktop.getFullscreen().then(setFullscreen);

    const unsubscribe = desktop?.onFullscreenChange?.(setFullscreen);
    const onBrowserChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onBrowserChange);
    return () => {
      unsubscribe?.();
      document.removeEventListener("fullscreenchange", onBrowserChange);
    };
  }, []);

  async function toggle() {
    const desktop = (window as DesktopWindow).pitDesktop;
    if (desktop?.toggleFullscreen) {
      setFullscreen(await desktop.toggleFullscreen());
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  }

  return (
    <button type="button" className="pit-update-btn pit-fullscreen-btn" onClick={() => void toggle()}>
      {fullscreen ? "⊙ 退出全屏" : "⛶ 一键全屏"}
    </button>
  );
}
