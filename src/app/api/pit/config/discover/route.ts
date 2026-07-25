import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import { discoverHomeAssistant } from "@/lib/home-assistant";
import { loadPitConfig } from "@/lib/pit-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("禁止跨站设备发现请求", 403);
  try {
    await request.json().catch(() => ({}));
    const config = loadPitConfig();
    return apiSuccess(await discoverHomeAssistant(config));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Home Assistant 设备发现失败", 502);
  }
}
