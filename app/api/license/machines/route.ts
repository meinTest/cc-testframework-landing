import { NextResponse } from "next/server";
import { licenseKeyFromRequest } from "../../tmgmt/lib/entitlement";
import { listDevices } from "../../tmgmt/lib/machines";

// The devices currently activated against the authenticated license (#29) — for
// an in-app / portal "your devices" view where a customer can free a seat.
// Bearer-scoped: only the caller's own license.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";
  const result = await listDevices(licenseKeyFromRequest(request), dryRun);

  if (result.ok) {
    return json(200, { ok: true, limit: result.limit, devices: result.devices });
  }
  return json(result.status, { ok: false, reason: result.reason, message: result.message });
}

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}
