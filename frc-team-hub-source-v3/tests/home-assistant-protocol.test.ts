import assert from "node:assert/strict";
import test from "node:test";
import { callService, subscribeEntities, type HassEntities } from "home-assistant-js-websocket";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { createHomeAssistantConnection, withTimeout } from "../src/lib/home-assistant-connection";

test("authenticates, streams fresh state after reconnect, and calls services", async (t) => {
  const serviceCalls: Array<{ domain: string; service: string; entityId?: string }> = [];
  let connectionCount = 0;
  let latestClient: WebSocket | undefined;
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  t.after(() => server.close());
  server.on("connection", (socket) => {
    connectionCount += 1;
    latestClient = socket;
    socket.send(JSON.stringify({ type: "auth_required", ha_version: "2026.7.4" }));
    socket.on("message", (data) => handleMessage(socket, data, serviceCalls, connectionCount === 1 ? "off" : "on"));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法读取模拟服务端口");
  const connection = await createHomeAssistantConnection({ baseUrl: `http://127.0.0.1:${address.port}`, accessToken: "valid-token" });
  t.after(() => connection.close());
  const snapshots: HassEntities[] = [];
  const unsubscribe = subscribeEntities(connection, (states) => snapshots.push(states));
  t.after(() => unsubscribe());
  await waitFor(() => snapshots.at(-1)?.["switch.workbench"]?.state === "off");
  await callService(connection, "switch", "turn_on", undefined, { entity_id: "switch.workbench" });
  assert.deepEqual(serviceCalls, [{ domain: "switch", service: "turn_on", entityId: "switch.workbench" }]);
  latestClient?.close();
  await waitFor(() => connectionCount === 2 && snapshots.at(-1)?.["switch.workbench"]?.state === "on");
});

test("rejects an invalid long-lived access token", async (t) => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  t.after(() => server.close());
  server.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "auth_required", ha_version: "2026.7.4" }));
    socket.on("message", () => socket.send(JSON.stringify({ type: "auth_invalid", message: "Invalid access token" })));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法读取模拟服务端口");
  await assert.rejects(createHomeAssistantConnection({ baseUrl: `http://127.0.0.1:${address.port}`, accessToken: "invalid" }), /令牌无效/);
});

function handleMessage(socket: WebSocket, data: RawData, calls: Array<{ domain: string; service: string; entityId?: string }>, state: string) {
  const message = JSON.parse(data.toString()) as Record<string, unknown>;
  if (message.type === "auth") return socket.send(JSON.stringify({ type: "auth_ok", ha_version: "2026.7.4" }));
  if (message.type === "supported_features") return sendResult(socket, message.id, {});
  if (message.type === "subscribe_entities") {
    sendResult(socket, message.id, null);
    socket.send(JSON.stringify({ id: message.id, type: "event", event: { a: { "switch.workbench": { s: state, a: {}, c: "ctx", lc: Math.floor(Date.now() / 1000) } } } }));
    return;
  }
  if (message.type === "call_service") {
    const target = message.target as { entity_id?: string } | undefined;
    calls.push({ domain: String(message.domain), service: String(message.service), entityId: target?.entity_id });
    return sendResult(socket, message.id, null);
  }
  if (message.type === "unsubscribe_events") return sendResult(socket, message.id, null);
  if (message.type === "ping") socket.send(JSON.stringify({ id: message.id, type: "pong" }));
}

function sendResult(socket: WebSocket, id: unknown, result: unknown) {
  socket.send(JSON.stringify({ id, type: "result", success: true, result }));
}

async function waitFor(check: () => boolean) {
  await withTimeout(new Promise<void>((resolve) => {
    const timer = setInterval(() => { if (check()) { clearInterval(timer); resolve(); } }, 10);
    timer.unref();
  }), 3_000, "等待 Home Assistant 模拟事件超时");
}
