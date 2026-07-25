import "server-only";

import { EventEmitter } from "node:events";
import { DeviceGatewayClient } from "@/lib/device-gateway-client";
import { CameraManager } from "@/lib/camera-manager";
import { HomeAssistantOutletManager } from "@/lib/home-assistant-outlets";
import { loadPitConfigFallback } from "@/lib/pit-config";
import { ToolManager } from "@/lib/tool-manager";
import { parseVisionScan } from "@/lib/tool-model";
import type {
  Battery,
  Compartment,
  PitState,
  PowerChannel,
  RackUnit,
} from "@/types/pit";

export type { PitState } from "@/types/pit";

/**
 * PIT-OS 实时数据中心
 * 运行在树莓派 5 上：通过 WebSocket 长连接接入本地设备网关，
 * 聚合两个 ESP32 分控上报的设备影子状态，供 Next.js API 读取。
 *
 * Topic 规划：
 *   pit/esp32-a/tools/{slot}        → 工具位状态（视觉识别结果）
 *   pit/esp32-a/units/{unit}        → 储物单元称重/门磁
 *   pit/esp32-a/compartments/{id}   → U4 格位库存
 *   pit/esp32-b/power/{ch}          → 电源通道电流/开关状态
 *   pit/esp32-b/battery/{id}        → 电池充电状态
 *   pit/esp32-b/env                 → 箱内温湿度
 *   pit/can/devices                 → 机器人 CAN 设备心跳（来自 ESP32-S3 探针）
 *   pit/can/status                  → 总线负载、帧率与控制器错误
 *   pit/can/log                     → CAN 探针诊断事件
 *   pit/vision/scan                 → 视觉识别扫码事件
 *   pit/control/{target}            → 下行控制指令（开关/指示灯/继电器）
 */

/* ---------------- 初始空状态（无硬件时回退） ---------------- */
function emptyState(): PitState {
  return {
    updatedAt: 0,
    source: "empty",
    connection: {
      gatewayConnected: false,
      lastMessageAt: null,
      deviceLastSeen: { cabinet: null, power: null, homeAssistant: null, can: null, vision: null, toolbox: null },
    },
    tools: [],
    units: [],
    compartments: [],
    channels: [],
    batteries: [],
    canDevices: [],
    canBus: {
      probeId: "",
      online: false,
      bitrate: 1_000_000,
      frameRate: 0,
      utilizationPct: 0,
      rxFrames: 0,
      rxDropped: 0,
      busErrors: 0,
      controllerState: "unknown",
      wifiRssi: null,
      serialConnected: false,
      serialBaud: 115200,
      serialCommands: 0,
      serialLines: 0,
      lastSerialActivityAt: null,
      updatedAt: 0,
    },
    canLog: [],
    cameras: { mediaServerOnline: false, selectedSourceId: null, revision: 0, updatedAt: 0, sources: [] },
    env: { tempC: null, humidity: null },
    scanLog: [],
    toolStation: {
      activeSession: null,
      checkoutCount: 0,
      returnCount: 0,
      desiredRevision: 0,
      appliedRevision: null,
      recentTransactions: [],
      vision: {
        stationId: process.env.PIT_TOOL_STATION_ID?.trim() || "main",
        online: false,
        ready: false,
        backend: "",
        device: "",
        width: null,
        height: null,
        error: null,
        updatedAt: null,
      },
    },
  };
}

/* ---------------- 单例数据中心 ---------------- */
const globalForPit = globalThis as unknown as {
  pitHub?: PitHub;
};

class PitHub extends EventEmitter {
  state: PitState = emptyState();
  private serializedState = JSON.stringify(this.state);
  private client: DeviceGatewayClient | null = null;
  private homeAssistant: HomeAssistantOutletManager | null = null;
  private cameras = new CameraManager();
  private tools = new ToolManager();
  private started = false;
  private updateTimer: NodeJS.Timeout | null = null;

  start() {
    if (this.started) return;
    this.started = true;
    this.refreshTools();
    this.cameras.start((cameras) => {
      this.state.cameras = cameras;
      this.markUpdated(Date.now());
    });
    this.queueUpdate();
    const config = loadPitConfigFallback();
    try {
      this.homeAssistant = new HomeAssistantOutletManager(config.homeAssistant);
      this.homeAssistant.start((channel) => {
        const index = this.state.channels.findIndex((item) => item.id === channel.id);
        if (index >= 0) this.state.channels[index] = channel;
        else this.state.channels.push(channel);
        this.state.channels.sort((a, b) => a.id.localeCompare(b.id));
        if (channel.online) this.state.connection.deviceLastSeen.homeAssistant = channel.updatedAt;
        this.markUpdated(Date.now());
      });
    } catch (error) {
      console.error(`[home-assistant] 配置加载失败：${error instanceof Error ? error.message : String(error)}`);
      this.homeAssistant = null;
    }
    const { url, clientId } = config.gateway;
    const token = config.gateway.token || process.env.PIT_GATEWAY_TOKEN || "";
    try {
      this.client = new DeviceGatewayClient({
        url,
        clientId,
        role: "pithub",
        token,
        subscriptions: ["pit/esp32-a/#", "pit/esp32-b/#", "pit/can/#", "pit/vision/#", "pit/toolbox/#"],
      });
      this.client.on("connect", () => {
        this.state.connection.gatewayConnected = true;
        void this.publishToolLeds();
        const session = this.state.toolStation.activeSession;
        if (session) void this.publishVisionSession(session);
        else void this.clearVisionSession(this.state.toolStation.vision.stationId);
        this.queueUpdate();
      });
      this.client.on("close", () => {
        if (!this.state.connection.gatewayConnected) return;
        this.state.connection.gatewayConnected = false;
        this.queueUpdate();
      });
      this.client.on("message", (topic, payload) => this.onMessage(topic, payload));
      this.client.start();
    } catch {
      this.client = null;
    }
  }

  private onMessage(topic: string, payload: Buffer) {
    if (payload.length > 64 * 1024) return;
    const parts = topic.split("/");
    const source = parts[1];
    if (!source || !["esp32-a", "esp32-b", "can", "vision", "toolbox"].includes(source)) return;

    const now = Date.now();
    if (source === "vision" && parts[2] === "status" && parts[3]) {
      let data: unknown;
      try { data = JSON.parse(payload.toString()); } catch { return; }
      const status = asRecord(data);
      if (!status || status.stationId !== parts[3]) return;
      if (finiteNumber(status.updatedAt, 0, Number.MAX_SAFE_INTEGER) === null) return;
      this.state.toolStation.vision = {
        stationId: String(status.stationId),
        online: status.online === true,
        ready: status.ready === true,
        backend: typeof status.backend === "string" ? status.backend.slice(0, 40) : "",
        device: typeof status.device === "string" ? status.device.slice(0, 300) : "",
        width: status.width == null ? null : finiteNumber(status.width, 1, 10_000),
        height: status.height == null ? null : finiteNumber(status.height, 1, 10_000),
        error: typeof status.error === "string" && status.error ? status.error.slice(0, 300) : null,
        updatedAt: now,
      };
      this.state.connection.deviceLastSeen.vision = status.online === true ? now : null;
      this.markUpdated(now);
      return;
    }
    if (parts[2] === "status" && source !== "can") {
      const seenAt = payload.toString().trim() === "online" ? now : null;
      if (source === "esp32-a") this.state.connection.deviceLastSeen.cabinet = seenAt;
      else if (source === "esp32-b") this.state.connection.deviceLastSeen.power = seenAt;
      else if (source === "toolbox") this.state.connection.deviceLastSeen.toolbox = seenAt;
      this.markUpdated(now);
      if (source === "toolbox" && seenAt) void this.publishToolLeds();
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      return;
    }
    if (source === "esp32-a") this.state.connection.deviceLastSeen.cabinet = now;
    else if (source === "esp32-b") this.state.connection.deviceLastSeen.power = now;
    else if (source === "can") this.state.connection.deviceLastSeen.can = now;
    else if (source === "toolbox") this.state.connection.deviceLastSeen.toolbox = now;
    else if (source === "vision") this.state.connection.deviceLastSeen.vision = now;
    let handled = false;
    if (source === "esp32-a") handled = this.handleCabinet(parts, data);
    else if (source === "esp32-b") handled = this.handlePower(parts, data);
    else if (source === "can") handled = this.handleCan(parts, data);
    else if (source === "toolbox") handled = this.handleToolbox(parts, data);
    else handled = this.handleVision(parts, data);
    if (handled) this.markUpdated(now);
  }

  private markUpdated(now: number) {
    this.state.updatedAt = now;
    this.state.source = "live";
    this.state.connection.lastMessageAt = now;
    this.queueUpdate();
  }

  private queueUpdate() {
    if (this.updateTimer) return;
    this.updateTimer = setTimeout(() => {
      this.updateTimer = null;
      this.serializedState = JSON.stringify(this.state);
      this.emit("update", this.serializedState);
    }, 100);
    this.updateTimer.unref();
  }

  getSerializedState() {
    return this.updateTimer ? JSON.stringify(this.state) : this.serializedState;
  }

  /* ESP32-A：16U 储存柜（工具位 / 储物单元 / 格位） */
  private handleCabinet(parts: string[], data: unknown) {
    const d = asRecord(data);
    if (!d) return false;
    if (parts[2] === "tools" && parts[3]) {
      // Tool state is owned by ToolManager; ESP32 only applies LED snapshots.
      return false;
    } else if (parts[2] === "units" && parts[3]) {
      const level = oneOf(d.level, ["ok", "low", "active"] as const);
      const pct = finiteNumber(d.pct, 0, 100);
      if (!level || pct === null) return false;
      const u = parts[3];
      const idx = this.state.units.findIndex((x) => x.u === u);
      const unit: RackUnit = {
        u,
        name: String(d.name ?? u),
        note: String(d.note ?? ""),
        status: String(d.status ?? ""),
        level,
        pct,
      };
      if (idx >= 0) this.state.units[idx] = unit;
      else this.state.units.push(unit);
      this.state.units.sort((a, b) => a.u.localeCompare(b.u));
    } else if (parts[2] === "compartments" && parts[3]) {
      const qty = finiteNumber(d.qty, 0, 1_000_000);
      const state = oneOf(d.state, ["ok", "low", "empty", "active"] as const);
      if (qty === null || !state) return false;
      const id = parts[3];
      const idx = this.state.compartments.findIndex((c) => c.id === id);
      const comp: Compartment = {
        id,
        label: String(d.label ?? id),
        qty,
        state,
      };
      if (idx >= 0) this.state.compartments[idx] = comp;
      else this.state.compartments.push(comp);
    } else return false;
    return true;
  }

  private handleToolbox(parts: string[], data: unknown) {
    if (parts[2] !== "tool-leds" || parts[3] !== "status") return false;
    const d = asRecord(data);
    const revision = d ? finiteNumber(d.revision, 0, Number.MAX_SAFE_INTEGER) : null;
    if (revision === null || d?.applied !== true || d.drawerCount !== 5) return false;
    this.state.toolStation.appliedRevision = revision;
    return true;
  }

  /* ESP32-B：电源配电箱（通道 / 电池 / 环境） */
  private handlePower(parts: string[], data: unknown) {
    const d = asRecord(data);
    if (!d) return false;
    if (parts[2] === "power" && parts[3]) {
      if (this.homeAssistant?.hasChannel(parts[3])) return false;
      const volts = finiteNumber(d.volts, 0, 500);
      const amps = finiteNumber(d.amps, 0, 100);
      const watts = finiteNumber(d.watts, 0, 50_000);
      if (volts === null || amps === null || watts === null || typeof d.on !== "boolean") return false;
      const id = parts[3];
      const idx = this.state.channels.findIndex((c) => c.id === id);
      const ch: PowerChannel = {
        id,
        name: String(d.name ?? id),
        zone: String(d.zone ?? ""),
        volts,
        amps,
        watts,
        on: d.on,
        provider: "gateway",
        transport: null,
        online: true,
        updatedAt: Date.now(),
      };
      if (idx >= 0) this.state.channels[idx] = ch;
      else this.state.channels.push(ch);
      this.state.channels.sort((a, b) => a.id.localeCompare(b.id));
    } else if (parts[2] === "battery" && parts[3]) {
      const pct = finiteNumber(d.pct, 0, 100);
      const volts = finiteNumber(d.volts, 0, 100);
      if (pct === null || volts === null || typeof d.charging !== "boolean") return false;
      const id = parts[3];
      const idx = this.state.batteries.findIndex((b) => b.id === id);
      const bat: Battery = {
        id,
        pct,
        charging: d.charging,
        volts,
      };
      if (idx >= 0) this.state.batteries[idx] = bat;
      else this.state.batteries.push(bat);
      this.state.batteries.sort((a, b) => a.id.localeCompare(b.id));
    } else if (parts[2] === "env") {
      const tempC = finiteNumber(d.tempC, -50, 150);
      const humidity = d.humidity == null ? null : finiteNumber(d.humidity, 0, 100);
      if (tempC === null) return false;
      this.state.env = {
        tempC,
        humidity,
      };
    } else return false;
    return true;
  }

  /* 机器人 CAN（来自 ESP32-S3 TWAI 只监听探针） */
  private handleCan(parts: string[], data: unknown) {
    if (parts[2] === "devices" && Array.isArray(data)) {
      this.state.canDevices = data.slice(0, 128).filter(isRecord).flatMap((d) => {
        const lastHeartbeat = finiteNumber(d.lastHeartbeat, 0, Number.MAX_SAFE_INTEGER);
        if (typeof d.id !== "string" || typeof d.on !== "boolean" || lastHeartbeat === null) return [];
        return [{
          id: d.id,
          name: String(d.name ?? ""),
          model: String(d.model ?? ""),
          mech: String(d.mech ?? ""),
          on: d.on,
          latencyMs: d.latencyMs == null ? null : finiteNumber(d.latencyMs, 0, 60_000),
          tempC: d.tempC == null ? null : finiteNumber(d.tempC, -50, 200),
          lastHeartbeat,
        }];
      });
      return true;
    }
    const record = asRecord(data);
    if (!record) return false;
    if (parts[2] === "status") {
      const bitrate = finiteNumber(record.bitrate, 1, 10_000_000);
      const frameRate = finiteNumber(record.frameRate, 0, 100_000);
      const utilizationPct = finiteNumber(record.utilizationPct, 0, 100);
      const rxFrames = finiteNumber(record.rxFrames, 0, Number.MAX_SAFE_INTEGER);
      const rxDropped = finiteNumber(record.rxDropped, 0, Number.MAX_SAFE_INTEGER);
      const busErrors = finiteNumber(record.busErrors, 0, Number.MAX_SAFE_INTEGER);
      const updatedAt = finiteNumber(record.updatedAt, 0, Number.MAX_SAFE_INTEGER);
      const serialBaud = finiteNumber(record.serialBaud, 1200, 4_000_000);
      const serialCommands = finiteNumber(record.serialCommands, 0, Number.MAX_SAFE_INTEGER);
      const serialLines = finiteNumber(record.serialLines, 0, Number.MAX_SAFE_INTEGER);
      const controllerState = String(record.controllerState ?? "unknown");
      if (!bitrate || frameRate === null || utilizationPct === null || rxFrames === null || rxDropped === null || busErrors === null || updatedAt === null || serialBaud === null || serialCommands === null || serialLines === null) return false;
      if (!["running", "bus-off", "stopped", "unknown"].includes(controllerState)) return false;
      this.state.canBus = {
        probeId: String(record.probeId ?? "").slice(0, 80),
        online: record.online === true,
        bitrate,
        frameRate,
        utilizationPct,
        rxFrames,
        rxDropped,
        busErrors,
        controllerState: controllerState as PitState["canBus"]["controllerState"],
        wifiRssi: record.wifiRssi == null ? null : finiteNumber(record.wifiRssi, -150, 0),
        serialConnected: record.serialConnected === true,
        serialBaud,
        serialCommands,
        serialLines,
        lastSerialActivityAt: record.lastSerialActivityAt == null ? null : finiteNumber(record.lastSerialActivityAt, 0, Number.MAX_SAFE_INTEGER),
        updatedAt,
      };
      return true;
    }
    if (parts[2] === "log") {
      const at = finiteNumber(record.at, 0, Number.MAX_SAFE_INTEGER);
      const level = String(record.level ?? "info");
      const source = record.source === "serial" ? "serial" : "system";
      if (at === null || !["info", "warn", "error"].includes(level) || typeof record.message !== "string") return false;
      this.state.canLog.unshift({ at, level: level as "info" | "warn" | "error", source, message: record.message.slice(0, 300) });
      this.state.canLog = this.state.canLog.slice(0, 30);
      return true;
    }
    return false;
  }

  /* 视觉识别扫码事件 */
  private handleVision(parts: string[], data: unknown) {
    if (parts[2] !== "scan") return false;
    try {
      const scan = parseVisionScan(data);
      try {
        const result = this.tools.consumeScan(scan.scanId, scan.sessionId, scan.qr, scan.stationId, scan.capturedAt);
        if (result.duplicate) return false;
        this.refreshTools();
        this.addScanLog(
          `${result.operation === "checkout" ? "借出" : "归还"}「${result.slot.name}」· ${result.slot.id} · ${result.slot.drawer}`,
          "ok",
        );
        void this.clearVisionSession(scan.stationId);
        void this.publishToolLeds();
      } catch (error) {
        this.refreshTools();
        this.addScanLog(error instanceof Error ? error.message : "扫码处理失败", "err");
      }
      return true;
    } catch {
      return false;
    }
  }

  private addScanLog(msg: string, kind: "ok" | "warn" | "err") {
    this.state.scanLog.unshift({
      t: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      msg: msg.slice(0, 500),
      kind,
    });
    this.state.scanLog = this.state.scanLog.slice(0, 20);
  }

  private refreshTools() {
    const appliedRevision = this.state.toolStation.appliedRevision;
    const vision = this.state.toolStation.vision;
    this.state.tools = this.tools.tools;
    this.state.toolStation = { ...this.tools.station, appliedRevision, vision };
  }

  private publishToolLeds(): Promise<boolean> {
    return this.client?.publish("pit/control/toolbox/tool-leds", JSON.stringify(this.tools.ledSnapshot()), true) ?? Promise.resolve(false);
  }

  getToolAdminState() {
    this.refreshTools();
    return { ...this.tools.adminState, station: this.state.toolStation };
  }

  configureTool(input: unknown) {
    const result = this.tools.configure(input);
    this.refreshTools();
    this.markUpdated(Date.now());
    void this.publishToolLeds();
    return result;
  }

  removeTool(id: unknown) {
    const result = this.tools.remove(id);
    this.refreshTools();
    this.markUpdated(Date.now());
    void this.publishToolLeds();
    return result;
  }

  drawerForTool(id: string) {
    return this.tools.drawerForTool(id);
  }

  async startToolSession(operation: unknown, borrower?: unknown) {
    if (!this.client?.connected) throw new Error("设备网关未连接，无法启动扫码");
    if (!this.isVisionReady()) throw new Error("Dabai DC 相机未就绪");
    const result = this.tools.startSession(operation, borrower);
    this.refreshTools();
    this.markUpdated(Date.now());
    const sent = await this.publishVisionSession(result);
    if (!sent) {
      this.tools.cancelSession(result.id);
      this.refreshTools();
      this.markUpdated(Date.now());
      throw new Error("扫码会话下发失败");
    }
    setTimeout(() => {
      if (!this.tools.cancelSession(result.id)) return;
      this.refreshTools();
      void this.clearVisionSession(this.state.toolStation.vision.stationId);
      this.markUpdated(Date.now());
    }, Math.max(0, result.expiresAt - Date.now())).unref();
    return result;
  }

  async cancelToolSession() {
    this.tools.cancelSession();
    this.refreshTools();
    this.markUpdated(Date.now());
    await this.clearVisionSession(this.state.toolStation.vision.stationId);
  }

  syncToolLeds() {
    return this.publishToolLeds();
  }

  selectCameraSource(sourceId: unknown) {
    return this.cameras.select(sourceId);
  }

  private isVisionReady() {
    const vision = this.state.toolStation.vision;
    return vision.online && vision.ready && vision.updatedAt !== null && Date.now() - vision.updatedAt < 20_000;
  }

  private publishVisionSession(session: NonNullable<PitState["toolStation"]["activeSession"]>) {
    return this.publishTopic(`pit/control/vision/session/${this.state.toolStation.vision.stationId}`, JSON.stringify({
      sessionId: session.id,
      operation: session.operation,
      borrower: session.borrower,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }), true);
  }

  private clearVisionSession(stationId: string) {
    return this.publishTopic(`pit/control/vision/session/${stationId}`, "", true);
  }

  private publishTopic(topic: string, payload: string, retain: boolean) {
    if (!this.client?.connected) return Promise.resolve(false);
    return this.client.publish(topic, payload, retain);
  }

  /** 下行控制：经 WebSocket 长连接发送给分控 */
  publishControl(target: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!this.client?.connected) return Promise.resolve(false);
    return this.client.publish(`pit/control/${target}`, JSON.stringify(payload));
  }

  hasHomeAssistantChannel(id: string) {
    return this.homeAssistant?.hasChannel(id) ?? false;
  }

  async setHomeAssistantPower(id: string, on: boolean) {
    if (!this.homeAssistant) throw new Error("Home Assistant 插座未配置");
    return this.homeAssistant.setPower(id, on);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

function finiteNumber(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : null;
}

function oneOf<const T extends readonly string[]>(value: unknown, choices: T): T[number] | null {
  return typeof value === "string" && choices.includes(value) ? value as T[number] : null;
}

export function getPitHub(): PitHub {
  if (!globalForPit.pitHub) {
    globalForPit.pitHub = new PitHub();
    globalForPit.pitHub.start();
  }
  return globalForPit.pitHub;
}
