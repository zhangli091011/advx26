"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { defaultRobotPointCloud, stepToPointCloud, type PointCloudData } from "./step-points";

// three.js 必须在客户端动态加载（禁用 SSR）
const ParticleScene = dynamic(() => import("./particle-scene"), { ssr: false });

type LoadState = "idle" | "parsing" | "ready" | "error";

export function StepViewer() {
  const [cloud, setCloud] = useState<PointCloudData>(() => defaultRobotPointCloud());
  const [status, setStatus] = useState<LoadState>("idle");
  const [fileName, setFileName] = useState("SPARK-III_chassis_v3.step");
  const [assemble, setAssemble] = useState(1);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadFile = useCallback(async (file: File) => {
    if (!/\.(step|stp)$/i.test(file.name)) {
      setError("仅支持 .step / .stp 文件");
      setStatus("error");
      return;
    }
    setStatus("parsing");
    setError("");
    setFileName(file.name);
    setAssemble(0);
    try {
      const data = await stepToPointCloud(file);
      setCloud(data);
      setStatus("ready");
      // 触发聚合动画
      requestAnimationFrame(() => setAssemble(1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
      setStatus("error");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  return (
    <>
      {/* 3D 视口（铺满形象墙） */}
      <div style={{ position: "absolute", inset: 0 }}>
        <ParticleScene data={cloud} assemble={assemble} />
      </div>

      {/* 顶部状态条 */}
      <div style={{ position: "absolute", left: 24, top: 16, zIndex: 2, display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ color: "var(--pit-text-2)", fontFamily: "var(--font-tech)", fontSize: 11, letterSpacing: 2 }}>
          3D MODEL
        </span>
        <span style={{ color: "var(--pit-accent)", fontFamily: "var(--font-tech)", fontSize: 12 }}>
          {fileName}
        </span>
        <span
          style={{
            fontSize: 11, fontWeight: 500,
            color: status === "ready" || status === "idle" ? "var(--pit-ok)" : status === "parsing" ? "var(--pit-accent)" : "var(--pit-err)",
          }}
        >
          {status === "idle" && "● 默认模型"}
          {status === "parsing" && "◐ 解析中…"}
          {status === "ready" && `● 已加载 · ${cloud.count.toLocaleString()} 粒子`}
          {status === "error" && `○ ${error}`}
        </span>
      </div>

      {/* 导入按钮（右下） */}
      <div style={{ position: "absolute", right: 24, bottom: 20, zIndex: 2, display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            height: 40, padding: "0 18px",
            border: "1px solid var(--pit-accent)",
            background: "rgba(255,199,0,0.12)",
            color: "var(--pit-accent)", fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}
        >
          ⤒ 导入 STEP 文件
        </button>
        <button
          type="button"
          onClick={() => { setCloud(defaultRobotPointCloud()); setFileName("SPARK-III_chassis_v3.step"); setStatus("idle"); setAssemble(0); requestAnimationFrame(() => setAssemble(1)); }}
          style={{
            height: 40, padding: "0 14px",
            border: "1px solid var(--pit-line)",
            background: "var(--pit-panel-2)",
            color: "var(--pit-text-2)", fontSize: 13, cursor: "pointer",
          }}
        >
          重置
        </button>
      </div>

      {/* 隐藏文件输入 */}
      <input
        ref={inputRef}
        type="file"
        accept=".step,.stp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = "";
        }}
      />

      {/* 拖拽覆盖层 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          position: "absolute", inset: 0, zIndex: 3,
          pointerEvents: dragOver ? "auto" : "none",
          background: dragOver ? "rgba(255,199,0,0.08)" : "transparent",
          border: dragOver ? "2px dashed var(--pit-accent)" : "2px dashed transparent",
          display: "grid", placeItems: "center",
          transition: "background 150ms ease",
        }}
      >
        {dragOver ? (
          <span style={{ color: "var(--pit-accent)", fontSize: 18, fontWeight: 700 }}>
            松开以导入 STEP 文件
          </span>
        ) : null}
      </div>

      {/* 全局拖拽监听（让按钮区域之外也能拖入） */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}
      />
    </>
  );
}
