import "server-only";

import { HomeAssistantClient, type HomeAssistantState } from "@/lib/home-assistant-client";
import type { HomeAssistantOutletConfig } from "@/lib/home-assistant-config";
import { isAvailable, measurement } from "@/lib/home-assistant-model";
import type { StoredPitConfig } from "@/lib/pit-config-model";
import type { PowerChannel } from "@/types/pit";

type OutletUpdate = (channel: PowerChannel) => void;

export class HomeAssistantOutletManager {
  readonly configs: HomeAssistantOutletConfig[];
  private readonly client: HomeAssistantClient;
  private readonly pollIntervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private pollPromise: Promise<void> | null = null;
  private update: OutletUpdate | null = null;

  constructor(config: StoredPitConfig["homeAssistant"]) {
    this.configs = config.outlets.filter((outlet) => outlet.switchEntityId);
    this.client = new HomeAssistantClient(config.baseUrl, config.accessToken);
    this.pollIntervalMs = config.pollIntervalMs;
  }

  start(update: OutletUpdate) {
    if (!this.configs.length || this.pollTimer) return;
    this.update = update;
    void this.pollAll();
    this.pollTimer = setInterval(() => void this.pollAll(), this.pollIntervalMs);
    this.pollTimer.unref();
  }

  hasChannel(id: string) {
    return this.configs.some((config) => config.id === id);
  }

  async setPower(id: string, on: boolean) {
    const config = this.requireConfig(id);
    await this.client.callSwitch(config.switchEntityId, on);
    await this.pollOne(config);
    return "rest" as const;
  }

  async testConnection(id: string) {
    const config = this.requireConfig(id);
    const states = await this.client.getStates();
    const state = states.find((item) => item.entity_id === config.switchEntityId);
    if (!state) throw new Error(`Home Assistant 中未找到 ${config.switchEntityId}`);
    if (!isAvailable(state)) throw new Error(`${config.switchEntityId} 当前不可用`);
    return "rest" as const;
  }

  destroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async pollAll() {
    if (this.pollPromise) return this.pollPromise;
    this.pollPromise = this.client.getStates()
      .then((states) => Promise.all(this.configs.map((config) => this.emitChannel(config, states))))
      .then(() => undefined)
      .catch(() => Promise.all(this.configs.map((config) => this.emitOffline(config))).then(() => undefined))
      .finally(() => { this.pollPromise = null; });
    return this.pollPromise;
  }

  private async pollOne(config: HomeAssistantOutletConfig) {
    try {
      await this.emitChannel(config, await this.client.getStates());
    } catch {
      await this.emitOffline(config);
    }
  }

  private async emitChannel(config: HomeAssistantOutletConfig, states: HomeAssistantState[]) {
    const byId = new Map(states.map((state) => [state.entity_id, state]));
    const switchState = byId.get(config.switchEntityId);
    if (!switchState || !isAvailable(switchState)) return this.emitOffline(config);
    const now = Date.now();
    this.update?.({
      id: config.id,
      name: config.name,
      zone: config.zone,
      provider: "home-assistant",
      transport: "rest",
      online: true,
      on: switchState.state === "on",
      watts: measurement(byId.get(config.wattsEntityId ?? ""), "watts"),
      volts: measurement(byId.get(config.voltsEntityId ?? ""), "volts"),
      amps: measurement(byId.get(config.ampsEntityId ?? ""), "amps"),
      updatedAt: now,
    });
  }

  private async emitOffline(config: HomeAssistantOutletConfig) {
    this.update?.({
      id: config.id,
      name: config.name,
      zone: config.zone,
      provider: "home-assistant",
      transport: null,
      online: false,
      on: false,
      watts: null,
      volts: null,
      amps: null,
      updatedAt: 0,
    });
  }

  private requireConfig(id: string) {
    const config = this.configs.find((item) => item.id === id);
    if (!config) throw new Error("未找到 Home Assistant 插座配置");
    return config;
  }
}
