import { NextResponse } from "next/server";
import { checkEntitlement, licenseKeyFromRequest } from "../../lib/entitlement";
import { getFeedText, getAssetRedirectUrl } from "../../lib/releases";

// cc-tmgmt update/download proxy (Option A — keyGen-Proxy).
//
// electron-updater (generic provider) points its base URL here and sends the
// Keygen license key as `Authorization: Bearer <key>`. This OS-agnostic
// catch-all serves whatever file the updater asks for:
//   - *.yml feed files  -> proxied text from the latest GitHub release
//   - any other name     -> 302 redirect to a short-lived GitHub asset URL
// A file that is not in the release returns 404.

const LOG_PREFIX = "[tmgmt][proxy]";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const dryRun = process.env.DRY_RUN === "true";
  const { file } = await params;

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
    console.error(`${LOG_PREFIX} failed serving ${file}`, err);
    return new NextResponse("Upstream error", { status: 502, headers: noStore() });
  }
}

function noStore(): Record<string, string> {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
}
