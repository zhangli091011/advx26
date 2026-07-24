import { apiError, apiSuccess } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);
  return apiSuccess({ user });
}
