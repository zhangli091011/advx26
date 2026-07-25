import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDrawerStates, createEmptyToolStore, drawerIds, nextToolState, parseToolInput, parseToolOperation, parseToolStore, parseVisionScan } from "../src/lib/tool-model";

test("defines exactly five stable tool drawers", () => {
  assert.deepEqual(drawerIds(), ["D1", "D2", "D3", "D4", "D5"]);
  assert.deepEqual(createEmptyToolStore(), {
    version: 2, revision: 1, tools: [], activeSession: null, transactions: [], processedScans: [],
  });
});

test("validates dynamic tools assigned to drawers", () => {
  assert.deepEqual(parseToolInput({ id: "tool-01", drawer: "d5", name: "活动扳手", qr: "TOOL-01" }), {
    id: "TOOL-01", drawer: "D5", name: "活动扳手", qr: "TOOL-01",
  });
  assert.deepEqual(parseToolInput({ drawer: "D1", name: "尖嘴钳", qr: "PLIERS-01" }), {
    id: "", drawer: "D1", name: "尖嘴钳", qr: "PLIERS-01",
  });
  assert.throws(() => parseToolInput({ drawer: "D6", name: "x", qr: "x" }), /D1 至 D5/);
  assert.throws(() => parseToolInput({ drawer: "D1", name: "", qr: "x" }), /名称/);
});

test("enforces explicit checkout and return transitions", () => {
  assert.equal(parseToolOperation("checkout"), "checkout");
  assert.equal(parseToolOperation("return"), "return");
  assert.equal(nextToolState("in", "checkout"), "out");
  assert.equal(nextToolState("out", "return"), "in");
  assert.equal(nextToolState("lost", "return"), "in");
  assert.throws(() => nextToolState("out", "checkout"), /重复借出/);
  assert.throws(() => nextToolState("in", "return"), /重复归还/);
});

test("validates the version 2 persisted tool store", () => {
  const store = createEmptyToolStore();
  store.tools.push({ id: "TOOL-01", drawer: "D2", name: "扳手", qr: "QR-01", state: "in", borrower: null, checkedOutAt: null, updatedAt: 1 });
  assert.deepEqual(parseToolStore(store), store);
  assert.throws(() => parseToolStore({ ...store, revision: "1" }), /结构无效/);
  assert.throws(() => parseToolStore({ ...store, tools: [...store.tools, { ...store.tools[0], id: "TOOL-02" }] }), /二维码重复/);
});

test("migrates ten legacy slots into five multi-tool drawers", () => {
  const slots = Array.from({ length: 10 }, (_, index) => ({
    slot: `U1-${String(index + 1).padStart(2, "0")}`,
    ledIndex: index,
    enabled: index < 6,
    name: index < 6 ? `工具${index + 1}` : "",
    qr: index < 6 ? `QR-${index + 1}` : "",
    state: "in",
    borrower: null,
    checkedOutAt: null,
    updatedAt: 0,
  }));
  const migrated = parseToolStore({ version: 1, revision: 3, slots, activeSession: null, transactions: [], processedScans: [] });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.revision, 4);
  assert.equal(migrated.tools.length, 6);
  assert.deepEqual(migrated.tools.map((tool) => tool.drawer), ["D1", "D2", "D3", "D4", "D5", "D1"]);
  assert.equal(migrated.activeSession, null);
});

test("aggregates multiple tools into five drawer LED states", () => {
  assert.deepEqual(aggregateDrawerStates([
    { drawer: "D1", state: "in" },
    { drawer: "D1", state: "out" },
    { drawer: "D2", state: "in" },
    { drawer: "D3", state: "lost" },
  ]), [
    { ledIndex: 0, drawer: "D1", state: "out", toolCount: 2 },
    { ledIndex: 1, drawer: "D2", state: "in", toolCount: 1 },
    { ledIndex: 2, drawer: "D3", state: "lost", toolCount: 1 },
    { ledIndex: 3, drawer: "D4", state: "unconfigured", toolCount: 0 },
    { ledIndex: 4, drawer: "D5", state: "unconfigured", toolCount: 0 },
  ]);
});

test("requires exact session correlation in vision scan payloads", () => {
  assert.deepEqual(parseVisionScan({ scanId: "scan-1", sessionId: "session-1", qr: "TOOL-1", stationId: "main", capturedAt: 123 }), {
    scanId: "scan-1", sessionId: "session-1", qr: "TOOL-1", stationId: "main", capturedAt: 123,
  });
  assert.throws(() => parseVisionScan({ scanId: "scan-1", qr: "TOOL-1", stationId: "main", capturedAt: 123 }), /sessionId/);
});
