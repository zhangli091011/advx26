"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

export function PitViewport({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 0, width: 0, height: 0 });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const update = () => {
      const scale = Math.min(root.clientWidth / DESIGN_WIDTH, root.clientHeight / DESIGN_HEIGHT);
      setSize({
        scale,
        width: DESIGN_WIDTH * scale,
        height: DESIGN_HEIGHT * scale,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="pit-root">
      <div
        className="pit-frame"
        style={{
          width: size.width,
          height: size.height,
          visibility: size.scale > 0 ? "visible" : "hidden",
          ["--pit-scale" as string]: size.scale,
        }}
      >
        {children}
      </div>
    </div>
  );
}
