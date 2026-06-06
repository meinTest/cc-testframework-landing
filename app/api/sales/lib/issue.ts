import { createPendingLicense } from "../../signup/lib/keygen";

export interface IssueInput {
  name: string;
  email: string;
  company: string;
  expiresInDays: number;
}

export interface IssueResult {
  token: string;
  onboardUrl: string;
  expiresAt: string;
}

export interface IssuePayload {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  expiresInDays?: unknown;
}

const DEFAULT_EXPIRES_IN_DAYS = 7;
const MAX_EXPIRES_IN_DAYS = 30;

export function validateIssuePayload(
  payload: IssuePayload,
): { value: IssueInput } | { error: string } {
  const name = stringField(payload.name);
  const email = stringField(payload.email);
  const company = stringField(payload.company);

  if (!name) return { error: "Missing field: name" };
  if (!email) return { error: "Missing field: email" };
  if (!company) return { error: "Missing field: company" };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Invalid email address" };
  }

  const raw = payload.expiresInDays;
  let expiresInDays = DEFAULT_EXPIRES_IN_DAYS;
  if (raw !== undefined && raw !== null && raw !== "") {
    const parsed = typeof raw === "string" ? Number(raw) : (raw as number);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_EXPIRES_IN_DAYS) {
      return {
        error: `expiresInDays must be a number between 1 and ${MAX_EXPIRES_IN_DAYS}`,
      };
    }
    expiresInDays = Math.floor(parsed);
  }

  return { value: { name, email, company, expiresInDays } };
}

export async function issueToken(
  input: IssueInput,
  origin: string,
  dryRun: boolean,
): Promise<IssueResult> {
  const pending = await createPendingLicense(input, dryRun);
  const onboardUrl = `${origin}/signup?token=${pending.salesToken}`;
  return {
    token: pending.salesToken,
    onboardUrl,
    expiresAt: pending.tokenExpiresAt,
  };
}

function stringField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}
