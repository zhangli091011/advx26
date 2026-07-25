import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import { getPitHub } from "@/lib/pit-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return apiSuccess(getPitHub().state.cameras);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("禁止跨站切换相机", 403);
  try {
    const text = await request.text();
    if (text.length > 4096) return apiError("相机控制请求过大", 413);
    const body = JSON.parse(text) as { sourceId?: unknown };
    return apiSuccess(getPitHub().selectCameraSource(body.sourceId));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "相机切换失败", 409);
  }
}
