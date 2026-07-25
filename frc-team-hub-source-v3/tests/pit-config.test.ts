import assert from "node:assert/strict";
import test from "node:test";
import { environmentPitConfig, mergePitConfigInput, parseStoredPitConfig, publicPitConfig } from "../src/lib/pit-config-model";

const base = parseStoredPitConfig({
  version: 2,
  mqtt: { url: "mqtt://127.0.0.1:1883", username: "pit", password: "mqtt-secret" },
  homeAssistant: {
    baseUrl: "http://homeassistant.local:8123",
    accessToken: "ha-secret",
    pollIntervalMs: 10_000,
    outlets: [{ id: "CH1", name: "plug", zone: "desk", switchEntityId: "switch.workbench", wattsEntityId: "sensor.workbench_power" }],
  },
});

test("public config redacts MQTT and Home Assistant secrets", () => {
  const view = publicPitConfig(base, "C:/config/pit-config.json");
  assert.equal(view.mqtt.password, "");
  assert.equal(view.mqtt.passwordConfigured, true);
  assert.equal(view.homeAssistant.accessToken, "");
  assert.equal(view.homeAssistant.accessTokenConfigured, true);
  assert.doesNotMatch(JSON.stringify(view), /mqtt-secret|ha-secret/);
});

test("blank secret fields retain stored values and explicit clear removes them", () => {
  const view = publicPitConfig(base, "config.json");
  const retained = mergePitConfigInput(view, base);
  assert.equal(retained.mqtt.password, "mqtt-secret");
  assert.equal(retained.homeAssistant.accessToken, "ha-secret");
  view.mqtt.clearPassword = true;
  view.homeAssistant.clearAccessToken = true;
  const cleared = mergePitConfigInput(view, base);
  assert.equal(cleared.mqtt.password, "");
  assert.equal(cleared.homeAssistant.accessToken, "");
});

test("validates MQTT, Home Assistant URLs, and entity IDs", () => {
  assert.throws(() => parseStoredPitConfig({ ...base, mqtt: { ...base.mqtt, url: "https://broker.example" } }), /仅支持 mqtt/);
  assert.throws(() => parseStoredPitConfig({ ...base, homeAssistant: { ...base.homeAssistant, baseUrl: "ftp://ha.local" } }), /HTTP/);
  assert.throws(() => parseStoredPitConfig({ ...base, homeAssistant: { ...base.homeAssistant, outlets: [{ ...base.homeAssistant.outlets[0], switchEntityId: "sensor.not_a_switch" }] } }), /switch/);
});

test("environment config supports Home Assistant REST", () => {
  const config = environmentPitConfig({
    PIT_MQTT_URL: "mqtts://broker.example:8883",
    HOME_ASSISTANT_URL: "https://ha.example",
    HOME_ASSISTANT_TOKEN: "token",
    HOME_ASSISTANT_POLL_INTERVAL_MS: "15000",
    HOME_ASSISTANT_OUTLETS_JSON: '[{"id":"CH2","switchEntityId":"switch.pit"}]',
  });
  assert.equal(config.homeAssistant.baseUrl, "https://ha.example");
  assert.equal(config.homeAssistant.accessToken, "token");
  assert.equal(config.homeAssistant.pollIntervalMs, 15_000);
  assert.equal(config.homeAssistant.outlets[0].switchEntityId, "switch.pit");
});

test("migrates version 1 Xiaomi channels without fabricating HA entities", () => {
  const config = parseStoredPitConfig({
    version: 1,
    mqtt: { url: "mqtt://127.0.0.1:1883", username: "", password: "" },
    miot: { pollIntervalMs: 5000, cloud: { password: "legacy-secret" }, outlets: [{ id: "CH3", name: "旧插座", zone: "工位", did: "123" }] },
  });
  assert.equal(config.version, 2);
  assert.equal(config.homeAssistant.migrationRequired, true);
  assert.equal(config.homeAssistant.outlets[0].switchEntityId, "");
  assert.doesNotMatch(JSON.stringify(config), /legacy-secret|"123"/);
});
