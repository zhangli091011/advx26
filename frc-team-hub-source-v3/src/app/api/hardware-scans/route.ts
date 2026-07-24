import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import {
  analyzeImageQuality,
  mapDeviceRow,
  matchHardwareDevices,
  serializeScanRow,
  type DeviceRow,
  type ScanRow,
} from "@/lib/hardware-scanner";
import { getVisionModel, identifyHardwareWithVision, isCloudVisionConfigured } from "@/lib/openai-vision";
import { deleteStorage, saveHardwareScanImage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const hintSchema = z.string().trim().max(500);

function getCatalog() {
  const rows = db
    .prepare(
      "SELECT id, manufacturer, model, category, part_number, revision, voltage_summary, protocols_json, interfaces_json, description, source_url, usage_url, pinout_url FROM hardware_devices ORDER BY manufacturer, model",
    )
    .all() as DeviceRow[];
  const devices = rows.map(mapDeviceRow);
  const aliasRows = db
    .prepare("SELECT device_id, alias_text FROM hardware_device_aliases")
    .all() as Array<{ device_id: string; alias_text: string }>;
  const aliases = new Map<string, string[]>();
  for (const row of aliasRows) {
    const values = aliases.get(row.device_id) || [];
    values.push(row.alias_text);
    aliases.set(row.device_id, values);
  }
  return { devices, aliases };
}

function validateImage(value: FormDataEntryValue | null, required: boolean) {
  if (!(value instanceof File)) {
    return required ? "请拍摄或上传硬件正面图片" : null;
  }
  if (value.size > 12 * 1024 * 1024) return "单张图片不能超过 12 MiB";
  if (!imageTypes.has(value.type)) return "仅支持 JPEG、PNG 或 WebP 图片";
  return null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);
  const catalog = getCatalog();
  const rows = db
    .prepare(
      "SELECT id, status, provider, provider_model, summary, observed_text_json, visual_guess_json, candidates_json, confirmed_device_id, user_note, front_quality_json, back_quality_json, back_storage_key, created_at, completed_at FROM hardware_scans WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
    )
    .all(user.id) as ScanRow[];
  return apiSuccess({
    cloudConfigured: isCloudVisionConfigured(),
    model: getVisionModel(),
    catalog: catalog.devices,
    scans: rows.map(serializeScanRow),
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("请求来源无效", 403);
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);

  const recent = db
    .prepare("SELECT COUNT(*) AS count FROM hardware_scans WHERE user_id = ? AND created_at >= ?")
    .get(user.id, Date.now() - 10 * 60 * 1000) as { count: number };
  if (recent.count >= 8) return apiError("识别请求过于频繁，请稍后再试", 429);

  const form = await request.formData();
  const front = form.get("front");
  const back = form.get("back");
  const frontError = validateImage(front, true);
  const backError = back instanceof File && back.size > 0 ? validateImage(back, false) : null;
  if (frontError || backError) return apiError(frontError || backError || "图片无效", 422);
  if (!(front instanceof File)) return apiError("请上传正面图片", 422);

  const hint = hintSchema.safeParse(form.get("hint") || "");
  if (!hint.success) return apiError("人工提示不能超过 500 字", 422);

  const scanId = randomUUID();
  let frontKey: string | null = null;
  let backKey: string | null = null;
  try {
    const savedFront = await saveHardwareScanImage(front, scanId, "front");
    frontKey = savedFront.storageKey;
    const backFile = back instanceof File && back.size > 0 ? back : null;
    const savedBack = backFile ? await saveHardwareScanImage(backFile, scanId, "back") : null;
    backKey = savedBack?.storageKey || null;

    const [frontQuality, backQuality] = await Promise.all([
      analyzeImageQuality(savedFront.buffer),
      savedBack ? analyzeImageQuality(savedBack.buffer) : Promise.resolve(null),
    ]);
    const catalog = getCatalog();
    const vision = await identifyHardwareWithVision({
      front: savedFront.buffer,
      back: savedBack?.buffer || null,
      hint: hint.data,
      devices: catalog.devices,
    });
    const candidates = matchHardwareDevices(
      catalog.devices,
      catalog.aliases,
      vision.observedTexts,
      vision.guess,
      hint.data,
    );
    const now = Date.now();

    db.prepare(
      "INSERT INTO hardware_scans (id, user_id, status, front_storage_key, back_storage_key, front_quality_json, back_quality_json, provider, provider_model, summary, observed_text_json, visual_guess_json, candidates_json, confirmed_device_id, user_note, error_message, created_at, completed_at) VALUES (?, ?, 'NEEDS_CONFIRMATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, NULL)",
    ).run(
      scanId,
      user.id,
      frontKey,
      backKey,
      JSON.stringify(frontQuality),
      backQuality ? JSON.stringify(backQuality) : null,
      vision.provider,
      vision.model,
      vision.summary,
      JSON.stringify(vision.observedTexts),
      JSON.stringify(vision.guess),
      JSON.stringify(candidates),
      hint.data || null,
      now,
    );

    const row = db
      .prepare(
        "SELECT id, status, provider, provider_model, summary, observed_text_json, visual_guess_json, candidates_json, confirmed_device_id, user_note, front_quality_json, back_quality_json, back_storage_key, created_at, completed_at FROM hardware_scans WHERE id = ?",
      )
      .get(scanId) as ScanRow;
    return apiSuccess({ scan: serializeScanRow(row) }, 201);
  } catch (error) {
    await Promise.all([deleteStorage(frontKey), deleteStorage(backKey)]);
    const message = error instanceof Error && error.message.includes("Input buffer")
      ? "图片无法解析，请换一张清晰的 JPEG、PNG 或 WebP"
      : "识别任务创建失败，请稍后重试";
    return apiError(message, 422);
  }
}
