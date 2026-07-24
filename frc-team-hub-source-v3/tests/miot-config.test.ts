import assert from "node:assert/strict";
import test from "node:test";
import { parseMiotOutletConfigs } from "../src/lib/miot-config";

test("parses a local-first outlet with cloud fallback", () => {
  const [outlet] = parseMiotOutletConfigs(JSON.stringify([{
    id: "CH1",
    name: "工作台插座",
    model: "xiaomi.plug.mcn005",
    ip: "192.168.1.31",
    token: "0123456789abcdef0123456789abcdef",
    did: "123456789",
    watts: { siid: 3, piid: 2 },
  }]));

  assert.deepEqual(outlet.power, { siid: 2, piid: 1, scale: 1 });
  assert.deepEqual(outlet.watts, { siid: 3, piid: 2, scale: 1 });
  assert.equal(outlet.nominalVolts, 220);
});

test("supports cloud-only outlets and measurement scaling", () => {
  const [outlet] = parseMiotOutletConfigs(JSON.stringify([{
    id: "CH8",
    did: "987654321",
    amps: { siid: 5, piid: 2, scale: 0.001 },
  }]));

  assert.equal(outlet.ip, undefined);
  assert.deepEqual(outlet.amps, { siid: 5, piid: 2, scale: 0.001 });
});

test("migrates an imported cuco plug that predates the power mapping", () => {
  const [outlet] = parseMiotOutletConfigs(JSON.stringify([{
    id: "CH2",
    model: "cuco.plug.v3",
    did: "2004729696",
  }]));

  assert.deepEqual(outlet.watts, { siid: 11, piid: 2, scale: 1 });
});

test("keeps an explicitly disabled cuco power mapping disabled", () => {
  const [outlet] = parseMiotOutletConfigs(JSON.stringify([{
    id: "CH2",
    model: "cuco.plug.v3",
    did: "2004729696",
    watts: null,
  }]));

  assert.equal(outlet.watts, undefined);
});

test("rejects incomplete local credentials and duplicate channels", () => {
  assert.throws(
    () => parseMiotOutletConfigs('[{"id":"CH1","ip":"192.168.1.31"}]'),
    /ip 和 token 必须同时配置/,
  );
  assert.throws(
    () => parseMiotOutletConfigs('[{"id":"CH1","did":"1"},{"id":"CH1","did":"2"}]'),
    /通道重复/,
  );
});

test("rejects malformed tokens and property identifiers", () => {
  assert.throws(
    () => parseMiotOutletConfigs('[{"id":"CH1","ip":"192.168.1.31","token":"bad"}]'),
    /32 位十六进制/,
  );
  assert.throws(
    () => parseMiotOutletConfigs('[{"id":"CH1","did":"1","power":{"siid":0,"piid":1}}]'),
    /siid\/piid/,
  );
});
