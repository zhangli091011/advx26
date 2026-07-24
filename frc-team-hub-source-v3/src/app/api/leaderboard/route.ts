import { apiError, apiSuccess } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import { startOfShanghaiMonth, startOfShanghaiWeek } from "@/lib/time";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("未登录", 401);
  const period = new URL(request.url).searchParams.get("period") || "week";
  const now = Date.now();
  const since =
    period === "all"
      ? 0
      : period === "month"
        ? startOfShanghaiMonth(now)
        : startOfShanghaiWeek(now);

  const rows = db
    .prepare(`
      SELECT
        u.id,
        u.display_name,
        u.username,
        u.role,
        u.avatar_path,
        COALESCE(SUM(
          CASE
            WHEN w.clock_out_at IS NOT NULL AND w.clock_out_at > ?
            THEN MAX(0, MIN(w.clock_out_at, ?) - MAX(w.clock_in_at, ?)) / 1000
            ELSE 0
          END
        ), 0) AS total_seconds,
        COUNT(CASE WHEN w.clock_out_at IS NOT NULL AND w.clock_out_at > ? THEN 1 END) AS tasks
      FROM users u
      LEFT JOIN work_sessions w ON w.user_id = u.id
      GROUP BY u.id
      ORDER BY total_seconds DESC, u.display_name ASC
    `)
    .all(since, now, since, since) as Array<{
    id: string;
    display_name: string;
    username: string;
    role: string;
    avatar_path: string | null;
    total_seconds: number;
    tasks: number;
  }>;

  return apiSuccess({
    period,
    currentUserId: currentUser.id,
    entries: rows.map((row, index) => ({
      rank: index + 1,
      id: row.id,
      displayName: row.display_name,
      username: row.username,
      role: row.role,
      avatarUrl: row.avatar_path ? `/api/avatar/${row.id}` : null,
      totalSeconds: Number(row.total_seconds),
      tasks: Number(row.tasks),
    })),
  });
}
