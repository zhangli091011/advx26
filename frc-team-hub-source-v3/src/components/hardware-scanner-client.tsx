"use client";

import {
  AlertTriangle,
  BookOpen,
  Cable,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cloud,
  CloudOff,
  Cpu,
  FileImage,
  Focus,
  History,
  ImagePlus,
  LibraryBig,
  LoaderCircle,
  Pause,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  SquareArrowOutUpRight,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, fetchJson } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type {
  HardwareCandidate,
  HardwareDeviceDto,
  HardwareScanDto,
  ImageQuality,
  ScannerOverview,
} from "@/lib/hardware-types";

type CapturedImage = {
  file: File;
  url: string;
};

type ViewName = "front" | "back";

type StabilityState = {
  state: "IDLE" | "SEARCHING" | "MOVING" | "FOCUSING" | "STABLE" | "CAPTURING";
  progress: number;
  motion: number;
  sharpness: number;
  coverage: number;
  message: string;
};

const initialStability: StabilityState = {
  state: "IDLE",
  progress: 0,
  motion: 0,
  sharpness: 0,
  coverage: 0,
  message: "将硬件放在桌面中央，系统会等待画面稳定后自动识别。",
};

function inspectVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, previous: Uint8Array | null) {
  const width = 160;
  const height = 90;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const luminance = new Uint8Array(width * height);
  let brightnessTotal = 0;
  let borderTotal = 0;
  let borderCount = 0;
  let motionTotal = 0;
  let edgeTotal = 0;
  let edgeCount = 0;

  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    const value = Math.round(rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114);
    luminance[index] = value;
    brightnessTotal += value;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x < 8 || x >= width - 8 || y < 5 || y >= height - 5) {
      borderTotal += value;
      borderCount += 1;
    }
    if (previous) motionTotal += Math.abs(value - previous[index]);
    if (x > 0) {
      edgeTotal += Math.abs(value - luminance[index - 1]);
      edgeCount += 1;
    }
    if (y > 0) {
      edgeTotal += Math.abs(value - luminance[index - width]);
      edgeCount += 1;
    }
  }

  const borderBrightness = borderTotal / Math.max(borderCount, 1);
  let foregroundPixels = 0;
  for (const value of luminance) {
    if (Math.abs(value - borderBrightness) >= 18) foregroundPixels += 1;
  }

  return {
    luminance,
    brightness: brightnessTotal / luminance.length,
    motion: previous ? motionTotal / luminance.length : 100,
    sharpness: edgeTotal / Math.max(edgeCount, 1),
    coverage: foregroundPixels / luminance.length,
  };
}

async function captureVideoFile(video: HTMLVideoElement, view: ViewName) {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return null;
  return new File([blob], "hardware-" + view + "-" + Date.now() + ".jpg", { type: "image/jpeg" });
}

const categoryLabels: Record<string, string> = {
  MOTOR_CONTROLLER: "电机控制器",
  ROBOT_CONTROLLER: "机器人主控",
  POWER_MODULE: "配电 / 电源",
  SENSOR: "传感器",
  ENCODER: "编码器",
  CAMERA: "视觉设备",
  NETWORK_DEVICE: "网络设备",
  COMMUNICATION_ADAPTER: "通信转接",
  CUSTOM_PCB: "自制 PCB",
  TOOL: "工具",
  UNKNOWN: "未知设备",
};

export function HardwareScannerClient() {
  const [overview, setOverview] = useState<ScannerOverview | null>(null);
  const [front, setFront] = useState<CapturedImage | null>(null);
  const [back, setBack] = useState<CapturedImage | null>(null);
  const [activeView, setActiveView] = useState<ViewName>("front");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [dynamicScan, setDynamicScan] = useState(true);
  const [stability, setStability] = useState<StabilityState>(initialStability);
  const [hint, setHint] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [result, setResult] = useState<HardwareScanDto | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState("");
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousFrameRef = useRef<Uint8Array | null>(null);
  const stableFramesRef = useRef(0);
  const autoScanLockRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchJson<ScannerOverview>("/api/hardware-scans")
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "无法加载识别记录");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOpen || !video || !stream) return;

    video.srcObject = stream;
    void video.play().catch(() => {
      setCameraError("摄像头已连接，但画面无法自动播放，请重新打开摄像头。");
    });

    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [cameraOpen]);

  const setCaptured = useCallback((view: ViewName, file: File) => {
    const next = { file, url: URL.createObjectURL(file) };
    if (view === "front") {
      setFront((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return next;
      });
    } else {
      setBack((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return next;
      });
    }
    setResult(null);
    setError("");
  }, []);

  function removeCaptured(view: ViewName) {
    if (view === "front") {
      if (front) URL.revokeObjectURL(front.url);
      setFront(null);
    } else {
      if (back) URL.revokeObjectURL(back.url);
      setBack(null);
    }
    setResult(null);
  }

  async function startCamera() {
    setCameraError("");
    previousFrameRef.current = null;
    stableFramesRef.current = 0;
    autoScanLockRef.current = false;
    setStability(initialStability);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("当前浏览器不支持摄像头，请使用图片上传。");
      return;
    }
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError("无法打开摄像头。请检查浏览器权限，或改用图片上传。");
      setCameraOpen(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    previousFrameRef.current = null;
    stableFramesRef.current = 0;
    setStability(initialStability);
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video) {
      setCameraError("摄像头画面尚未准备好，请稍候。");
      return;
    }
    const file = await captureVideoFile(video, activeView);
    if (!file) {
      setCameraError("无法保存摄像头画面，请重试。");
      return;
    }
    setCaptured(activeView, file);
    if (activeView === "front") setActiveView("back");
  }

  const submitScan = useCallback(async (frontFile: File, backFile: File | null, scanHint: string) => {
    setAnalyzing(true);
    setError("");
    try {
      const form = new FormData();
      form.set("front", frontFile);
      if (backFile) form.set("back", backFile);
      form.set("hint", scanHint);
      const data = await fetchJson<{ scan: HardwareScanDto }>("/api/hardware-scans", {
        method: "POST",
        body: form,
      });
      setResult(data.scan);
      setOverview((previous) =>
        previous
          ? { ...previous, scans: [data.scan, ...previous.scans.filter((item) => item.id !== data.scan.id)] }
          : previous,
      );
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : "识别失败");
    } finally {
      setAnalyzing(false);
    }
  }, []);

  async function analyze() {
    if (!front) {
      setError("请先拍摄或上传硬件正面图片。");
      return;
    }
    await submitScan(front.file, back?.file || null, hint);
  }

  useEffect(() => {
    if (!cameraOpen || !dynamicScan || analyzing) return;
    const video = videoRef.current;
    if (!video) return;
    if (!analysisCanvasRef.current) analysisCanvasRef.current = document.createElement("canvas");
    const analysisCanvas = analysisCanvasRef.current;

    let sampleBusy = false;
    const timer = window.setInterval(() => {
      if (sampleBusy || autoScanLockRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      sampleBusy = true;
      void (async () => {
        try {
          const metrics = inspectVideoFrame(video, analysisCanvas, previousFrameRef.current);
          if (!metrics) return;
          previousFrameRef.current = metrics.luminance;

          const values = {
            motion: Number(metrics.motion.toFixed(1)),
            sharpness: Number(metrics.sharpness.toFixed(1)),
            coverage: Number(metrics.coverage.toFixed(2)),
          };

          if (metrics.brightness < 35 || metrics.brightness > 225) {
            stableFramesRef.current = 0;
            setStability({
              state: "SEARCHING",
              progress: 0,
              ...values,
              message: metrics.brightness < 35 ? "画面过暗，请增加照明。" : "画面过亮，请减少反光或调整灯光。",
            });
            return;
          }
          if (metrics.coverage < 0.04) {
            stableFramesRef.current = 0;
            setStability({
              state: "SEARCHING",
              progress: 0,
              ...values,
              message: "未检测到明显主体，请把硬件放在取景框中央并靠近一些。",
            });
            return;
          }
          if (metrics.motion >= 3.2) {
            stableFramesRef.current = 0;
            setStability({
              state: "MOVING",
              progress: 0,
              ...values,
              message: "检测到画面移动，请保持硬件和摄像头静止。",
            });
            return;
          }
          if (metrics.sharpness < 5.5) {
            stableFramesRef.current = 0;
            setStability({
              state: "FOCUSING",
              progress: 0,
              ...values,
              message: "主体存在，但细节偏少；请靠近硬件或等待自动对焦。",
            });
            return;
          }

          stableFramesRef.current += 1;
          const progress = Math.min(stableFramesRef.current / 6, 1);
          setStability({
            state: "STABLE",
            progress,
            ...values,
            message: progress >= 1 ? "主体稳定，正在自动截帧并上传识别。" : "主体已锁定，请继续保持静止。",
          });
          if (progress < 1) return;

          autoScanLockRef.current = true;
          setStability((current) => ({ ...current, state: "CAPTURING", progress: 1 }));
          const file = await captureVideoFile(video, "front");
          if (!file) {
            autoScanLockRef.current = false;
            stableFramesRef.current = 0;
            setCameraError("自动截帧失败，请使用手动拍摄。");
            return;
          }

          setCaptured("front", file);
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          video.srcObject = null;
          setCameraOpen(false);
          await submitScan(file, back?.file || null, hint);
        } finally {
          sampleBusy = false;
        }
      })();
    }, 250);

    return () => window.clearInterval(timer);
  }, [analyzing, back, cameraOpen, dynamicScan, hint, setCaptured, submitScan]);

  async function confirm(candidate: HardwareCandidate) {
    if (!result) return;
    setConfirming(candidate.device.id);
    setError("");
    try {
      const data = await fetchJson<{ scan: HardwareScanDto }>(
        "/api/hardware-scans/" + result.id + "/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "CONFIRM", deviceId: candidate.device.id, note: hint }),
        },
      );
      setResult(data.scan);
      setOverview((previous) =>
        previous
          ? { ...previous, scans: previous.scans.map((item) => item.id === data.scan.id ? data.scan : item) }
          : previous,
      );
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "确认失败");
    } finally {
      setConfirming("");
    }
  }

  async function markUnknown() {
    if (!result) return;
    const note = hint.trim() || result.observedTexts.map((item) => item.text).join("、") || "未能确认型号";
    setConfirming("UNKNOWN");
    setError("");
    try {
      const data = await fetchJson<{ scan: HardwareScanDto }>(
        "/api/hardware-scans/" + result.id + "/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "UNKNOWN", note }),
        },
      );
      setResult(data.scan);
      setOverview((previous) =>
        previous
          ? { ...previous, scans: previous.scans.map((item) => item.id === data.scan.id ? data.scan : item) }
          : previous,
      );
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "保存失败");
    } finally {
      setConfirming("");
    }
  }

  function resetScanner() {
    stopCamera();
    if (front) URL.revokeObjectURL(front.url);
    if (back) URL.revokeObjectURL(back.url);
    setFront(null);
    setBack(null);
    setHint("");
    setResult(null);
    setError("");
    setActiveView("front");
  }

  const currentCapture = activeView === "front" ? front : back;
  const cloudConfigured = overview?.cloudConfigured ?? false;

  return (
    <>
      <PageHeader
        eyebrow="VISION INTAKE / PHASE 01"
        title="AI 硬件识别"
        description="拍摄板卡正反面，提取型号与丝印，并与团队设备目录进行候选匹配。协议、电压和引脚只有在人工确认型号后才作为资料库事实展示。"
        action={
          <div className={"scanner-cloud-status " + (cloudConfigured ? "online" : "offline")}>
            {cloudConfigured ? <Cloud size={16} /> : <CloudOff size={16} />}
            <div>
              <strong>{cloudConfigured ? "云端视觉已连接" : "云端密钥待配置"}</strong>
              <span>{overview?.model || "gpt-5.6"} · {cloudConfigured ? "结构化识别" : "本地降级模式"}</span>
            </div>
          </div>
        }
      />

      {!cloudConfigured ? (
        <div className="scanner-notice">
          <CloudOff size={17} />
          <div>
            <strong>当前使用降级模式</strong>
            <span>可以完成图像质量检测和本地目录匹配；配置服务端密钥后自动启用云端 OCR 与视觉识别。</span>
          </div>
        </div>
      ) : null}

      <div className="scanner-layout">
        <section className="panel scanner-capture-panel">
          <div className="scanner-panel-head">
            <div>
              <span className="scanner-step">01 / CAPTURE</span>
              <h2>采集硬件图像</h2>
            </div>
            <div className="view-switch" aria-label="拍摄视角">
              <button
                type="button"
                className={activeView === "front" ? "active" : ""}
                onClick={() => setActiveView("front")}
              >
                正面 {front ? <Check size={13} /> : null}
              </button>
              <button
                type="button"
                className={activeView === "back" ? "active" : ""}
                onClick={() => setActiveView("back")}
              >
                背面 {back ? <Check size={13} /> : null}
              </button>
            </div>
          </div>

          <div className="camera-stage">
            {cameraOpen ? (
              <>
                <video ref={videoRef} muted playsInline autoPlay />
                <div className="camera-reticle">
                  <span />
                  <div>
                    <ScanLine size={22} />
                    <strong>
                      {dynamicScan
                        ? stability.state === "CAPTURING" ? "主体已锁定" : "动态扫描中"
                        : activeView === "front" ? "对准硬件正面" : "翻转并拍摄背面"}
                    </strong>
                    <small>{dynamicScan ? stability.message : "确保型号、丝印和接口文字位于框内"}</small>
                  </div>
                </div>
                <span className="camera-live"><i /> CAMERA LIVE</span>
              </>
            ) : currentCapture ? (
              <>
                <Image
                  src={currentCapture.url}
                  alt={activeView === "front" ? "硬件正面预览" : "硬件背面预览"}
                  width={2048}
                  height={1536}
                  unoptimized
                />
                <button
                  type="button"
                  className="camera-remove"
                  onClick={() => removeCaptured(activeView)}
                  aria-label="移除图片"
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <div className="camera-empty">
                <div className="camera-empty-icon"><Focus size={30} /></div>
                <strong>{activeView === "front" ? "等待采集硬件正面" : "背面图像为推荐项"}</strong>
                <span>使用摄像头或上传 JPEG、PNG、WebP，单张最大 12 MiB</span>
              </div>
            )}
          </div>

          {cameraOpen && dynamicScan ? (
            <div className={"dynamic-scan-panel " + stability.state.toLowerCase()} aria-live="polite">
              <div className="dynamic-scan-head">
                <div>
                  <ScanLine size={16} />
                  <strong>{stability.message}</strong>
                </div>
                <span>{Math.round(stability.progress * 100)}%</span>
              </div>
              <div className="dynamic-progress"><i style={{ width: Math.round(stability.progress * 100) + "%" }} /></div>
              <div className="dynamic-metrics">
                <span>移动 <b>{stability.motion.toFixed(1)}</b></span>
                <span>清晰 <b>{stability.sharpness.toFixed(1)}</b></span>
                <span>主体 <b>{Math.round(stability.coverage * 100)}%</b></span>
                <small>连续稳定约 1.5 秒后自动截帧并上传</small>
              </div>
            </div>
          ) : null}

          {cameraError ? <div className="alert error scanner-inline-alert">{cameraError}</div> : null}

          <div className="camera-actions">
            {cameraOpen ? (
              <>
                <button className="button primary large" type="button" onClick={captureFrame}>
                  <Camera size={18} />手动拍摄{activeView === "front" ? "正面" : "背面"}
                </button>
                <button
                  className={"button " + (dynamicScan ? "dynamic-active" : "")}
                  type="button"
                  onClick={() => {
                    setDynamicScan((enabled) => !enabled);
                    previousFrameRef.current = null;
                    stableFramesRef.current = 0;
                    autoScanLockRef.current = false;
                    setStability(initialStability);
                  }}
                >
                  {dynamicScan ? <Pause size={16} /> : <ScanLine size={16} />}
                  {dynamicScan ? "暂停动态扫描" : "启用动态扫描"}
                </button>
                <button className="button" type="button" onClick={stopCamera}>
                  关闭摄像头
                </button>
              </>
            ) : (
              <button className="button primary" type="button" onClick={startCamera}>
                <Camera size={16} />打开摄像头
              </button>
            )}
            <label className="button scanner-upload-button">
              <Upload size={16} />
              上传{activeView === "front" ? "正面" : "背面"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) setCaptured(activeView, file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div className="capture-thumbnails">
            <CaptureThumbnail
              label="正面 / FRONT"
              image={front}
              active={activeView === "front"}
              onSelect={() => setActiveView("front")}
            />
            <CaptureThumbnail
              label="背面 / BACK"
              image={back}
              active={activeView === "back"}
              onSelect={() => setActiveView("back")}
            />
          </div>

          <div className="field scanner-hint">
            <label htmlFor="hardware-hint">人工提示（推荐）</label>
            <textarea
              className="textarea"
              id="hardware-hint"
              value={hint}
              maxLength={500}
              onChange={(event) => setHint(event.target.value)}
              placeholder="例如：疑似 REV 电机控制器；可见文字 SPARK MAX、REV-11-2158。没有云端密钥时将使用这里的文字匹配本地目录。"
            />
            <span className="field-hint">只填写可见文字或已知用途，不要猜测电压与引脚。</span>
          </div>

          {error ? <div className="alert error scanner-inline-alert">{error}</div> : null}

          <div className="scanner-submit-row">
            <div>
              <ShieldCheck size={16} />
              <span>图片只发送到服务端；云端密钥不会进入浏览器。</span>
            </div>
            <button className="button primary large" type="button" disabled={!front || analyzing} onClick={analyze}>
              {analyzing ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
              {analyzing ? "正在识别…" : "开始识别"}
            </button>
          </div>
        </section>

        <section className="panel scanner-result-panel">
          <div className="scanner-panel-head">
            <div>
              <span className="scanner-step">02 / VERIFY</span>
              <h2>识别与人工确认</h2>
            </div>
            {result ? (
              <button className="icon-button" type="button" onClick={resetScanner} aria-label="开始新扫描">
                <RefreshCw size={17} />
              </button>
            ) : null}
          </div>

          {analyzing ? (
            <AnalyzingState cloud={cloudConfigured} />
          ) : result ? (
            <ScanResult
              scan={result}
              confirming={confirming}
              onConfirm={confirm}
              onUnknown={markUnknown}
            />
          ) : (
            <ScannerGuide />
          )}
        </section>
      </div>

      <section className="panel panel-pad scanner-history">
        <div className="panel-heading">
          <div>
            <h2><History size={16} />最近识别记录</h2>
            <p>保留原图、质量结果、AI 观察和人工确认状态。</p>
          </div>
          <span className="status-chip">{overview?.scans.length || 0} RECORDS</span>
        </div>
        {overview?.scans.length ? (
          <div className="scan-history-grid">
            {overview.scans.slice(0, 8).map((scan) => (
              <button
                className={"scan-history-card " + (result?.id === scan.id ? "active" : "")}
                key={scan.id}
                type="button"
                onClick={() => setResult(scan)}
              >
                <Image src={scan.frontImageUrl} alt="" width={116} height={108} unoptimized />
                <div>
                  <strong>{scan.visualGuess.model || scan.candidates[0]?.device.model || "未确认硬件"}</strong>
                  <span>{formatDateTime(scan.createdAt)}</span>
                  <small className={"scan-state " + scan.status.toLowerCase()}>
                    {scan.status === "CONFIRMED" ? "已确认" : scan.status === "UNKNOWN" ? "未知设备" : "待确认"}
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <div className="scan-history-empty"><FileImage size={20} />完成第一次扫描后，记录会显示在这里。</div>
        )}
      </section>

      <section className="panel panel-pad hardware-catalog">
        <div className="panel-heading catalog-heading">
          <div>
            <h2><LibraryBig size={16} />常用 FRC 硬件数据库</h2>
            <p>型号、用途、协议和接口来自官方资料；点击可继续查看使用说明或引脚/接线图。</p>
          </div>
          <span className="status-chip">{overview?.catalog.length || 0} DEVICES</span>
        </div>
        <div className="catalog-toolbar">
          <input
            className="input"
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            placeholder="搜索厂商、型号、料号、协议或接口"
          />
        </div>
        <div className="hardware-catalog-grid">
          {(overview?.catalog || [])
            .filter((device) => {
              const query = catalogSearch.trim().toLowerCase();
              if (!query) return true;
              return [
                device.manufacturer,
                device.model,
                device.partNumber || "",
                ...device.protocols,
                ...device.interfaces,
              ].some((value) => value.toLowerCase().includes(query));
            })
            .map((device) => <HardwareCatalogCard key={device.id} device={device} />)}
        </div>
      </section>
    </>
  );
}

function CaptureThumbnail({
  label,
  image,
  active,
  onSelect,
}: {
  label: string;
  image: CapturedImage | null;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={"capture-thumb " + (active ? "active" : "")} onClick={onSelect}>
      {image ? <Image src={image.url} alt="" width={108} height={108} unoptimized /> : <span><ImagePlus size={18} /></span>}
      <div>
        <strong>{label}</strong>
        <small>{image ? "已采集" : "等待图片"}</small>
      </div>
      {image ? <CheckCircle2 size={15} /> : null}
    </button>
  );
}

function ScannerGuide() {
  return (
    <div className="scanner-guide">
      <div className="scanner-guide-visual">
        <ScanLine size={36} />
        <span className="guide-orbit orbit-one" />
        <span className="guide-orbit orbit-two" />
      </div>
      <h3>等待硬件图像</h3>
      <p>正面用于识别品牌和型号，背面用于补充产品编号、版本及接口丝印。</p>
      <ol>
        <li><span>01</span><div><strong>控制反光</strong><small>使用漫射补光，让丝印保持清晰。</small></div></li>
        <li><span>02</span><div><strong>拍摄正反面</strong><small>硬件占据画面主体，不要裁掉边缘。</small></div></li>
        <li><span>03</span><div><strong>人工确认</strong><small>AI 只提供候选，不会自动写入电气事实。</small></div></li>
      </ol>
    </div>
  );
}

function AnalyzingState({ cloud }: { cloud: boolean }) {
  return (
    <div className="scanner-analyzing">
      <div className="analyzing-core"><ScanLine size={30} /><span /></div>
      <h3>{cloud ? "云端视觉正在读取硬件…" : "正在分析图像并匹配本地目录…"}</h3>
      <p>{cloud ? "提取可见文字、接口和型号候选，然后执行结构化校验。" : "当前不会执行图片 OCR，将使用人工提示与本地候选目录。"}</p>
      <div className="analyzing-steps">
        <span className="done"><Check size={13} />图片上传</span>
        <span><LoaderCircle size={13} className="spin" />质量检查</span>
        <span>候选排序</span>
      </div>
    </div>
  );
}

function ScanResult({
  scan,
  confirming,
  onConfirm,
  onUnknown,
}: {
  scan: HardwareScanDto;
  confirming: string;
  onConfirm: (candidate: HardwareCandidate) => void;
  onUnknown: () => void;
}) {
  const confirmed = scan.status === "CONFIRMED";
  const unknown = scan.status === "UNKNOWN";
  return (
    <div className="scan-result">
      <div className={"result-status-banner " + (confirmed ? "confirmed" : unknown ? "unknown" : "")}>
        {confirmed ? <CheckCircle2 size={18} /> : unknown ? <CircleHelp size={18} /> : <Sparkles size={18} />}
        <div>
          <strong>{confirmed ? "型号已人工确认" : unknown ? "已记录为未知设备" : "AI 观察完成，等待确认"}</strong>
          <span>
            {scan.provider === "OPENAI"
              ? "OPENAI · " + scan.providerModel
              : scan.provider === "OPENAI_COMPATIBLE"
                ? "CLOUD GATEWAY · " + scan.providerModel
                : "LOCAL FALLBACK"}
          </span>
        </div>
      </div>

      <QualityStrip front={scan.frontQuality} back={scan.backQuality} />

      <div className="result-summary">
        <span className="result-label">AI OBSERVATION</span>
        <p>{scan.summary}</p>
        <div className="guess-grid">
          <div><small>厂商候选</small><strong>{scan.visualGuess.manufacturer || "—"}</strong></div>
          <div><small>型号候选</small><strong>{scan.visualGuess.model || "—"}</strong></div>
          <div><small>类别</small><strong>{categoryLabels[scan.visualGuess.category] || scan.visualGuess.category}</strong></div>
          <div><small>视觉置信度</small><strong>{Math.round(scan.visualGuess.confidence * 100)}%</strong></div>
        </div>
      </div>

      {scan.observedTexts.length ? (
        <div className="observed-texts">
          <span className="result-label">VISIBLE TEXT</span>
          <div>
            {scan.observedTexts.slice(0, 16).map((item, index) => (
              <span key={item.text + index} title={item.type}>
                {item.text}<small>{Math.round(item.confidence * 100)}%</small>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {scan.visualGuess.warnings.length ? (
        <div className="result-warnings">
          {scan.visualGuess.warnings.map((warning) => (
            <div key={warning}><AlertTriangle size={14} />{warning}</div>
          ))}
        </div>
      ) : null}

      <div className="candidate-section">
        <div className="candidate-heading">
          <div>
            <span className="result-label">LOCAL CANDIDATES</span>
            <h3>本地设备目录候选</h3>
          </div>
          <span>{scan.candidates.length} MATCHES</span>
        </div>
        {scan.candidates.length ? (
          <div className="candidate-list">
            {scan.candidates.map((candidate, index) => (
              <article
                className={"candidate-card " + (scan.confirmedDeviceId === candidate.device.id ? "selected" : "")}
                key={candidate.device.id}
              >
                <div className="candidate-rank">0{index + 1}</div>
                <div className="candidate-main">
                  <span>{candidate.device.manufacturer}</span>
                  <h4>{candidate.device.model}</h4>
                  <small>{categoryLabels[candidate.device.category] || candidate.device.category}{candidate.device.partNumber ? " · " + candidate.device.partNumber : ""}</small>
                  <div className="candidate-reasons">
                    {candidate.reasons.map((reason) => <span key={reason}>{reason}</span>)}
                  </div>
                  {candidate.device.description ? <p>{candidate.device.description}</p> : null}
                  <DeviceFacts device={candidate.device} />
                  <HardwareResourceLinks device={candidate.device} />
                </div>
                <div className="candidate-score">
                  <strong>{Math.round(candidate.score * 100)}</strong>
                  <span>MATCH</span>
                  <button
                    className="button primary"
                    type="button"
                    disabled={Boolean(confirming) || confirmed || unknown}
                    onClick={() => onConfirm(candidate)}
                  >
                    {confirming === candidate.device.id ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                    {scan.confirmedDeviceId === candidate.device.id ? "已确认" : "确认型号"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="no-candidates">
            <Cpu size={20} />
            <div><strong>本地目录没有可靠候选</strong><span>补充可见型号后重新扫描，或将本次记录保存为未知设备。</span></div>
          </div>
        )}
      </div>

      {!confirmed && !unknown ? (
        <button className="button ghost full" type="button" disabled={Boolean(confirming)} onClick={onUnknown}>
          {confirming === "UNKNOWN" ? <LoaderCircle size={15} className="spin" /> : <CircleHelp size={15} />}
          无法确认，记录为未知设备
        </button>
      ) : null}
    </div>
  );
}

function DeviceFacts({ device }: { device: HardwareDeviceDto }) {
  return (
    <div className="device-facts">
      {device.voltageSummary ? <span><small>供电</small>{device.voltageSummary}</span> : null}
      {device.protocols.length ? <span><small>协议</small>{device.protocols.join(" / ")}</span> : null}
      {device.interfaces.length ? <span><small>接口</small>{device.interfaces.join(" / ")}</span> : null}
    </div>
  );
}

function HardwareResourceLinks({ device }: { device: HardwareDeviceDto }) {
  const links = [
    device.sourceUrl ? { label: "官方信息", href: device.sourceUrl, icon: BookOpen } : null,
    device.usageUrl && device.usageUrl !== device.sourceUrl
      ? { label: "使用方法", href: device.usageUrl, icon: SquareArrowOutUpRight }
      : null,
    device.pinoutUrl && device.pinoutUrl !== device.sourceUrl && device.pinoutUrl !== device.usageUrl
      ? { label: "引脚 / 接线图", href: device.pinoutUrl, icon: Cable }
      : null,
  ].filter(Boolean) as Array<{ label: string; href: string; icon: typeof BookOpen }>;
  if (!links.length) return null;
  return (
    <div className="hardware-resource-links">
      {links.map(({ label, href, icon: Icon }) => (
        <a key={label} href={href} target="_blank" rel="noreferrer">
          <Icon size={13} />{label}
        </a>
      ))}
    </div>
  );
}

function HardwareCatalogCard({ device }: { device: HardwareDeviceDto }) {
  return (
    <article className="hardware-catalog-card">
      <div className="catalog-card-top">
        <span>{categoryLabels[device.category] || device.category}</span>
        <small>{device.partNumber || "官方型号"}</small>
      </div>
      <strong>{device.model}</strong>
      <p>{device.manufacturer}</p>
      {device.description ? <div className="catalog-description">{device.description}</div> : null}
      <DeviceFacts device={device} />
      <HardwareResourceLinks device={device} />
    </article>
  );
}

function QualityStrip({ front, back }: { front: ImageQuality; back: ImageQuality | null }) {
  return (
    <div className="quality-strip">
      <QualityItem label="正面" quality={front} />
      {back ? <QualityItem label="背面" quality={back} /> : (
        <div className="quality-item muted"><FileImage size={16} /><div><small>背面</small><strong>未提供</strong></div></div>
      )}
    </div>
  );
}

function QualityItem({ label, quality }: { label: string; quality: ImageQuality }) {
  return (
    <div className={"quality-item " + (quality.accepted ? "good" : "warn")}>
      {quality.accepted ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      <div>
        <small>{label} · {quality.width} × {quality.height}</small>
        <strong>{quality.accepted ? "图像质量可用" : quality.issues[0]?.message || "需要检查"}</strong>
      </div>
      <span>{Math.round(quality.score * 100)}</span>
    </div>
  );
}
