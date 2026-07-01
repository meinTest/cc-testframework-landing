import type { ProductId } from "../../../products";

// Entitlement check for the cc-tmgmt update/download proxy. The Electron app
// sends its Keygen license key as a Bearer token; we validate it against Keygen
// and confirm the license is for this product before serving any release asset.

const LOG_PREFIX = "[tmgmt][entitlement]";
const PRODUCT: ProductId = "cc-tmgmt";

export type EntitlementResult =
  | { ok: true; licenseId: string; company: string }
  | { ok: false; status: number; reason: string };

// Fuller license view for the license-status endpoint (needs expiry + licensee).
export type LicenseDescription =
  | {
      ok: true;
      licenseId: string;
      company: string;
      customerName: string;
      expiresAt: string | null;
    }
  | { ok: false; status: number; reason?: "invalid" | "expired"; message: string };

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
    return { ok: true, licenseId: "dry-run-license-id", company: "DryRun Co" };
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
  const company =
    typeof body?.data?.attributes?.metadata?.company === "string"
      ? body.data.attributes.metadata.company
      : "";
  console.log(`${LOG_PREFIX} entitled license ${licenseId} (key ${mask(licenseKey)})`);
  return { ok: true, licenseId, company };
}

/**
 * Validate a license and return status details for the license-status endpoint:
 * expiry + licensee/company (the customer's own data), classified into
 * invalid (401) / expired (403). Only the authenticated license's own data is
 * ever returned — no other license, no secrets.
 */
export async function describeLicense(
  licenseKey: string,
  dryRun: boolean,
): Promise<LicenseDescription> {
  if (!licenseKey) {
    return { ok: false, status: 401, reason: "invalid", message: "Missing license key" };
  }

  if (dryRun) {
    return {
      ok: true,
      licenseId: "dry-run-license-id",
      company: "DryRun Co",
      customerName: "Dry Run Tester",
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
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
      return { ok: false, status: 502, message: "License validation unavailable" };
    }
    body = (await response.json()) as KeygenValidation;
  } catch (err) {
    console.error(`${LOG_PREFIX} Keygen validate-key request failed`, err);
    return { ok: false, status: 502, message: "License validation unavailable" };
  }

  const valid = body?.meta?.valid === true;
  const code = body?.meta?.code;
  const metadata = body?.data?.attributes?.metadata ?? {};
  const product = metadata.product;

  if (valid && product === PRODUCT) {
    return {
      ok: true,
      licenseId: body?.data?.id ?? "",
      company: typeof metadata.company === "string" ? metadata.company : "",
      customerName:
        typeof metadata.customerName === "string" ? metadata.customerName : "",
      expiresAt:
        typeof body?.data?.attributes?.expiry === "string"
          ? body.data.attributes.expiry
          : null,
    };
  }

  if (code === "EXPIRED") {
    return { ok: false, status: 403, reason: "expired", message: "License expired" };
  }
  if (code === "SUSPENDED" || code === "BANNED") {
    return { ok: false, status: 403, reason: "invalid", message: "License suspended" };
  }
  if (valid && product !== PRODUCT) {
    return {
      ok: false,
      status: 403,
      reason: "invalid",
      message: "License is not valid for cc-tmgmt",
    };
  }
  // NOT_FOUND / missing / any other → treat as an unresolvable/invalid key.
  return { ok: false, status: 401, reason: "invalid", message: "Invalid license key" };
}

/**
 * Read the license key from a request. The Electron updater sends it as
 * `Authorization: Bearer <key>`; browser download links (from the welcome mail)
 * can't set headers, so a `?key=` query param is accepted as a fallback.
 */
export function licenseKeyFromRequest(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) return match[1].trim();
  try {
    return (new URL(request.url).searchParams.get("key") ?? "").trim();
  } catch {
    return "";
  }
}

interface KeygenValidation {
  meta?: { valid?: boolean; code?: string; detail?: string };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      expiry?: string | null;
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
