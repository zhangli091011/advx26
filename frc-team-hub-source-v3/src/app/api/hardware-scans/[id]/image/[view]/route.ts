import { z } from "zod";
import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import { readStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/hardware-scans/[id]/image/[view]">,
) {
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);
  const { id, view } = await context.params;
  if (!z.string().uuid().safeParse(id).success || !new Set(["front", "back"]).has(view)) {
    return apiError("图片地址无效", 422);
  }

  const row = db
    .prepare(
      "SELECT user_id, front_storage_key, back_storage_key FROM hardware_scans WHERE id = ?",
    )
    .get(id) as
    | { user_id: string; front_storage_key: string; back_storage_key: string | null }
    | undefined;
  if (!row || (row.user_id !== user.id && user.role !== "ADMIN")) return apiError("图片不存在", 404);

  const storageKey = view === "front" ? row.front_storage_key : row.back_storage_key;
  if (!storageKey) return apiError("图片不存在", 404);
  const buffer = await readStorage(storageKey);
  return new Response(buffer, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
