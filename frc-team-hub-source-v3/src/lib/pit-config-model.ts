import { parseMiotOutletConfigs, type MiotOutletConfig } from "@/lib/miot-config";
import type { PitConfigView } from "@/types/pit-config";

export const DEFAULT_MIOT_BROKER_URL = "https://data.zhangli.online/pit-session";

export type StoredPitConfig = {
  version: 1;
  mqtt: { url: string; username: string; password: string };
  miot: {
    pollIntervalMs: number;
    debug: boolean;
    cloud: {
      region: string;
      username: string;
      password: string;
      session: string;
      brokerUrl: string;
    };
    outlets: MiotOutletConfig[];
  };
};

export function environmentPitConfig(env: Record<string, string | undefined> = process.env): StoredPitConfig {
  return {
    version: 1,
    mqtt: {
      url: env.PIT_MQTT_URL ?? "mqtt://127.0.0.1:1883",
      username: env.PIT_MQTT_USERNAME ?? "",
      password: env.PIT_MQTT_PASSWORD ?? "",
    },
    miot: {
      pollIntervalMs: boundedInteger(env.MIOT_POLL_INTERVAL_MS, 10_000, 5_000, 300_000),
      debug: env.MIOT_DEBUG === "true",
      cloud: {
        region: env.MIOT_CLOUD_REGION ?? "cn",
        username: env.MIOT_CLOUD_USERNAME ?? "",
        password: env.MIOT_CLOUD_PASSWORD ?? "",
        session: env.MIOT_CLOUD_SESSION_JSON ?? "",
        brokerUrl: env.MIOT_SESSION_BROKER_URL ?? DEFAULT_MIOT_BROKER_URL,
      },
      outlets: parseMiotOutletConfigs(env.MIOT_OUTLETS_JSON),
    },
  };
}

export function parseStoredPitConfig(value: unknown): StoredPitConfig {
  if (!isRecord(value) || !isRecord(value.mqtt) || !isRecord(value.miot) || !isRecord(value.miot.cloud)) {
    throw new Error("配置文件结构无效");
  }
  const mqttUrl = requiredText(value.mqtt.url, "MQTT URL 不能为空");
  validateMqttUrl(mqttUrl);
  const outlets = parseMiotOutletConfigs(JSON.stringify(value.miot.outlets ?? []));
  return {
    version: 1,
    mqtt: {
      url: mqttUrl,
      username: optionalText(value.mqtt.username),
      password: optionalText(value.mqtt.password),
    },
    miot: {
      pollIntervalMs: boundedInteger(value.miot.pollIntervalMs, 10_000, 5_000, 300_000),
      debug: value.miot.debug === true,
      cloud: {
        region: oneOf(value.miot.cloud.region, ["cn", "de", "us", "ru", "sg", "tw", "in", "i2"], "cn"),
        username: optionalText(value.miot.cloud.username),
        password: optionalText(value.miot.cloud.password),
        session: validateSession(optionalText(value.miot.cloud.session)),
        brokerUrl: validateBrokerUrl(optionalText(value.miot.cloud.brokerUrl) || DEFAULT_MIOT_BROKER_URL),
      },
      outlets,
    },
  };
}

export function mergePitConfigInput(input: unknown, current: StoredPitConfig): StoredPitConfig {
  if (!isRecord(input) || !isRecord(input.mqtt) || !isRecord(input.miot) || !isRecord(input.miot.cloud)) {
    throw new Error("请求配置结构无效");
  }
  const outletsInput = Array.isArray(input.miot.outlets) ? input.miot.outlets : [];
  const outlets = outletsInput.map((outlet, index) => {
    if (!isRecord(outlet)) throw new Error(`插座配置 #${index + 1} 无效`);
    const id = requiredText(outlet.id, `插座配置 #${index + 1} 缺少通道`);
    const existing = current.miot.outlets.find((item) => item.id === id);
    return {
      ...outlet,
      token: outlet.clearToken === true ? "" : optionalText(outlet.token) || existing?.token || "",
      model: optionalText(outlet.model),
      ip: optionalText(outlet.ip),
      did: optionalText(outlet.did),
    };
  });
  const mqttUrl = requiredText(input.mqtt.url, "MQTT URL 不能为空");
  validateMqttUrl(mqttUrl);
  const cloudSession = input.miot.cloud.clearSession === true
    ? ""
    : optionalText(input.miot.cloud.session) || current.miot.cloud.session;

  return parseStoredPitConfig({
    version: 1,
    mqtt: {
      url: mqttUrl,
      username: optionalText(input.mqtt.username),
      password: input.mqtt.clearPassword === true
        ? ""
        : optionalText(input.mqtt.password) || current.mqtt.password,
    },
    miot: {
      pollIntervalMs: input.miot.pollIntervalMs,
      debug: input.miot.debug === true,
      cloud: {
        region: input.miot.cloud.region,
        username: optionalText(input.miot.cloud.username),
        password: input.miot.cloud.clearPassword === true
          ? ""
          : optionalText(input.miot.cloud.password) || current.miot.cloud.password,
        session: cloudSession,
        brokerUrl: input.miot.cloud.brokerUrl,
      },
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
    miot: {
      pollIntervalMs: config.miot.pollIntervalMs,
      debug: config.miot.debug,
      cloud: {
        region: config.miot.cloud.region,
        username: config.miot.cloud.username,
        password: "",
        passwordConfigured: Boolean(config.miot.cloud.password),
        session: "",
        sessionConfigured: Boolean(config.miot.cloud.session),
        brokerUrl: config.miot.cloud.brokerUrl,
      },
      outlets: config.miot.outlets.map((outlet) => ({
        id: outlet.id,
        name: outlet.name,
        zone: outlet.zone,
        model: outlet.model ?? "",
        ip: outlet.ip ?? "",
        token: "",
        tokenConfigured: Boolean(outlet.token),
        did: outlet.did ?? "",
        nominalVolts: outlet.nominalVolts,
        power: outlet.power,
        watts: outlet.watts ?? null,
        volts: outlet.volts ?? null,
        amps: outlet.amps ?? null,
      })),
    },
  };
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

function validateSession(value: string) {
  if (!value) return "";
  try {
    const session = JSON.parse(value);
    if (!isRecord(session) || !session.ssecurity || !session.userId || !session.serviceToken) throw new Error();
    return value;
  } catch {
    throw new Error("米家云 session JSON 缺少 ssecurity、userId 或 serviceToken");
  }
}

function validateBrokerUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("Session Broker 必须使用有效的 HTTPS URL");
  }
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

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function oneOf(value: unknown, values: string[], fallback: string) {
  return typeof value === "string" && values.includes(value) ? value : fallback;
}
