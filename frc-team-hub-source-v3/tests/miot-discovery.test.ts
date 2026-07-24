import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeDiscoveredDevices } from "../src/lib/miot-discovery-model";

test("discovery returns only redacted outlet metadata", () => {
  const [device] = sanitizeDiscoveredDevices([{
    did: "123456",
    name: "工作台插座",
    model: "xiaomi.plug.mcn005",
    localip: "192.168.1.31",
    token: "0123456789abcdef0123456789abcdef",
    isOnline: true,
  }]);

  assert.deepEqual(device, {
    did: "123456",
    name: "工作台插座",
    model: "xiaomi.plug.mcn005",
    ip: "192.168.1.31",
    online: true,
    localAvailable: true,
    mappingKnown: true,
  });
  assert.equal("token" in device, false);
});

test("discovery filters non-outlet devices", () => {
  assert.deepEqual(sanitizeDiscoveredDevices([{
    did: "1",
    name: "客厅空气净化器",
    model: "xiaomi.airpurifier.v1",
    token: "0123456789abcdef0123456789abcdef",
  }]), []);
});

test("discovery recognizes the deployed cuco plug mapping", () => {
  const [device] = sanitizeDiscoveredDevices([{
    did: "cuco-1",
    name: "PIT power",
    model: "cuco.plug.v3",
    localip: "192.168.1.30",
    token: "0123456789abcdef0123456789abcdef",
    isOnline: true,
  }]);
  assert.equal(device.mappingKnown, true);
  assert.equal(device.localAvailable, true);
});
