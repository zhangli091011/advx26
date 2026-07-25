import { apiError, apiSuccess } from "@/lib/api";
import { collectSystemMetrics } from "@/lib/system-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiSuccess(await collectSystemMetrics());
  } catch (error) {
    console.error("[system-metrics] collection failed", error);
    return apiError("系统性能数据采集失败", 500);
  }
}
