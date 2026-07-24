import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, apiSuccess, formatZodError, isSameOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import {
  startOfShanghaiDay,
  startOfShanghaiMonth,
  startOfShanghaiWeek,
} from "@/lib/time";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("clock-in"),
    task: z.string().trim().min(2, "请填写今天准备完成的任务").max(2000),
  }),
  z.object({
    action: z.literal("clock-out"),
    task: z.string().trim().min(2, "请填写本次完成的任务").max(4000),
  }),
]);

type WorkRow = {
  id: string;
  clock_in_at: number;
  plan_task: string;
  clock_out_at: number | null;
  completed_task: string | null;
  duration_seconds: number | null;
};

function sumSince(userId: string, since: number) {
  const row = db
    .prepare(`
      SELECT COALESCE(SUM(duration_seconds), 0) AS total
      FROM work_sessions
      WHERE user_id = ? AND clock_out_at IS NOT NULL AND clock_in_at >= ?
    `)
    .get(userId, since) as { total: number };
  return Number(row.total);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);
  const now = Date.now();
  const current = db
    .prepare(`
      SELECT id, clock_in_at, plan_task, clock_out_at, completed_task, duration_seconds
      FROM work_sessions WHERE user_id = ? AND clock_out_at IS NULL LIMIT 1
    `)
    .get(user.id) as WorkRow | undefined;

  const records = db
    .prepare(`
      SELECT id, clock_in_at, plan_task, clock_out_at, completed_task, duration_seconds
      FROM work_sessions WHERE user_id = ? ORDER BY clock_in_at DESC LIMIT 40
    `)
    .all(user.id) as WorkRow[];

  const all = db
    .prepare(`
      SELECT COALESCE(SUM(duration_seconds), 0) AS total
      FROM work_sessions WHERE user_id = ? AND clock_out_at IS NOT NULL
    `)
    .get(user.id) as { total: number };

  const todayStart = startOfShanghaiDay(now);
  const weeklyBars = Array.from({ length: 7 }, (_, index) => {
    const start = todayStart - (6 - index) * 86_400_000;
    const end = start + 86_400_000;
    const total = db
      .prepare(`
        SELECT COALESCE(SUM(duration_seconds), 0) AS total
        FROM work_sessions
        WHERE user_id = ? AND clock_out_at IS NOT NULL
          AND clock_in_at >= ? AND clock_in_at < ?
      `)
      .get(user.id, start, end) as { total: number };
    return { start, seconds: Number(total.total) };
  });

  return apiSuccess({
    current: current ?? null,
    records,
    summary: {
      todaySeconds: sumSince(user.id, todayStart),
      weekSeconds: sumSince(user.id, startOfShanghaiWeek(now)),
      monthSeconds: sumSince(user.id, startOfShanghaiMonth(now)),
      allSeconds: Number(all.total),
      currentSeconds: current ? Math.max(0, Math.floor((now - current.clock_in_at) / 1000)) : 0,
    },
    weeklyBars,
    serverNow: now,
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("请求来源无效", 403);
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("请检查任务内容", 422, formatZodError(parsed.error));
  const now = Date.now();

  if (parsed.data.action === "clock-in") {
    try {
      db.prepare(`
        INSERT INTO work_sessions (
          id, user_id, clock_in_at, plan_task, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), user.id, now, parsed.data.task, now, now);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE")) return apiError("你已经在工作中了", 409);
      throw error;
    }
    return apiSuccess({ clockedInAt: now }, 201);
  }

  const current = db
    .prepare("SELECT id, clock_in_at FROM work_sessions WHERE user_id = ? AND clock_out_at IS NULL")
    .get(user.id) as { id: string; clock_in_at: number } | undefined;
  if (!current) return apiError("当前没有进行中的打卡", 409);

  const duration = Math.max(0, Math.floor((now - current.clock_in_at) / 1000));
  db.prepare(`
    UPDATE work_sessions
    SET clock_out_at = ?, completed_task = ?, duration_seconds = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND clock_out_at IS NULL
  `).run(now, parsed.data.task, duration, now, current.id, user.id);

  return apiSuccess({ clockedOutAt: now, durationSeconds: duration });
}
