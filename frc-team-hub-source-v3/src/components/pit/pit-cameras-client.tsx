"use client";

import { useState, useSyncExternalStore } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import { usePitState } from "@/components/pit/use-pit-state";

export function PitCamerasClient() {
  const { state } = usePitState();
  const cameras = state?.cameras;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const host = useBrowserHost();
  const selectedId = cameras?.selectedSourceId ?? null;
  const displayId = previewId ?? selectedId;
  const source = cameras?.sources.find((item) => item.id === displayId);

  async function take(sourceId: string) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/pit/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "相机切换失败");
      setPreviewId(null);
      setMessage(`${sourceId} 已切换为节目源`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "相机切换失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <PitShell title="RTMP CAMERA SWITCHER" active={4}>
      <Panel x={224} y={96} w={1120} h={720} title="节目预览" en="PROGRAM · WEBRTC">
        <div className="pit-camera-program">
          {source?.online ? <CameraPlayer sourceId={source.id} /> : <CameraSlate message={source ? `${source.label} 当前离线` : "请选择在线相机源"} />}
          <div className="pit-camera-program-bar">
            <span>PREVIEW</span>
            <strong>{source?.label ?? "NO SOURCE"}</strong>
            <i className={source?.online ? "online" : ""} />
            <a href="/pit/cameras/output" target="_blank" rel="noreferrer">独立输出</a>
          </div>
        </div>
      </Panel>

      <Panel x={1360} y={96} w={520} h={720} title="RTMP 输入" en="SOURCES · TAKE">
        <div className="pit-camera-server">
          <i className={cameras?.mediaServerOnline ? "online" : ""} />
          <span>MEDIAMTX</span>
          <strong>{cameras?.mediaServerOnline ? "ONLINE" : "OFFLINE"}</strong>
          <code>RTMP :1935 · WebRTC :8889</code>
        </div>
        <div className="pit-camera-sources">
          {(cameras?.sources ?? []).map((item, index) => (
            <article key={item.id} className={`${item.id === selectedId ? "program" : ""} ${item.id === displayId ? "preview" : ""}`}>
              <div className="num">{String(index + 1).padStart(2, "0")}</div>
              <div className="name"><strong>{item.label}</strong><span>{item.id} · {item.tracks.join(" + ") || "NO TRACK"}</span></div>
              <div className={`state ${item.online ? "online" : ""}`}>{item.online ? "LIVE" : "OFFLINE"}</div>
              <button type="button" disabled={!item.online || pending} onClick={() => setPreviewId(item.id)}>PREVIEW</button>
              <button type="button" className="take" disabled={!item.online || pending || item.id === selectedId} onClick={() => void take(item.id)}>TAKE</button>
              <small>{item.readers} READERS · {(item.bytesReceived / 1_048_576).toFixed(1)} MB</small>
            </article>
          ))}
          {!cameras?.sources.length ? <p>未配置 RTMP 相机源。</p> : null}
        </div>
      </Panel>

      <Panel x={224} y={832} w={1656} h={204} title="推流与状态" en="INGEST · CONTROL">
        <div className="pit-camera-help">
          <div><span>RTMP SERVER</span><strong>{host ? `rtmp://${host}:1935` : "rtmp://PI-IP:1935"}</strong></div>
          <div><span>STREAM KEY</span><strong>{cameras?.sources.map((item) => item.id).join(" / ") || "—"}</strong></div>
          <div><span>PROGRAM REV</span><strong>{cameras?.revision ?? 0}</strong></div>
          <div><span>STATUS</span><strong className={message ? "accent" : ""}>{message || "选择 PREVIEW 后按 TAKE 切换节目源"}</strong></div>
        </div>
      </Panel>
    </PitShell>
  );
}

export function CameraPlayer({ sourceId }: { sourceId: string }) {
  const host = useBrowserHost();
  return host ? <iframe key={sourceId} title={`${sourceId} WebRTC live stream`} src={`http://${host}:8889/${encodeURIComponent(sourceId)}`} allow="autoplay; fullscreen" /> : <CameraSlate message="正在连接 WebRTC 播放器" />;
}

function useBrowserHost() {
  return useSyncExternalStore(subscribeToStaticHost, () => window.location.hostname, () => "");
}

function subscribeToStaticHost() {
  return () => undefined;
}

function CameraSlate({ message }: { message: string }) {
  return <div className="pit-camera-slate"><span>NO SIGNAL</span><strong>{message}</strong></div>;
}
