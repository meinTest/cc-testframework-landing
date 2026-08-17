import { NextResponse } from "next/server";
import { licenseStatus, licenseKeyFromRequest } from "../../lib/entitlement";

// Single source of truth for the TMT client (Issue #8): one call returns BOTH
//   valid    — keygen validity (the check the client used to make against keygen)
//   entitled — the npm broker's entitlement (guarantees `npm install` will pass)
// so the UI status and the installability can never disagree. Auth is the same
// Bearer <license-key> as the npm broker; keygen stays behind the proxy, so the
// client needs no keygen URL or second secret.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  const result = await licenseStatus(licenseKeyFromRequest(request), dryRun);

  if (result.kind === "missing") {
    return json(401, { valid: false, entitled: false, code: "MISSING_KEY", meta: emptyMeta() });
  }
  if (result.kind === "unavailable") {
    // Transient upstream (keygen) failure — never a definitive "invalid".
    return json(502, { valid: false, entitled: false, code: "UNAVAILABLE", meta: emptyMeta() });
  }

  return json(200, {
    valid: result.valid,
    entitled: result.entitled,
    code: result.code,
    meta: result.meta,
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
