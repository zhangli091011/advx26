import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import { discoverMiotDevices, importMiotDevice } from "@/lib/miot-discovery";
import { getPitConfigPath, loadPitConfig, savePitConfig } from "@/lib/pit-config";
import { publicPitConfig } from "@/lib/pit-config-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("禁止跨站设备发现请求", 403);
  try {
    const body = await request.json().catch(() => ({})) as { action?: unknown; did?: unknown; channelId?: unknown };
    const config = loadPitConfig();
    if (body.action === "import") {
      if (typeof body.did !== "string" || typeof body.channelId !== "string") return apiError("缺少 DID 或导入通道", 400);
      const outlet = await importMiotDevice(config, body.did, body.channelId);
      const next = { ...config, miot: { ...config.miot, outlets: [...config.miot.outlets, outlet] } };
      savePitConfig(next);
      return apiSuccess(publicPitConfig(next, getPitConfigPath()));
    }
    const imported = new Set(config.miot.outlets.map((outlet) => outlet.did).filter(Boolean));
    return apiSuccess({ devices: (await discoverMiotDevices(config)).filter((device) => !imported.has(device.did)) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "小米设备发现失败", 502);
  }
}
