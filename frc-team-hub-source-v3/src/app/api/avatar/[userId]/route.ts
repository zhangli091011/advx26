import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import { readStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/avatar/[userId]">) {
  const current = await getCurrentUser();
  if (!current) return apiError("未登录", 401);
  const { userId } = await context.params;
  const row = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(userId) as
    | { avatar_path: string | null }
    | undefined;
  if (!row?.avatar_path) return apiError("头像不存在", 404);

  try {
    const file = await readStorage(row.avatar_path);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return apiError("头像不存在", 404);
  }
}
