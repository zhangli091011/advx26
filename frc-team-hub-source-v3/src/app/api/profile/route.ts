import { z } from "zod";
import { apiError, apiSuccess, formatZodError, isSameOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  displayName: z.string().trim().min(1, "昵称不能为空").max(40),
  email: z.string().trim().email("邮箱格式不正确").max(120).or(z.literal("")),
});

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return apiError("请求来源无效", 403);
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("请检查资料", 422, formatZodError(parsed.error));

  try {
    db.prepare(`
      UPDATE users SET display_name = ?, email = ?, updated_at = ? WHERE id = ?
    `).run(parsed.data.displayName, parsed.data.email || null, Date.now(), user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) return apiError("该邮箱已被其他账号使用", 409);
    throw error;
  }

  return apiSuccess({
    user: { ...user, displayName: parsed.data.displayName, email: parsed.data.email || null },
  });
}
