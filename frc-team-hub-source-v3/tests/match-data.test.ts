import assert from "node:assert/strict";
import test from "node:test";
import { parseEventKey, parseMatchPayload } from "../src/lib/match-data";

test("parses the configured upstream event key", () => {
  assert.equal(parseEventKey({ config: { eventKey: "2026otsan" } }), "2026otsan");
  assert.equal(parseEventKey({ config: { eventKey: "../bad" } }), null);
  assert.equal(parseEventKey({ config: {} }), null);
});

test("normalizes matches and rankings from the upstream TBA shape", () => {
  const result = parseMatchPayload({
    event: { key: "2026otsan", name: "Sanya Off-Season", year: 2026 },
    matches: [{
      key: "2026otsan_qm5",
      comp_level: "qm",
      match_number: 5,
      set_number: 1,
      actual_time: 1234,
      predicted_time: 1200,
      winning_alliance: "blue",
      alliances: {
        red: { team_keys: ["frc1", "frc2", "frc3"], score: 10 },
        blue: { team_keys: ["frc8214", "frc4", "frc5"], score: 20 },
      },
    }],
    rankings: [{ rank: 1, team_key: "frc8214", record: { wins: 7, losses: 0, ties: 0 }, sort_orders: [5] }],
  }, "2026otsan", 8214, "ADVX Robotics", "2026-07-25T00:00:00.000Z");

  assert.equal(result?.matches[0].label, "Q5");
  assert.deepEqual(result?.matches[0].blue.teams, [8214, 4, 5]);
  assert.equal(result?.matches[0].played, true);
  assert.equal(result?.rankings[0].team, 8214);
  assert.equal(result?.rankings[0].rankingScore, 5);
  assert.equal(result?.teamName, "ADVX Robotics");
});

test("rejects mismatched events and skips malformed rows", () => {
  assert.equal(parseMatchPayload({ event: { key: "other", name: "Event", year: 2026 } }, "2026otsan", 8214), null);
  const result = parseMatchPayload({
    event: { key: "2026otsan", name: "Event", year: 2026 },
    matches: [{ key: "bad" }],
    rankings: [{ rank: 1, team_key: "not-a-team" }],
  }, "2026otsan", 8214);
  assert.deepEqual(result?.matches, []);
  assert.deepEqual(result?.rankings, []);
});
