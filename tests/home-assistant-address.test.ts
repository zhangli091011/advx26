import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHomeAssistantBaseUrl,
  splitHomeAssistantBaseUrl,
} from "../src/lib/home-assistant-address";

test("splits a Home Assistant base URL into editable host and port fields", () => {
  assert.deepEqual(splitHomeAssistantBaseUrl("http://192.168.66.34:8123"), {
    protocol: "http",
    host: "192.168.66.34",
    port: "8123",
  });
  assert.deepEqual(splitHomeAssistantBaseUrl("https://ha.example.test"), {
    protocol: "https",
    host: "ha.example.test",
    port: "443",
  });
});

test("builds IPv4, hostname, and IPv6 Home Assistant origins", () => {
  assert.equal(buildHomeAssistantBaseUrl({
    protocol: "http",
    host: "192.168.66.34",
    port: "8123",
  }), "http://192.168.66.34:8123");
  assert.equal(buildHomeAssistantBaseUrl({
    protocol: "https",
    host: "ha.example.test",
    port: "8443",
  }), "https://ha.example.test:8443");
  assert.equal(buildHomeAssistantBaseUrl({
    protocol: "http",
    host: "fd00::34",
    port: "8123",
  }), "http://[fd00::34]:8123");
});

test("rejects invalid hosts and ports before saving settings", () => {
  assert.throws(() => buildHomeAssistantBaseUrl({
    protocol: "http",
    host: "",
    port: "8123",
  }), /不能为空/);
  assert.throws(() => buildHomeAssistantBaseUrl({
    protocol: "http",
    host: "192.168.66.34/path",
    port: "8123",
  }), /格式无效/);
  assert.throws(() => buildHomeAssistantBaseUrl({
    protocol: "http",
    host: "192.168.66.34",
    port: "70000",
  }), /1–65535/);
});
