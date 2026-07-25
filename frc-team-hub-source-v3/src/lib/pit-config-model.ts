import { parseHomeAssistantOutlets, validateHomeAssistantUrl, type HomeAssistantOutletConfig } from "@/lib/home-assistant-config";
import type { PitConfigView } from "@/types/pit-config";

export type StoredPitConfig = {
  version: 3;
  team: { number: number; name: string };
  gateway: { url: string; clientId: string; token: string };
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
    version: 3,
    team: {
      number: boundedInteger(env.PIT_TEAM_NUMBER, 8214, 1, 99_999),
      name: optionalText(env.PIT_TEAM_NAME),
    },
    gateway: {
      url: env.PIT_GATEWAY_URL ?? "ws://127.0.0.1:8765",
      clientId: env.PIT_GATEWAY_CLIENT_ID ?? "pithub-main",
      token: env.PIT_GATEWAY_TOKEN ?? "",
    },
    homeAssistant: {
      baseUrl: normalizeOptionalHomeAssistantUrl(env.HOME_ASSISTANT_URL),
      accessToken: env.HOME_ASSISTANT_ACCESS_TOKEN ?? env.HOME_ASSISTANT_TOKEN ?? "",
      pollIntervalMs: boundedInteger(env.HOME_ASSISTANT_POLL_INTERVAL_MS, 10_000, 5_000, 300_000),
      migrationRequired: false,
      outlets: parseEnvironmentOutlets(env),
    },
  };
}

export function parseStoredPitConfig(value: unknown): StoredPitConfig {
  if (!isRecord(value)) throw new Error("配置文件结构无效");
  if (value.version === 3) return parseVersion3(value);
  if (value.version === 2) return migrateVersion2(value);
  if (value.version === 1 || isRecord(value.miot)) return migrateVersion1(value);
  throw new Error("不支持的配置文件版本");
}

export function mergePitConfigInput(input: unknown, current: StoredPitConfig): StoredPitConfig {
  if (!isRecord(input) || !isRecord(input.team) || !isRecord(input.gateway) || !isRecord(input.homeAssistant)) throw new Error("请求配置结构无效");
  const outlets = parseHomeAssistantOutlets(input.homeAssistant.outlets);
  const nextBaseUrl = normalizeOptionalHomeAssistantUrl(input.homeAssistant.baseUrl);
  const submittedAccessToken = optionalText(input.homeAssistant.accessToken);
  if (nextBaseUrl !== current.homeAssistant.baseUrl && current.homeAssistant.accessToken && !submittedAccessToken) {
    throw new Error("修改 Home Assistant 地址时必须重新输入访问令牌");
  }
  return parseVersion3({
    version: 3,
    team: {
      number: requiredTeamNumber(input.team.number),
      name: teamName(input.team.name),
    },
    gateway: {
      url: input.gateway.url,
      clientId: optionalText(input.gateway.clientId),
      token: input.gateway.clearToken === true ? "" : optionalText(input.gateway.token) || current.gateway.token,
    },
    homeAssistant: {
      baseUrl: nextBaseUrl,
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
    team: { ...config.team },
    gateway: {
      url: config.gateway.url,
      clientId: config.gateway.clientId,
      token: "",
      tokenConfigured: Boolean(config.gateway.token || process.env.PIT_GATEWAY_TOKEN),
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

function parseVersion3(value: Record<string, unknown>): StoredPitConfig {
  if (!isRecord(value.gateway) || !isRecord(value.homeAssistant)) throw new Error("配置文件结构无效");
  const gatewayUrl = requiredText(value.gateway.url, "设备网关 URL 不能为空");
  validateGatewayUrl(gatewayUrl);
  return {
    version: 3,
    team: parseTeam(value.team),
    gateway: {
      url: gatewayUrl,
      clientId: requiredText(value.gateway.clientId, "设备网关客户端 ID 不能为空"),
      token: optionalText(value.gateway.token),
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

function migrateVersion2(value: Record<string, unknown>): StoredPitConfig {
  if (!isRecord(value.homeAssistant)) throw new Error("旧配置文件结构无效");
  const outlets = Array.isArray(value.homeAssistant.outlets)
    ? value.homeAssistant.outlets
    : migrateBindings(value.homeAssistant.bindings);
  return parseVersion3({
    version: 3,
    team: value.team,
    gateway: { url: "ws://127.0.0.1:8765", clientId: "pithub-main", token: "" },
    homeAssistant: {
      baseUrl: value.homeAssistant.baseUrl,
      accessToken: value.homeAssistant.accessToken,
      pollIntervalMs: value.homeAssistant.pollIntervalMs,
      migrationRequired: false,
      outlets,
    },
  });
}

function migrateVersion1(value: Record<string, unknown>): StoredPitConfig {
  if (!isRecord(value.mqtt) || !isRecord(value.miot)) throw new Error("旧配置文件结构无效");
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
    version: 3,
    team: { number: 8214, name: "" },
    gateway: { url: "ws://127.0.0.1:8765", clientId: "pithub-main", token: "" },
    homeAssistant: {
      baseUrl: "",
      accessToken: "",
      pollIntervalMs: boundedInteger(value.miot.pollIntervalMs, 10_000, 5_000, 300_000),
      migrationRequired: outlets.length > 0,
      outlets: parseHomeAssistantOutlets(outlets),
    },
  };
}

function validateGatewayUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["ws:", "wss:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error("设备网关 URL 仅支持 ws 或 wss");
  }
}

function normalizeOptionalHomeAssistantUrl(value: unknown) {
  const result = optionalText(value);
  return result ? validateHomeAssistantUrl(result) : "";
}

function parseTeam(value: unknown) {
  if (value === undefined) return { number: 8214, name: "" };
  if (!isRecord(value)) throw new Error("赛队配置结构无效");
  return { number: requiredTeamNumber(value.number), name: teamName(value.name) };
}

function requiredTeamNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 99_999) throw new Error("FRC 队号必须是 1 到 99999 的整数");
  return number;
}

function teamName(value: unknown) {
  const name = optionalText(value);
  if (name.length > 80) throw new Error("赛队名称不能超过 80 个字符");
  return name;
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

function parseEnvironmentOutlets(env: Record<string, string | undefined>) {
  if (env.HOME_ASSISTANT_OUTLETS_JSON?.trim()) return parseHomeAssistantOutlets(parseJsonArray(env.HOME_ASSISTANT_OUTLETS_JSON));
  return parseHomeAssistantOutlets(migrateBindings(parseJsonArray(env.HOME_ASSISTANT_BINDINGS_JSON)));
}

function migrateBindings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => isRecord(item) ? {
    id: item.channelId,
    name: item.name,
    zone: item.zone,
    switchEntityId: item.controlEntityId,
    wattsEntityId: item.powerEntityId,
    voltsEntityId: item.voltageEntityId,
    ampsEntityId: item.currentEntityId,
  } : item);
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
