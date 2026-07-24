import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import { revokeCurrentSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("请求来源无效", 403);
  await revokeCurrentSession();
  return apiSuccess({ loggedOut: true });
}
