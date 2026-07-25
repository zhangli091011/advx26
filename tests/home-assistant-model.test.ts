import assert from "node:assert/strict";
import test from "node:test";
import type { HassEntity } from "home-assistant-js-websocket";
import {
  findDefaultAreaId,
  homeAssistantChannel,
  measurement,
} from "../src/lib/home-assistant-model";
import type { HomeAssistantBinding } from "../src/lib/pit-config-model";

const binding: HomeAssistantBinding = {
  channelId: "CH1",
  name: "工作台",
  zone: "亭子",
  controlEntityId: "switch.workbench",
  powerEntityId: "sensor.workbench_power",
  voltageEntityId: "sensor.workbench_voltage",
  currentEntityId: "sensor.workbench_current",
};

test("converts supported Home Assistant measurement units", () => {
  assert.equal(measurement(entity("1.25", "kW"), "power"), 1_250);
  assert.equal(measurement(entity("220000", "mV"), "voltage"), 220);
  assert.equal(measurement(entity("850", "mA"), "current"), 0.85);
  assert.equal(measurement(entity("12", "VA"), "power"), null);
  assert.equal(measurement(entity("unavailable", "W"), "power"), null);
  assert.equal(measurement(entity("-1", "W"), "power"), null);
});

test("projects Home Assistant states into a live power channel", () => {
  const channel = homeAssistantChannel(binding, {
    "switch.workbench": entity("on"),
    "sensor.workbench_power": entity("125", "W"),
    "sensor.workbench_voltage": entity("220", "V"),
    "sensor.workbench_current": entity("0.57", "A"),
  }, true);
  assert.equal(channel.provider, "home-assistant");
  assert.equal(channel.transport, "websocket");
  assert.equal(channel.online, true);
  assert.equal(channel.on, true);
  assert.equal(channel.watts, 125);
  assert.equal(channel.volts, 220);
  assert.equal(channel.amps, 0.57);
});

test("disconnects safely and never reuses stale measurements", () => {
  const channel = homeAssistantChannel(binding, {
    "switch.workbench": entity("unavailable"),
    "sensor.workbench_power": entity("unknown", "W"),
  }, false);
  assert.equal(channel.online, false);
  assert.equal(channel.on, false);
  assert.equal(channel.watts, null);
  assert.equal(channel.transport, null);
});

test("prefers a real 亭子 area but does not infer it from a dashboard path", () => {
  const areas = [
    { areaId: "garage", name: "车库" },
    { areaId: "ting_zi", name: "亭子" },
  ];
  assert.equal(findDefaultAreaId(areas), "ting_zi");
  assert.equal(findDefaultAreaId([{ areaId: "yard", name: "院子" }], "areas-ting_zi"), "");
});

function entity(state: string, unit = ""): HassEntity {
  return {
    entity_id: "sensor.fixture",
    state,
    attributes: {
      friendly_name: "Fixture",
      unit_of_measurement: unit,
    },
    last_changed: "2026-07-25T10:00:00Z",
    last_updated: "2026-07-25T10:00:00Z",
    context: { id: "1", user_id: null, parent_id: null },
  };
}
