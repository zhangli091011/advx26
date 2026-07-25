import assert from "node:assert/strict";
import test from "node:test";
import { isRecentlySeen, parsePitControl } from "../src/lib/pit-control";

const inventory = {
  channels: ["CH1", "CH8"],
  locations: ["U1-01", "m4x20"],
  units: ["U1", "U16"],
};

test("accepts known, well-formed control commands", () => {
  assert.deepEqual(parsePitControl({ action: "power", target: "CH1", on: false }, inventory), {
    command: { action: "power", target: "CH1", on: false },
  });
  assert.deepEqual(parsePitControl({ action: "locate", target: "U1-01" }, inventory), {
    command: { action: "locate", target: "U1-01" },
  });
  assert.deepEqual(parsePitControl({ action: "locate-unit", target: "U16" }, inventory), {
    command: { action: "locate-unit", target: "U16" },
  });
  assert.deepEqual(parsePitControl({ action: "can-serial", target: "main", command: "trace-10" }, inventory), {
    command: { action: "can-serial", target: "main", command: "trace-10" },
  });
});

test("rejects unknown targets and topic injection", () => {
  assert.ok("error" in parsePitControl({ action: "power", target: "CH9", on: true }, inventory));
  assert.ok("error" in parsePitControl({ action: "locate", target: "U1-01/extra" }, inventory));
  assert.ok("error" in parsePitControl({ action: "locate-unit", target: "U0" }, inventory));
  assert.ok("error" in parsePitControl({ action: "can-serial", target: "main", command: "reboot" }, inventory));
  assert.ok("error" in parsePitControl({ action: "can-serial", target: "../../shell", command: "status" }, inventory));
});

test("requires a boolean power state", () => {
  assert.ok("error" in parsePitControl({ action: "power", target: "CH1", on: "true" }, inventory));
});

test("device freshness uses a bounded 15 second window", () => {
  assert.equal(isRecentlySeen(90_001, 100_000), true);
  assert.equal(isRecentlySeen(85_000, 100_000), false);
  assert.equal(isRecentlySeen(null, 100_000), false);
  assert.equal(isRecentlySeen(100_001, 100_000), false);
});
