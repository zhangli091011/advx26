import "server-only";

import {
  callService,
  getServices,
  subscribeEntities,
  type Connection,
  type HassEntities,
  type HassEntity,
  type UnsubscribeFunc,
} from "home-assistant-js-websocket";
import {
  findDefaultAreaId,
  homeAssistantChannel,
  HOME_ASSISTANT_UNAVAILABLE_STATES,
  type HomeAssistantArea,
  type HomeAssistantDevice,
  type HomeAssistantDiscovery,
  type HomeAssistantEntity,
  type HomeAssistantEntityRegistryDisplay,
} from "@/lib/home-assistant-model";
import {
  createHomeAssistantConnection,
  withTimeout,
} from "@/lib/home-assistant-connection";
import type { StoredPitConfig } from "@/lib/pit-config-model";
import type { PowerChannel } from "@/types/pit";

type ManagerConfig = StoredPitConfig["homeAssistant"];
type ChannelListener = (channel: PowerChannel) => void;
type ConnectionListener = (connected: boolean, timestamp: number) => void;

type AreaRegistryEntry = { area_id?: unknown; name?: unknown };
type DeviceRegistryEntry = {
  id?: unknown;
  name?: unknown;
  name_by_user?: unknown;
  area_id?: unknown;
  manufacturer?: unknown;
  model?: unknown;
};

export class HomeAssistantManager {
  private connection: Connection | null = null;
  private unsubscribe: UnsubscribeFunc | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private states: HassEntities = {};
  private stopped = false;
  private channelListener: ChannelListener | null = null;
  private connectionListener: ConnectionListener | null = null;

  constructor(private readonly config: ManagerConfig) {}

  start(onChannel: ChannelListener, onConnection: ConnectionListener) {
    this.channelListener = onChannel;
    this.connectionListener = onConnection;
    this.publishChannels(false);
    if (!this.config.accessToken || this.config.bindings.length === 0) return;
    void this.connect();
  }

  destroy() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.connection?.close();
    this.connection = null;
    this.states = {};
  }

  hasChannel(channelId: string) {
    return this.config.bindings.some((binding) => binding.channelId === channelId);
  }

  get mode() {
    return this.config.mode;
  }

  async setPower(channelId: string, on: boolean) {
    if (this.config.mode !== "active") {
      throw new HomeAssistantControlError("Home Assistant 当前为观察模式，禁止发送控制指令", 409);
    }
    const binding = this.config.bindings.find((item) => item.channelId === channelId);
    if (!binding) throw new HomeAssistantControlError("Home Assistant 通道未映射", 409);
    if (!this.connection?.connected) throw new HomeAssistantControlError("Home Assistant 未连接", 409);
    const channel = homeAssistantChannel(binding, this.states, true);
    if (!channel.online) throw new HomeAssistantControlError("Home Assistant 实体离线或状态不可用", 409);
    const domain = binding.controlEntityId.split(".", 1)[0];
    await withTimeout(
      callService(
        this.connection,
        domain,
        on ? "turn_on" : "turn_off",
        undefined,
        { entity_id: binding.controlEntityId },
      ),
      5_000,
      "Home Assistant 控制超时",
    );
    return "home-assistant" as const;
  }

  private async connect() {
    if (this.stopped || this.connection) return;
    try {
      const connection = await createHomeAssistantConnection(this.config);
      if (this.stopped) {
        connection.close();
        return;
      }
      this.connection = connection;
      connection.addEventListener("ready", () => {
        this.connectionListener?.(true, Date.now());
        this.publishChannels(true);
      });
      connection.addEventListener("disconnected", () => {
        this.connectionListener?.(false, Date.now());
        this.publishChannels(false);
      });
      connection.addEventListener("reconnect-error", () => {
        this.connectionListener?.(false, Date.now());
        this.publishChannels(false);
      });
      this.unsubscribe = subscribeEntities(connection, (states) => {
        this.states = states;
        this.connectionListener?.(true, Date.now());
        this.publishChannels(true);
      });
      this.connectionListener?.(true, Date.now());
    } catch (error) {
      if (this.stopped) return;
      console.error(`[home-assistant] ${errorMessage(error)}`);
      this.connectionListener?.(false, Date.now());
      this.publishChannels(false);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        void this.connect();
      }, 5_000);
      this.reconnectTimer.unref();
    }
  }

  private publishChannels(connected: boolean) {
    for (const binding of this.config.bindings) {
      this.channelListener?.(homeAssistantChannel(binding, this.states, connected));
    }
  }
}

export class HomeAssistantControlError extends Error {
  constructor(message: string, readonly status: 409) {
    super(message);
  }
}

export async function testHomeAssistantConfig(config: StoredPitConfig) {
  const startedAt = Date.now();
  if (!config.homeAssistant.accessToken) throw new Error("请先配置 Home Assistant 长期访问令牌");
  const connection = await createHomeAssistantConnection(config.homeAssistant);
  try {
    await withTimeout(connection.ping(), 5_000, "Home Assistant 响应超时");
    return {
      ok: true,
      target: "home-assistant",
      transport: "websocket" as const,
      latencyMs: Date.now() - startedAt,
      version: connection.haVersion,
      message: `Home Assistant ${connection.haVersion} 连接成功`,
    };
  } finally {
    connection.close();
  }
}

export async function discoverHomeAssistant(config: StoredPitConfig): Promise<HomeAssistantDiscovery> {
  if (!config.homeAssistant.accessToken) throw new Error("请先配置 Home Assistant 长期访问令牌");
  const connection = await createHomeAssistantConnection(config.homeAssistant);
  try {
    const [areaEntries, deviceEntries, registry, states, services] = await withTimeout(
      Promise.all([
        connection.sendMessagePromise<AreaRegistryEntry[]>({ type: "config/area_registry/list" }),
        connection.sendMessagePromise<DeviceRegistryEntry[]>({ type: "config/device_registry/list" }),
        connection.sendMessagePromise<{
          entities: HomeAssistantEntityRegistryDisplay[];
        }>({ type: "config/entity_registry/list_for_display" }),
        connection.sendMessagePromise<HassEntity[]>({ type: "get_states" }),
        getServices(connection),
      ]),
      10_000,
      "Home Assistant 设备发现超时",
    );

    const areas: HomeAssistantArea[] = areaEntries.flatMap((entry) => {
      const areaId = text(entry.area_id);
      const name = text(entry.name);
      return areaId && name ? [{ areaId, name }] : [];
    }).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    const devices: HomeAssistantDevice[] = deviceEntries.flatMap((entry) => {
      const deviceId = text(entry.id);
      if (!deviceId) return [];
      return [{
        deviceId,
        name: text(entry.name_by_user) || text(entry.name) || deviceId,
        areaId: text(entry.area_id),
        manufacturer: text(entry.manufacturer),
        model: text(entry.model),
      }];
    });
    const deviceMap = new Map(devices.map((device) => [device.deviceId, device]));
    const stateMap = new Map(states.map((state) => [state.entity_id, state]));

    const entities: HomeAssistantEntity[] = registry.entities.flatMap((entry) => {
      const entityId = text(entry.ei);
      const state = stateMap.get(entityId);
      if (!entityId || !state) return [];
      const domain = entityId.split(".", 1)[0] ?? "";
      const deviceId = text(entry.di);
      return [{
        entityId,
        name: text(entry.en) || text(state.attributes.friendly_name) || entityId,
        domain,
        platform: text(entry.pl),
        areaId: text(entry.ai) || deviceMap.get(deviceId)?.areaId || "",
        deviceId,
        state: state.state,
        unit: text(state.attributes.unit_of_measurement),
        deviceClass: text(state.attributes.device_class),
        services: Object.keys(services[domain] ?? {}).sort(),
        available: !HOME_ASSISTANT_UNAVAILABLE_STATES.has(state.state),
        controllable: domain === "switch" || domain === "light",
      }];
    }).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    return {
      version: connection.haVersion,
      defaultAreaId: config.homeAssistant.defaultAreaId
        || findDefaultAreaId(areas, "亭子"),
      areas,
      devices,
      entities,
    };
  } finally {
    connection.close();
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "number") {
    if (error === 1) return "无法连接 Home Assistant";
    if (error === 2) return "Home Assistant 访问令牌无效";
    if (error === 3) return "Home Assistant 连接已中断";
  }
  return String(error);
}
