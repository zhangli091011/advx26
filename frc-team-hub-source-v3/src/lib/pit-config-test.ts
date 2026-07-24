import "server-only";

import mqtt from "mqtt";
import { MiotOutletManager } from "@/lib/miot-outlets";
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
      resolve({ ok, target: "mqtt", latencyMs: Date.now() - startedAt, message });
    };
    client.once("connect", () => finish(true, "MQTT Broker 连接成功"));
    client.once("error", (error) => finish(false, `MQTT 连接失败：${error.message}`));
    setTimeout(() => finish(false, "MQTT 连接超时"), 6_000).unref();
  });
}

export async function testMiotConfig(config: StoredPitConfig, channelId: string): Promise<PitConfigTestResult> {
  const startedAt = Date.now();
  const manager = new MiotOutletManager(config.miot);
  try {
    const transport = await manager.testConnection(channelId);
    return {
      ok: true,
      target: channelId,
      transport,
      latencyMs: Date.now() - startedAt,
      message: `米家插座连接成功（${transport === "local" ? "局域网" : "云端"}）`,
    };
  } catch (error) {
    return {
      ok: false,
      target: channelId,
      latencyMs: Date.now() - startedAt,
      message: `米家插座连接失败：${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    manager.destroy();
  }
}
