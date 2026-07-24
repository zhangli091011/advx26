import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { apiError, apiSuccess, formatZodError, isSameOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import { deleteStorage, saveUpload } from "@/lib/storage";

export const runtime = "nodejs";

const metadataSchema = z.object({
  title: z.string().trim().min(1, "请输入图纸名称").max(120),
  partNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,64}$/, "图纸编号只能包含字母、数字及 ._-"),
  subsystem: z.string().trim().min(1, "请选择所属模块").max(60),
  revision: z.string().trim().min(1, "请输入版本号").max(32),
  description: z.string().trim().max(2000),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  const like = `%${q}%`;
  const rows = db
    .prepare(`
      SELECT d.*, u.display_name AS uploader
      FROM drawings d JOIN users u ON u.id = d.uploaded_by
      WHERE ? = '' OR d.title LIKE ? OR d.part_number LIKE ? OR d.subsystem LIKE ?
      ORDER BY d.created_at DESC LIMIT 200
    `)
    .all(q, like, like, like) as Array<Record<string, string | number | null>>;

  return apiSuccess({
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      partNumber: row.part_number,
      subsystem: row.subsystem,
      revision: row.revision,
      description: row.description,
      originalName: row.original_name,
      sizeBytes: Number(row.size_bytes),
      uploader: row.uploader,
      createdAt: Number(row.created_at),
    })),
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("请求来源无效", 403);
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return apiError("请选择 STEP 文件", 422);
  if (file.size > 100 * 1024 * 1024) return apiError("单个图纸不能超过 100 MiB", 413);
  const ext = path.extname(file.name).toLowerCase();
  if (!new Set([".step", ".stp"]).has(ext)) return apiError("仅支持 .step 或 .stp 文件", 422);

  const header = Buffer.from(await file.slice(0, 1024).arrayBuffer()).toString("utf8");
  if (!header.includes("ISO-10303-21")) return apiError("文件不像有效的 STEP 文档", 422);

  const parsed = metadataSchema.safeParse({
    title: form.get("title"),
    partNumber: form.get("partNumber"),
    subsystem: form.get("subsystem"),
    revision: form.get("revision"),
    description: form.get("description") || "",
  });
  if (!parsed.success) return apiError("请检查图纸信息", 422, formatZodError(parsed.error));

  const saved = await saveUpload(file, "drawings");
  const id = randomUUID();
  const now = Date.now();
  try {
    db.prepare(`
      INSERT INTO drawings (
        id, title, part_number, subsystem, revision, description,
        original_name, storage_key, mime_type, size_bytes, sha256, uploaded_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      parsed.data.title,
      parsed.data.partNumber,
      parsed.data.subsystem,
      parsed.data.revision,
      parsed.data.description || null,
      saved.originalName,
      saved.storageKey,
      saved.mimeType,
      saved.sizeBytes,
      saved.sha256,
      user.id,
      now,
    );
  } catch (error) {
    await deleteStorage(saved.storageKey);
    throw error;
  }

  return apiSuccess({ id, createdAt: now }, 201);
}
