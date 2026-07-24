import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import { readStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/drawings/[id]/download">) {
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);
  const { id } = await context.params;
  const row = db
    .prepare("SELECT storage_key, original_name, mime_type FROM drawings WHERE id = ?")
    .get(id) as
    | { storage_key: string; original_name: string; mime_type: string }
    | undefined;
  if (!row) return apiError("图纸不存在", 404);

  try {
    const file = await readStorage(row.storage_key);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": row.mime_type || "application/step",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
        "Content-Length": String(file.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return apiError("图纸文件丢失", 404);
  }
}
