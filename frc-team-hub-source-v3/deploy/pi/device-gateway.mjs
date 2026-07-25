import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const port = Number(process.env.PIT_GATEWAY_PORT || 8765);
const token = process.env.PIT_GATEWAY_TOKEN || "";
const maxPayload = 64 * 1024;
const retained = new Map();
const clients = new Set();

if (!token) throw new Error("PIT_GATEWAY_TOKEN is required");

const permissions = {
  pithub: {
    publish: ["pit/control/"],
    subscribe: ["pit/esp32-a/", "pit/esp32-b/", "pit/can/", "pit/vision/", "pit/toolbox/"],
  },
  vision: { publish: ["pit/vision/"], subscribe: ["pit/control/vision/session/"] },
  can: { publish: ["pit/can/"], subscribe: [] },
  cabinet: { publish: ["pit/esp32-a/"], subscribe: ["pit/control/locate/", "pit/control/locate-unit/"] },
  power: { publish: ["pit/esp32-b/"], subscribe: ["pit/control/power/"] },
  toolbox: { publish: ["pit/toolbox/"], subscribe: ["pit/control/toolbox/", "pit/control/locate/"] },
};

function matches(channel, pattern) {
  return pattern.endsWith("#") ? channel.startsWith(pattern.slice(0, -1)) : channel === pattern;
}

function allowed(channel, prefixes) {
  return typeof channel === "string" && prefixes.some((prefix) => channel.startsWith(prefix));
}

function validToken(candidate) {
  if (typeof candidate !== "string") return false;
  const expected = Buffer.from(token);
  const actual = Buffer.from(candidate);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function send(socket, value) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function broadcast(channel, payload, sender) {
  for (const client of clients) {
    if (client === sender || !client.authenticated) continue;
    if (client.subscriptions.some((pattern) => matches(channel, pattern))) {
      send(client, { type: "event", channel, payload });
    }
  }
}

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, clients: [...clients].filter((client) => client.authenticated).length }));
    return;
  }
  response.writeHead(404).end();
});

const wss = new WebSocketServer({ server, maxPayload });
wss.on("connection", (socket, request) => {
  socket.authenticated = false;
  socket.subscriptions = [];
  socket.alive = true;
  clients.add(socket);
  const authTimer = setTimeout(() => socket.close(4401, "authentication timeout"), 5_000);
  socket.on("pong", () => { socket.alive = true; });
  socket.on("message", (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return socket.close(4400, "invalid JSON"); }
    if (!socket.authenticated) {
      const rolePermissions = permissions[message.role];
      if (message.type !== "hello" || !validToken(message.token) || !rolePermissions || typeof message.clientId !== "string") {
        return socket.close(4403, "unauthorized");
      }
      clearTimeout(authTimer);
      socket.authenticated = true;
      socket.role = message.role;
      socket.clientId = message.clientId.slice(0, 80);
      socket.permissions = rolePermissions;
      send(socket, { type: "welcome", connectionId: randomUUID(), heartbeatMs: 10_000, serverTime: Date.now() });
      return;
    }
    if (message.type === "subscribe" && Array.isArray(message.channels)) {
      const channels = message.channels.filter((channel) => allowed(channel.replace(/#$/, ""), socket.permissions.subscribe)).slice(0, 32);
      socket.subscriptions = channels;
      for (const [channel, payload] of retained) {
        if (channels.some((pattern) => matches(channel, pattern))) send(socket, { type: "event", channel, payload });
      }
      return;
    }
    if (message.type === "publish" && allowed(message.channel, socket.permissions.publish)) {
      const payload = typeof message.payload === "string" ? message.payload : JSON.stringify(message.payload);
      if (Buffer.byteLength(payload) > maxPayload) return socket.close(4409, "payload too large");
      if (message.retain === true) {
        if (payload) retained.set(message.channel, payload);
        else retained.delete(message.channel);
      }
      broadcast(message.channel, payload, socket);
      if (typeof message.messageId === "string") send(socket, { type: "ack", messageId: message.messageId });
    }
  });
  socket.on("close", () => {
    clearTimeout(authTimer);
    clients.delete(socket);
  });
  socket.on("error", () => undefined);
  console.log(`[gateway] connection from ${request.socket.remoteAddress}`);
});

const heartbeat = setInterval(() => {
  for (const client of clients) {
    if (!client.alive) {
      client.terminate();
      continue;
    }
    client.alive = false;
    client.ping();
  }
}, 10_000);
heartbeat.unref();

server.listen(port, "0.0.0.0", () => console.log(`[gateway] listening on 0.0.0.0:${port}`));

function shutdown() {
  for (const client of clients) client.close(1001, "server shutdown");
  wss.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
