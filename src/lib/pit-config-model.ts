import {
  isControlEntityId,
  isSensorEntityId,
} from "@/lib/home-assistant-model";
import type {
  LegacyChannelHint,
  LocalNetworkView,
  PitConfigView,
} from "@/types/pit-config";

export const DEFAULT_HOME_ASSISTANT_URL = "http://192.168.66.34:8123";
export const HOME_ASSISTANT_TOKEN_ENV = "HOME_ASSISTANT_ACCESS_TOKEN";

export type PitChannelId = `CH${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type HomeAssistantMode = "observe" | "active";

export type HomeAssistantBinding = {
  channelId: PitChannelId;
  name: string;
  zone: string;
  controlEntityId: `switch.${string}` | `light.${string}`;
  powerEntityId?: `sensor.${string}`;
  voltageEntityId?: `sensor.${string}`;
  currentEntityId?: `sensor.${string}`;
};

export type StoredPitConfig = {
  version: 2;
  mqtt: { url: string; username: string; password: string };
  homeAssistant: {
    baseUrl: string;
    accessToken: string;
    defaultAreaId?: string;
    mode: HomeAssistantMode;
    bindings: HomeAssistantBinding[];
  };
};

export function environmentPitConfig(
  env: Record<string, string | undefined> = process.env,
): StoredPitConfig {
  return {
    version: 2,
    mqtt: {
      url: env.PIT_MQTT_URL ?? "mqtt://127.0.0.1:1883",
      username: env.PIT_MQTT_USERNAME ?? "",
      password: env.PIT_MQTT_PASSWORD ?? "",
    },
    homeAssistant: {
      baseUrl: normalizeHomeAssistantBaseUrl(env.HOME_ASSISTANT_URL ?? DEFAULT_HOME_ASSISTANT_URL),
      accessToken: optionalText(env[HOME_ASSISTANT_TOKEN_ENV]),
      defaultAreaId: optionalText(env.HOME_ASSISTANT_DEFAULT_AREA_ID) || undefined,
      mode: env.HOME_ASSISTANT_MODE === "active" ? "active" : "observe",
      bindings: parseBindingsFromEnvironment(env.HOME_ASSISTANT_BINDINGS_JSON),
    },
  };
}

export function parseStoredPitConfig(value: unknown): StoredPitConfig {
  if (!isRecord(value) || !isRecord(value.mqtt)) {
    throw new Error("配置文件结构无效");
  }
  const mqtt = parseMqttConfig(value.mqtt);
  if (value.version === 1 || isRecord(value.miot)) {
    return {
      version: 2,
      mqtt,
      homeAssistant: {
        baseUrl: DEFAULT_HOME_ASSISTANT_URL,
        accessToken: "",
        mode: "observe",
        bindings: [],
      },
    };
  }
  if (value.version !== 2 || !isRecord(value.homeAssistant)) {
    throw new Error("配置版本不受支持");
  }
  return {
    version: 2,
    mqtt,
    homeAssistant: parseHomeAssistantConfig(value.homeAssistant),
  };
}

export function resolvePitConfigEnvironment(
  config: StoredPitConfig,
  env: Record<string, string | undefined> = process.env,
): StoredPitConfig {
  const accessToken = optionalText(env[HOME_ASSISTANT_TOKEN_ENV]);
  return accessToken
    ? {
        ...config,
        homeAssistant: { ...config.homeAssistant, accessToken },
      }
    : config;
}

export function mergePitConfigInput(
  input: unknown,
  current: StoredPitConfig,
  env: Record<string, string | undefined> = process.env,
): StoredPitConfig {
  if (!isRecord(input) || !isRecord(input.mqtt) || !isRecord(input.homeAssistant)) {
    throw new Error("请求配置结构无效");
  }
  const mqttUrl = requiredText(input.mqtt.url, "MQTT URL 不能为空");
  validateMqttUrl(mqttUrl);

  const baseUrl = normalizeHomeAssistantBaseUrl(
    requiredText(input.homeAssistant.baseUrl, "Home Assistant 地址不能为空"),
  );
  const baseChanged = baseUrl !== current.homeAssistant.baseUrl;
  const environmentToken = optionalText(env[HOME_ASSISTANT_TOKEN_ENV]);
  const submittedToken = optionalText(input.homeAssistant.accessToken);
  if (baseChanged && environmentToken) {
    throw new Error("Home Assistant 令牌由环境变量托管；修改地址时必须同步修改环境变量并重启");
  }
  if (baseChanged && !submittedToken) {
    throw new Error("修改 Home Assistant 地址时必须重新输入访问令牌");
  }

  const accessToken = input.homeAssistant.clearAccessToken === true
    ? ""
    : submittedToken || (baseChanged ? "" : current.homeAssistant.accessToken);
  const mode = input.homeAssistant.mode === "active" ? "active" : "observe";
  const bindings = parseHomeAssistantBindings(input.homeAssistant.bindings);
  if (input.migrationRequired === true && Array.isArray(input.legacyChannels)) {
    const mapped = new Set(bindings.map((binding) => binding.channelId));
    const missing = input.legacyChannels.flatMap((item) => {
      if (!isRecord(item)) return [];
      const channelId = optionalText(item.channelId);
      return isPitChannelId(channelId) && !mapped.has(channelId) ? [channelId] : [];
    });
    if (missing.length) {
      throw new Error(`保存版本 2 前必须完成旧通道映射：${missing.join("、")}`);
    }
  }
  if (mode === "active" && !accessToken && !environmentToken) {
    throw new Error("活动模式必须配置 Home Assistant 访问令牌");
  }
  if (mode === "active" && bindings.length === 0) {
    throw new Error("活动模式至少需要映射一个电源通道");
  }

  return {
    version: 2,
    mqtt: {
      url: mqttUrl,
      username: optionalText(input.mqtt.username),
      password: input.mqtt.clearPassword === true
        ? ""
        : optionalText(input.mqtt.password) || current.mqtt.password,
    },
    homeAssistant: {
      baseUrl,
      accessToken,
      defaultAreaId: validateAreaId(optionalText(input.homeAssistant.defaultAreaId)),
      mode,
      bindings,
    },
  };
}

export function publicPitConfig(
  config: StoredPitConfig,
  configPath: string,
  options: {
    migrationRequired?: boolean;
    legacyChannels?: LegacyChannelHint[];
    localNetwork?: LocalNetworkView;
    env?: Record<string, string | undefined>;
  } = {},
): PitConfigView {
  const env = options.env ?? process.env;
  const tokenManagedByEnvironment = Boolean(optionalText(env[HOME_ASSISTANT_TOKEN_ENV]));
  return {
    version: 2,
    configPath,
    restartRequired: true,
    migrationRequired: options.migrationRequired === true,
    legacyChannels: options.legacyChannels ?? [],
    localNetwork: options.localNetwork ?? {
      hostname: "",
      preferredIpv4: "",
      ipv4Addresses: [],
    },
    mqtt: {
      url: config.mqtt.url,
      username: config.mqtt.username,
      password: "",
      passwordConfigured: Boolean(config.mqtt.password),
    },
    homeAssistant: {
      baseUrl: config.homeAssistant.baseUrl,
      accessToken: "",
      accessTokenConfigured: Boolean(config.homeAssistant.accessToken),
      tokenManagedByEnvironment,
      mode: config.homeAssistant.mode,
      defaultAreaId: config.homeAssistant.defaultAreaId ?? "",
      bindings: config.homeAssistant.bindings.map((binding) => ({ ...binding })),
    },
  };
}

export function normalizeHomeAssistantBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Home Assistant 地址格式无效");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Home Assistant 地址仅支持 HTTP 或 HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Home Assistant 地址不能包含用户名或密码");
  }
  return url.origin;
}

export function extractLegacyChannelHints(value: unknown): LegacyChannelHint[] {
  if (!isRecord(value) || !(value.version === 1 || isRecord(value.miot))) return [];
  if (!isRecord(value.miot) || !Array.isArray(value.miot.outlets)) return [];
  const ids = new Set<string>();
  return value.miot.outlets.flatMap((outlet) => {
    if (!isRecord(outlet)) return [];
    const channelId = optionalText(outlet.id);
    if (!isPitChannelId(channelId) || ids.has(channelId)) return [];
    ids.add(channelId);
    return [{
      channelId,
      name: optionalText(outlet.name) || channelId,
      zone: optionalText(outlet.zone),
    }];
  });
}

export function isLegacyPitConfig(value: unknown) {
  return isRecord(value) && (value.version === 1 || isRecord(value.miot));
}

function parseHomeAssistantConfig(
  value: Record<string, unknown>,
): StoredPitConfig["homeAssistant"] {
  const mode: HomeAssistantMode = value.mode === "active" ? "active" : "observe";
  const accessToken = optionalText(value.accessToken);
  const bindings = parseHomeAssistantBindings(value.bindings);
  if (mode === "active" && bindings.length === 0) {
    throw new Error("活动模式至少需要映射一个电源通道");
  }
  return {
    baseUrl: normalizeHomeAssistantBaseUrl(
      requiredText(value.baseUrl, "Home Assistant 地址不能为空"),
    ),
    accessToken,
    defaultAreaId: validateAreaId(optionalText(value.defaultAreaId)),
    mode,
    bindings,
  };
}

function parseHomeAssistantBindings(value: unknown): HomeAssistantBinding[] {
  if (!Array.isArray(value)) throw new Error("Home Assistant 通道映射必须是数组");
  const channelIds = new Set<string>();
  const entityIds = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Home Assistant 映射 #${index + 1} 无效`);
    const channelId = requiredText(item.channelId, `映射 #${index + 1} 缺少通道`);
    if (!isPitChannelId(channelId)) throw new Error(`映射 #${index + 1} 通道必须为 CH1-CH8`);
    if (channelIds.has(channelId)) throw new Error(`电源通道重复：${channelId}`);
    channelIds.add(channelId);
    const controlEntityId = requiredText(item.controlEntityId, `${channelId} 缺少控制实体`);
    if (!isControlEntityId(controlEntityId)) {
      throw new Error(`${channelId} 控制实体必须是 switch.* 或 light.*`);
    }
    if (entityIds.has(controlEntityId)) throw new Error(`控制实体重复：${controlEntityId}`);
    entityIds.add(controlEntityId);
    return {
      channelId,
      name: requiredText(item.name, `${channelId} 名称不能为空`),
      zone: optionalText(item.zone),
      controlEntityId,
      powerEntityId: optionalSensor(item.powerEntityId, channelId, "功率"),
      voltageEntityId: optionalSensor(item.voltageEntityId, channelId, "电压"),
      currentEntityId: optionalSensor(item.currentEntityId, channelId, "电流"),
    };
  });
}

function parseBindingsFromEnvironment(value: string | undefined) {
  if (!value) return [];
  try {
    return parseHomeAssistantBindings(JSON.parse(value));
  } catch (error) {
    throw new Error(
      `HOME_ASSISTANT_BINDINGS_JSON 无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseMqttConfig(value: Record<string, unknown>) {
  const url = requiredText(value.url, "MQTT URL 不能为空");
  validateMqttUrl(url);
  return {
    url,
    username: optionalText(value.username),
    password: optionalText(value.password),
  };
}

function optionalSensor(value: unknown, channelId: string, label: string) {
  const entityId = optionalText(value);
  if (!entityId) return undefined;
  if (!isSensorEntityId(entityId)) throw new Error(`${channelId} ${label}实体必须是 sensor.*`);
  return entityId as `sensor.${string}`;
}

function validateMqttUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MQTT URL 格式无效");
  }
  if (!["mqtt:", "mqtts:", "ws:", "wss:"].includes(url.protocol)) {
    throw new Error("MQTT URL 仅支持 mqtt、mqtts、ws 或 wss");
  }
}

function validateAreaId(value: string) {
  if (!value) return undefined;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("Home Assistant 区域 ID 无效");
  return value;
}

function isPitChannelId(value: string): value is PitChannelId {
  return /^CH[1-8]$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, message: string) {
  const text = optionalText(value);
  if (!text) throw new Error(message);
  return text;
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
