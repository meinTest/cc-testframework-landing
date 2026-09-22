import { NextResponse } from "next/server";
import {
  checkEntitlement,
  checkEntitlementCached,
  checkQaEntitlement,
  licenseKeyFromRequest,
  ENTITLED_PRODUCTS,
} from "./entitlement";
import { rateLimit } from "./rate-limit";
import {
  resolveOsAssetName,
  getAssetRedirectUrl,
  getFeedText,
  type TargetOs,
} from "./releases";
import {
  getProxiedPackument,
  resolveOriginalTarball,
  fetchTarball,
  NpmProxyError,
} from "./npm-registry";

// Shared request handlers for the license-brokered delivery proxies. Both the
// original product-specific routes (/api/tmgmt/download, /updates, /npm) and
// their neutral aliases (/api/download, /api/updates, /api/npm) delegate here,
// so the logic lives in exactly one place. The only path-dependent input is the
// npm mount prefix, passed in explicitly.

// no-referrer keeps the ?key= license code out of the Referer header sent to the
// GitHub storage host on a redirect.
function noStore(): Record<string, string> {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
}

// --- Installer download (welcome-mail link) ---------------------------------

const DOWNLOAD_LOG_PREFIX = "[tmgmt][download]";
const TARGET_OSES: TargetOs[] = ["win", "mac", "linux"];

export async function handleDownload(request: Request): Promise<Response> {
  const dryRun = process.env.DRY_RUN === "true";
  const params = new URL(request.url).searchParams;
  const os = params.get("os");
  // ?channel=qa serves the internal QA installer (same entitlement gate as the
  // QA update feed). Anything else (incl. absent) → the customer channel, as today.
  const channel = params.get("channel") === "qa" ? "qa" : "stable";

  if (!os || !TARGET_OSES.includes(os as TargetOs)) {
    return new NextResponse("Query param 'os' must be one of: win, mac, linux", {
      status: 400,
      headers: noStore(),
    });
  }

  const licenseKey = licenseKeyFromRequest(request);
  if (channel === "qa") {
    const qa = await checkQaEntitlement(licenseKey, dryRun);
    if (!qa.ok) {
      return NextResponse.json({ error: qa.error }, { status: qa.status, headers: noStore() });
    }
  } else {
    const entitlement = await checkEntitlement(licenseKey, dryRun);
    if (!entitlement.ok) {
      return new NextResponse(entitlement.reason, {
        status: entitlement.status,
        headers: noStore(),
      });
    }
  }

  try {
    const assetName = await resolveOsAssetName(os as TargetOs, dryRun, channel);
    if (!assetName) {
      return new NextResponse("No download available for this platform", {
        status: 404,
        headers: noStore(),
      });
    }
    const url = await getAssetRedirectUrl(assetName, dryRun, channel);
    if (!url) {
      return new NextResponse("Not found", { status: 404, headers: noStore() });
    }
    return NextResponse.redirect(url, { status: 302, headers: noStore() });
  } catch (err) {
    console.error(`${DOWNLOAD_LOG_PREFIX} failed resolving ${channel} ${os} download`, err);
    return new NextResponse("Upstream error", { status: 502, headers: noStore() });
  }
}

// --- electron-updater feed / asset proxy ------------------------------------

const UPDATES_LOG_PREFIX = "[tmgmt][proxy]";

export async function handleUpdateFile(
  request: Request,
  file: string,
): Promise<Response> {
  const dryRun = process.env.DRY_RUN === "true";

  const entitlement = await checkEntitlement(licenseKeyFromRequest(request), dryRun);
  if (!entitlement.ok) {
    return new NextResponse(entitlement.reason, {
      status: entitlement.status,
      headers: noStore(),
    });
  }

  try {
    if (file.endsWith(".yml")) {
      const text = await getFeedText(file, dryRun);
      if (text === null) {
        return new NextResponse("Not found", { status: 404, headers: noStore() });
      }
      return new NextResponse(text, {
        status: 200,
        headers: { ...noStore(), "Content-Type": "text/yaml; charset=utf-8" },
      });
    }

    const url = await getAssetRedirectUrl(file, dryRun);
    if (!url) {
      return new NextResponse("Not found", { status: 404, headers: noStore() });
    }
    return NextResponse.redirect(url, { status: 302, headers: noStore() });
  } catch (err) {
    console.error(`${UPDATES_LOG_PREFIX} failed serving ${file}`, err);
    return new NextResponse("Upstream error", { status: 502, headers: noStore() });
  }
}

// --- Internal QA update feed (#30) ------------------------------------------

// Same shape as handleUpdateFile, but served from the newest pre-release with a
// qa.yml and gated to internal (channel:qa) licenses only. A non-entitled license
// gets 403 { error: "qa-channel-not-entitled" } (never 404), so a customer key
// can never reach a candidate and a misconfiguration stays visible.
export async function handleQaUpdateFile(
  request: Request,
  file: string,
): Promise<Response> {
  const dryRun = process.env.DRY_RUN === "true";

  const qa = await checkQaEntitlement(licenseKeyFromRequest(request), dryRun);
  if (!qa.ok) {
    return NextResponse.json({ error: qa.error }, { status: qa.status, headers: noStore() });
  }

  try {
    if (file.endsWith(".yml")) {
      const text = await getFeedText(file, dryRun, "qa");
      if (text === null) {
        return new NextResponse("Not found", { status: 404, headers: noStore() });
      }
      return new NextResponse(text, {
        status: 200,
        headers: { ...noStore(), "Content-Type": "text/yaml; charset=utf-8" },
      });
    }

    const url = await getAssetRedirectUrl(file, dryRun, "qa");
    if (!url) {
      return new NextResponse("Not found", { status: 404, headers: noStore() });
    }
    return NextResponse.redirect(url, { status: 302, headers: noStore() });
  } catch (err) {
    console.error(`${UPDATES_LOG_PREFIX} failed serving qa ${file}`, err);
    return new NextResponse("Upstream error", { status: 502, headers: noStore() });
  }
}

// --- License-brokered npm registry (@meintest/*) ----------------------------

// @meintest/<pkg>/-/<file> — GitHub Packages names the tarball with a bare SHA
// (no .tgz extension), so match anything after `/-/`.
const TARBALL_RE = /^@meintest\/([^/]+)\/-\/(.+)$/;
// @meintest/<pkg>
const PACKUMENT_RE = /^@meintest\/([^/]+)$/;

/**
 * @param mountPrefix the route's mount path incl. trailing slash, e.g.
 *   "/api/tmgmt/npm/" or "/api/npm/". Used both to slice the package specifier
 *   out of the raw pathname and to build the packument's tarball URLs so they
 *   point back at the SAME mount the client is using.
 */
export async function handleNpm(
  request: Request,
  mountPrefix: string,
): Promise<Response> {
  const dryRun = process.env.DRY_RUN === "true";

  // The @meintest/cc-testframework package is served to both a standalone
  // framework license and a cc-tmgmt license (which depends on the framework).
  // Same product set drives /license/status "entitled" and feedback (Issues #8/#10).
  const entitlement = await checkEntitlementCached(
    licenseKeyFromRequest(request),
    dryRun,
    ENTITLED_PRODUCTS,
  );
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
  const at = pathname.indexOf(mountPrefix);
  const spec = safeDecode(at >= 0 ? pathname.slice(at + mountPrefix.length) : "");

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
      // Point the packument's tarball URLs back at the same mount the client
      // called (trailing slash trimmed).
      const proxyBase = `${originFromRequest(request)}${mountPrefix.replace(/\/$/, "")}`;
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
