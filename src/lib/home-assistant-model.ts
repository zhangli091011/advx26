import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistantBinding } from "@/lib/pit-config-model";
import type { PowerChannel } from "@/types/pit";

export const HOME_ASSISTANT_UNAVAILABLE_STATES = new Set(["unknown", "unavailable"]);

export type HomeAssistantArea = {
  areaId: string;
  name: string;
};

export type HomeAssistantDevice = {
  deviceId: string;
  name: string;
  areaId: string;
  manufacturer: string;
  model: string;
};

export type HomeAssistantEntity = {
  entityId: string;
  name: string;
  domain: string;
  platform: string;
  areaId: string;
  deviceId: string;
  state: string;
  unit: string;
  deviceClass: string;
  services: string[];
  available: boolean;
  controllable: boolean;
};

export type HomeAssistantDiscovery = {
  version: string;
  defaultAreaId: string;
  areas: HomeAssistantArea[];
  devices: HomeAssistantDevice[];
  entities: HomeAssistantEntity[];
};

export type HomeAssistantEntityRegistryDisplay = {
  ei: string;
  pl?: string;
  ai?: string;
  di?: string;
  en?: string;
  hn?: boolean;
};

export function homeAssistantChannel(
  binding: HomeAssistantBinding,
  states: Record<string, HassEntity>,
  connected: boolean,
): PowerChannel {
  const control = states[binding.controlEntityId];
  const validControl = connected
    && control !== undefined
    && !HOME_ASSISTANT_UNAVAILABLE_STATES.has(control.state)
    && (control.state === "on" || control.state === "off");

  const measurements = [
    binding.powerEntityId ? states[binding.powerEntityId] : undefined,
    binding.voltageEntityId ? states[binding.voltageEntityId] : undefined,
    binding.currentEntityId ? states[binding.currentEntityId] : undefined,
  ].filter((state): state is HassEntity => state !== undefined);

  const timestamps = [control, ...measurements]
    .map((state) => state ? Date.parse(state.last_updated) : Number.NaN)
    .filter(Number.isFinite);

  return {
    id: binding.channelId,
    name: binding.name,
    zone: binding.zone,
    volts: measurement(states[binding.voltageEntityId ?? ""], "voltage"),
    amps: measurement(states[binding.currentEntityId ?? ""], "current"),
    watts: measurement(states[binding.powerEntityId ?? ""], "power"),
    on: validControl ? control.state === "on" : false,
    provider: "home-assistant",
    transport: connected ? "websocket" : null,
    online: validControl,
    updatedAt: timestamps.length ? Math.max(...timestamps) : 0,
    model: control?.attributes.friendly_name,
  };
}

export function measurement(
  entity: HassEntity | undefined,
  kind: "power" | "voltage" | "current",
): number | null {
  if (!entity || HOME_ASSISTANT_UNAVAILABLE_STATES.has(entity.state)) return null;
  const value = Number(entity.state);
  if (!Number.isFinite(value)) return null;
  const unit = String(entity.attributes.unit_of_measurement ?? "").trim().toLowerCase();
  const factor = measurementFactor(kind, unit);
  if (factor === null) return null;
  const converted = value * factor;
  return Number.isFinite(converted) && converted >= 0 ? converted : null;
}

export function findDefaultAreaId(areas: HomeAssistantArea[], hint = "") {
  const normalizedHint = normalizeArea(hint);
  const preferred = areas.find((area) => {
    const id = normalizeArea(area.areaId);
    const name = normalizeArea(area.name);
    return id === "tingzi"
      || id === "ting_zi"
      || name === "亭子"
      || (normalizedHint !== "" && (id === normalizedHint || name === normalizedHint));
  });
  return preferred?.areaId ?? "";
}

export function isControlEntityId(value: string): value is HomeAssistantBinding["controlEntityId"] {
  return /^(?:switch|light)\.[a-z0-9_]+$/.test(value);
}

export function isSensorEntityId(value: string) {
  return /^sensor\.[a-z0-9_]+$/.test(value);
}

function measurementFactor(kind: "power" | "voltage" | "current", unit: string) {
  if (kind === "power") {
    if (unit === "w") return 1;
    if (unit === "kw") return 1_000;
    return null;
  }
  if (kind === "voltage") {
    if (unit === "v") return 1;
    if (unit === "mv") return 0.001;
    return null;
  }
  if (unit === "a") return 1;
  if (unit === "ma") return 0.001;
  return null;
}

function normalizeArea(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}
