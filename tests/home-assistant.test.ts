import assert from "node:assert/strict";
import test from "node:test";
import { discoverOutletsFromStates, measurement, type HomeAssistantState } from "../src/lib/home-assistant-model";

function state(entityId: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState {
  return { entity_id: entityId, state: value, attributes };
}

test("discovers switch entities and matches measurement sensors", () => {
  const devices = discoverOutletsFromStates([
    state("switch.workbench_plug", "on", { friendly_name: "工作台插座" }),
    state("sensor.workbench_plug_power", "590", { friendly_name: "工作台插座 Power", device_class: "power", unit_of_measurement: "W" }),
    state("light.room", "on"),
  ]);
  assert.deepEqual(devices, [{ entityId: "switch.workbench_plug", name: "工作台插座", available: true, wattsEntityId: "sensor.workbench_plug_power", voltsEntityId: "", ampsEntityId: "" }]);
});

test("normalizes only explicit compatible HA measurement units", () => {
  assert.equal(measurement(state("sensor.p", "0.59", { unit_of_measurement: "kW" }), "watts"), 590);
  assert.equal(measurement(state("sensor.c", "750", { unit_of_measurement: "mA" }), "amps"), 0.75);
  assert.equal(measurement(state("sensor.v", "220", { unit_of_measurement: "V" }), "volts"), 220);
  assert.equal(measurement(state("sensor.bad", "590", { unit_of_measurement: "kWh" }), "watts"), null);
  assert.equal(measurement(state("sensor.off", "unavailable", { unit_of_measurement: "W" }), "watts"), null);
});
