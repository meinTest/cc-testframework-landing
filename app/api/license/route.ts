import { NextResponse } from "next/server";
import { describeLicense, licenseKeyFromRequest } from "../tmgmt/lib/entitlement";

// Neutral alias of /api/tmgmt/license (both products use it). Returns the master
// data of the Bearer-authenticated license — expiry + licensee + company — for
// the app's first-run onboarding + Settings → License. Bearer-scoped: only the
// authenticated license's own data is ever returned (no other license, no
// secrets), the same scoping rule as /api/license/status and the feedback proxy.
// The /api/tmgmt/license path stays as back-compat until the shipped clients
// switch over (landing #26, TMT #139).

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
      // Support-facing customer number (#33) — never the Stripe id.
      customerId: license.customerId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
