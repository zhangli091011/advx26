import "server-only";

import { HomeAssistantClient } from "@/lib/home-assistant-client";
import type { HomeAssistantOutletConfig } from "@/lib/home-assistant-config";
import { discoverOutletsFromStates, type DiscoveredHomeAssistantOutlet } from "@/lib/home-assistant-model";
import type { StoredPitConfig } from "@/lib/pit-config-model";

export type { DiscoveredHomeAssistantOutlet } from "@/lib/home-assistant-model";

export async function discoverHomeAssistantOutlets(config: StoredPitConfig) {
  const states = await client(config).getStates();
  return discoverOutletsFromStates(states);
}

export function importHomeAssistantOutlet(
  config: StoredPitConfig,
  discovered: DiscoveredHomeAssistantOutlet,
  channelId: string,
): HomeAssistantOutletConfig {
  if (!/^CH[1-8]$/.test(channelId)) throw new Error("导入通道必须为 CH1-CH8");
  if (config.homeAssistant.outlets.some((outlet) => outlet.switchEntityId === discovered.entityId)) throw new Error("该 Home Assistant 插座已经导入");
  const existing = config.homeAssistant.outlets.find((outlet) => outlet.id === channelId);
  if (existing?.switchEntityId) throw new Error(`${channelId} 已被其他插座占用`);
  return {
    id: channelId,
    name: discovered.name,
    zone: existing?.zone || "Home Assistant",
    switchEntityId: discovered.entityId,
    wattsEntityId: discovered.wattsEntityId || undefined,
    voltsEntityId: discovered.voltsEntityId || undefined,
    ampsEntityId: discovered.ampsEntityId || undefined,
  };
}

function client(config: StoredPitConfig) {
  return new HomeAssistantClient(config.homeAssistant.baseUrl, config.homeAssistant.accessToken);
}
