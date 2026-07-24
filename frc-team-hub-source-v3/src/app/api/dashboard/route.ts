import { apiError, apiSuccess } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import { startOfShanghaiDay, startOfShanghaiWeek } from "@/lib/time";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);
  const now = Date.now();
  const weekStart = startOfShanghaiWeek(now);
  const todayStart = startOfShanghaiDay(now);

  const current = db
    .prepare(`
      SELECT id, clock_in_at, plan_task
      FROM work_sessions WHERE user_id = ? AND clock_out_at IS NULL LIMIT 1
    `)
    .get(user.id) as { id: string; clock_in_at: number; plan_task: string } | undefined;

  const totals = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN clock_in_at >= ? THEN duration_seconds ELSE 0 END), 0) AS today,
        COALESCE(SUM(CASE WHEN clock_in_at >= ? THEN duration_seconds ELSE 0 END), 0) AS week,
        COALESCE(SUM(duration_seconds), 0) AS total,
        COUNT(CASE WHEN clock_out_at IS NOT NULL THEN 1 END) AS tasks
      FROM work_sessions WHERE user_id = ? AND clock_out_at IS NOT NULL
    `)
    .get(todayStart, weekStart, user.id) as {
    today: number;
    week: number;
    total: number;
    tasks: number;
  };

  const ranking = db
    .prepare(`
      SELECT u.id, u.display_name,
        COALESCE(SUM(CASE WHEN w.clock_out_at IS NOT NULL AND w.clock_in_at >= ?
          THEN w.duration_seconds ELSE 0 END), 0) AS total_seconds
      FROM users u
      LEFT JOIN work_sessions w ON w.user_id = u.id
      GROUP BY u.id
      ORDER BY total_seconds DESC, u.display_name ASC
    `)
    .all(weekStart) as Array<{ id: string; display_name: string; total_seconds: number }>;

  const recentDrawings = db
    .prepare(`
      SELECT d.id, d.title, d.part_number, d.revision, d.created_at, u.display_name
      FROM drawings d JOIN users u ON u.id = d.uploaded_by
      ORDER BY d.created_at DESC LIMIT 4
    `)
    .all();
  const recentReports = db
    .prepare(`
      SELECT f.id, f.kind, f.title, f.vendor, f.created_at, u.display_name
      FROM finance_documents f JOIN users u ON u.id = f.uploaded_by
      ORDER BY f.created_at DESC LIMIT 4
    `)
    .all();

  return apiSuccess({
    user,
    serverNow: now,
    current: current ?? null,
    summary: {
      todaySeconds: Number(totals.today),
      weekSeconds: Number(totals.week),
      totalSeconds: Number(totals.total),
      tasks: Number(totals.tasks),
      rank: Math.max(1, ranking.findIndex((entry) => entry.id === user.id) + 1),
      memberCount: ranking.length,
    },
    topThree: ranking.slice(0, 3).map((entry, index) => ({
      rank: index + 1,
      id: entry.id,
      displayName: entry.display_name,
      totalSeconds: Number(entry.total_seconds),
    })),
    recentDrawings,
    recentReports,
  });
}
