import "server-only";

import { callService, subscribeEntities, type Connection, type HassEntities } from "home-assistant-js-websocket";
import { createHomeAssistantConnection, withTimeout } from "@/lib/home-assistant-connection";
import type { HomeAssistantOutletConfig } from "@/lib/home-assistant-config";
import { isAvailable, measurement, type HomeAssistantState } from "@/lib/home-assistant-model";
import type { StoredPitConfig } from "@/lib/pit-config-model";
import type { PowerChannel } from "@/types/pit";

type OutletUpdate = (channel: PowerChannel) => void;

export class HomeAssistantOutletManager {
  readonly configs: HomeAssistantOutletConfig[];
  private readonly config: StoredPitConfig["homeAssistant"];
  private connection: Connection | null = null;
  private states = new Map<string, HomeAssistantState>();
  private unsubscribe: (() => void) | null = null;
  private update: OutletUpdate | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: StoredPitConfig["homeAssistant"]) {
    this.config = config;
    this.configs = config.outlets.filter((outlet) => outlet.switchEntityId);
  }

  start(update: OutletUpdate) {
    if (!this.configs.length || this.connection || this.stopped) return;
    this.update = update;
    void this.connect();
  }

  hasChannel(id: string) {
    return this.configs.some((config) => config.id === id);
  }

  async setPower(id: string, on: boolean) {
    const config = this.requireConfig(id);
    if (!this.connection?.connected) throw new Error("Home Assistant 未连接");
    const state = this.states.get(config.switchEntityId);
    if (!state || !isAvailable(state)) throw new Error(`${config.switchEntityId} 当前不可用`);
    await withTimeout(callService(
      this.connection,
      "switch",
      on ? "turn_on" : "turn_off",
      undefined,
      { entity_id: config.switchEntityId },
    ), 5_000, "Home Assistant 控制超时");
    return "websocket" as const;
  }

  async testConnection(id: string) {
    const config = this.requireConfig(id);
    const connection = await createHomeAssistantConnection(this.config);
    try {
      const states = await withTimeout(
        connection.sendMessagePromise<HomeAssistantState[]>({ type: "get_states" }),
        5_000,
        "Home Assistant 状态读取超时",
      );
      const state = states.find((item) => item.entity_id === config.switchEntityId);
      if (!state) throw new Error(`Home Assistant 中未找到 ${config.switchEntityId}`);
      if (!isAvailable(state)) throw new Error(`${config.switchEntityId} 当前不可用`);
      return "websocket" as const;
    } finally {
      connection.close();
    }
  }

  destroy() {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.connection?.close();
    this.connection = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.states.clear();
  }

  private async connect() {
    try {
      const connection = await createHomeAssistantConnection(this.config);
      if (this.stopped) return connection.close();
      this.connection = connection;
      connection.addEventListener("disconnected", () => this.markOffline());
      connection.addEventListener("reconnect-error", () => this.markOffline());
      this.unsubscribe = subscribeEntities(connection, (states) => this.receiveStates(states));
    } catch (error) {
      this.markOffline();
      console.error(`[home-assistant] ${error instanceof Error ? error.message : String(error)}`);
      if (this.stopped) return;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        void this.connect();
      }, 5_000);
      this.reconnectTimer.unref();
    }
  }

  private receiveStates(states: HassEntities) {
    this.states = new Map(Object.values(states).map((state) => [state.entity_id, state]));
    for (const config of this.configs) this.emitChannel(config, true);
  }

  private markOffline() {
    this.states.clear();
    for (const config of this.configs) this.emitChannel(config, false);
  }

  private emitChannel(config: HomeAssistantOutletConfig, connected: boolean) {
    const switchState = this.states.get(config.switchEntityId);
    const online = connected && Boolean(switchState && isAvailable(switchState) && ["on", "off"].includes(switchState.state));
    this.update?.({
      id: config.id,
      name: config.name,
      zone: config.zone,
      provider: "home-assistant",
      transport: online ? "websocket" : null,
      online,
      on: online && switchState?.state === "on",
      watts: measurement(this.states.get(config.wattsEntityId ?? ""), "watts"),
      volts: measurement(this.states.get(config.voltsEntityId ?? ""), "volts"),
      amps: measurement(this.states.get(config.ampsEntityId ?? ""), "amps"),
      updatedAt: online ? Date.now() : 0,
    });
  }

  private requireConfig(id: string) {
    const config = this.configs.find((item) => item.id === id);
    if (!config) throw new Error("未找到 Home Assistant 插座配置");
    return config;
  }
}
