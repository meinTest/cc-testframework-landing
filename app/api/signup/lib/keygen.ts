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
}

const LOG_PREFIX = "[signup][keygen]";
const CRON_LOG_PREFIX = "[cron][keygen]";

export async function createTrialLicense(
  input: CreateLicenseInput,
  dryRun: boolean,
): Promise<KeygenLicense> {
  const accountId = required("KEYGEN_ACCOUNT_ID");
  const adminToken = required("KEYGEN_ADMIN_TOKEN");
  const policyId = required("KEYGEN_TRIAL_POLICY_ID");

  if (dryRun) {
    console.log(
      `${LOG_PREFIX} DRY_RUN — would create license with policy=${policyId}, owner=${input.email}`,
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
      metadata: { salesToken: token, dryRun: true },
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

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
