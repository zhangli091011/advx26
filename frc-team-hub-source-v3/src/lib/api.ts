import { NextResponse } from "next/server";

export function apiError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: message, details },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(
    { ok: true, data },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export function formatZodError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}
