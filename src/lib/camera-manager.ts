import "server-only";

import fs from "node:fs";
import path from "node:path";
import { parseCameraSources, projectMediaMtxSources } from "@/lib/camera-model";
import type { CameraState } from "@/types/pit";

type CameraUpdate = (state: CameraState) => void;
const API_URL = process.env.PIT_MEDIAMTX_API_URL?.trim() || "http://127.0.0.1:9997";

export class CameraManager {
  private readonly configs = parseCameraSources(process.env.PIT_CAMERA_SOURCES_JSON);
  private timer: NodeJS.Timeout | null = null;
  private update: CameraUpdate | null = null;
  private state: CameraState = {
    mediaServerOnline: false,
    selectedSourceId: null,
    revision: 0,
    updatedAt: 0,
    sources: this.configs.map((source) => ({ ...source, online: false, readers: 0, bytesReceived: 0, tracks: [], updatedAt: 0 })),
  };

  start(update: CameraUpdate) {
    if (this.timer) return;
    this.update = update;
    this.loadSelection();
    void this.poll();
    this.timer = setInterval(() => void this.poll(), 3_000);
    this.timer.unref();
  }

  select(sourceIdInput: unknown) {
    const sourceId = typeof sourceIdInput === "string" ? sourceIdInput.trim() : "";
    const source = this.state.sources.find((item) => item.id === sourceId);
    if (!source) throw new Error("RTMP 相机源不存在");
    if (!source.online) throw new Error("RTMP 相机源当前离线");
    this.state = { ...this.state, selectedSourceId: sourceId, revision: this.state.revision + 1, updatedAt: Date.now() };
    this.saveSelection();
    this.update?.(this.state);
    return this.state;
  }

  private async poll() {
    try {
      const response = await fetch(`${API_URL}/v3/paths/list`, { cache: "no-store", signal: AbortSignal.timeout(4_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const sources = projectMediaMtxSources(this.configs, await response.json());
      this.state = { ...this.state, mediaServerOnline: true, sources, updatedAt: Date.now() };
    } catch {
      this.state = {
        ...this.state,
        mediaServerOnline: false,
        sources: this.state.sources.map((source) => ({ ...source, online: false, readers: 0, tracks: [], updatedAt: Date.now() })),
        updatedAt: Date.now(),
      };
    }
    this.update?.(this.state);
  }

  private loadSelection() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.filePath(), "utf8")) as { sourceId?: unknown; revision?: unknown };
      const sourceId = typeof stored.sourceId === "string" && this.configs.some((source) => source.id === stored.sourceId) ? stored.sourceId : null;
      const revision = typeof stored.revision === "number" && Number.isSafeInteger(stored.revision) && stored.revision >= 0 ? stored.revision : 0;
      this.state = { ...this.state, selectedSourceId: sourceId, revision };
    } catch { /* first start */ }
  }

  private saveSelection() {
    const file = this.filePath();
    const temporary = `${file}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, `${JSON.stringify({ sourceId: this.state.selectedSourceId, revision: this.state.revision })}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  private filePath() {
    return path.join(process.env.PIT_CONFIG_DIR ? path.resolve(process.env.PIT_CONFIG_DIR) : path.join(process.cwd(), "data"), "camera-state.json");
  }
}
