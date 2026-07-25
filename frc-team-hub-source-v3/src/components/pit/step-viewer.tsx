"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointCloudData } from "./point-cloud";

// three.js 必须在客户端动态加载（禁用 SSR）
const ParticleScene = dynamic(() => import("./particle-scene"), { ssr: false });

type LoadState = "idle" | "loading-cache" | "parsing" | "ready" | "error";
const PARTICLE_OPTIONS = [22000, 40000, 60000, 100000] as const;
const IS_PI = process.env.NEXT_PUBLIC_PIT_DEVICE_PROFILE === "pi5";
const PI_PARTICLE_OPTIONS = [22000, 30000, 40000, 60000] as const;

export function StepViewer() {
  const [cloud, setCloud] = useState<PointCloudData | null>(null);
  const [status, setStatus] = useState<LoadState>("loading-cache");
  const [fileName, setFileName] = useState("未导入 STEP 文件");
  const [assemble, setAssemble] = useState(1);
  const [replay, setReplay] = useState(0);
  const [viewReset, setViewReset] = useState(0);
  const [particleTarget, setParticleTarget] = useState(IS_PI ? 30000 : 60000);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const loadIdRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  const replayAnimation = useCallback(() => {
    setReplay((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("./step-model-cache")
      .then(({ loadDefaultStepModel }) => loadDefaultStepModel())
      .then((model) => {
        if (cancelled) return;
        if (!model) {
          setStatus("idle");
          return;
        }
        setCloud(model.cloud);
        setFileName(model.fileName);
        setParticleTarget(model.cloud.count);
        setSourceFile(model.sourceFile);
        setIsDefault(true);
        setStatus("ready");
        requestAnimationFrame(replayAnimation);
      })
      .catch((cacheError) => {
        if (cancelled) return;
        setError(cacheError instanceof Error ? cacheError.message : "默认模型缓存读取失败");
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [replayAnimation]);

  const loadFile = useCallback(async (file: File, targetPoints = particleTarget) => {
    if (!/\.(step|stp)$/i.test(file.name)) {
      setError("仅支持 .step / .stp 文件");
      setStatus("error");
      return;
    }
    const loadId = ++loadIdRef.current;
    setStatus("parsing");
    setError("");
    setFileName(file.name);
    setSourceFile(file);
    setIsDefault(false);
    setAssemble(0);
    try {
      const { stepToPointCloud } = await import("./step-points");
      const data = await stepToPointCloud(file, targetPoints);
      if (loadId !== loadIdRef.current) return;
      setCloud(data);
      setStatus("ready");
      // 触发聚合动画
      requestAnimationFrame(() => {
        setAssemble(1);
        replayAnimation();
      });
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      setError(err instanceof Error ? err.message : "解析失败");
      setStatus("error");
    }
  }, [particleTarget, replayAnimation]);

  function changeParticleTarget(value: number) {
    setParticleTarget(value);
    if (sourceFile) void loadFile(sourceFile, value);
  }

  async function saveAsDefault() {
    if (!cloud || !sourceFile) return;
    try {
      const { saveDefaultStepModel } = await import("./step-model-cache");
      await saveDefaultStepModel(fileName, cloud, sourceFile);
      setIsDefault(true);
      replayAnimation();
    } catch (cacheError) {
      setError(cacheError instanceof Error ? cacheError.message : "默认模型缓存失败");
      setStatus("error");
    }
  }

  async function resetModel() {
    loadIdRef.current += 1;
    if (isDefault) {
      const { clearDefaultStepModel } = await import("./step-model-cache");
      await clearDefaultStepModel().catch(() => undefined);
    }
    setCloud(null);
    setFileName("未导入 STEP 文件");
    setStatus("idle");
    setAssemble(0);
    setIsDefault(false);
    setSourceFile(null);
    setError("");
  }

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
      className="pit-model-viewer"
    >
      {/* 3D 视口（铺满形象墙） */}
      <div className="pit-model-canvas">
        {cloud ? <ParticleScene data={cloud} assemble={assemble} replay={replay} viewReset={viewReset} /> : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--pit-text-2)", fontSize: 14 }}>
            CAD 文件未配置
          </div>
        )}
      </div>

      {/* 顶部状态条 */}
      <div className="pit-model-status">
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
          {status === "loading-cache" && "◐ 正在加载默认模型…"}
          {status === "parsing" && "◐ 解析中…"}
          {status === "ready" && cloud && `● ${isDefault ? "默认模型" : "已加载"} · ${cloud.count.toLocaleString()} 粒子`}
          {status === "error" && `○ ${error}`}
        </span>
      </div>

        {cloud ? <div className="pit-model-drag-hint">拖动旋转 · 滚轮缩放{!sourceFile ? " · 重新导入后可调整粒子数" : ""}</div> : null}

      {/* 导入按钮（右下） */}
      <div className="pit-model-toolbar">
        <label className="pit-particle-control">
          <span>粒子数</span>
          <select
            value={particleTarget}
            disabled={status === "parsing" || status === "loading-cache" || (cloud !== null && sourceFile === null)}
            onChange={(event) => changeParticleTarget(Number(event.target.value))}
          >
            {(IS_PI ? PI_PARTICLE_OPTIONS : PARTICLE_OPTIONS).map((count) => <option key={count} value={count}>{count / 1000}K</option>)}
          </select>
        </label>
        {cloud ? (
          <button type="button" className="pit-model-btn" onClick={() => setViewReset((value) => value + 1)}>
            视角重置
          </button>
        ) : null}
        {cloud && !isDefault ? (
          <button
            type="button"
            className="pit-model-btn ok"
            onClick={() => void saveAsDefault()}
          >
            设为默认模型
          </button>
        ) : null}
        <button
          type="button"
          className="pit-model-btn primary"
          disabled={status === "parsing" || status === "loading-cache"}
          onClick={() => inputRef.current?.click()}
        >
          ⤒ 导入 STEP 文件
        </button>
        <button
          type="button"
          className="pit-model-btn"
          onClick={() => void resetModel()}
        >
          {isDefault ? "清除默认" : "重置"}
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
