import "server-only";

import type { HassEntity } from "home-assistant-js-websocket";
import { createHomeAssistantConnection, withTimeout } from "@/lib/home-assistant-connection";
import type { HomeAssistantOutletConfig } from "@/lib/home-assistant-config";
import { discoverOutletsFromStates } from "@/lib/home-assistant-model";
import type { StoredPitConfig } from "@/lib/pit-config-model";
import type { DiscoveredHomeAssistantArea, DiscoveredHomeAssistantOutlet } from "@/types/pit-config";

type RegistryEntity = { ei?: string; pl?: string; ai?: string; di?: string };
type RegistryDevice = { id?: string; name?: string; name_by_user?: string; area_id?: string; manufacturer?: string; model?: string };
type RegistryArea = { area_id?: string; name?: string };

export type HomeAssistantDiscoveryResult = {
  version: string;
  areas: DiscoveredHomeAssistantArea[];
  devices: DiscoveredHomeAssistantOutlet[];
};

export async function discoverHomeAssistantOutlets(config: StoredPitConfig): Promise<HomeAssistantDiscoveryResult> {
  const connection = await createHomeAssistantConnection(config.homeAssistant);
  try {
    const [statesRecord, areaEntries, deviceEntries, registryResult] = await withTimeout(Promise.all([
      connection.sendMessagePromise<HassEntity[]>({ type: "get_states" }),
      connection.sendMessagePromise<RegistryArea[]>({ type: "config/area_registry/list" }),
      connection.sendMessagePromise<RegistryDevice[]>({ type: "config/device_registry/list" }),
      connection.sendMessagePromise<{ entities?: RegistryEntity[] }>({ type: "config/entity_registry/list_for_display" }),
    ]), 10_000, "Home Assistant 设备发现超时");

    const areas = areaEntries.flatMap((area) => {
      const areaId = text(area.area_id);
      const name = text(area.name);
      return areaId && name ? [{ areaId, name }] : [];
    }).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    const areaMap = new Map(areas.map((area) => [area.areaId, area.name]));
    const devices = new Map(deviceEntries.flatMap((device) => {
      const id = text(device.id);
      return id ? [[id, device] as const] : [];
    }));
    const registry = new Map((registryResult.entities ?? []).flatMap((entity) => {
      const entityId = text(entity.ei);
      return entityId ? [[entityId, entity] as const] : [];
    }));
    const states = statesRecord.map((state) => ({
      entity_id: state.entity_id,
      state: state.state,
      attributes: state.attributes,
      last_updated: state.last_updated,
    }));

    return {
      version: connection.haVersion,
      areas,
      devices: discoverOutletsFromStates(states).map((outlet) => {
        const entity = registry.get(outlet.entityId);
        const device = devices.get(text(entity?.di));
        const areaId = text(entity?.ai) || text(device?.area_id);
        return {
          ...outlet,
          areaId,
          areaName: areaMap.get(areaId) ?? "",
          deviceName: text(device?.name_by_user) || text(device?.name),
          manufacturer: text(device?.manufacturer),
          model: text(device?.model),
          platform: text(entity?.pl),
        };
      }),
    };
  } finally {
    connection.close();
  }
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
    name: discovered.deviceName || discovered.name,
    zone: discovered.areaName || existing?.zone || "Home Assistant",
    switchEntityId: discovered.entityId,
    wattsEntityId: discovered.wattsEntityId || undefined,
    voltsEntityId: discovered.voltsEntityId || undefined,
    ampsEntityId: discovered.ampsEntityId || undefined,
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
