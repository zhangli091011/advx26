"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { calculatePitViewport, type PitViewportLayout } from "./pit-viewport-model";

export function PitViewport({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<PitViewportLayout>(() => (
    { scale: 0, frameWidth: 0, frameHeight: 0, scrollable: false }
  ));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const update = () => {
      setLayout(calculatePitViewport(root.clientWidth, root.clientHeight));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  const frameStyle = {
    width: layout.frameWidth,
    height: layout.frameHeight,
    visibility: layout.scale > 0 ? "visible" : "hidden",
    "--pit-scale": layout.scale,
    "--pit-frame-width": `${layout.frameWidth}px`,
    "--pit-frame-height": `${layout.frameHeight}px`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`pit-root ${layout.scrollable ? "pit-root-scrollable" : "pit-root-fitted"}`}
      data-viewport-mode={layout.scrollable ? "scroll" : "fit"}
    >
      <div className="pit-frame" style={frameStyle}>
        {children}
      </div>
    </div>
  );
}
