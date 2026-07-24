import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { apiError, apiSuccess, formatZodError, isSameOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import { deleteStorage, saveUpload } from "@/lib/storage";

export const runtime = "nodejs";

const metadataSchema = z.object({
  kind: z.enum(["INVOICE", "PURCHASE"]),
  title: z.string().trim().min(1, "请输入文档名称").max(120),
  vendor: z.string().trim().max(100),
  amount: z.string().trim().max(30),
  documentDate: z.string().trim().max(20),
  notes: z.string().trim().max(2000),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "";
  const q = url.searchParams.get("q")?.trim() || "";
  const like = `%${q}%`;
  const rows = db
    .prepare(`
      SELECT f.*, u.display_name AS uploader
      FROM finance_documents f JOIN users u ON u.id = f.uploaded_by
      WHERE (? = '' OR f.kind = ?)
        AND (? = '' OR f.title LIKE ? OR COALESCE(f.vendor, '') LIKE ?)
      ORDER BY f.created_at DESC LIMIT 200
    `)
    .all(kind, kind, q, like, like) as Array<Record<string, string | number | null>>;

  return apiSuccess({
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      vendor: row.vendor,
      amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
      documentDate: row.document_date,
      notes: row.notes,
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
  if (!(file instanceof File)) return apiError("请选择要上传的文件", 422);

  const parsed = metadataSchema.safeParse({
    kind: form.get("kind"),
    title: form.get("title"),
    vendor: form.get("vendor") || "",
    amount: form.get("amount") || "",
    documentDate: form.get("documentDate") || "",
    notes: form.get("notes") || "",
  });
  if (!parsed.success) return apiError("请检查文档信息", 422, formatZodError(parsed.error));

  const ext = path.extname(file.name).toLowerCase();
  const allowed =
    parsed.data.kind === "INVOICE"
      ? new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"])
      : new Set([".xlsx"]);
  const maxSize = parsed.data.kind === "INVOICE" ? 25 : 50;
  if (!allowed.has(ext)) {
    return apiError(
      parsed.data.kind === "INVOICE"
        ? "发票仅支持 PDF、PNG、JPEG 或 WebP"
        : "购买记录仅支持 .xlsx 文件",
      422,
    );
  }
  if (file.size > maxSize * 1024 * 1024) return apiError(`文件不能超过 ${maxSize} MiB`, 413);

  let amountCents: number | null = null;
  if (parsed.data.amount) {
    const value = Number(parsed.data.amount);
    if (!Number.isFinite(value) || value < 0) return apiError("金额格式不正确", 422);
    amountCents = Math.round(value * 100);
  }

  const saved = await saveUpload(file, "finance");
  const id = randomUUID();
  const now = Date.now();
  try {
    db.prepare(`
      INSERT INTO finance_documents (
        id, kind, title, vendor, amount_cents, document_date, notes,
        original_name, storage_key, mime_type, size_bytes, sha256, uploaded_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      parsed.data.kind,
      parsed.data.title,
      parsed.data.vendor || null,
      amountCents,
      parsed.data.documentDate || null,
      parsed.data.notes || null,
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
