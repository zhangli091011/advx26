import { parseHomeAssistantOutlets, validateHomeAssistantUrl, type HomeAssistantOutletConfig } from "@/lib/home-assistant-config";
import type { PitConfigView } from "@/types/pit-config";

export type StoredPitConfig = {
  version: 2;
  mqtt: { url: string; username: string; password: string };
  homeAssistant: {
    baseUrl: string;
    accessToken: string;
    pollIntervalMs: number;
    migrationRequired: boolean;
    outlets: HomeAssistantOutletConfig[];
  };
};

export function environmentPitConfig(env: Record<string, string | undefined> = process.env): StoredPitConfig {
  return {
    version: 2,
    mqtt: {
      url: env.PIT_MQTT_URL ?? "mqtt://127.0.0.1:1883",
      username: env.PIT_MQTT_USERNAME ?? "",
      password: env.PIT_MQTT_PASSWORD ?? "",
    },
    homeAssistant: {
      baseUrl: normalizeOptionalHomeAssistantUrl(env.HOME_ASSISTANT_URL),
      accessToken: env.HOME_ASSISTANT_TOKEN ?? "",
      pollIntervalMs: boundedInteger(env.HOME_ASSISTANT_POLL_INTERVAL_MS, 10_000, 5_000, 300_000),
      migrationRequired: false,
      outlets: parseHomeAssistantOutlets(parseJsonArray(env.HOME_ASSISTANT_OUTLETS_JSON)),
    },
  };
}

export function parseStoredPitConfig(value: unknown): StoredPitConfig {
  if (!isRecord(value)) throw new Error("配置文件结构无效");
  if (value.version === 2) return parseVersion2(value);
  if (value.version === 1 || isRecord(value.miot)) return migrateVersion1(value);
  throw new Error("不支持的配置文件版本");
}

export function mergePitConfigInput(input: unknown, current: StoredPitConfig): StoredPitConfig {
  if (!isRecord(input) || !isRecord(input.mqtt) || !isRecord(input.homeAssistant)) throw new Error("请求配置结构无效");
  const outlets = parseHomeAssistantOutlets(input.homeAssistant.outlets);
  return parseVersion2({
    version: 2,
    mqtt: {
      url: input.mqtt.url,
      username: optionalText(input.mqtt.username),
      password: input.mqtt.clearPassword === true ? "" : optionalText(input.mqtt.password) || current.mqtt.password,
    },
    homeAssistant: {
      baseUrl: input.homeAssistant.baseUrl,
      accessToken: input.homeAssistant.clearAccessToken === true
        ? ""
        : optionalText(input.homeAssistant.accessToken) || current.homeAssistant.accessToken,
      pollIntervalMs: input.homeAssistant.pollIntervalMs,
      migrationRequired: outlets.some((outlet) => !outlet.switchEntityId),
      outlets,
    },
  });
}

export function publicPitConfig(config: StoredPitConfig, configPath: string): PitConfigView {
  return {
    configPath,
    restartRequired: true,
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
      pollIntervalMs: config.homeAssistant.pollIntervalMs,
      migrationRequired: config.homeAssistant.migrationRequired,
      outlets: config.homeAssistant.outlets.map((outlet) => ({
        id: outlet.id,
        name: outlet.name,
        zone: outlet.zone,
        switchEntityId: outlet.switchEntityId,
        wattsEntityId: outlet.wattsEntityId ?? "",
        voltsEntityId: outlet.voltsEntityId ?? "",
        ampsEntityId: outlet.ampsEntityId ?? "",
      })),
    },
  };
}

function parseVersion2(value: Record<string, unknown>): StoredPitConfig {
  if (!isRecord(value.mqtt) || !isRecord(value.homeAssistant)) throw new Error("配置文件结构无效");
  const mqttUrl = requiredText(value.mqtt.url, "MQTT URL 不能为空");
  validateMqttUrl(mqttUrl);
  return {
    version: 2,
    mqtt: {
      url: mqttUrl,
      username: optionalText(value.mqtt.username),
      password: optionalText(value.mqtt.password),
    },
    homeAssistant: {
      baseUrl: normalizeOptionalHomeAssistantUrl(value.homeAssistant.baseUrl),
      accessToken: optionalText(value.homeAssistant.accessToken),
      pollIntervalMs: boundedInteger(value.homeAssistant.pollIntervalMs, 10_000, 5_000, 300_000),
      migrationRequired: value.homeAssistant.migrationRequired === true,
      outlets: parseHomeAssistantOutlets(value.homeAssistant.outlets),
    },
  };
}

function migrateVersion1(value: Record<string, unknown>): StoredPitConfig {
  if (!isRecord(value.mqtt) || !isRecord(value.miot)) throw new Error("旧配置文件结构无效");
  const mqttUrl = requiredText(value.mqtt.url, "MQTT URL 不能为空");
  validateMqttUrl(mqttUrl);
  const legacyOutlets = Array.isArray(value.miot.outlets) ? value.miot.outlets : [];
  const outlets = legacyOutlets.flatMap((item) => {
    if (!isRecord(item) || !/^CH[1-8]$/.test(optionalText(item.id))) return [];
    return [{
      id: optionalText(item.id),
      name: optionalText(item.name) || `Home Assistant 插座 ${optionalText(item.id)}`,
      zone: optionalText(item.zone) || "Home Assistant",
      switchEntityId: "",
    }];
  });
  return {
    version: 2,
    mqtt: { url: mqttUrl, username: optionalText(value.mqtt.username), password: optionalText(value.mqtt.password) },
    homeAssistant: {
      baseUrl: "",
      accessToken: "",
      pollIntervalMs: boundedInteger(value.miot.pollIntervalMs, 10_000, 5_000, 300_000),
      migrationRequired: outlets.length > 0,
      outlets: parseHomeAssistantOutlets(outlets),
    },
  };
}

function validateMqttUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["mqtt:", "mqtts:", "ws:", "wss:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error("MQTT URL 仅支持 mqtt、mqtts、ws 或 wss");
  }
}

function normalizeOptionalHomeAssistantUrl(value: unknown) {
  const result = optionalText(value);
  return result ? validateHomeAssistantUrl(result) : "";
}

function parseJsonArray(value: string | undefined) {
  if (!value?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error("HOME_ASSISTANT_OUTLETS_JSON 必须是有效 JSON 数组");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, message: string) {
  const result = optionalText(value);
  if (!result) throw new Error(message);
  return result;
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}
