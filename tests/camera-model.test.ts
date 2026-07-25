import assert from "node:assert/strict";
import test from "node:test";
import { parseCameraSources, projectMediaMtxSources } from "../src/lib/camera-model";

test("camera source config validates IDs and bounds", () => {
  assert.deepEqual(parseCameraSources(undefined), [{ id: "dabai", label: "Dabai DC" }]);
  assert.deepEqual(parseCameraSources('[{"id":"cam2","label":"Driver"}]'), [{ id: "cam2", label: "Driver" }]);
  assert.throws(() => parseCameraSources('[{"id":"bad/path","label":"Bad"}]'), /ID/);
  assert.throws(() => parseCameraSources('[{"id":"cam","label":"One"},{"id":"cam","label":"Two"}]'), /重复/);
  assert.throws(() => parseCameraSources("[]"), /1 至 4/);
});

test("MediaMTX paths are projected only onto configured sources", () => {
  const sources = projectMediaMtxSources(
    [{ id: "dabai", label: "Dabai DC" }, { id: "cam2", label: "Driver" }],
    { items: [
      { name: "dabai", ready: true, readers: [{ type: "webrtc" }], bytesReceived: 1048576, tracks: ["H264"] },
      { name: "unknown", ready: true, readers: [], bytesReceived: 99, tracks: ["H264"] },
    ] },
    123,
  );
  assert.deepEqual(sources[0], { id: "dabai", label: "Dabai DC", online: true, readers: 1, bytesReceived: 1048576, tracks: ["H264"], updatedAt: 123 });
  assert.equal(sources[1].online, false);
  assert.equal(sources.length, 2);
});

test("malformed MediaMTX fields do not leak into camera state", () => {
  const [source] = projectMediaMtxSources([{ id: "dabai", label: "Dabai" }], {
    items: [{ name: "dabai", ready: "yes", readers: "many", bytesReceived: -1, tracks: ["H264", 5] }],
  }, 456);
  assert.equal(source.online, false);
  assert.equal(source.readers, 0);
  assert.equal(source.bytesReceived, 0);
  assert.deepEqual(source.tracks, ["H264"]);
});
