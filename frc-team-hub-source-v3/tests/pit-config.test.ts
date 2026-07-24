import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MIOT_BROKER_SSH_HOST, DEFAULT_MIOT_BROKER_URL, environmentPitConfig, mergePitConfigInput, parseStoredPitConfig, publicPitConfig } from "../src/lib/pit-config-model";

const base = parseStoredPitConfig({
  version: 1,
  mqtt: { url: "mqtt://127.0.0.1:1883", username: "pit", password: "mqtt-secret" },
  miot: {
    pollIntervalMs: 10_000,
    debug: false,
    cloud: { region: "cn", username: "mi", password: "cloud-secret", session: "" },
    outlets: [{
      id: "CH1",
      name: "plug",
      zone: "desk",
      ip: "192.168.1.31",
      token: "0123456789abcdef0123456789abcdef",
      did: "123",
      nominalVolts: 220,
      power: { siid: 2, piid: 1, scale: 1 },
    }],
  },
});

test("public config redacts every secret", () => {
  const view = publicPitConfig(base, "C:/config/pit-config.json");
  assert.equal(view.mqtt.password, "");
  assert.equal(view.mqtt.passwordConfigured, true);
  assert.equal(view.miot.cloud.password, "");
  assert.equal(view.miot.outlets[0].token, "");
  assert.equal(view.miot.outlets[0].tokenConfigured, true);
  assert.doesNotMatch(JSON.stringify(view), /mqtt-secret|cloud-secret|0123456789abcdef/);
});

test("blank secret fields retain stored values", () => {
  const view = publicPitConfig(base, "config.json");
  const merged = mergePitConfigInput(view, base);
  assert.equal(merged.mqtt.password, "mqtt-secret");
  assert.equal(merged.miot.cloud.password, "cloud-secret");
  assert.equal(merged.miot.outlets[0].token, "0123456789abcdef0123456789abcdef");
});

test("explicit clear removes stored secrets", () => {
  const view = publicPitConfig(base, "config.json");
  view.mqtt.clearPassword = true;
  view.miot.cloud.clearPassword = true;
  view.miot.outlets[0].clearToken = true;
  view.miot.outlets[0].ip = "";
  const merged = mergePitConfigInput(view, base);
  assert.equal(merged.mqtt.password, "");
  assert.equal(merged.miot.cloud.password, "");
  assert.equal(merged.miot.outlets[0].token, undefined);
});

test("rejects unsupported MQTT schemes and incomplete cloud sessions", () => {
  assert.throws(
    () => parseStoredPitConfig({ ...base, mqtt: { ...base.mqtt, url: "https://broker.example" } }),
    /仅支持 mqtt/,
  );
  assert.throws(
    () => parseStoredPitConfig({
      ...base,
      miot: { ...base.miot, cloud: { ...base.miot.cloud, session: '{"userId":"1"}' } },
    }),
    /session JSON 缺少/,
  );
});

test("environment config remains the initial fallback", () => {
  const config = environmentPitConfig({
    PIT_MQTT_URL: "mqtts://broker.example:8883",
    MIOT_POLL_INTERVAL_MS: "15000",
    MIOT_DEBUG: "true",
  });
  assert.equal(config.mqtt.url, "mqtts://broker.example:8883");
  assert.equal(config.miot.pollIntervalMs, 15_000);
  assert.equal(config.miot.debug, true);
  assert.equal(config.miot.cloud.brokerUrl, DEFAULT_MIOT_BROKER_URL);
  assert.equal(config.miot.cloud.brokerSshHost, DEFAULT_MIOT_BROKER_SSH_HOST);
});

test("empty broker values in existing configs migrate to the built-in broker", () => {
  const config = parseStoredPitConfig({
    ...base,
    miot: { ...base.miot, cloud: { ...base.miot.cloud, brokerUrl: "", brokerSshHost: "" } },
  });
  assert.equal(config.miot.cloud.brokerUrl, DEFAULT_MIOT_BROKER_URL);
  assert.equal(config.miot.cloud.brokerSshHost, DEFAULT_MIOT_BROKER_SSH_HOST);
});
