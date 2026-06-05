export interface KeygenLicense {
  id: string;
  key: string;
  expiry: string | null;
}

interface CreateLicenseInput {
  email: string;
  name: string;
  company: string;
  githubUsername: string;
}

const LOG_PREFIX = "[signup][keygen]";

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

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
