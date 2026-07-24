import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import db from "@/lib/db";
import { deleteStorage, saveAvatar } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("请求来源无效", 403);
  const user = await getCurrentUser();
  if (!user) return apiError("未登录", 401);

  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) return apiError("请选择头像文件", 422);
  if (file.size > 5 * 1024 * 1024) return apiError("头像不能超过 5 MiB", 413);
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
    return apiError("仅支持 JPEG、PNG 或 WebP 头像", 422);
  }

  const old = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(user.id) as {
    avatar_path: string | null;
  };

  try {
    const storageKey = await saveAvatar(file, user.id);
    db.prepare("UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?").run(
      storageKey,
      Date.now(),
      user.id,
    );
    await deleteStorage(old.avatar_path);
    return apiSuccess({ avatarUrl: `/api/avatar/${user.id}?v=${Date.now()}` });
  } catch {
    return apiError("头像无法解析，请换一张图片", 422);
  }
}
