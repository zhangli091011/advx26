import { apiError, apiSuccess } from "@/lib/api";
import { getPitHub } from "@/lib/pit-hub";
import { seedPitStateIfEmpty } from "@/lib/pit-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = seedPitStateIfEmpty();
  return apiSuccess(state);
}

/** 下行控制：电源开关 / 指示灯寻物 */
export async function POST(request: Request) {
  let body: { action?: string; target?: string; on?: boolean };
  try {
    body = await request.json();
  } catch {
    return apiError("请求格式错误", 400);
  }
  const hub = getPitHub();

  if (body.action === "power" && body.target) {
    const ok = hub.publishControl(`power/${body.target}`, { on: Boolean(body.on) });
    // 乐观更新本地影子
    const ch = hub.state.channels.find((c) => c.id === body.target);
    if (ch) ch.on = Boolean(body.on);
    return apiSuccess({ sent: ok });
  }

  if (body.action === "locate" && body.target) {
    const ok = hub.publishControl(`locate/${body.target}`, { blink: true });
    return apiSuccess({ sent: ok });
  }

  if (body.action === "locate-unit" && body.target) {
    const ok = hub.publishControl(`locate-unit/${body.target}`, { blink: true });
    return apiSuccess({ sent: ok });
  }

  return apiError("未知指令", 400);
}
