import assert from "node:assert/strict";
import test from "node:test";
import { calculatePitViewport } from "../src/components/pit/pit-viewport-model";

test("fits a 16:9 desktop viewport without scrolling", () => {
  assert.deepEqual(calculatePitViewport(1280, 720), {
    scale: 2 / 3,
    frameWidth: 1280,
    frameHeight: 720,
    scrollable: false,
  });
});

test("centers a fitted canvas when the browser is taller than 16:9", () => {
  const layout = calculatePitViewport(1920, 1200);
  assert.equal(layout.scale, 1);
  assert.equal(layout.frameWidth, 1920);
  assert.equal(layout.frameHeight, 1080);
  assert.equal(layout.scrollable, false);
});

test("keeps a readable scale and enables panning on a phone viewport", () => {
  const layout = calculatePitViewport(390, 844);
  assert.equal(layout.scale, 0.72);
  assert.equal(layout.frameWidth, 1382.4);
  assert.equal(layout.frameHeight, 777.6);
  assert.equal(layout.scrollable, true);
});

test("uses a smaller minimum scale for tablet-sized windows", () => {
  const layout = calculatePitViewport(768, 1024);
  assert.equal(layout.scale, 0.64);
  assert.equal(layout.frameWidth, 1228.8);
  assert.equal(layout.frameHeight, 691.2);
  assert.equal(layout.scrollable, true);
});

test("returns a hidden layout until a measurable viewport exists", () => {
  assert.deepEqual(calculatePitViewport(0, 720), {
    scale: 0,
    frameWidth: 0,
    frameHeight: 0,
    scrollable: false,
  });
});
