import { NextResponse } from "next/server";
import { licenseKeyFromRequest } from "../../../tmgmt/lib/entitlement";
import { deactivateDevice } from "../../../tmgmt/lib/machines";

// Free a device seat (#29): deactivate one machine so a reinstall / device change
// doesn't permanently consume a seat. Bearer-scoped and ownership-checked — the
// machine must belong to the authenticated license, otherwise 403/404. Works on
// an expired license too (so a customer can still move their seat).

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ machineId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const dryRun = process.env.DRY_RUN === "true";
  const { machineId } = await params;
  if (!machineId) {
    return json(400, { ok: false, message: "Missing machine id" });
  }

  const result = await deactivateDevice(licenseKeyFromRequest(request), machineId, dryRun);
  if (result.ok) return json(200, { ok: true });
  return json(result.status, { ok: false, reason: result.reason, message: result.message });
}

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}
