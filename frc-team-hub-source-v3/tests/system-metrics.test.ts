import assert from "node:assert/strict";
import test from "node:test";
import { calculateCpuUsage, parseThrottled } from "../src/lib/system-metrics";

test("calculates CPU usage from consecutive aggregate samples", () => {
  assert.equal(calculateCpuUsage(null, { idle: 400, total: 1000 }), null);
  assert.equal(calculateCpuUsage({ idle: 400, total: 1000 }, { idle: 460, total: 1200 }), 70);
  assert.equal(calculateCpuUsage({ idle: 460, total: 1200 }, { idle: 460, total: 1200 }), null);
});

test("decodes active and historical Raspberry Pi throttling flags", () => {
  assert.deepEqual(parseThrottled("throttled=0x0"), { raw: "0x0", active: [], historical: [] });
  assert.deepEqual(parseThrottled("0x50005"), {
    raw: "0x50005",
    active: ["undervoltage", "throttled"],
    historical: ["undervoltage", "throttled"],
  });
  assert.deepEqual(parseThrottled("unsupported"), { raw: null, active: [], historical: [] });
});
