export const MATCH_SOURCE_URL = "https://pit.team8214.com";

export type MatchAlliance = {
  teams: number[];
  score: number | null;
};

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

export type PitRanking = {
  rank: number;
  team: number;
  wins: number;
  losses: number;
  ties: number;
  rankingScore: number | null;
};

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

export function parseEventKey(payload: unknown) {
  const config = record(payload)?.config;
  const eventKey = typeof record(config)?.eventKey === "string" ? record(config)?.eventKey as string : "";
  return /^\d{4}[a-z0-9]+$/i.test(eventKey) ? eventKey : null;
}

export function parseMatchPayload(payload: unknown, eventKey: string, teamNumber: number, teamName = "", fetchedAt = new Date().toISOString()): PitMatchData | null {
  const root = record(payload);
  const event = record(root?.event);
  if (!root || !event || event.key !== eventKey || typeof event.name !== "string" || !Number.isInteger(event.year)) return null;

  const matches = Array.isArray(root.matches) ? root.matches.flatMap(parseMatch) : [];
  const rankings = Array.isArray(root.rankings) ? root.rankings.flatMap(parseRanking) : [];
  return {
    source: MATCH_SOURCE_URL,
    fetchedAt,
    teamNumber,
    teamName,
    event: { key: eventKey, name: event.name, year: event.year as number },
    matches: matches.sort((a, b) => matchOrder(a) - matchOrder(b)),
    rankings: rankings.sort((a, b) => a.rank - b.rank),
  };
}

function parseMatch(value: unknown): PitMatch[] {
  const match = record(value);
  const alliances = record(match?.alliances);
  const red = parseAlliance(record(alliances?.red));
  const blue = parseAlliance(record(alliances?.blue));
  const level = match?.comp_level;
  const number = finiteInteger(match?.match_number);
  const setNumber = finiteInteger(match?.set_number);
  if (!match || typeof match.key !== "string" || !isLevel(level) || number === null || !red || !blue) return [];

  const winningAlliance = match.winning_alliance === "red" || match.winning_alliance === "blue"
    ? match.winning_alliance
    : null;
  return [{
    key: match.key,
    label: matchLabel(level, number, setNumber),
    level,
    red,
    blue,
    winningAlliance,
    actualTime: positiveNumber(match.actual_time),
    estimatedTime: positiveNumber(match.predicted_time) ?? positiveNumber(match.scheduled_time),
    played: red.score !== null && blue.score !== null,
  }];
}

function parseAlliance(value: JsonRecord | null): MatchAlliance | null {
  if (!value || !Array.isArray(value.team_keys)) return null;
  const teams = value.team_keys.flatMap((key) => {
    const found = typeof key === "string" ? key.match(/^frc(\d{1,5})$/i) : null;
    return found ? [Number(found[1])] : [];
  });
  if (teams.length !== value.team_keys.length) return null;
  return { teams, score: finiteNumber(value.score) };
}

function parseRanking(value: unknown): PitRanking[] {
  const ranking = record(value);
  const teamMatch = typeof ranking?.team_key === "string" ? ranking.team_key.match(/^frc(\d{1,5})$/i) : null;
  const recordValue = record(ranking?.record);
  const rank = finiteInteger(ranking?.rank);
  const wins = finiteInteger(recordValue?.wins);
  const losses = finiteInteger(recordValue?.losses);
  const ties = finiteInteger(recordValue?.ties);
  if (!teamMatch || rank === null || wins === null || losses === null || ties === null) return [];
  const sortOrders = Array.isArray(ranking?.sort_orders) ? ranking.sort_orders : [];
  return [{ rank, team: Number(teamMatch[1]), wins, losses, ties, rankingScore: finiteNumber(sortOrders[0]) }];
}

function matchLabel(level: PitMatch["level"], number: number, setNumber: number | null) {
  if (level === "practice") return `P${number}`;
  if (level === "qm") return `Q${number}`;
  if (level === "f") return `F${number}`;
  return `${level === "sf" ? "SF" : "M"}${setNumber ?? number}`;
}

function matchOrder(match: PitMatch) {
  const levelOrder = { practice: 0, qm: 1, ef: 2, sf: 3, f: 4 };
  const keyNumber = Number(match.key.match(/(?:qm|practice|m)(\d+)$/)?.[1] ?? 0);
  return levelOrder[match.level] * 1_000_000 + keyNumber;
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null;
}

function isLevel(value: unknown): value is PitMatch["level"] {
  return value === "practice" || value === "qm" || value === "ef" || value === "sf" || value === "f";
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveNumber(value: unknown) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function finiteInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
