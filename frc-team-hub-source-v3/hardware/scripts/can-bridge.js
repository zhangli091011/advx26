/**
 * PIT-OS CAN 转 MQTT 桥
 * 运行于树莓派 5，通过 SocketCAN（USB-CAN 适配器）读取 FRC 机器人 CAN 总线，
 * 聚合设备心跳 → 发布 pit/can/devices 供面板显示。
 *
 * 依赖：npm i socketcan mqtt
 * 前置：sudo ip link set can0 up type can bitrate 1000000
 *
 * FRC CAN 设备 ID 约定（与前端一致）：
 *   01 DRIVE-L1 (TalonFX), 02 DRIVE-R1 (TalonFX), 11 INTAKE (SparkMax),
 *   21 SHOOTER (TalonFX×2), 31 CLIMB (SparkMax), 60 PDH (Rev PDH)
 */
const mqtt = require("mqtt");

const MQTT_URL = process.env.PIT_MQTT_URL || "mqtt://127.0.0.1:1883";
const CAN_IFACE = process.env.CAN_IFACE || "can0";
const HEARTBEAT_TIMEOUT_MS = 1500;   // 超过则判定离线
const REPORT_INTERVAL_MS = 500;

// 设备注册表：CAN 仲裁 ID 低 6 位 → 设备元数据
const DEVICE_MAP = {
  1:  { id: "01", name: "DRIVE-L1", model: "TalonFX (Kraken)", mech: "左驱动" },
  2:  { id: "02", name: "DRIVE-R1", model: "TalonFX (Kraken)", mech: "右驱动" },
  11: { id: "11", name: "INTAKE",   model: "SparkMax + NEO",   mech: "进气" },
  21: { id: "21", name: "SHOOTER",  model: "TalonFX ×2",        mech: "射手" },
  31: { id: "31", name: "CLIMB",    model: "SparkMax + NEO",   mech: "攀爬" },
  60: { id: "60", name: "PDH",      model: "Rev PDH",           mech: "电源分配" },
};

// 运行时状态：devId → { lastSeen, latencyMs, tempC }
const runtime = {};

const client = mqtt.connect(MQTT_URL, { clientId: "pit-can-bridge" });

let channel = null;
try {
  const can = require("socketcan");
  channel = can.createRawChannel(CAN_IFACE, true);
  channel.addListener("onMessage", (msg) => {
    const devId = msg.id & 0x3f;   // FRC 设备号在低 6 位
    const meta = DEVICE_MAP[devId];
    if (!meta) return;
    const now = Date.now();
    const prev = runtime[devId];
    runtime[devId] = {
      lastSeen: now,
      latencyMs: prev ? Math.min(99, Math.max(1, Math.round((now - prev.lastSeen) / 1))) : 1,
      // TalonFX 温度在特定帧的数据段，此处简化为周期上报；真实按协议解析
      tempC: parseTemp(msg),
    };
  });
  channel.start();
  console.log(`[can-bridge] SocketCAN ${CAN_IFACE} 已启动`);
} catch (err) {
  console.warn("[can-bridge] SocketCAN 不可用（非树莓派/未插适配器），仅发布空状态。", err.message);
}

// 从 CAN 帧数据段解析温度（占位实现，按实际设备协议调整）
function parseTemp(msg) {
  if (!msg.data || msg.data.length < 2) return null;
  return msg.data[0]; // 示例：假设温度在 data[0]
}

setInterval(() => {
  const now = Date.now();
  const devices = Object.entries(DEVICE_MAP).map(([devId, meta]) => {
    const rt = runtime[devId] || {};
    const on = rt.lastSeen && now - rt.lastSeen < HEARTBEAT_TIMEOUT_MS;
    return {
      ...meta,
      on: Boolean(on),
      latencyMs: on ? rt.latencyMs ?? null : null,
      tempC: on ? rt.tempC ?? null : null,
      lastHeartbeat: rt.lastSeen ?? 0,
    };
  });
  client.publish("pit/can/devices", JSON.stringify(devices), { qos: 1, retain: true });
}, REPORT_INTERVAL_MS);

client.on("connect", () => console.log("[can-bridge] MQTT 已连接", MQTT_URL));
