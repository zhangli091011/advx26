import assert from "node:assert/strict";
import test from "node:test";
import {
  callService,
  subscribeEntities,
  type HassEntities,
} from "home-assistant-js-websocket";
import {
  WebSocketServer,
  type RawData,
  type WebSocket,
} from "ws";
import {
  createHomeAssistantConnection,
  withTimeout,
} from "../src/lib/home-assistant-connection";

type CapturedServiceCall = {
  domain: string;
  service: string;
  target?: { entity_id?: string };
};

test("authenticates, streams state, calls services, and recovers after disconnect", async (t) => {
  const serviceCalls: CapturedServiceCall[] = [];
  let connectionCount = 0;
  let latestClient: WebSocket | undefined;
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => server.close());

  server.on("connection", (socket) => {
    connectionCount += 1;
    latestClient = socket;
    socket.send(JSON.stringify({
      type: "auth_required",
      ha_version: "2026.7.2",
    }));
    socket.on("message", (data) => {
      handleMessage(socket, data, serviceCalls);
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法读取 Home Assistant 模拟服务端口");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const connection = await createHomeAssistantConnection({
    baseUrl,
    accessToken: "valid-token",
  });
  t.after(() => connection.close());

  const snapshots: HassEntities[] = [];
  const unsubscribe = subscribeEntities(connection, (states) => {
    snapshots.push(states);
  });
  t.after(() => unsubscribe());

  await waitFor(() => snapshots.at(-1)?.["switch.workbench"]?.state === "off");
  await callService(
    connection,
    "switch",
    "turn_on",
    undefined,
    { entity_id: "switch.workbench" },
  );
  assert.deepEqual(serviceCalls, [{
    domain: "switch",
    service: "turn_on",
    target: { entity_id: "switch.workbench" },
  }]);

  const readyAgain = new Promise<void>((resolve) => {
    connection.addEventListener("ready", () => {
      if (connectionCount > 1) resolve();
    });
  });
  latestClient?.close();
  await withTimeout(readyAgain, 3_000, "Home Assistant 未自动重连");
  await waitFor(() => connectionCount === 2 && snapshots.length >= 2);
  assert.equal(snapshots.at(-1)?.["switch.workbench"]?.state, "off");
});

test("rejects an invalid long-lived access token", async (t) => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => server.close());

  server.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "auth_required", ha_version: "2026.7.2" }));
    socket.on("message", (data) => {
      const message = parseMessage(data);
      if (message.type === "auth") {
        socket.send(JSON.stringify({
          type: "auth_invalid",
          message: "Invalid access token",
        }));
      }
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法读取 Home Assistant 模拟服务端口");
  }
  await assert.rejects(
    createHomeAssistantConnection({
      baseUrl: `http://127.0.0.1:${address.port}`,
      accessToken: "invalid-token",
    }),
    (error) => error === 2,
  );
});

function handleMessage(
  socket: WebSocket,
  data: RawData,
  serviceCalls: CapturedServiceCall[],
) {
  const message = parseMessage(data);
  if (message.type === "auth") {
    if (message.access_token !== "valid-token") {
      socket.send(JSON.stringify({ type: "auth_invalid", message: "Invalid access token" }));
      return;
    }
    socket.send(JSON.stringify({ type: "auth_ok", ha_version: "2026.7.2" }));
    return;
  }
  if (message.type === "supported_features") {
    sendResult(socket, message.id, {});
    return;
  }
  if (message.type === "subscribe_entities") {
    sendResult(socket, message.id, null);
    socket.send(JSON.stringify({
      id: message.id,
      type: "event",
      event: {
        a: {
          "switch.workbench": {
            s: "off",
            a: { friendly_name: "工作台电源" },
            c: "context-id",
            lc: Math.floor(Date.now() / 1000),
          },
        },
      },
    }));
    return;
  }
  if (message.type === "call_service") {
    serviceCalls.push({
      domain: String(message.domain),
      service: String(message.service),
      target: message.target as CapturedServiceCall["target"],
    });
    sendResult(socket, message.id, null);
    return;
  }
  if (message.type === "unsubscribe_events") {
    sendResult(socket, message.id, null);
    return;
  }
  if (message.type === "ping") {
    socket.send(JSON.stringify({ id: message.id, type: "pong" }));
  }
}

function parseMessage(data: RawData): Record<string, unknown> {
  return JSON.parse(data.toString()) as Record<string, unknown>;
}

function sendResult(socket: WebSocket, id: unknown, result: unknown) {
  socket.send(JSON.stringify({ id, type: "result", success: true, result }));
}

async function waitFor(check: () => boolean) {
  await withTimeout(
    new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (!check()) return;
        clearInterval(timer);
        resolve();
      }, 10);
      timer.unref();
    }),
    3_000,
    "等待 Home Assistant 模拟事件超时",
  );
}
