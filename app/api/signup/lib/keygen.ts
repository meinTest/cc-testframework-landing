import type { ProductId } from "../../../products";

export interface KeygenLicense {
  id: string;
  key: string;
  expiry: string | null;
}

export interface KeygenLicenseFull extends KeygenLicense {
  metadata: Record<string, unknown>;
  status: string;
}

interface CreateLicenseInput {
  email: string;
  name: string;
  company: string;
  githubUsername: string;
  product: ProductId;
}

const LOG_PREFIX = "[signup][keygen]";
const CRON_LOG_PREFIX = "[cron][keygen]";

export async function createTrialLicense(
  input: CreateLicenseInput,
  dryRun: boolean,
): Promise<KeygenLicense> {
  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");
  const policyId = trialPolicyId(input.product);

  if (dryRun) {
    console.log(
      `${LOG_PREFIX} DRY_RUN — would create ${input.product} license with policy=${policyId}, owner=${input.email}`,
    );
    return {
      id: "dry-run-license-id",
      key: "DRY-RUN-XXXXX-XXXXX-XXXXX",
      expiry: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  const response = await fetch(
    `https://api.keygen.sh/v1/accounts/${accountId}/licenses`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "licenses",
          attributes: {
            name: `Trial — ${input.company} (${input.email})`,
            metadata: {
              product: input.product,
              email: input.email,
              customerName: input.name,
              company: input.company,
              githubUsername: input.githubUsername,
              signupAt: new Date().toISOString(),
            },
          },
          relationships: {
            policy: {
              data: { type: "policies", id: policyId },
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Keygen createLicense failed: ${response.status} ${response.statusText} — ${text}`,
    );
  }

  const body = await response.json();
  const license = body?.data;
  if (!license?.id || !license?.attributes?.key) {
    throw new Error("Keygen createLicense returned unexpected payload shape");
  }

  console.log(`${LOG_PREFIX} created license ${license.id}`);
  return {
    id: license.id,
    key: license.attributes.key,
    expiry: license.attributes.expiry ?? null,
  };
}

export interface PendingLicenseInput {
  email: string;
  name: string;
  company: string;
  expiresInDays: number;
  product: ProductId;
}

export interface PendingLicense {
  id: string;
  salesToken: string;
  tokenExpiresAt: string;
}

export interface ResolvedPendingLicense {
  id: string;
  tokenExpiresAt: string;
  metadata: Record<string, unknown>;
}

export async function createPendingLicense(
  input: PendingLicenseInput,
  dryRun: boolean,
): Promise<PendingLicense> {
  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");
  const policyId = required("KEYGEN_PENDING_POLICY_ID");

  const salesToken = crypto.randomUUID();
  const tokenExpiresAt = new Date(
    Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  if (dryRun) {
    console.log(
      `${LOG_PREFIX} DRY_RUN — would create pending license for ${input.email} (token=${salesToken.slice(0, 8)}…, expires=${tokenExpiresAt})`,
    );
    return { id: "dry-run-pending-id", salesToken, tokenExpiresAt };
  }

  const response = await fetch(
    `https://api.keygen.sh/v1/accounts/${accountId}/licenses`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "licenses",
          attributes: {
            name: `Pending — ${input.company} (${input.email})`,
            metadata: {
              product: input.product,
              salesToken,
              tokenExpiresAt,
              email: input.email,
              customerName: input.name,
              company: input.company,
              issuedAt: new Date().toISOString(),
            },
          },
          relationships: {
            policy: {
              data: { type: "policies", id: policyId },
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Keygen createPendingLicense failed: ${response.status} ${response.statusText} — ${text}`,
    );
  }

  const body = await response.json();
  const license = body?.data;
  if (!license?.id) {
    throw new Error(
      "Keygen createPendingLicense returned unexpected payload shape",
    );
  }

  console.log(
    `${LOG_PREFIX} created pending license ${license.id} (token=${salesToken.slice(0, 8)}…)`,
  );
  return { id: license.id, salesToken, tokenExpiresAt };
}

export async function findPendingLicenseByToken(
  token: string,
  dryRun: boolean,
): Promise<ResolvedPendingLicense | null> {
  if (dryRun) {
    console.log(
      `${LOG_PREFIX} DRY_RUN — would look up pending license by token=${token.slice(0, 8)}…`,
    );
    return {
      id: "dry-run-pending-id",
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      // DRY_RUN_PRODUCT lets smoke tests simulate either product (real lookups
      // read product from the pending license metadata). Absent → framework.
      // Sample customer details exercise the signup prefill path.
      metadata: {
        salesToken: token,
        dryRun: true,
        product: process.env.DRY_RUN_PRODUCT,
        customerName: "Dry Run Tester",
        email: "dry-run@example.com",
        company: "DryRun Co",
      },
    };
  }

  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");
  const policyId = required("KEYGEN_PENDING_POLICY_ID");

  let page = 1;
  const pageSize = 100;

  while (true) {
    const response = await fetch(
      `https://api.keygen.sh/v1/accounts/${accountId}/licenses?page[number]=${page}&page[size]=${pageSize}&policy=${policyId}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Accept: "application/vnd.api+json",
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Keygen findPendingLicenseByToken failed: ${response.status} ${response.statusText} — ${text}`,
      );
    }

    const body = await response.json();
    const data: unknown[] = Array.isArray(body?.data) ? body.data : [];
    for (const entry of data) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as {
        id?: string;
        attributes?: { metadata?: Record<string, unknown> };
      };
      const metadata = item.attributes?.metadata ?? {};
      if (!item.id) continue;
      if (metadata.salesToken !== token) continue;
      const tokenExpiresAt =
        typeof metadata.tokenExpiresAt === "string"
          ? metadata.tokenExpiresAt
          : "";
      return { id: item.id, tokenExpiresAt, metadata };
    }

    if (data.length < pageSize) return null;
    page += 1;
    if (page > 20) {
      console.warn(
        `${LOG_PREFIX} pending lookup pagination aborted at page ${page}`,
      );
      return null;
    }
  }
}

export async function deleteLicense(
  licenseId: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`${LOG_PREFIX} DRY_RUN — would delete license ${licenseId}`);
    return;
  }

  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");

  const response = await fetch(
    `https://api.keygen.sh/v1/accounts/${accountId}/licenses/${licenseId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Accept: "application/vnd.api+json",
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    console.error(
      `${LOG_PREFIX} rollback delete failed for ${licenseId}: ${response.status}`,
    );
    return;
  }
  console.log(`${LOG_PREFIX} rolled back license ${licenseId}`);
}

export async function listActiveLicenses(
  dryRun: boolean,
): Promise<KeygenLicenseFull[]> {
  if (dryRun) {
    console.log(`${CRON_LOG_PREFIX} DRY_RUN — would list active licenses`);
    return [];
  }

  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");

  const licenses: KeygenLicenseFull[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const response = await fetch(
      `https://api.keygen.sh/v1/accounts/${accountId}/licenses?page[number]=${page}&page[size]=${pageSize}&status=ACTIVE`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Accept: "application/vnd.api+json",
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Keygen listLicenses failed: ${response.status} ${response.statusText} — ${text}`,
      );
    }

    const body = await response.json();
    const data: unknown[] = Array.isArray(body?.data) ? body.data : [];
    for (const entry of data) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as {
        id?: string;
        attributes?: {
          key?: string;
          expiry?: string | null;
          status?: string;
          metadata?: Record<string, unknown>;
        };
      };
      if (!item.id || !item.attributes?.key) continue;
      licenses.push({
        id: item.id,
        key: item.attributes.key,
        expiry: item.attributes.expiry ?? null,
        metadata: item.attributes.metadata ?? {},
        status: item.attributes.status ?? "UNKNOWN",
      });
    }

    if (data.length < pageSize) break;
    page += 1;
    if (page > 50) {
      console.warn(`${CRON_LOG_PREFIX} aborting pagination at page ${page}`);
      break;
    }
  }

  console.log(`${CRON_LOG_PREFIX} fetched ${licenses.length} active licenses`);
  return licenses;
}

export async function markReminderSent(
  license: KeygenLicenseFull,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(
      `${CRON_LOG_PREFIX} DRY_RUN — would mark reminderSentAt on ${license.id}`,
    );
    return;
  }

  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");

  const mergedMetadata = {
    ...license.metadata,
    reminderSentAt: new Date().toISOString(),
  };

  const response = await fetch(
    `https://api.keygen.sh/v1/accounts/${accountId}/licenses/${license.id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "licenses",
          attributes: { metadata: mergedMetadata },
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Keygen markReminderSent failed: ${response.status} ${response.statusText} — ${text}`,
    );
  }

  console.log(`${CRON_LOG_PREFIX} marked reminderSentAt on ${license.id}`);
}

// ── Paid subscription licenses (one Keygen license/key per seat) ────────────

function paidPolicyId(product: ProductId): string {
  if (product === "cc-tmgmt") return required("KEYGEN_TMGMT_PAID_POLICY_ID");
  return required("KEYGEN_PAID_POLICY_ID");
}

export interface PaidLicenseInput {
  product: ProductId;
  company: string;
  email: string;
  subscriptionId: string;
  seatIndex: number;
  expiresAt: string; // ISO — mirrors the Stripe subscription's current_period_end
}

export interface SubscriptionLicense {
  id: string;
  key: string;
  seatIndex: number;
  status: string;
}

export async function createPaidLicense(
  input: PaidLicenseInput,
  dryRun: boolean,
): Promise<SubscriptionLicense> {
  if (dryRun) {
    console.log(
      `${LOG_PREFIX} DRY_RUN — would create paid ${input.product} license (seat ${input.seatIndex}) for ${input.subscriptionId}`,
    );
    return {
      id: `dry-${input.subscriptionId}-${input.seatIndex}`,
      key: `DRY-SEAT${input.seatIndex}-XXXXX`,
      seatIndex: input.seatIndex,
      status: "ACTIVE",
    };
  }

  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");
  const policyId = paidPolicyId(input.product);

  const response = await fetch(
    `https://api.keygen.sh/v1/accounts/${accountId}/licenses`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "licenses",
          attributes: {
            name: `${input.company || "Subscription"} — seat ${input.seatIndex + 1}`,
            expiry: input.expiresAt,
            metadata: {
              product: input.product,
              kind: "paid",
              company: input.company,
              email: input.email,
              subscriptionId: input.subscriptionId,
              seatIndex: input.seatIndex,
              issuedAt: new Date().toISOString(),
            },
          },
          relationships: { policy: { data: { type: "policies", id: policyId } } },
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Keygen createPaidLicense failed: ${response.status} — ${text}`);
  }
  const license = (await response.json())?.data;
  if (!license?.id || !license?.attributes?.key) {
    throw new Error("Keygen createPaidLicense returned unexpected payload shape");
  }
  return {
    id: license.id,
    key: license.attributes.key,
    seatIndex: input.seatIndex,
    status: license.attributes.status ?? "ACTIVE",
  };
}

/** All paid licenses belonging to a Stripe subscription (filtered by metadata). */
export async function listSubscriptionLicenses(
  subscriptionId: string,
  dryRun: boolean,
): Promise<SubscriptionLicense[]> {
  if (dryRun) return [];

  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");
  const out: SubscriptionLicense[] = [];
  let page = 1;
  const size = 100;

  while (true) {
    const response = await fetch(
      `https://api.keygen.sh/v1/accounts/${accountId}/licenses?page[number]=${page}&page[size]=${size}`,
      { headers: { Authorization: `Bearer ${adminToken}`, Accept: "application/vnd.api+json" } },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Keygen listSubscriptionLicenses failed: ${response.status} — ${text}`);
    }
    const body = await response.json();
    const data: unknown[] = Array.isArray(body?.data) ? body.data : [];
    for (const entry of data) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as {
        id?: string;
        attributes?: { key?: string; status?: string; metadata?: Record<string, unknown> };
      };
      const md = item.attributes?.metadata ?? {};
      if (md.subscriptionId !== subscriptionId) continue;
      if (!item.id || !item.attributes?.key) continue;
      out.push({
        id: item.id,
        key: item.attributes.key,
        seatIndex: Number(md.seatIndex) || 0,
        status: item.attributes.status ?? "UNKNOWN",
      });
    }
    if (data.length < size) break;
    page += 1;
    if (page > 50) break;
  }
  return out;
}

export async function updateLicenseExpiry(
  licenseId: string,
  expiresAt: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`${LOG_PREFIX} DRY_RUN — would set expiry ${expiresAt} on ${licenseId}`);
    return;
  }
  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");
  const response = await fetch(
    `https://api.keygen.sh/v1/accounts/${accountId}/licenses/${licenseId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify({ data: { type: "licenses", attributes: { expiry: expiresAt } } }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Keygen updateLicenseExpiry failed: ${response.status} — ${text}`);
  }
}

async function licenseAction(
  action: "suspend" | "reinstate",
  licenseId: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`${LOG_PREFIX} DRY_RUN — would ${action} ${licenseId}`);
    return;
  }
  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");
  const response = await fetch(
    `https://api.keygen.sh/v1/accounts/${accountId}/licenses/${licenseId}/actions/${action}`,
    { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, Accept: "application/vnd.api+json" } },
  );
  // 422 = already in that state → treat as success (idempotent).
  if (!response.ok && response.status !== 422) {
    const text = await response.text();
    throw new Error(`Keygen ${action} failed: ${response.status} — ${text}`);
  }
}

export function suspendLicense(licenseId: string, dryRun: boolean): Promise<void> {
  return licenseAction("suspend", licenseId, dryRun);
}
export function reinstateLicense(licenseId: string, dryRun: boolean): Promise<void> {
  return licenseAction("reinstate", licenseId, dryRun);
}

// Trial policy per product: cc-tmgmt has its own; the framework keeps the
// original env var.
function trialPolicyId(product: ProductId): string {
  if (product === "cc-tmgmt") return required("KEYGEN_TMGMT_TRIAL_POLICY_ID");
  return required("KEYGEN_TRIAL_POLICY_ID");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
