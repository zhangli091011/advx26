import bcrypt from "bcryptjs";
import { z } from "zod";
import { apiError, apiSuccess, formatZodError, isSameOrigin } from "@/lib/api";
import { createSession, getCurrentUser, revokeAllSessions } from "@/lib/auth";
import db from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码").max(128),
  newPassword: z.string().min(10, "新密码至少 10 位").max(128),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("请求来源无效", 403);
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("请检查密码", 422, formatZodError(parsed.error));

  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as {
    password_hash: string;
  };
  if (!(await bcrypt.compare(parsed.data.currentPassword, row.password_hash))) {
    return apiError("当前密码不正确", 403);
  }

  const hash = await bcrypt.hash(parsed.data.newPassword, 12);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    hash,
    Date.now(),
    user.id,
  );
  await revokeAllSessions(user.id);
  await createSession(user.id);
  return apiSuccess({ changed: true });
}
