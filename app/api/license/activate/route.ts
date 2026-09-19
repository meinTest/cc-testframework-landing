import { NextResponse } from "next/server";
import { licenseKeyFromRequest } from "../../tmgmt/lib/entitlement";
import { activateDevice } from "../../tmgmt/lib/machines";

// Device/seat activation (#29). The app sends its license key as
// `Authorization: Bearer <key>` plus a stable, PII-free device fingerprint
// (header `X-Device-Fingerprint` or JSON body `{ fingerprint }`). We bind the
// device to the license via Keygen machine activation and enforce the per-license
// machine limit + product-wide fingerprint uniqueness (a device that already ran
// a trial of this product can't activate a second one). Bearer-scoped: only the
// authenticated license is touched.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";
  const licenseKey = licenseKeyFromRequest(request);

  const fingerprint = await fingerprintFromRequest(request);
  if (!fingerprint) {
    return json(400, { ok: false, reason: "missing-fingerprint", message: "Missing device fingerprint" });
  }

  const result = await activateDevice(licenseKey, fingerprint, dryRun);
  if (result.ok) {
    return json(200, {
      ok: true,
      status: result.status,
      machineId: result.machineId,
      limit: result.limit,
      used: result.used,
    });
  }
  return json(result.status, {
    ok: false,
    reason: result.reason,
    message: result.message,
    ...(result.limit != null ? { limit: result.limit } : {}),
    ...(result.used != null ? { used: result.used } : {}),
  });
}

async function fingerprintFromRequest(request: Request): Promise<string> {
  const header = request.headers.get("x-device-fingerprint");
  if (header && header.trim()) return header.trim();
  try {
    const body = (await request.json()) as { fingerprint?: unknown };
    return typeof body?.fingerprint === "string" ? body.fingerprint.trim() : "";
  } catch {
    return "";
  }
}

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}
