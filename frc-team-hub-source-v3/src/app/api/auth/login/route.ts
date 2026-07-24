import bcrypt from "bcryptjs";
import { z } from "zod";
import { apiError, apiSuccess, formatZodError, isSameOrigin } from "@/lib/api";
import { createSession } from "@/lib/auth";
import db from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  login: z.string().trim().min(3, "请输入用户名或邮箱").max(120),
  password: z.string().min(1, "请输入密码").max(128),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("请求来源无效", 403);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return apiError("请求格式不正确", 400);
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return apiError("请检查登录信息", 422, formatZodError(parsed.error));

  const row = db
    .prepare(`
      SELECT id, username, display_name, password_hash, role
      FROM users
      WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
      LIMIT 1
    `)
    .get(parsed.data.login, parsed.data.login) as
    | {
        id: string;
        username: string;
        display_name: string;
        password_hash: string;
        role: string;
      }
    | undefined;

  if (!row || !(await bcrypt.compare(parsed.data.password, row.password_hash))) {
    return apiError("账号或密码错误", 401);
  }

  await createSession(row.id);
  return apiSuccess({
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    },
  });
}
