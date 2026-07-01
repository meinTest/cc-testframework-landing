import { NextResponse } from "next/server";
import { describeLicense, licenseKeyFromRequest } from "../lib/entitlement";

// License status for the cc-tmgmt app (first-run onboarding + Settings → License).
// The update feed validates a key but has no expiry; this returns the license's
// own status + expiry + licensee. Bearer-scoped: only the authenticated
// license's own data is ever returned — no other license, no secrets.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  const license = await describeLicense(licenseKeyFromRequest(request), dryRun);
  if (!license.ok) {
    return NextResponse.json(
      {
        ok: false,
        ...(license.reason ? { reason: license.reason } : {}),
        message: license.message,
      },
      { status: license.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      expiresAt: license.expiresAt,
      licensee: license.customerName || null,
      company: license.company || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
