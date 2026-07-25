import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import { discoverHomeAssistantOutlets, importHomeAssistantOutlet } from "@/lib/home-assistant-discovery";
import { getPitConfigPath, loadPitConfig, savePitConfig } from "@/lib/pit-config";
import { publicPitConfig } from "@/lib/pit-config-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("禁止跨站设备发现请求", 403);
  try {
    const body = await request.json().catch(() => ({})) as { action?: unknown; entityId?: unknown; channelId?: unknown };
    const config = loadPitConfig();
    const devices = await discoverHomeAssistantOutlets(config);
    if (body.action === "import") {
      if (typeof body.entityId !== "string" || typeof body.channelId !== "string") return apiError("缺少实体 ID 或导入通道", 400);
      const discovered = devices.find((device) => device.entityId === body.entityId);
      if (!discovered) return apiError("Home Assistant 实体不存在", 404);
      const outlet = importHomeAssistantOutlet(config, discovered, body.channelId);
      const outlets = [...config.homeAssistant.outlets.filter((item) => item.id !== body.channelId), outlet];
      const next = { ...config, homeAssistant: { ...config.homeAssistant, migrationRequired: outlets.some((item) => !item.switchEntityId), outlets } };
      savePitConfig(next);
      return apiSuccess(publicPitConfig(next, getPitConfigPath()));
    }
    const imported = new Set(config.homeAssistant.outlets.map((outlet) => outlet.switchEntityId).filter(Boolean));
    return apiSuccess({ devices: devices.filter((device) => !imported.has(device.entityId)) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Home Assistant 设备发现失败", 502);
  }
}
