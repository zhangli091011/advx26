import assert from "node:assert/strict";
import test from "node:test";
import { environmentPitConfig, mergePitConfigInput, parseStoredPitConfig, publicPitConfig } from "../src/lib/pit-config-model";

const base = parseStoredPitConfig({
  version: 3,
  gateway: { url: "ws://127.0.0.1:8765", clientId: "pithub-main", token: "gateway-secret" },
  homeAssistant: {
    baseUrl: "http://homeassistant.local:8123",
    accessToken: "ha-secret",
    pollIntervalMs: 10_000,
    outlets: [{ id: "CH1", name: "plug", zone: "desk", switchEntityId: "switch.workbench", wattsEntityId: "sensor.workbench_power" }],
  },
});

test("public config redacts gateway and Home Assistant secrets", () => {
  const view = publicPitConfig(base, "C:/config/pit-config.json");
  assert.equal(view.gateway.token, "");
  assert.equal(view.gateway.tokenConfigured, true);
  assert.equal(view.homeAssistant.accessToken, "");
  assert.equal(view.homeAssistant.accessTokenConfigured, true);
  assert.doesNotMatch(JSON.stringify(view), /gateway-secret|ha-secret/);
});

test("persists and validates team identity", () => {
  const view = publicPitConfig(base, "config.json");
  view.team = { number: 9999, name: "Test Robotics" };
  const updated = mergePitConfigInput(view, base);
  assert.deepEqual(updated.team, { number: 9999, name: "Test Robotics" });
  assert.throws(() => mergePitConfigInput({ ...view, team: { number: 0, name: "Bad" } }, base), /队号/);
  assert.throws(() => mergePitConfigInput({ ...view, team: { number: 1, name: "x".repeat(81) } }, base), /80/);
});

test("blank secret fields retain stored values and explicit clear removes them", () => {
  const view = publicPitConfig(base, "config.json");
  const retained = mergePitConfigInput(view, base);
  assert.equal(retained.gateway.token, "gateway-secret");
  assert.equal(retained.homeAssistant.accessToken, "ha-secret");
  view.gateway.clearToken = true;
  view.homeAssistant.clearAccessToken = true;
  const cleared = mergePitConfigInput(view, base);
  assert.equal(cleared.gateway.token, "");
  assert.equal(cleared.homeAssistant.accessToken, "");
});

test("validates gateway, Home Assistant URLs, and entity IDs", () => {
  assert.throws(() => parseStoredPitConfig({ ...base, gateway: { ...base.gateway, url: "https://gateway.example" } }), /仅支持 ws/);
  assert.throws(() => parseStoredPitConfig({ ...base, homeAssistant: { ...base.homeAssistant, baseUrl: "ftp://ha.local" } }), /HTTP/);
  assert.throws(() => parseStoredPitConfig({ ...base, homeAssistant: { ...base.homeAssistant, outlets: [{ ...base.homeAssistant.outlets[0], switchEntityId: "sensor.not_a_switch" }] } }), /switch/);
  assert.throws(() => parseStoredPitConfig({ ...base, homeAssistant: { ...base.homeAssistant, baseUrl: "http://user:secret@ha.local:8123" } }), /HTTP/);
  assert.equal(parseStoredPitConfig({ ...base, homeAssistant: { ...base.homeAssistant, baseUrl: "http://ha.local:8123/dashboard/path" } }).homeAssistant.baseUrl, "http://ha.local:8123");
});

test("environment config supports current and dev Home Assistant names", () => {
  const config = environmentPitConfig({
    PIT_GATEWAY_URL: "wss://gateway.example/device",
    PIT_GATEWAY_TOKEN: "token-1",
    PIT_TEAM_NUMBER: "9999",
    PIT_TEAM_NAME: "Test Robotics",
    HOME_ASSISTANT_URL: "https://ha.example",
    HOME_ASSISTANT_TOKEN: "token",
    HOME_ASSISTANT_POLL_INTERVAL_MS: "15000",
    HOME_ASSISTANT_OUTLETS_JSON: '[{"id":"CH2","switchEntityId":"switch.pit"}]',
  });
  assert.equal(config.homeAssistant.baseUrl, "https://ha.example");
  assert.equal(config.gateway.url, "wss://gateway.example/device");
  assert.equal(config.gateway.token, "token-1");
  assert.deepEqual(config.team, { number: 9999, name: "Test Robotics" });
  assert.equal(config.homeAssistant.accessToken, "token");
  assert.equal(config.homeAssistant.pollIntervalMs, 15_000);
  assert.equal(config.homeAssistant.outlets[0].switchEntityId, "switch.pit");
  const devNames = environmentPitConfig({
    HOME_ASSISTANT_URL: "http://ha.local:8123",
    HOME_ASSISTANT_ACCESS_TOKEN: "new-token",
    HOME_ASSISTANT_BINDINGS_JSON: '[{"channelId":"CH3","name":"Dev plug","zone":"pit","controlEntityId":"switch.dev","powerEntityId":"sensor.dev_power"}]',
  });
  assert.equal(devNames.homeAssistant.accessToken, "new-token");
  assert.deepEqual(devNames.homeAssistant.outlets[0], {
    id: "CH3", name: "Dev plug", zone: "pit", switchEntityId: "switch.dev", wattsEntityId: "sensor.dev_power", voltsEntityId: undefined, ampsEntityId: undefined,
  });
});

test("migrates version 1 Xiaomi channels without fabricating HA entities", () => {
  const config = parseStoredPitConfig({
    version: 1,
    mqtt: { url: "mqtt://127.0.0.1:1883", username: "", password: "" },
    miot: { pollIntervalMs: 5000, cloud: { password: "legacy-secret" }, outlets: [{ id: "CH3", name: "旧插座", zone: "工位", did: "123" }] },
  });
  assert.equal(config.version, 3);
  assert.equal(config.homeAssistant.migrationRequired, true);
  assert.equal(config.homeAssistant.outlets[0].switchEntityId, "");
  assert.doesNotMatch(JSON.stringify(config), /legacy-secret|"123"/);
});

test("migrates version 2 MQTT config to the local WebSocket gateway", () => {
  const config = parseStoredPitConfig({
    version: 2,
    team: { number: 8214, name: "ADVX" },
    mqtt: { url: "mqtt://127.0.0.1:1883", username: "old", password: "old-secret" },
    homeAssistant: base.homeAssistant,
  });
  assert.equal(config.version, 3);
  assert.deepEqual(config.gateway, { url: "ws://127.0.0.1:8765", clientId: "pithub-main", token: "" });
  assert.doesNotMatch(JSON.stringify(config), /old-secret/);
});

test("migrates dev version 2 bindings without losing Home Assistant entities", () => {
  const config = parseStoredPitConfig({
    version: 2,
    mqtt: { url: "mqtt://127.0.0.1:1883", username: "old", password: "old-secret" },
    homeAssistant: {
      baseUrl: "http://ha.local:8123/home/dashboard",
      accessToken: "ha-token",
      mode: "active",
      bindings: [{
        channelId: "CH4", name: "Dev outlet", zone: "pit", controlEntityId: "switch.dev_outlet",
        powerEntityId: "sensor.dev_power", voltageEntityId: "sensor.dev_voltage", currentEntityId: "sensor.dev_current",
      }],
    },
  });
  assert.equal(config.version, 3);
  assert.equal(config.homeAssistant.baseUrl, "http://ha.local:8123");
  assert.equal(config.homeAssistant.accessToken, "ha-token");
  assert.deepEqual(config.homeAssistant.outlets[0], {
    id: "CH4", name: "Dev outlet", zone: "pit", switchEntityId: "switch.dev_outlet",
    wattsEntityId: "sensor.dev_power", voltsEntityId: "sensor.dev_voltage", ampsEntityId: "sensor.dev_current",
  });
});

test("requires a fresh token when redirecting a stored Home Assistant credential", () => {
  const view = publicPitConfig(base, "config.json");
  view.homeAssistant.baseUrl = "http://other-ha.local:8123";
  assert.throws(() => mergePitConfigInput(view, base), /重新输入访问令牌/);
  view.homeAssistant.accessToken = "replacement-token";
  assert.equal(mergePitConfigInput(view, base).homeAssistant.baseUrl, "http://other-ha.local:8123");
});
