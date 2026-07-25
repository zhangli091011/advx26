import "server-only";

import { DeviceGatewayClient } from "@/lib/device-gateway-client";
import { HomeAssistantOutletManager } from "@/lib/home-assistant-outlets";
import type { StoredPitConfig } from "@/lib/pit-config-model";
import type { PitConfigTestResult } from "@/types/pit-config";

export async function testGatewayConfig(config: StoredPitConfig): Promise<PitConfigTestResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const client = new DeviceGatewayClient({
      url: config.gateway.url,
      clientId: `pit-config-test-${Math.random().toString(16).slice(2, 8)}`,
      role: "pithub",
      token: config.gateway.token || process.env.PIT_GATEWAY_TOKEN || "",
    });
    let finished = false;
    const finish = (ok: boolean, message: string) => {
      if (finished) return;
      finished = true;
      client.stop();
      resolve({ ok, target: "gateway", latencyMs: Date.now() - startedAt, message });
    };
    client.once("connect", () => finish(true, "设备网关长连接成功"));
    client.start();
    setTimeout(() => finish(false, "设备网关连接或认证超时"), 6_000).unref();
  });
}

export async function testHomeAssistantConfig(config: StoredPitConfig, channelId: string): Promise<PitConfigTestResult> {
  const startedAt = Date.now();
  const manager = new HomeAssistantOutletManager(config.homeAssistant);
  try {
    const transport = await manager.testConnection(channelId);
    return { ok: true, target: channelId, transport, latencyMs: Date.now() - startedAt, message: "Home Assistant 插座连接成功（WebSocket）" };
  } catch (error) {
    return {
      ok: false,
      target: channelId,
      latencyMs: Date.now() - startedAt,
      message: `Home Assistant 插座连接失败：${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    manager.destroy();
  }
}
