import { NextResponse } from "next/server";
import { licenseKeyFromRequest } from "../../../../tmgmt/lib/entitlement";
import { pingHeartbeat } from "../../../../tmgmt/lib/machines";

// Heartbeat for the framework floating lease (#47). A test run acquires a lease
// via POST /api/license/activate, then pings here (~heartbeatDuration/2) so Keygen
// keeps the machine (lease) alive; a crashed run stops pinging and Keygen culls
// the dead machine, freeing the concurrency seat. See docs/license-concurrency.md.
//
// Bearer-scoped (Authorization: Bearer <licenseKey>) + ownership-checked: the
// machine must belong to THIS license, else 403. A culled/gone lease returns 404
// ALWAYS WITH a JSON body { ok:false, reason:"not-found" }, so the runtime can
// tell it apart from a missing-route (endpoint-not-deployed) 404 and not loop
// re-activating. DRY_RUN=true mirrors activate/DELETE (magic machine ids).

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ machineId: string }> };

export async function POST(request: Request, { params }: Params) {
  const dryRun = process.env.DRY_RUN === "true";
  const { machineId } = await params;

  const result = await pingHeartbeat(licenseKeyFromRequest(request), machineId, dryRun);
  if (result.ok) {
    return json(200, {
      ok: true,
      // Let the runtime derive its ping interval instead of hard-coding it.
      ...(result.heartbeatDuration != null ? { heartbeatDuration: result.heartbeatDuration } : {}),
    });
  }
  return json(result.status, { ok: false, reason: result.reason, message: result.message });
}

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}
