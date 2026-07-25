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
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin) return fetchSite === "same-origin";
  try {
    const source = new URL(origin);
    const requestUrl = new URL(request.url);
    const host = request.headers.get("host");
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
    const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
      ? `${forwardedProtocol}:`
      : requestUrl.protocol;
    const destination = host ? new URL(`${protocol}//${host}`) : requestUrl;
    if (source.origin === destination.origin) return true;

    // Electron may normalize the same loopback server between localhost and
    // 127.0.0.1. Keep protocol and dynamic port strict while allowing aliases.
    return isLoopback(source.hostname)
      && isLoopback(destination.hostname)
      && source.protocol === destination.protocol
      && effectivePort(source) === effectivePort(destination);
  } catch {
    return false;
  }
}

function isLoopback(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function effectivePort(url: URL) {
  return url.port || (url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : "");
}

export function formatZodError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}
