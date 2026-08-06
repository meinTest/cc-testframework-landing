import { NextResponse } from "next/server";
import { checkEntitlementCached, licenseKeyFromRequest } from "../../lib/entitlement";
import { rateLimit } from "../../lib/rate-limit";
import {
  getProxiedPackument,
  resolveOriginalTarball,
  fetchTarball,
  NpmProxyError,
} from "../../lib/npm-registry";

// License-brokered npm registry for @meintest/* (GitHub Packages). Clients set
//   @meintest:registry=<origin>/api/tmgmt/npm/
//   //<origin>/api/tmgmt/npm/:_authToken=${CC_LICENSE_KEY}
// and can `npm install @meintest/…` with only a valid license — no GitHub access.

const PREFIX = "/api/tmgmt/npm/";
// @meintest/<pkg>/-/<file> — GitHub Packages names the tarball with a bare SHA
// (no .tgz extension), so match anything after `/-/`.
const TARBALL_RE = /^@meintest\/([^/]+)\/-\/(.+)$/;
// @meintest/<pkg>
const PACKUMENT_RE = /^@meintest\/([^/]+)$/;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  const entitlement = await checkEntitlementCached(licenseKeyFromRequest(request), dryRun);
  if (!entitlement.ok) {
    return npmError(entitlement.status, entitlement.reason);
  }

  // Per-license abuse cap (default 60 req/min).
  const perMinute = Number(process.env.NPM_RATE_LIMIT_PER_MIN) || 60;
  const rl = rateLimit(`npm:${entitlement.licenseId}`, perMinute, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec), "Cache-Control": "no-store" },
      },
    );
  }

  // Parse the package specifier from the RAW pathname so the scoped name's %2f
  // is preserved (Vercel/Next would otherwise mangle the scoped segment).
  const pathname = new URL(request.url).pathname;
  const at = pathname.indexOf(PREFIX);
  const spec = safeDecode(at >= 0 ? pathname.slice(at + PREFIX.length) : "");

  // Never act as an open registry mirror.
  if (!spec.startsWith("@meintest/")) {
    return npmError(403, "Only @meintest/* packages are served");
  }

  try {
    const tar = TARBALL_RE.exec(spec);
    if (tar) {
      const [, pkg, filename] = tar;
      const originalUrl = await resolveOriginalTarball(pkg, filename);
      if (!originalUrl) return npmError(404, "Not found");

      const upstream = await fetchTarball(originalUrl);
      if (!upstream.ok || !upstream.body) return npmError(502, "Tarball fetch failed");

      const headers: Record<string, string> = {
        "Content-Type": "application/octet-stream",
        // A given version's tarball is immutable → long-cacheable.
        "Cache-Control": "public, max-age=31536000, immutable",
      };
      const len = upstream.headers.get("content-length");
      if (len) headers["Content-Length"] = len;
      // Stream bytes through unchanged so npm's integrity check holds.
      return new Response(upstream.body, { status: 200, headers });
    }

    const pack = PACKUMENT_RE.exec(spec);
    if (pack) {
      const proxyBase = `${originFromRequest(request)}/api/tmgmt/npm`;
      const packument = await getProxiedPackument(pack[1], proxyBase);
      return NextResponse.json(packument, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    return npmError(404, "Not found");
  } catch (err) {
    if (err instanceof NpmProxyError) return npmError(err.status, err.message);
    console.error("[tmgmt][npm] error", err);
    return npmError(502, "Upstream error");
  }
}

function npmError(status: number, reason: string) {
  // npm expects a JSON body with an `error` field.
  return NextResponse.json({ error: reason }, { status, headers: { "Cache-Control": "no-store" } });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function originFromRequest(request: Request): string {
  const explicit = process.env.LANDING_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
