import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, apiSuccess, formatZodError, isSameOrigin } from "@/lib/api";
import { createSession } from "@/lib/auth";
import db from "@/lib/db";

export const runtime = "nodejs";

const schema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_.-]{3,32}$/, "用户名需为 3–32 位字母、数字或 _.-"),
    displayName: z.string().trim().min(1, "请输入昵称").max(40),
    email: z.string().trim().email("邮箱格式不正确").max(120).or(z.literal("")),
    password: z.string().min(10, "密码至少 10 位").max(128),
    confirmPassword: z.string(),
    inviteCode: z.string().trim().min(1, "请输入赛队邀请码"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "两次输入的密码不一致",
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
  if (!parsed.success) return apiError("请检查注册信息", 422, formatZodError(parsed.error));

  const inviteCode = process.env.TEAM_INVITE_CODE || "FRC2026";
  if (parsed.data.inviteCode !== inviteCode) return apiError("赛队邀请码无效", 403);

  const now = Date.now();
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    db.prepare(`
      INSERT INTO users (
        id, username, email, display_name, password_hash, role, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'MEMBER', ?, ?)
    `).run(
      id,
      parsed.data.username,
      parsed.data.email || null,
      parsed.data.displayName,
      passwordHash,
      now,
      now,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) return apiError("用户名或邮箱已被使用", 409);
    throw error;
  }

  await createSession(id);
  return apiSuccess(
    {
      user: {
        id,
        username: parsed.data.username,
        displayName: parsed.data.displayName,
        role: "MEMBER",
      },
    },
    201,
  );
}
