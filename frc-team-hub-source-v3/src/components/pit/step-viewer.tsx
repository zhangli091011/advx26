"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { stepToPointCloud, type PointCloudData } from "./step-points";

// three.js 必须在客户端动态加载（禁用 SSR）
const ParticleScene = dynamic(() => import("./particle-scene"), { ssr: false });

type LoadState = "idle" | "parsing" | "ready" | "error";

export function StepViewer() {
  const [cloud, setCloud] = useState<PointCloudData | null>(null);
  const [status, setStatus] = useState<LoadState>("idle");
  const [fileName, setFileName] = useState("未导入 STEP 文件");
  const [assemble, setAssemble] = useState(1);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const loadIdRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  const loadFile = useCallback(async (file: File) => {
    if (!/\.(step|stp)$/i.test(file.name)) {
      setError("仅支持 .step / .stp 文件");
      setStatus("error");
      return;
    }
    const loadId = ++loadIdRef.current;
    setStatus("parsing");
    setError("");
    setFileName(file.name);
    setAssemble(0);
    try {
      const data = await stepToPointCloud(file);
      if (loadId !== loadIdRef.current) return;
      setCloud(data);
      setStatus("ready");
      // 触发聚合动画
      requestAnimationFrame(() => setAssemble(1));
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
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
    <div
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={onDrop}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* 3D 视口（铺满形象墙） */}
      <div style={{ position: "absolute", inset: 0 }}>
        {cloud ? <ParticleScene data={cloud} assemble={assemble} /> : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--pit-text-2)", fontSize: 14 }}>
            CAD 文件未配置
          </div>
        )}
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
            color: status === "ready" ? "var(--pit-ok)" : status === "parsing" ? "var(--pit-accent)" : status === "error" ? "var(--pit-err)" : "var(--pit-text-2)",
          }}
        >
          {status === "idle" && "未配置"}
          {status === "parsing" && "◐ 解析中…"}
          {status === "ready" && cloud && `● 已加载 · ${cloud.count.toLocaleString()} 粒子`}
          {status === "error" && `○ ${error}`}
        </span>
      </div>

      {/* 导入按钮（右下） */}
      <div style={{ position: "absolute", right: 24, bottom: 20, zIndex: 2, display: "flex", gap: 10 }}>
        <button
          type="button"
          disabled={status === "parsing"}
          onClick={() => inputRef.current?.click()}
          style={{
            height: 40, padding: "0 18px",
            border: "1px solid var(--pit-accent)",
            background: "rgba(255,199,0,0.12)",
            color: "var(--pit-accent)", fontSize: 13, fontWeight: 500,
            cursor: status === "parsing" ? "wait" : "pointer", opacity: status === "parsing" ? 0.6 : 1,
          }}
        >
          ⤒ 导入 STEP 文件
        </button>
        <button
          type="button"
          onClick={() => { setCloud(null); setFileName("未导入 STEP 文件"); setStatus("idle"); setAssemble(0); setError(""); }}
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
        style={{
          position: "absolute", inset: 0, zIndex: 3,
          pointerEvents: "none",
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

    </div>
  );
}
