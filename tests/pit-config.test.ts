import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HOME_ASSISTANT_URL,
  environmentPitConfig,
  extractLegacyChannelHints,
  mergePitConfigInput,
  normalizeHomeAssistantBaseUrl,
  parseStoredPitConfig,
  publicPitConfig,
  resolvePitConfigEnvironment,
} from "../src/lib/pit-config-model";

const base = parseStoredPitConfig({
  version: 2,
  mqtt: {
    url: "mqtt://127.0.0.1:1883",
    username: "pit",
    password: "mqtt-secret",
  },
  homeAssistant: {
    baseUrl: "http://192.168.66.34:8123/home/areas-ting_zi",
    accessToken: "ha-secret",
    mode: "observe",
    defaultAreaId: "ting_zi",
    bindings: [{
      channelId: "CH1",
      name: "工作台电源",
      zone: "亭子",
      controlEntityId: "switch.workbench",
      powerEntityId: "sensor.workbench_power",
    }],
  },
});

test("normalizes the dashboard URL to the Home Assistant origin", () => {
  assert.equal(base.homeAssistant.baseUrl, DEFAULT_HOME_ASSISTANT_URL);
  assert.equal(
    normalizeHomeAssistantBaseUrl("https://ha.example.test/dashboard/view?x=1"),
    "https://ha.example.test",
  );
  assert.throws(() => normalizeHomeAssistantBaseUrl("ws://ha.example.test"), /HTTP/);
  assert.throws(
    () => normalizeHomeAssistantBaseUrl("http://user:pass@ha.example.test"),
    /用户名或密码/,
  );
});

test("public config redacts MQTT and Home Assistant secrets", () => {
  const view = publicPitConfig(base, "/var/lib/pit-os/pit-config.json", { env: {} });
  assert.equal(view.mqtt.password, "");
  assert.equal(view.mqtt.passwordConfigured, true);
  assert.equal(view.homeAssistant.accessToken, "");
  assert.equal(view.homeAssistant.accessTokenConfigured, true);
  assert.doesNotMatch(JSON.stringify(view), /mqtt-secret|ha-secret/);
});

test("blank secret fields retain stored values", () => {
  const view = publicPitConfig(base, "config.json", { env: {} });
  const merged = mergePitConfigInput(view, base, {});
  assert.equal(merged.mqtt.password, "mqtt-secret");
  assert.equal(merged.homeAssistant.accessToken, "ha-secret");
});

test("explicit clear removes stored secrets in observe mode", () => {
  const view = publicPitConfig(base, "config.json", { env: {} });
  view.mqtt.clearPassword = true;
  view.homeAssistant.clearAccessToken = true;
  const merged = mergePitConfigInput(view, base, {});
  assert.equal(merged.mqtt.password, "");
  assert.equal(merged.homeAssistant.accessToken, "");
});

test("changing the Home Assistant host requires a new token", () => {
  const view = publicPitConfig(base, "config.json", { env: {} });
  view.homeAssistant.baseUrl = "http://192.168.66.35:8123";
  assert.throws(() => mergePitConfigInput(view, base, {}), /重新输入访问令牌/);
  view.homeAssistant.accessToken = "new-host-secret";
  const merged = mergePitConfigInput(view, base, {});
  assert.equal(merged.homeAssistant.baseUrl, "http://192.168.66.35:8123");
  assert.equal(merged.homeAssistant.accessToken, "new-host-secret");
});

test("environment-managed tokens cannot be redirected through the settings API", () => {
  const view = publicPitConfig(base, "config.json", {
    env: { HOME_ASSISTANT_ACCESS_TOKEN: "managed-secret" },
  });
  view.homeAssistant.baseUrl = "http://attacker.test:8123";
  view.homeAssistant.accessToken = "replacement";
  assert.throws(
    () => mergePitConfigInput(
      view,
      base,
      { HOME_ASSISTANT_ACCESS_TOKEN: "managed-secret" },
    ),
    /环境变量托管/,
  );
});

test("rejects duplicate channels, duplicate entities, and invalid domains", () => {
  const view = publicPitConfig(base, "config.json", { env: {} });
  view.homeAssistant.bindings.push({
    ...view.homeAssistant.bindings[0],
    channelId: "CH2",
  });
  assert.throws(() => mergePitConfigInput(view, base, {}), /控制实体重复/);

  view.homeAssistant.bindings[1] = {
    ...view.homeAssistant.bindings[1],
    controlEntityId: "light.workbench",
    channelId: "CH1",
  };
  assert.throws(() => mergePitConfigInput(view, base, {}), /电源通道重复/);

  const invalid = publicPitConfig(base, "config.json", { env: {} });
  invalid.homeAssistant.bindings[0].controlEntityId =
    "button.workbench" as `switch.${string}`;
  assert.throws(() => mergePitConfigInput(invalid, base, {}), /switch.*light/);
});

test("active mode requires a token and at least one binding", () => {
  const noToken = parseStoredPitConfig({
    ...base,
    homeAssistant: {
      ...base.homeAssistant,
      accessToken: "",
      mode: "observe",
      bindings: [],
    },
  });
  const view = publicPitConfig(noToken, "config.json", { env: {} });
  view.homeAssistant.mode = "active";
  assert.throws(() => mergePitConfigInput(view, noToken, {}), /访问令牌/);
  view.homeAssistant.accessToken = "token";
  assert.throws(() => mergePitConfigInput(view, noToken, {}), /至少需要映射/);
});

test("legacy version retains MQTT and exposes safe channel hints only", () => {
  const legacy = {
    version: 1,
    mqtt: { url: "mqtts://broker.example:8883", username: "pit", password: "secret" },
    miot: {
      cloud: { username: "mi", password: "cloud", session: "session" },
      outlets: [{
        id: "CH3",
        name: "旧工作台",
        zone: "亭子",
        token: "miot-token",
        did: "123",
      }],
    },
  };
  const migrated = parseStoredPitConfig(legacy);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.mqtt.url, "mqtts://broker.example:8883");
  assert.equal(migrated.homeAssistant.mode, "observe");
  assert.deepEqual(extractLegacyChannelHints(legacy), [{
    channelId: "CH3",
    name: "旧工作台",
    zone: "亭子",
  }]);
  assert.doesNotMatch(JSON.stringify(migrated), /miot-token|cloud|session/);
});

test("environment token overrides the stored token without changing the source object", () => {
  const effective = resolvePitConfigEnvironment(base, {
    HOME_ASSISTANT_ACCESS_TOKEN: "managed-secret",
  });
  assert.equal(effective.homeAssistant.accessToken, "managed-secret");
  assert.equal(base.homeAssistant.accessToken, "ha-secret");
});

test("environment config provides safe Home Assistant defaults", () => {
  const config = environmentPitConfig({
    PIT_MQTT_URL: "mqtts://broker.example:8883",
    HOME_ASSISTANT_URL: "http://192.168.66.34:8123/home/areas-ting_zi",
    HOME_ASSISTANT_ACCESS_TOKEN: "env-secret",
    HOME_ASSISTANT_MODE: "observe",
  });
  assert.equal(config.mqtt.url, "mqtts://broker.example:8883");
  assert.equal(config.homeAssistant.baseUrl, DEFAULT_HOME_ASSISTANT_URL);
  assert.equal(config.homeAssistant.accessToken, "env-secret");
  assert.equal(config.homeAssistant.mode, "observe");
});
