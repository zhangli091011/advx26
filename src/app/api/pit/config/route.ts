import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import {
  getPitConfigPath,
  loadPitConfig,
  loadPitConfigMetadata,
  loadStoredPitConfigFallback,
  savePitConfig,
} from "@/lib/pit-config";
import {
  mergePitConfigInput,
  publicPitConfig,
  resolvePitConfigEnvironment,
} from "@/lib/pit-config-model";
import { testHomeAssistantConfig, testMqttConfig } from "@/lib/pit-config-test";
import { getLocalNetworkView } from "@/lib/local-network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiSuccess(
      publicPitConfig(loadPitConfig(), getPitConfigPath(), {
        ...loadPitConfigMetadata(),
        localNetwork: getLocalNetworkView(),
      }),
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "配置读取失败", 500);
  }
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return apiError("禁止跨站配置请求", 403);
  try {
    const text = await request.text();
    if (text.length > 256 * 1024) return apiError("配置请求过大", 413);
    const next = mergePitConfigInput(JSON.parse(text), loadStoredPitConfigFallback());
    savePitConfig(next);
    return apiSuccess(
      publicPitConfig(resolvePitConfigEnvironment(next), getPitConfigPath(), {
        localNetwork: getLocalNetworkView(),
      }),
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "配置保存失败", 400);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("禁止跨站测试请求", 403);
  try {
    const body = await request.json() as { target?: unknown };
    const config = loadPitConfig();
    if (body.target === "mqtt") return apiSuccess(await testMqttConfig(config));
    if (body.target === "home-assistant") {
      return apiSuccess(await testHomeAssistantConfig(config));
    }
    return apiError("未知测试目标", 400);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "连接测试失败", 500);
  }
}
