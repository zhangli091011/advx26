import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyToolStore, nextToolState, parseToolOperation, parseToolSlotInput, parseToolStore } from "../src/lib/tool-model";

test("creates exactly ten stable LED slots", () => {
  const store = createEmptyToolStore();
  assert.equal(store.slots.length, 10);
  assert.deepEqual(store.slots.map((slot) => slot.slot), [
    "U1-01", "U1-02", "U1-03", "U1-04", "U1-05",
    "U1-06", "U1-07", "U1-08", "U1-09", "U1-10",
  ]);
  assert.deepEqual(store.slots.map((slot) => slot.ledIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("validates enabled tool configuration", () => {
  assert.deepEqual(parseToolSlotInput({
    slot: "u1-10", enabled: true, name: "活动扳手", qr: "TOOL-10",
  }), {
    slot: "U1-10", enabled: true, name: "活动扳手", qr: "TOOL-10",
  });
  assert.throws(() => parseToolSlotInput({ slot: "U1-11", enabled: true, name: "x", qr: "x" }));
  assert.throws(() => parseToolSlotInput({ slot: "U1-01", enabled: true, name: "", qr: "x" }));
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

test("validates the complete persisted tool store", () => {
  const store = createEmptyToolStore();
  assert.deepEqual(parseToolStore(store), store);
  assert.throws(() => parseToolStore({ ...store, revision: "1" }), /结构无效/);
  assert.throws(() => parseToolStore({ ...store, slots: store.slots.map((slot, index) => index === 0 ? { ...slot, ledIndex: 9 } : slot) }), /顺序无效/);
  assert.throws(() => parseToolStore({ ...store, transactions: null }), /事务记录无效/);
});
