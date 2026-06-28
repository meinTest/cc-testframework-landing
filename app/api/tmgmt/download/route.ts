import { NextResponse } from "next/server";
import { checkEntitlement, licenseKeyFromRequest } from "../lib/entitlement";
import { resolveOsAssetName, getAssetRedirectUrl, type TargetOs } from "../lib/releases";

// Human-facing first-download entry point, linked from the cc-tmgmt welcome
// mail: GET /api/tmgmt/download?os=win&key=<license-key>. License-gated like
// the updater proxy, but resolves the current installable for the requested OS
// at click time (so the mailed link never goes stale) and 302s to the signed
// GitHub asset URL.

const LOG_PREFIX = "[tmgmt][download]";
const TARGET_OSES: TargetOs[] = ["win", "mac", "linux"];

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";
  const os = new URL(request.url).searchParams.get("os");

  if (!os || !TARGET_OSES.includes(os as TargetOs)) {
    return new NextResponse("Query param 'os' must be one of: win, mac, linux", {
      status: 400,
      headers: noStore(),
    });
  }

  const entitlement = await checkEntitlement(licenseKeyFromRequest(request), dryRun);
  if (!entitlement.ok) {
    return new NextResponse(entitlement.reason, {
      status: entitlement.status,
      headers: noStore(),
    });
  }

  try {
    const assetName = await resolveOsAssetName(os as TargetOs, dryRun);
    if (!assetName) {
      return new NextResponse("No download available for this platform", {
        status: 404,
        headers: noStore(),
      });
    }
    const url = await getAssetRedirectUrl(assetName, dryRun);
    if (!url) {
      return new NextResponse("Not found", { status: 404, headers: noStore() });
    }
    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error(`${LOG_PREFIX} failed resolving ${os} download`, err);
    return new NextResponse("Upstream error", { status: 502, headers: noStore() });
  }
}

function noStore(): Record<string, string> {
  return { "Cache-Control": "no-store" };
}
