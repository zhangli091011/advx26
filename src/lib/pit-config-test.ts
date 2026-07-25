import "server-only";

import mqtt from "mqtt";
import { testHomeAssistantConfig as connectHomeAssistant } from "@/lib/home-assistant";
import type { StoredPitConfig } from "@/lib/pit-config-model";
import type { PitConfigTestResult } from "@/types/pit-config";

export async function testMqttConfig(config: StoredPitConfig): Promise<PitConfigTestResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const client = mqtt.connect(config.mqtt.url, {
      clientId: `pit-config-test-${Math.random().toString(16).slice(2, 8)}`,
      username: config.mqtt.username || undefined,
      password: config.mqtt.password || undefined,
      reconnectPeriod: 0,
      connectTimeout: 5_000,
    });
    let finished = false;
    const finish = (ok: boolean, message: string) => {
      if (finished) return;
      finished = true;
      client.end(true);
      resolve({
        ok,
        target: "mqtt",
        transport: "mqtt",
        latencyMs: Date.now() - startedAt,
        message,
      });
    };
    client.once("connect", () => finish(true, "MQTT Broker 连接成功"));
    client.once("error", (error) => finish(false, `MQTT 连接失败：${error.message}`));
    setTimeout(() => finish(false, "MQTT 连接超时"), 6_000).unref();
  });
}

export async function testHomeAssistantConfig(
  config: StoredPitConfig,
): Promise<PitConfigTestResult> {
  const startedAt = Date.now();
  try {
    return await connectHomeAssistant(config);
  } catch (error) {
    return {
      ok: false,
      target: "home-assistant",
      transport: "websocket",
      latencyMs: Date.now() - startedAt,
      message: `Home Assistant 连接失败：${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
