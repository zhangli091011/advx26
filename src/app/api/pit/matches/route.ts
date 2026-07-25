import { apiError, apiSuccess } from "@/lib/api";
import { FRC_API_BASE_URL, parseFirstEvents, parseFirstMatchData, parseFirstTeamName, selectFirstEvent } from "@/lib/match-data";
import { loadPitConfigFallback } from "@/lib/pit-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const username = process.env.FRC_API_USERNAME?.trim();
  const authorizationKey = process.env.FRC_API_AUTHORIZATION_KEY?.trim();
  if (!username || !authorizationKey) return apiError("FIRST 官方赛事 API 凭据未配置", 503);
  const season = boundedSeason(process.env.FRC_API_SEASON);
  const team = loadPitConfigFallback().team;
  const headers = { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${username}:${authorizationKey}`, "utf8").toString("base64")}` };

  try {
    const eventsPayload = await fetchFirst(`${season}/events?teamNumber=${team.number}`, headers);
    const event = selectFirstEvent(parseFirstEvents(eventsPayload), process.env.FRC_API_EVENT_CODE?.trim());
    if (!event) return apiError(`FIRST 官方 API 中未找到 TEAM ${team.number} 的 ${season} 赛事`, 503);
    const eventCode = encodeURIComponent(event.code);
    const [qualification, playoff, results, rankings, teamPayload] = await Promise.all([
      fetchFirst(`${season}/schedule/${eventCode}?tournamentLevel=Qualification`, headers, true),
      fetchFirst(`${season}/schedule/${eventCode}?tournamentLevel=Playoff`, headers, true),
      fetchFirst(`${season}/matches/${eventCode}`, headers, true),
      fetchFirst(`${season}/rankings/${eventCode}`, headers, true),
      team.name ? Promise.resolve(null) : fetchFirst(`${season}/teams?teamNumber=${team.number}`, headers, true),
    ]);
    return apiSuccess(parseFirstMatchData({ season, event, schedules: [qualification, playoff], results, rankings, teamNumber: team.number, teamName: team.name || parseFirstTeamName(teamPayload) }));
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return apiError(timedOut ? "FIRST 官方赛事 API 请求超时" : error instanceof Error ? error.message : "无法连接 FIRST 官方赛事 API", 502);
  }
}

async function fetchFirst(path: string, headers: Record<string, string>, optional = false) {
  const response = await fetch(`${FRC_API_BASE_URL}/${path}`, { headers, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (optional && (response.status === 404 || response.status === 500)) return {};
  if (!response.ok) throw new Error(`FIRST 官方赛事 API 请求失败 (${response.status})`);
  return response.json() as Promise<unknown>;
}

function boundedSeason(value: string | undefined) {
  const season = Number(value ?? "2026");
  return Number.isInteger(season) && season >= 1992 && season <= 2100 ? season : 2026;
}
