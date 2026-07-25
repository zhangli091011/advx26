import { apiError, apiSuccess } from "@/lib/api";
import { MATCH_SOURCE_URL, parseEventKey, parseMatchPayload } from "@/lib/match-data";
import { loadPitConfigFallback } from "@/lib/pit-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const team = loadPitConfigFallback().team;
    const configResponse = await fetch(`${MATCH_SOURCE_URL}/api/config`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!configResponse.ok) return apiError(`赛事源配置请求失败 (${configResponse.status})`, 502);

    const eventKey = parseEventKey(await configResponse.json());
    if (!eventKey) return apiError("赛事源尚未配置有效赛事", 503);

    const dataResponse = await fetch(`${MATCH_SOURCE_URL}/api/tba?eventKey=${encodeURIComponent(eventKey)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!dataResponse.ok) return apiError(`赛事数据请求失败 (${dataResponse.status})`, 502);

    const data = parseMatchPayload(await dataResponse.json(), eventKey, team.number, team.name);
    return data ? apiSuccess(data) : apiError("赛事源返回了无效数据", 502);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return apiError(timedOut ? "赛事数据源请求超时" : "无法连接赛事数据源", 502);
  }
}
