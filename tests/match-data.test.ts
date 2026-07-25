import assert from "node:assert/strict";
import test from "node:test";
import { parseFirstEvents, parseFirstMatchData, parseFirstTeamName, selectFirstEvent } from "../src/lib/match-data";

const event = { code: "TEST", name: "Official Regional", dateStart: "2026-03-10", dateEnd: "2026-03-12" };

test("parses and selects official FIRST team events", () => {
  const events = parseFirstEvents({ Events: [event, { code: "NEXT", name: "Next Event", dateStart: "2026-04-01", dateEnd: "2026-04-03" }] });
  assert.equal(selectFirstEvent(events, "next")?.code, "NEXT");
  assert.equal(selectFirstEvent(events, undefined, Date.parse("2026-03-11T12:00:00"))?.code, "TEST");
  assert.equal(selectFirstEvent(events, undefined, Date.parse("2026-03-20T12:00:00"))?.code, "NEXT");
  assert.deepEqual(parseFirstEvents({ Events: [{ code: "bad" }] }), []);
});

test("normalizes official schedules, results, and rankings", () => {
  const data = parseFirstMatchData({
    season: 2026,
    event,
    schedules: [{ Schedule: [
      { tournamentLevel: "Qualification", description: "Qualification 1", startTime: "2026-03-10T09:00:00Z", matchNumber: 1, teams: [
        { teamNumber: 1, station: "Red1" }, { teamNumber: 2, station: "Red2" }, { teamNumber: 3, station: "Red3" },
        { teamNumber: 8214, station: "Blue1" }, { teamNumber: 4, station: "Blue2" }, { teamNumber: 5, station: "Blue3" },
      ] },
      { tournamentLevel: "Qualification", description: "Qualification 2", startTime: "2026-03-10T09:10:00Z", matchNumber: 2, teams: [
        { teamNumber: 6, station: "Red1" }, { teamNumber: 7, station: "Red2" }, { teamNumber: 8, station: "Red3" },
        { teamNumber: 9, station: "Blue1" }, { teamNumber: 10, station: "Blue2" }, { teamNumber: 11, station: "Blue3" },
      ] },
    ] }],
    results: { Matches: [{ tournamentLevel: "Qualification", matchNumber: 1, actualStartTime: "2026-03-10T09:02:00Z", scoreRedFinal: 90, scoreBlueFinal: 105 }] },
    rankings: { Rankings: [{ rank: 3, teamNumber: 8214, wins: 7, losses: 2, ties: 1, sortOrder1: 4.25 }] },
    teamNumber: 8214,
    teamName: "ADVX Robotics",
    fetchedAt: "2026-03-10T00:00:00.000Z",
  });

  assert.equal(data.source, "https://frc-api.firstinspires.org/v3.0");
  assert.equal(data.event.key, "2026test");
  assert.deepEqual(data.matches[0].blue.teams, [8214, 4, 5]);
  assert.equal(data.matches[0].played, true);
  assert.equal(data.matches[0].winningAlliance, "blue");
  assert.equal(data.matches[1].played, false);
  assert.equal(data.matches[1].red.score, null);
  assert.deepEqual(data.rankings[0], { rank: 3, team: 8214, wins: 7, losses: 2, ties: 1, rankingScore: 4.25 });
});

test("skips malformed official rows and parses the official team name", () => {
  const data = parseFirstMatchData({ season: 2026, event, schedules: [{ Schedule: [{ matchNumber: "bad" }] }], results: {}, rankings: { Rankings: [{ rank: 1 }] }, teamNumber: 8214 });
  assert.deepEqual(data.matches, []);
  assert.deepEqual(data.rankings, []);
  assert.equal(parseFirstTeamName({ teams: [{ nameShort: "ADVX", nameFull: "ADVX Robotics" }] }), "ADVX");
  assert.equal(parseFirstTeamName({ teams: [{ nameShort: "", nameFull: "ADVX Robotics" }] }), "ADVX Robotics");
});
