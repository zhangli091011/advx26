export const FRC_API_BASE_URL = "https://frc-api.firstinspires.org/v3.0";

export type MatchAlliance = { teams: number[]; score: number | null };
export type PitMatch = {
  key: string;
  label: string;
  level: "practice" | "qm" | "ef" | "sf" | "f";
  red: MatchAlliance;
  blue: MatchAlliance;
  winningAlliance: "red" | "blue" | null;
  actualTime: number | null;
  estimatedTime: number | null;
  played: boolean;
};
export type PitRanking = { rank: number; team: number; wins: number; losses: number; ties: number; rankingScore: number | null };
export type PitMatchData = {
  source: string;
  fetchedAt: string;
  teamNumber: number;
  teamName: string;
  event: { key: string; name: string; year: number };
  matches: PitMatch[];
  rankings: PitRanking[];
};

type JsonRecord = Record<string, unknown>;
export type FirstEvent = { code: string; name: string; dateStart: string; dateEnd: string };

export function parseFirstEvents(payload: unknown) {
  const root = record(payload);
  if (!root || !Array.isArray(root.Events)) return [];
  return root.Events.flatMap((value): FirstEvent[] => {
    const event = record(value);
    if (!event || typeof event.code !== "string" || typeof event.name !== "string" || typeof event.dateStart !== "string" || typeof event.dateEnd !== "string") return [];
    return [{ code: event.code, name: event.name, dateStart: event.dateStart, dateEnd: event.dateEnd }];
  });
}

export function selectFirstEvent(events: FirstEvent[], preferredCode: string | undefined, now = Date.now()) {
  if (preferredCode) return events.find((event) => event.code.toLowerCase() === preferredCode.toLowerCase()) ?? null;
  const dated = events.flatMap((event) => {
    const start = parseEventBoundary(event.dateStart, false);
    const end = parseEventBoundary(event.dateEnd, true);
    return Number.isFinite(start) && Number.isFinite(end) ? [{ event, start, end }] : [];
  });
  return dated.find(({ start, end }) => start <= now && now <= end)?.event
    ?? dated.filter(({ start }) => start > now).sort((a, b) => a.start - b.start)[0]?.event
    ?? dated.filter(({ end }) => end < now).sort((a, b) => b.end - a.end)[0]?.event
    ?? null;
}

function parseEventBoundary(value: string, endOfDay: boolean) {
  const parsed = Date.parse(value.includes("T") ? value : `${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function parseFirstTeamName(payload: unknown) {
  const teams = record(payload)?.teams;
  if (!Array.isArray(teams)) return "";
  const team = record(teams[0]);
  return typeof team?.nameShort === "string" && team.nameShort.trim()
    ? team.nameShort.trim()
    : typeof team?.nameFull === "string" ? team.nameFull.trim() : "";
}

export function parseFirstMatchData(input: {
  season: number;
  event: FirstEvent;
  schedules: unknown[];
  results: unknown;
  rankings: unknown;
  teamNumber: number;
  teamName?: string;
  fetchedAt?: string;
}): PitMatchData {
  const results = new Map(arrayField(input.results, "Matches").flatMap((value) => {
    const row = parseFirstResult(value);
    return row ? [[matchIdentity(row.levelName, row.matchNumber), row] as const] : [];
  }));
  const matches = input.schedules.flatMap((payload) => arrayField(payload, "Schedule")).flatMap((value): PitMatch[] => {
    const schedule = parseFirstSchedule(value);
    if (!schedule) return [];
    const result = results.get(matchIdentity(schedule.levelName, schedule.matchNumber));
    const redScore = result?.redScore ?? null;
    const blueScore = result?.blueScore ?? null;
    const played = Boolean(result);
    return [{
      key: `${input.season}${input.event.code.toLowerCase()}_${levelCode(schedule.levelName)}${schedule.matchNumber}`,
      label: schedule.description || matchLabel(schedule.levelName, schedule.matchNumber),
      level: levelCode(schedule.levelName),
      red: { teams: schedule.red, score: redScore },
      blue: { teams: schedule.blue, score: blueScore },
      winningAlliance: !played || redScore === blueScore ? null : redScore! > blueScore! ? "red" : "blue",
      actualTime: parseFirstTime(result?.actualStartTime),
      estimatedTime: parseFirstTime(schedule.startTime),
      played,
    }];
  });
  return {
    source: FRC_API_BASE_URL,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    teamNumber: input.teamNumber,
    teamName: input.teamName ?? "",
    event: { key: `${input.season}${input.event.code.toLowerCase()}`, name: input.event.name, year: input.season },
    matches: matches.sort((a, b) => (a.estimatedTime ?? Number.MAX_SAFE_INTEGER) - (b.estimatedTime ?? Number.MAX_SAFE_INTEGER) || matchOrder(a) - matchOrder(b)),
    rankings: arrayField(input.rankings, "Rankings").flatMap(parseFirstRanking).sort((a, b) => a.rank - b.rank),
  };
}

function parseFirstSchedule(value: unknown) {
  const row = record(value);
  const matchNumber = finiteInteger(row?.matchNumber);
  if (!row || typeof row.tournamentLevel !== "string" || matchNumber === null || !Array.isArray(row.teams)) return null;
  const teams = parseFirstTeams(row.teams);
  if (!teams) return null;
  return { levelName: row.tournamentLevel, matchNumber, description: typeof row.description === "string" ? row.description : "", startTime: typeof row.startTime === "string" ? row.startTime : null, ...teams };
}

function parseFirstResult(value: unknown) {
  const row = record(value);
  const matchNumber = finiteInteger(row?.matchNumber);
  const redScore = finiteNumber(row?.scoreRedFinal);
  const blueScore = finiteNumber(row?.scoreBlueFinal);
  if (!row || typeof row.tournamentLevel !== "string" || matchNumber === null || redScore === null || blueScore === null) return null;
  return { levelName: row.tournamentLevel, matchNumber, redScore, blueScore, actualStartTime: typeof row.actualStartTime === "string" ? row.actualStartTime : null };
}

function parseFirstTeams(values: unknown[]) {
  const parsed = values.flatMap((value) => {
    const team = record(value);
    const teamNumber = finiteInteger(team?.teamNumber);
    return team && teamNumber !== null && typeof team.station === "string" ? [{ number: teamNumber, station: team.station }] : [];
  });
  if (parsed.length !== values.length) return null;
  const alliance = (prefix: string) => parsed.filter((team) => team.station.toLowerCase().startsWith(prefix)).sort((a, b) => a.station.localeCompare(b.station)).map((team) => team.number);
  return { red: alliance("red"), blue: alliance("blue") };
}

function parseFirstRanking(value: unknown): PitRanking[] {
  const row = record(value);
  const rank = finiteInteger(row?.rank);
  const team = finiteInteger(row?.teamNumber);
  const wins = finiteInteger(row?.wins);
  const losses = finiteInteger(row?.losses);
  const ties = finiteInteger(row?.ties);
  if (rank === null || team === null || wins === null || losses === null || ties === null) return [];
  return [{ rank, team, wins, losses, ties, rankingScore: finiteNumber(row?.sortOrder1) }];
}

function levelCode(value: string): PitMatch["level"] {
  const level = value.toLowerCase();
  if (level === "practice") return "practice";
  if (level === "qualification") return "qm";
  if (level.includes("final") && !level.includes("semi")) return "f";
  return "sf";
}

function matchLabel(level: string, number: number) {
  const code = levelCode(level);
  return code === "practice" ? `P${number}` : code === "qm" ? `Q${number}` : code === "f" ? `F${number}` : `M${number}`;
}

function matchIdentity(level: string, number: number) { return `${level.toLowerCase()}:${number}`; }
function matchOrder(match: PitMatch) { return ({ practice: 0, qm: 1, ef: 2, sf: 3, f: 4 })[match.level] * 1_000_000 + Number(match.key.match(/(\d+)$/)?.[1] ?? 0); }
function parseFirstTime(value: string | null | undefined) { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null; }
function arrayField(value: unknown, field: string) { const found = record(value)?.[field]; return Array.isArray(found) ? found : []; }
function record(value: unknown): JsonRecord | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null; }
function finiteNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function finiteInteger(value: unknown) { return typeof value === "number" && Number.isInteger(value) ? value : null; }
