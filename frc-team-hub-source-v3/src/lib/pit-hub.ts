import "server-only";

import mqtt from "mqtt";
import { EventEmitter } from "node:events";

/**
 * PIT-OS 实时数据中心
 * 运行在树莓派 5 上：作为 MQTT 客户端连接本地 Mosquitto Broker，
 * 聚合两个 ESP32 分控上报的设备影子状态，供 Next.js API 读取。
 *
 * Topic 规划：
 *   pit/esp32-a/tools/{slot}        → 工具位状态（视觉识别结果）
 *   pit/esp32-a/units/{unit}        → 储物单元称重/门磁
 *   pit/esp32-a/compartments/{id}   → U4 格位库存
 *   pit/esp32-b/power/{ch}          → 电源通道电流/开关状态
 *   pit/esp32-b/battery/{id}        → 电池充电状态
 *   pit/esp32-b/env                 → 箱内温湿度
 *   pit/can/devices                 → 机器人 CAN 设备心跳（来自 CAN 适配器服务）
 *   pit/vision/scan                 → 视觉识别扫码事件
 *   pit/control/{target}            → 下行控制指令（开关/指示灯/继电器）
 */

export type ToolState = "in" | "out" | "lost";
export interface PitTool {
  slot: string;
  name: string;
  unit: string;
  state: ToolState;
  who?: string;
  time?: string;
  qr?: string; // 二维码内容
}

export interface RackUnit {
  u: string;
  name: string;
  note: string;
  status: string;
  level: "ok" | "low" | "active";
  pct: number;
}

export interface Compartment {
  id: string;
  label: string;
  qty: number;
  state: "ok" | "low" | "empty" | "active";
}

export interface PowerChannel {
  id: string;
  name: string;
  zone: string;
  volts: number;
  amps: number;
  watts: number;
  on: boolean;
}

export interface Battery {
  id: string;
  pct: number;
  charging: boolean;
  volts: number;
}

export interface CanDevice {
  id: string;
  name: string;
  model: string;
  mech: string;
  on: boolean;
  latencyMs: number | null;
  tempC: number | null;
  lastHeartbeat: number;
}

export interface PitState {
  updatedAt: number;
  tools: PitTool[];
  units: RackUnit[];
  compartments: Compartment[];
  channels: PowerChannel[];
  batteries: Battery[];
  canDevices: CanDevice[];
  env: { tempC: number; humidity: number };
  scanLog: Array<{ t: string; msg: string; kind: "ok" | "warn" | "err" }>;
}

/* ---------------- 初始空状态（无硬件时回退） ---------------- */
function emptyState(): PitState {
  return {
    updatedAt: 0,
    tools: [],
    units: [],
    compartments: [],
    channels: [],
    batteries: [],
    canDevices: [],
    env: { tempC: 0, humidity: 0 },
    scanLog: [],
  };
}

/* ---------------- 单例数据中心 ---------------- */
const globalForPit = globalThis as unknown as {
  pitHub?: PitHub;
};

class PitHub extends EventEmitter {
  state: PitState = emptyState();
  private client: mqtt.MqttClient | null = null;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    const url = process.env.PIT_MQTT_URL ?? "mqtt://127.0.0.1:1883";
    try {
      this.client = mqtt.connect(url, {
        clientId: `pit-hub-${Math.random().toString(16).slice(2, 8)}`,
        reconnectPeriod: 3000,
        connectTimeout: 4000,
      });
      this.client.on("connect", () => {
        this.client?.subscribe("pit/#", { qos: 1 });
        this.emit("broker", true);
      });
      this.client.on("close", () => this.emit("broker", false));
      this.client.on("error", () => {
        /* broker 未启动时保持静默，前端走空状态 */
      });
      this.client.on("message", (topic, payload) => this.onMessage(topic, payload));
    } catch {
      this.client = null;
    }
  }

  private onMessage(topic: string, payload: Buffer) {
    let data: unknown;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      return;
    }
    const parts = topic.split("/");
    this.state.updatedAt = Date.now();

    if (parts[1] === "esp32-a") this.handleCabinet(parts, data);
    else if (parts[1] === "esp32-b") this.handlePower(parts, data);
    else if (parts[1] === "can") this.handleCan(parts, data);
    else if (parts[1] === "vision") this.handleVision(parts, data);
    this.emit("update", this.state);
  }

  /* ESP32-A：16U 储存柜（工具位 / 储物单元 / 格位） */
  private handleCabinet(parts: string[], data: unknown) {
    const d = data as Record<string, unknown>;
    if (parts[2] === "tools" && parts[3]) {
      const slot = parts[3];
      const idx = this.state.tools.findIndex((t) => t.slot === slot);
      const tool: PitTool = {
        slot,
        name: String(d.name ?? slot),
        unit: String(d.unit ?? slot.split("-")[0]),
        state: (d.state as ToolState) ?? "in",
        who: d.who as string | undefined,
        time: d.time as string | undefined,
        qr: d.qr as string | undefined,
      };
      if (idx >= 0) this.state.tools[idx] = tool;
      else this.state.tools.push(tool);
      this.state.tools.sort((a, b) => a.slot.localeCompare(b.slot));
    } else if (parts[2] === "units" && parts[3]) {
      const u = parts[3];
      const idx = this.state.units.findIndex((x) => x.u === u);
      const unit: RackUnit = {
        u,
        name: String(d.name ?? u),
        note: String(d.note ?? ""),
        status: String(d.status ?? ""),
        level: (d.level as RackUnit["level"]) ?? "ok",
        pct: Number(d.pct ?? 0),
      };
      if (idx >= 0) this.state.units[idx] = unit;
      else this.state.units.push(unit);
      this.state.units.sort((a, b) => a.u.localeCompare(b.u));
    } else if (parts[2] === "compartments" && parts[3]) {
      const id = parts[3];
      const idx = this.state.compartments.findIndex((c) => c.id === id);
      const comp: Compartment = {
        id,
        label: String(d.label ?? id),
        qty: Number(d.qty ?? 0),
        state: (d.state as Compartment["state"]) ?? "ok",
      };
      if (idx >= 0) this.state.compartments[idx] = comp;
      else this.state.compartments.push(comp);
    }
  }

  /* ESP32-B：电源配电箱（通道 / 电池 / 环境） */
  private handlePower(parts: string[], data: unknown) {
    const d = data as Record<string, unknown>;
    if (parts[2] === "power" && parts[3]) {
      const id = parts[3];
      const idx = this.state.channels.findIndex((c) => c.id === id);
      const ch: PowerChannel = {
        id,
        name: String(d.name ?? id),
        zone: String(d.zone ?? ""),
        volts: Number(d.volts ?? 0),
        amps: Number(d.amps ?? 0),
        watts: Number(d.watts ?? 0),
        on: Boolean(d.on),
      };
      if (idx >= 0) this.state.channels[idx] = ch;
      else this.state.channels.push(ch);
      this.state.channels.sort((a, b) => a.id.localeCompare(b.id));
    } else if (parts[2] === "battery" && parts[3]) {
      const id = parts[3];
      const idx = this.state.batteries.findIndex((b) => b.id === id);
      const bat: Battery = {
        id,
        pct: Number(d.pct ?? 0),
        charging: Boolean(d.charging),
        volts: Number(d.volts ?? 0),
      };
      if (idx >= 0) this.state.batteries[idx] = bat;
      else this.state.batteries.push(bat);
      this.state.batteries.sort((a, b) => a.id.localeCompare(b.id));
    } else if (parts[2] === "env") {
      this.state.env = { tempC: Number(d.tempC ?? 0), humidity: Number(d.humidity ?? 0) };
    }
  }

  /* 机器人 CAN（来自 USB-CAN 适配器 + TunerX 服务） */
  private handleCan(parts: string[], data: unknown) {
    if (parts[2] !== "devices" || !Array.isArray(data)) return;
    this.state.canDevices = (data as Array<Record<string, unknown>>).map((d) => ({
      id: String(d.id ?? ""),
      name: String(d.name ?? ""),
      model: String(d.model ?? ""),
      mech: String(d.mech ?? ""),
      on: Boolean(d.on),
      latencyMs: d.latencyMs == null ? null : Number(d.latencyMs),
      tempC: d.tempC == null ? null : Number(d.tempC),
      lastHeartbeat: Number(d.lastHeartbeat ?? 0),
    }));
  }

  /* 视觉识别扫码事件 */
  private handleVision(_parts: string[], data: unknown) {
    const d = data as Record<string, unknown>;
    const entry = {
      t: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      msg: String(d.msg ?? ""),
      kind: (d.kind as "ok" | "warn" | "err") ?? "ok",
    };
    this.state.scanLog.unshift(entry);
    this.state.scanLog = this.state.scanLog.slice(0, 20);
  }

  /** 下行控制：发布 MQTT 指令给分控 */
  publishControl(target: string, payload: Record<string, unknown>) {
    if (!this.client) return false;
    this.client.publish(`pit/control/${target}`, JSON.stringify(payload), { qos: 1 });
    return true;
  }
}

export function getPitHub(): PitHub {
  if (!globalForPit.pitHub) {
    globalForPit.pitHub = new PitHub();
    globalForPit.pitHub.start();
  }
  return globalForPit.pitHub;
}
