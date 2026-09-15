import { NextResponse } from "next/server";

// Shared helpers for the public, read-only CMS-facing API (/api/public/v1/*).
// These endpoints carry no secrets and require no auth, but are still locked to
// an explicit origin allowlist (defence-in-depth) and are cacheable at the edge.

/**
 * Origin allowlist for the public API, from PUBLIC_API_ALLOWED_ORIGINS
 * (comma-separated, e.g. "https://www.itsbusiness.ch,https://itsbusiness.ch").
 * The special value "*" allows any origin (use only if the marketing origin is
 * not yet known). Unset → no cross-origin access is granted (same-origin still
 * works, since the browser sends no Origin check there).
 */
function allowedOrigins(): string[] {
  return (process.env.PUBLIC_API_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Resolve the Access-Control-Allow-Origin value to echo for this request, or
 * null when the caller's Origin is not allowlisted. We echo the exact origin
 * (never a bare "*") when allowed so the contract stays tight and credential-safe.
 */
export function resolveAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  const list = allowedOrigins();
  if (list.includes("*")) return origin ?? "*";
  if (origin && list.includes(origin)) return origin;
  return null;
}

/** CORS + Vary headers for a public API response (empty when origin not allowed). */
export function corsHeaders(request: Request): Record<string, string> {
  const allowed = resolveAllowedOrigin(request);
  const headers: Record<string, string> = { Vary: "Origin" };
  if (allowed) {
    headers["Access-Control-Allow-Origin"] = allowed;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

/** Preflight response for OPTIONS on a public API route. */
export function preflight(request: Request): Response {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * JSON response for a public GET: adds CORS headers and a shared-cache policy
 * (5 min fresh, 10 min stale-while-revalidate) matching the in-process pricing
 * cache. Pass `status` for error bodies (which stay cacheable-safe via no-store).
 */
export function publicJson(
  request: Request,
  data: unknown,
  { status = 200, cache = true }: { status?: number; cache?: boolean } = {},
): Response {
  const headers: Record<string, string> = {
    ...corsHeaders(request),
    "Cache-Control": cache
      ? "public, max-age=300, stale-while-revalidate=600"
      : "no-store",
  };
  return NextResponse.json(data, { status, headers });
}

/** Standard error body for the public API. */
export function publicError(
  request: Request,
  status: number,
  code: string,
  message: string,
): Response {
  return publicJson(request, { error: { code, message } }, { status, cache: false });
}

/**
 * Absolute base URL of the app (for building action deep-links). Prefers the
 * explicit LANDING_BASE_URL, else derives it from the request. Mirrors the
 * originFromRequest helper used by the checkout/demo-request routes.
 */
export function appBaseUrl(request: Request): string {
  const explicit = process.env.LANDING_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
