import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import { getPitConfigPath, loadPitConfig, loadPitConfigFallback, savePitConfig } from "@/lib/pit-config";
import { mergePitConfigInput, publicPitConfig } from "@/lib/pit-config-model";
import { testGatewayConfig, testHomeAssistantConfig } from "@/lib/pit-config-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiSuccess(publicPitConfig(loadPitConfig(), getPitConfigPath()));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "配置读取失败", 500);
  }
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return apiError("禁止跨站配置请求", 403);
  try {
    const text = await request.text();
    if (text.length > 256 * 1024) return apiError("配置请求过大", 413);
    const next = mergePitConfigInput(JSON.parse(text), loadPitConfigFallback());
    savePitConfig(next);
    return apiSuccess(publicPitConfig(next, getPitConfigPath()));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "配置保存失败", 400);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("禁止跨站测试请求", 403);
  try {
    const body = await request.json() as { target?: unknown; config?: unknown };
    const current = loadPitConfig();
    const config = body.config === undefined ? current : mergePitConfigInput(body.config, current);
    if (body.target === "gateway") return apiSuccess(await testGatewayConfig(config));
    if (typeof body.target === "string" && /^CH[1-8]$/.test(body.target)) {
      return apiSuccess(await testHomeAssistantConfig(config, body.target));
    }
    return apiError("未知测试目标", 400);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "连接测试失败", 500);
  }
}
