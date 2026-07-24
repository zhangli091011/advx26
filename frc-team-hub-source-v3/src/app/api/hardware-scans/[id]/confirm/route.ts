import { z } from "zod";
import { apiError, apiSuccess, formatZodError, isSameOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import { serializeScanRow, type ScanRow } from "@/lib/hardware-scanner";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CONFIRM"),
    deviceId: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._-]+$/),
    note: z.string().trim().max(500).optional().default(""),
  }),
  z.object({
    action: z.literal("UNKNOWN"),
    note: z.string().trim().min(1, "请填写可见文字或用途").max(500),
  }),
]);

export async function POST(request: Request, context: RouteContext<"/api/hardware-scans/[id]/confirm">) {
  if (!isSameOrigin(request)) return apiError("请求来源无效", 403);
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return apiError("扫描记录编号无效", 422);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("请检查确认信息", 422, formatZodError(parsed.error));

  const scan = db
    .prepare("SELECT id, status FROM hardware_scans WHERE id = ? AND user_id = ?")
    .get(id, user.id) as { id: string; status: string } | undefined;
  if (!scan) return apiError("扫描记录不存在", 404);
  if (scan.status === "FAILED") return apiError("失败的扫描记录不能确认", 409);

  const now = Date.now();
  if (parsed.data.action === "CONFIRM") {
    const device = db
      .prepare("SELECT id FROM hardware_devices WHERE id = ?")
      .get(parsed.data.deviceId) as { id: string } | undefined;
    if (!device) return apiError("候选设备不存在", 404);
    db.prepare(
      "UPDATE hardware_scans SET status = 'CONFIRMED', confirmed_device_id = ?, user_note = ?, completed_at = ? WHERE id = ? AND user_id = ?",
    ).run(device.id, parsed.data.note || null, now, id, user.id);
  } else {
    db.prepare(
      "UPDATE hardware_scans SET status = 'UNKNOWN', confirmed_device_id = NULL, user_note = ?, completed_at = ? WHERE id = ? AND user_id = ?",
    ).run(parsed.data.note, now, id, user.id);
  }

  const row = db
    .prepare(
      "SELECT id, status, provider, provider_model, summary, observed_text_json, visual_guess_json, candidates_json, confirmed_device_id, user_note, front_quality_json, back_quality_json, back_storage_key, created_at, completed_at FROM hardware_scans WHERE id = ?",
    )
    .get(id) as ScanRow;
  return apiSuccess({ scan: serializeScanRow(row) });
}
