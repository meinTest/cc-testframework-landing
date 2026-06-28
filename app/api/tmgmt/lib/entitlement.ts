import type { ProductId } from "../../../products";

// Entitlement check for the cc-tmgmt update/download proxy. The Electron app
// sends its Keygen license key as a Bearer token; we validate it against Keygen
// and confirm the license is for this product before serving any release asset.

const LOG_PREFIX = "[tmgmt][entitlement]";
const PRODUCT: ProductId = "cc-tmgmt";

export type EntitlementResult =
  | { ok: true; licenseId: string }
  | { ok: false; status: number; reason: string };

/**
 * Validate a Keygen license key for cc-tmgmt access.
 *
 * Uses Keygen's public `validate-key` action (no admin token needed — the key
 * itself is the credential). The license must validate as ACTIVE/valid and its
 * metadata.product must be "cc-tmgmt".
 *
 * In DRY_RUN any non-empty key is accepted (so the proxy can be smoke-tested
 * without hitting Keygen), but a missing key is still rejected.
 */
export async function checkEntitlement(
  licenseKey: string,
  dryRun: boolean,
): Promise<EntitlementResult> {
  if (!licenseKey) {
    return { ok: false, status: 401, reason: "Missing license key" };
  }

  if (dryRun) {
    console.log(`${LOG_PREFIX} DRY_RUN — accepting key ${mask(licenseKey)} as ${PRODUCT}`);
    return { ok: true, licenseId: "dry-run-license-id" };
  }

  const accountId = required("KEYGEN_ACCOUNT_ID");

  let body: KeygenValidation;
  try {
    const response = await fetch(
      `https://api.keygen.sh/v1/accounts/${accountId}/licenses/actions/validate-key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.api+json",
          Accept: "application/vnd.api+json",
        },
        body: JSON.stringify({ meta: { key: licenseKey } }),
      },
    );
    if (!response.ok && response.status !== 200) {
      console.error(`${LOG_PREFIX} Keygen validate-key HTTP ${response.status}`);
      return { ok: false, status: 502, reason: "License validation unavailable" };
    }
    body = (await response.json()) as KeygenValidation;
  } catch (err) {
    console.error(`${LOG_PREFIX} Keygen validate-key request failed`, err);
    return { ok: false, status: 502, reason: "License validation unavailable" };
  }

  const valid = body?.meta?.valid === true;
  if (!valid) {
    return { ok: false, status: 403, reason: body?.meta?.code ?? "License not valid" };
  }

  const product = body?.data?.attributes?.metadata?.product;
  if (product !== PRODUCT) {
    return { ok: false, status: 403, reason: "License is not entitled for cc-tmgmt" };
  }

  const licenseId = body?.data?.id ?? "";
  console.log(`${LOG_PREFIX} entitled license ${licenseId} (key ${mask(licenseKey)})`);
  return { ok: true, licenseId };
}

/** Extract the Bearer token from an Authorization header, or "" if absent. */
export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

interface KeygenValidation {
  meta?: { valid?: boolean; code?: string; detail?: string };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      metadata?: Record<string, unknown>;
    };
  };
}

function mask(key: string): string {
  return key.length <= 8 ? "********" : `${key.slice(0, 8)}…`;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
