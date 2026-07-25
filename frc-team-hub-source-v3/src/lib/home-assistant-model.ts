export type HomeAssistantState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_updated?: string;
};

export type DiscoveredHomeAssistantOutlet = {
  entityId: string;
  name: string;
  available: boolean;
  wattsEntityId: string;
  voltsEntityId: string;
  ampsEntityId: string;
};

export function discoverOutletsFromStates(states: HomeAssistantState[]): DiscoveredHomeAssistantOutlet[] {
  const sensors = states.filter((state) => state.entity_id.startsWith("sensor."));
  return states.filter((state) => state.entity_id.startsWith("switch.")).map((state) => ({
    entityId: state.entity_id,
    name: friendlyName(state),
    available: isAvailable(state),
    wattsEntityId: matchingSensor(state, sensors, "power", ["W", "kW"]),
    voltsEntityId: matchingSensor(state, sensors, "voltage", ["V"]),
    ampsEntityId: matchingSensor(state, sensors, "current", ["A", "mA"]),
  })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function measurement(state: HomeAssistantState | undefined, kind: "watts" | "volts" | "amps") {
  if (!state || !isAvailable(state)) return null;
  const value = Number(state.state);
  if (!Number.isFinite(value)) return null;
  const unit = String(state.attributes.unit_of_measurement ?? "");
  if (kind === "watts") return unit === "kW" ? value * 1000 : unit === "W" ? value : null;
  if (kind === "volts") return unit === "V" ? value : null;
  return unit === "mA" ? value / 1000 : unit === "A" ? value : null;
}

export function isAvailable(state: HomeAssistantState) {
  return state.state !== "unavailable" && state.state !== "unknown";
}

function matchingSensor(source: HomeAssistantState, sensors: HomeAssistantState[], deviceClass: string, units: string[]) {
  const sourceBase = source.entity_id.slice("switch.".length);
  const sourceName = friendlyName(source).toLowerCase();
  const candidates = sensors.filter((sensor) => {
    const unit = String(sensor.attributes.unit_of_measurement ?? "");
    const type = String(sensor.attributes.device_class ?? "");
    return type === deviceClass || units.includes(unit);
  });
  const scored = candidates.map((sensor) => {
    const sensorBase = sensor.entity_id.slice("sensor.".length);
    const sensorName = friendlyName(sensor).toLowerCase();
    let score = 0;
    if (sensorBase.startsWith(`${sourceBase}_`)) score += 10;
    if (sensorName.startsWith(sourceName)) score += 5;
    if (sensorBase.includes(sourceBase) || sourceBase.includes(sensorBase)) score += 2;
    return { entityId: sensor.entity_id, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.entityId.localeCompare(b.entityId));
  return scored[0]?.entityId ?? "";
}

function friendlyName(state: HomeAssistantState) {
  const value = state.attributes.friendly_name;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 100) : state.entity_id;
}
