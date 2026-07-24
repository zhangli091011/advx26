import "server-only";

import mqtt from "mqtt";
import { EventEmitter } from "node:events";
import type {
  Battery,
  Compartment,
  PitState,
  PitTool,
  PowerChannel,
  RackUnit,
} from "@/types/pit";

export type { PitState } from "@/types/pit";

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

/* ---------------- 初始空状态（无硬件时回退） ---------------- */
function emptyState(): PitState {
  return {
    updatedAt: 0,
    source: "empty",
    connection: {
      brokerConnected: false,
      lastMessageAt: null,
      deviceLastSeen: { cabinet: null, power: null, can: null, vision: null },
    },
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
        username: process.env.PIT_MQTT_USERNAME || undefined,
        password: process.env.PIT_MQTT_PASSWORD || undefined,
        reconnectPeriod: 3000,
        connectTimeout: 4000,
      });
      this.client.on("connect", () => {
        this.state.connection.brokerConnected = true;
        this.client?.subscribe([
          "pit/esp32-a/#",
          "pit/esp32-b/#",
          "pit/can/#",
          "pit/vision/#",
        ], { qos: 1 });
        this.emit("update", this.state);
      });
      this.client.on("close", () => {
        if (!this.state.connection.brokerConnected) return;
        this.state.connection.brokerConnected = false;
        this.emit("update", this.state);
      });
      this.client.on("error", () => {
        /* broker 未启动时保持静默，前端走空状态 */
      });
      this.client.on("message", (topic, payload) => this.onMessage(topic, payload));
    } catch {
      this.client = null;
    }
  }

  private onMessage(topic: string, payload: Buffer) {
    if (payload.length > 64 * 1024) return;
    const parts = topic.split("/");
    const source = parts[1];
    if (!source || !["esp32-a", "esp32-b", "can", "vision"].includes(source)) return;

    const now = Date.now();
    if (parts[2] === "status") {
      const seenAt = payload.toString().trim() === "online" ? now : null;
      if (source === "esp32-a") this.state.connection.deviceLastSeen.cabinet = seenAt;
      else if (source === "esp32-b") this.state.connection.deviceLastSeen.power = seenAt;
      this.markUpdated(now);
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
    else this.state.connection.deviceLastSeen.vision = now;
    let handled = false;
    if (source === "esp32-a") handled = this.handleCabinet(parts, data);
    else if (source === "esp32-b") handled = this.handlePower(parts, data);
    else if (source === "can") handled = this.handleCan(parts, data);
    else handled = this.handleVision(parts, data);
    if (handled) this.markUpdated(now);
  }

  private markUpdated(now: number) {
    this.state.updatedAt = now;
    this.state.source = "live";
    this.state.connection.lastMessageAt = now;
    this.emit("update", this.state);
  }

  /* ESP32-A：16U 储存柜（工具位 / 储物单元 / 格位） */
  private handleCabinet(parts: string[], data: unknown) {
    const d = asRecord(data);
    if (!d) return false;
    if (parts[2] === "tools" && parts[3]) {
      const slot = parts[3];
      const idx = this.state.tools.findIndex((t) => t.slot === slot);
      const tool: PitTool = {
        slot,
        name: String(d.name ?? slot),
        unit: String(d.unit ?? slot.split("-")[0]),
        state: oneOf(d.state, ["in", "out", "lost"] as const, "in"),
        who: optionalText(d.who),
        time: optionalText(d.time),
        qr: optionalText(d.qr),
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
        level: oneOf(d.level, ["ok", "low", "active"] as const, "ok"),
        pct: finiteNumber(d.pct, 0, 0, 100),
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
        qty: finiteNumber(d.qty, 0, 0, 1_000_000),
        state: oneOf(d.state, ["ok", "low", "empty", "active"] as const, "ok"),
      };
      if (idx >= 0) this.state.compartments[idx] = comp;
      else this.state.compartments.push(comp);
    } else return false;
    return true;
  }

  /* ESP32-B：电源配电箱（通道 / 电池 / 环境） */
  private handlePower(parts: string[], data: unknown) {
    const d = asRecord(data);
    if (!d) return false;
    if (parts[2] === "power" && parts[3]) {
      const id = parts[3];
      const idx = this.state.channels.findIndex((c) => c.id === id);
      const ch: PowerChannel = {
        id,
        name: String(d.name ?? id),
        zone: String(d.zone ?? ""),
        volts: finiteNumber(d.volts, 0, 0, 500),
        amps: finiteNumber(d.amps, 0, 0, 100),
        watts: finiteNumber(d.watts, 0, 0, 50_000),
        on: d.on === true,
      };
      if (idx >= 0) this.state.channels[idx] = ch;
      else this.state.channels.push(ch);
      this.state.channels.sort((a, b) => a.id.localeCompare(b.id));
    } else if (parts[2] === "battery" && parts[3]) {
      const id = parts[3];
      const idx = this.state.batteries.findIndex((b) => b.id === id);
      const bat: Battery = {
        id,
        pct: finiteNumber(d.pct, 0, 0, 100),
        charging: d.charging === true,
        volts: finiteNumber(d.volts, 0, 0, 100),
      };
      if (idx >= 0) this.state.batteries[idx] = bat;
      else this.state.batteries.push(bat);
      this.state.batteries.sort((a, b) => a.id.localeCompare(b.id));
    } else if (parts[2] === "env") {
      this.state.env = {
        tempC: finiteNumber(d.tempC, 0, -50, 150),
        humidity: finiteNumber(d.humidity, 0, 0, 100),
      };
    } else return false;
    return true;
  }

  /* 机器人 CAN（来自 USB-CAN 适配器 + TunerX 服务） */
  private handleCan(parts: string[], data: unknown) {
    if (parts[2] !== "devices" || !Array.isArray(data)) return false;
    this.state.canDevices = data.slice(0, 128).filter(isRecord).map((d) => ({
      id: String(d.id ?? ""),
      name: String(d.name ?? ""),
      model: String(d.model ?? ""),
      mech: String(d.mech ?? ""),
      on: Boolean(d.on),
      latencyMs: d.latencyMs == null ? null : finiteNumber(d.latencyMs, 0, 0, 60_000),
      tempC: d.tempC == null ? null : finiteNumber(d.tempC, 0, -50, 200),
      lastHeartbeat: finiteNumber(d.lastHeartbeat, 0, 0, Number.MAX_SAFE_INTEGER),
    }));
    return true;
  }

  /* 视觉识别扫码事件 */
  private handleVision(_parts: string[], data: unknown) {
    const d = asRecord(data);
    if (!d) return false;
    const entry = {
      t: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      msg: String(d.msg ?? "").slice(0, 500),
      kind: oneOf(d.kind, ["ok", "warn", "err"] as const, "ok"),
    };
    this.state.scanLog.unshift(entry);
    this.state.scanLog = this.state.scanLog.slice(0, 20);
    return true;
  }

  /** 下行控制：发布 MQTT 指令给分控 */
  publishControl(target: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!this.client?.connected) return Promise.resolve(false);
    return new Promise((resolve) => {
      this.client?.publish(`pit/control/${target}`, JSON.stringify(payload), { qos: 1 }, (error) => {
        resolve(!error);
      });
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value.slice(0, 200) : undefined;
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function oneOf<const T extends readonly string[]>(value: unknown, choices: T, fallback: T[number]): T[number] {
  return typeof value === "string" && choices.includes(value) ? value as T[number] : fallback;
}

export function getPitHub(): PitHub {
  if (!globalForPit.pitHub) {
    globalForPit.pitHub = new PitHub();
    globalForPit.pitHub.start();
  }
  return globalForPit.pitHub;
}
