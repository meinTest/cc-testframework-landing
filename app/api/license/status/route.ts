import { NextResponse } from "next/server";
import { licenseStatus, licenseKeyFromRequest } from "../../tmgmt/lib/entitlement";

// Neutral alias of /api/tmgmt/license/status (both products use it). Returns the
// combined keygen validity + npm-broker entitlement verdict, plus a
// `billing.manageable` flag telling the client whether to offer the
// "manage/cancel subscription" button (#13). The tmgmt path stays as back-compat.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  const result = await licenseStatus(licenseKeyFromRequest(request), dryRun);

  if (result.kind === "missing") {
    return json(401, {
      valid: false,
      entitled: false,
      code: "MISSING_KEY",
      meta: emptyMeta(),
      billing: { manageable: false, upgradeable: false },
    });
  }
  if (result.kind === "unavailable") {
    return json(502, {
      valid: false,
      entitled: false,
      code: "UNAVAILABLE",
      meta: emptyMeta(),
      billing: { manageable: false, upgradeable: false },
    });
  }

  return json(200, {
    valid: result.valid,
    entitled: result.entitled,
    code: result.code,
    // Support-facing customer number (#33) — lets the license page backfill it
    // for installs activated before this change. Never the Stripe id.
    customerId: result.customerId,
    meta: result.meta,
    billing: result.billing,
  });
}

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function emptyMeta() {
  return { product: null, company: null, customerName: null, expiry: null };
}
