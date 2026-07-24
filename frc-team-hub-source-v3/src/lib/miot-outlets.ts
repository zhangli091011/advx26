import "server-only";

import MiCloud from "homebridge-miot/lib/protocol/MiCloud.js";
import MiioProtocol from "homebridge-miot/lib/protocol/MiioProtocol.js";
import { parseMiotOutletConfigs, type MiotOutletConfig, type MiotPropertyRef } from "@/lib/miot-config";
import { fetchBrokerSession } from "@/lib/miot-session-broker";
import { DEFAULT_MIOT_BROKER_SSH_HOST, DEFAULT_MIOT_BROKER_URL, type StoredPitConfig } from "@/lib/pit-config-model";
import type { PowerChannel } from "@/types/pit";

type Transport = "local" | "cloud";
type OutletUpdate = (channel: PowerChannel) => void;

export class MiotOutletManager {
  readonly configs: MiotOutletConfig[];
  private readonly local: MiioProtocol | null;
  private cloud: MiCloud | null = null;
  private cloudLogin: Promise<void> | null = null;
  private brokerRefresh: Promise<void> | null = null;
  private brokerRefreshTimer: NodeJS.Timeout | null = null;
  private brokerRefreshedAt = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private update: OutletUpdate | null = null;
  private readonly pollIntervalMs: number;
  private readonly cloudConfig: StoredPitConfig["miot"]["cloud"];
  private readonly logger: { debug(message: string): void; deepDebug(message: string): void };

  constructor(config?: StoredPitConfig["miot"]) {
    this.configs = config?.outlets ?? parseMiotOutletConfigs(process.env.MIOT_OUTLETS_JSON);
    this.pollIntervalMs = config?.pollIntervalMs ?? Number(process.env.MIOT_POLL_INTERVAL_MS ?? 10_000);
    this.cloudConfig = config?.cloud ?? {
      region: process.env.MIOT_CLOUD_REGION ?? "cn",
      username: process.env.MIOT_CLOUD_USERNAME ?? "",
      password: process.env.MIOT_CLOUD_PASSWORD ?? "",
      session: process.env.MIOT_CLOUD_SESSION_JSON ?? "",
      brokerUrl: process.env.MIOT_SESSION_BROKER_URL ?? DEFAULT_MIOT_BROKER_URL,
      brokerKey: process.env.MIOT_SESSION_BROKER_KEY ?? "",
      brokerSshHost: process.env.MIOT_SESSION_BROKER_SSH_HOST ?? DEFAULT_MIOT_BROKER_SSH_HOST,
    };
    const debug = config?.debug ?? process.env.MIOT_DEBUG === "true";
    this.logger = {
      debug: (message) => { if (debug) console.info(`[miot] ${message}`); },
      deepDebug: (message) => { if (debug) console.debug(`[miot] ${message}`); },
    };
    this.local = this.configs.some((item) => item.ip && item.token) ? new MiioProtocol(this.logger) : null;
    for (const config of this.configs) {
      if (config.ip && config.token) this.local?.updateDevice(config.ip, { token: config.token });
    }
  }

  start(update: OutletUpdate) {
    if (this.configs.length === 0 || this.pollTimer) return;
    this.update = update;
    if (this.cloudConfig.brokerUrl) {
      void this.refreshBrokerSession().catch((error) => this.logger.debug(`Session Broker 同步失败：${safeError(error)}`));
      this.brokerRefreshTimer = setInterval(() => {
        void this.refreshBrokerSession().catch((error) => this.logger.debug(`Session Broker 同步失败：${safeError(error)}`));
      }, 6 * 60 * 60 * 1000);
      this.brokerRefreshTimer.unref();
    }
    void this.pollAll();
    this.pollTimer = setInterval(() => void this.pollAll(), Math.max(5_000, this.pollIntervalMs));
  }

  hasChannel(id: string) {
    return this.configs.some((config) => config.id === id);
  }

  async setPower(id: string, on: boolean) {
    const config = this.configs.find((item) => item.id === id);
    if (!config) throw new Error("未找到米家插座配置");
    const { transport } = await this.withFallback(config, (selected) => this.setProperty(config, config.power, on, selected));
    await this.pollOne(config, transport);
    return transport;
  }

  async testConnection(id: string) {
    const config = this.configs.find((item) => item.id === id);
    if (!config) throw new Error("未找到米家插座配置");
    const { transport } = await this.withFallback(config, (selected) => this.getProperties(config, [config.power], selected));
    return transport;
  }

  destroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.brokerRefreshTimer) clearInterval(this.brokerRefreshTimer);
    this.pollTimer = null;
    this.brokerRefreshTimer = null;
    this.local?.destroy();
  }

  private async pollAll() {
    await Promise.allSettled(this.configs.map((config) => this.pollOne(config)));
  }

  private async pollOne(config: MiotOutletConfig, preferred?: Transport) {
    try {
      const properties = [
        ["power", config.power],
        ["watts", config.watts],
        ["volts", config.volts],
        ["amps", config.amps],
      ].filter((entry): entry is [string, MiotPropertyRef] => Boolean(entry[1]));
      const refs = properties.map(([, ref]) => ref);
      const { value, transport } = preferred
        ? { value: await this.getProperties(config, refs, preferred), transport: preferred }
        : await this.withFallback(config, (selected) => this.getProperties(config, refs, selected));
      const values = value as unknown[];
      const readings = Object.fromEntries(properties.map(([name], index) => [name, values[index]]));
      const on = propertyValue(readings.power);
      if (typeof on !== "boolean") throw new Error("插座开关属性返回值无效");
      const watts = scaledValue(readings.watts, config.watts) ?? 0;
      const volts = scaledValue(readings.volts, config.volts) ?? config.nominalVolts;
      const amps = scaledValue(readings.amps, config.amps) ?? (volts > 0 ? watts / volts : 0);
      this.update?.({
        id: config.id,
        name: config.name,
        zone: config.zone,
        model: config.model,
        provider: "miot",
        transport,
        online: true,
        volts,
        amps,
        watts,
        on,
        updatedAt: Date.now(),
      });
    } catch (error) {
      this.logger.debug(`${config.id} poll failed: ${safeError(error)}`);
      this.update?.({
        id: config.id,
        name: config.name,
        zone: config.zone,
        model: config.model,
        provider: "miot",
        transport: null,
        online: false,
        volts: config.nominalVolts,
        amps: 0,
        watts: 0,
        on: false,
        updatedAt: Date.now(),
      });
    }
  }

  private async withFallback<T>(config: MiotOutletConfig, operation: (transport: Transport) => Promise<T>) {
    let localError: unknown;
    if (config.ip && config.token && this.local) {
      try {
        return { value: await operation("local"), transport: "local" as const };
      } catch (error) {
        localError = error;
        this.logger.debug(`${config.id} local failed, trying cloud: ${safeError(error)}`);
      }
    }
    if (config.did && this.hasCloudConfig()) {
      return { value: await operation("cloud"), transport: "cloud" as const };
    }
    throw localError ?? new Error("米家插座没有可用的局域网或云端连接配置");
  }

  private async getProperties(config: MiotOutletConfig, refs: MiotPropertyRef[], transport: Transport) {
    const params = refs.map((ref) => ({
      ...(transport === "cloud" ? { did: config.did } : {}),
      siid: ref.siid,
      piid: ref.piid,
    }));
    const result = transport === "local"
      ? await this.local?.send(config.ip!, "get_properties", params, { timeout: 2_500, retries: 1 })
      : await (await this.getCloud()).miotGetProps(params);
    return validateResults(result, "读取");
  }

  private async setProperty(config: MiotOutletConfig, ref: MiotPropertyRef, value: boolean, transport: Transport) {
    const params = [{
      ...(transport === "cloud" ? { did: config.did } : {}),
      siid: ref.siid,
      piid: ref.piid,
      value,
    }];
    const result = transport === "local"
      ? await this.local?.send(config.ip!, "set_properties", params, { timeout: 2_500, retries: 1 })
      : await (await this.getCloud()).miotSetProps(params);
    validateResults(result, "控制");
  }

  private hasCloudConfig() {
    return Boolean(this.cloudConfig.brokerUrl || this.cloudConfig.session || (this.cloudConfig.username && this.cloudConfig.password));
  }

  private async getCloud() {
    if (this.cloudConfig.brokerUrl && Date.now() - this.brokerRefreshedAt > 5 * 60 * 60 * 1000) {
      await this.refreshBrokerSession();
    }
    if (!this.cloud) {
      this.cloud = new MiCloud(this.logger);
      this.cloud.setCountry(this.cloudConfig.region);
      this.cloud.setRequestTimeout(5_000);
    }
    if (!this.cloud.isLoggedIn()) {
      this.cloudLogin ??= this.loginCloud().finally(() => { this.cloudLogin = null; });
      await this.cloudLogin;
    }
    return this.cloud;
  }

  private async refreshBrokerSession() {
    if (this.brokerRefresh) return this.brokerRefresh;
    this.brokerRefresh = (async () => {
      const session = await fetchBrokerSession(this.cloudConfig);
      if (!session) return;
      this.cloudConfig.session = JSON.stringify(session);
      this.brokerRefreshedAt = Date.now();
      if (this.cloud) this.cloud.setServiceToken(session);
      this.logger.debug("Session Broker 同步成功");
    })().finally(() => {
      this.brokerRefresh = null;
    });
    return this.brokerRefresh;
  }

  private async loginCloud() {
    const session = this.cloudConfig.session;
    if (session) {
      try {
        this.cloud?.setServiceToken(JSON.parse(session));
      } catch {
        throw new Error("MIOT_CLOUD_SESSION_JSON 不是有效的云端 session JSON");
      }
      if (!this.cloud?.isLoggedIn()) throw new Error("米家云端 session 缺少必要字段");
      return;
    }
    const username = this.cloudConfig.username;
    const password = this.cloudConfig.password;
    if (!username || !password) throw new Error("未配置米家云端账号或 session");
    try {
      await this.cloud?.login(username, password);
    } catch (error) {
      if (safeError(error).toLowerCase().includes("two")) {
        throw new Error("小米账号需要二次验证，请配置 MIOT_CLOUD_SESSION_JSON");
      }
      throw error;
    }
  }
}

function validateResults(value: unknown, operation: string) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`米家${operation}没有返回结果`);
  for (const item of value) {
    if (isRecord(item) && typeof item.code === "number" && item.code !== 0) {
      throw new Error(`米家${operation}失败，MIoT code ${item.code}`);
    }
  }
  return value;
}

function propertyValue(value: unknown) {
  return isRecord(value) ? value.value : undefined;
}

function scaledValue(value: unknown, ref: MiotPropertyRef | undefined) {
  const raw = propertyValue(value);
  return ref && typeof raw === "number" && Number.isFinite(raw) ? raw * ref.scale : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
