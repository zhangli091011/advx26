/** PIT-OS SocketCAN to WebSocket device gateway bridge. */
const WebSocket = require("ws");
const { randomUUID } = require("node:crypto");

const GATEWAY_URL = process.env.PIT_GATEWAY_URL || "ws://127.0.0.1:8765";
const GATEWAY_TOKEN = process.env.PIT_GATEWAY_TOKEN || "";
const CAN_IFACE = process.env.CAN_IFACE || "can0";
const HEARTBEAT_TIMEOUT_MS = 1500;
const REPORT_INTERVAL_MS = 500;

const DEVICE_MAP = {
  1: { id: "01", name: "DRIVE-L1", model: "TalonFX (Kraken)", mech: "左驱动" },
  2: { id: "02", name: "DRIVE-R1", model: "TalonFX (Kraken)", mech: "右驱动" },
  11: { id: "11", name: "INTAKE", model: "SparkMax + NEO", mech: "进气" },
  21: { id: "21", name: "SHOOTER", model: "TalonFX ×2", mech: "射手" },
  31: { id: "31", name: "CLIMB", model: "SparkMax + NEO", mech: "攀爬" },
  60: { id: "60", name: "PDH", model: "Rev PDH", mech: "电源分配" },
};
const runtime = {};
let socket = null;
let connected = false;
let reconnectDelay = 1000;
let latestSnapshot = "[]";

function connect() {
  socket = new WebSocket(GATEWAY_URL, { handshakeTimeout: 5000 });
  socket.on("open", () => socket.send(JSON.stringify({
    type: "hello", clientId: "can-bridge-main", role: "can", token: GATEWAY_TOKEN,
  })));
  socket.on("message", (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type !== "welcome") return;
    connected = true;
    reconnectDelay = 1000;
    publishSnapshot();
    console.log(`[can-bridge] gateway connected ${GATEWAY_URL}`);
  });
  const reconnect = () => {
    if (socket === null) return;
    socket = null;
    connected = false;
    setTimeout(connect, reconnectDelay).unref();
    reconnectDelay = Math.min(10000, reconnectDelay * 2);
  };
  socket.once("close", reconnect);
  socket.once("error", reconnect);
}

function publishSnapshot() {
  if (!connected || socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    type: "publish",
    messageId: randomUUID(),
    channel: "pit/can/devices",
    payload: latestSnapshot,
    retain: true,
  }));
}

try {
  const can = require("socketcan");
  const channel = can.createRawChannel(CAN_IFACE, true);
  channel.addListener("onMessage", (message) => {
    const deviceId = message.id & 0x3f;
    if (!DEVICE_MAP[deviceId]) return;
    const now = Date.now();
    const previous = runtime[deviceId];
    runtime[deviceId] = {
      lastSeen: now,
      latencyMs: previous ? Math.min(99, Math.max(1, now - previous.lastSeen)) : 1,
      tempC: null,
    };
  });
  channel.start();
  console.log(`[can-bridge] SocketCAN ${CAN_IFACE} started`);
} catch (error) {
  console.warn(`[can-bridge] SocketCAN unavailable: ${error.message}`);
}

setInterval(() => {
  const now = Date.now();
  latestSnapshot = JSON.stringify(Object.entries(DEVICE_MAP).map(([deviceId, metadata]) => {
    const state = runtime[deviceId] || {};
    const online = state.lastSeen && now - state.lastSeen < HEARTBEAT_TIMEOUT_MS;
    return {
      ...metadata,
      on: Boolean(online),
      latencyMs: online ? state.latencyMs ?? null : null,
      tempC: online ? state.tempC ?? null : null,
      lastHeartbeat: state.lastSeen ?? 0,
    };
  }));
  publishSnapshot();
}, REPORT_INTERVAL_MS).unref();

connect();
