import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import { getPitHub } from "@/lib/pit-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiSuccess(getPitHub().getToolAdminState());
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "工具数据读取失败", 500);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("禁止跨站工具操作", 403);
  try {
    const text = await request.text();
    if (text.length > 32 * 1024) return apiError("请求过大", 413);
    const body = JSON.parse(text) as { action?: unknown; operation?: unknown; borrower?: unknown; tool?: unknown; id?: unknown };
    const hub = getPitHub();
    if (body.action === "start-session") return apiSuccess(await hub.startToolSession(body.operation, body.borrower));
    if (body.action === "cancel-session") {
      await hub.cancelToolSession();
      return apiSuccess({ cancelled: true });
    }
    if (body.action === "configure") return apiSuccess(hub.configureTool(body.tool));
    if (body.action === "remove") return apiSuccess(hub.removeTool(body.id));
    if (body.action === "sync-leds") {
      const sent = await hub.syncToolLeds();
      return sent ? apiSuccess({ sent: true }) : apiError("设备网关未连接，LED 同步失败", 503);
    }
    return apiError("未知工具操作", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "工具操作失败";
    const status = /设备网关|相机未就绪|下发失败/.test(message) ? 503 : /已有|重复|已经|不在位/.test(message) ? 409 : 400;
    return apiError(message, status);
  }
}
