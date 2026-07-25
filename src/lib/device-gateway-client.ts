import "server-only";

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

type GatewayClientOptions = {
  url: string;
  token: string;
  clientId: string;
  role: "pithub" | "vision" | "can" | "cabinet" | "power" | "toolbox";
  subscriptions?: string[];
};

export class DeviceGatewayClient extends EventEmitter {
  connected = false;
  private socket: WebSocket | null = null;
  private stopped = false;
  private reconnectDelay = 1_000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pending = new Map<string, { resolve(value: boolean): void; timer: NodeJS.Timeout }>();

  constructor(private readonly options: GatewayClientOptions) {
    super();
  }

  start() {
    if (this.socket || this.stopped) return;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
    this.setConnected(false);
    this.finishPending(false);
  }

  publish(channel: string, payload: string, retain = false): Promise<boolean> {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return Promise.resolve(false);
    const messageId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        resolve(false);
      }, 3_000);
      timer.unref();
      this.pending.set(messageId, { resolve, timer });
      this.socket?.send(JSON.stringify({ type: "publish", messageId, channel, payload, retain }));
    });
  }

  private connect() {
    const socket = new WebSocket(this.options.url, { handshakeTimeout: 5_000, maxPayload: 64 * 1024 });
    this.socket = socket;
    socket.on("open", () => socket.send(JSON.stringify({
      type: "hello",
      clientId: this.options.clientId,
      role: this.options.role,
      token: this.options.token,
    })));
    socket.on("message", (raw) => {
      let message: Record<string, unknown>;
      try { message = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return; }
      if (message.type === "welcome") {
        this.reconnectDelay = 1_000;
        this.setConnected(true);
        if (this.options.subscriptions?.length) {
          socket.send(JSON.stringify({ type: "subscribe", channels: this.options.subscriptions }));
        }
        return;
      }
      if (message.type === "event" && typeof message.channel === "string" && typeof message.payload === "string") {
        this.emit("message", message.channel, Buffer.from(message.payload));
        return;
      }
      if (message.type === "ack" && typeof message.messageId === "string") {
        const pending = this.pending.get(message.messageId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.messageId);
        pending.resolve(true);
      }
    });
    const disconnected = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.setConnected(false);
      this.finishPending(false);
      if (this.stopped || this.reconnectTimer) return;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.reconnectDelay);
      this.reconnectTimer.unref();
      this.reconnectDelay = Math.min(10_000, this.reconnectDelay * 2);
    };
    socket.on("close", disconnected);
    socket.on("error", disconnected);
  }

  private setConnected(value: boolean) {
    if (this.connected === value) return;
    this.connected = value;
    this.emit(value ? "connect" : "close");
  }

  private finishPending(value: boolean) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(value);
    }
    this.pending.clear();
  }
}
