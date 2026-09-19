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

  const device = await deviceFromRequest(request);
  if (!device.fingerprint) {
    return json(400, { ok: false, reason: "missing-fingerprint", message: "Missing device fingerprint" });
  }

  const result = await activateDevice(licenseKey, device.fingerprint, dryRun, {
    name: device.name,
    platform: device.platform,
  });
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

// Device details: fingerprint (required) plus optional name (PC name) / platform.
// Each may come from a header (X-Device-Fingerprint / -Name / -Platform) or the
// JSON body; the header wins. The body is parsed once.
async function deviceFromRequest(
  request: Request,
): Promise<{ fingerprint: string; name?: string; platform?: string }> {
  let body: { fingerprint?: unknown; name?: unknown; platform?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* no/invalid body → headers only */
  }
  const pick = (headerName: string, bodyValue: unknown): string => {
    const h = request.headers.get(headerName);
    if (h && h.trim()) return h.trim();
    return typeof bodyValue === "string" ? bodyValue.trim() : "";
  };
  const fingerprint = pick("x-device-fingerprint", body.fingerprint);
  const name = pick("x-device-name", body.name);
  const platform = pick("x-device-platform", body.platform);
  return {
    fingerprint,
    ...(name ? { name } : {}),
    ...(platform ? { platform } : {}),
  };
}

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}
