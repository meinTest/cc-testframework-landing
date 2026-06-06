import { NextResponse } from "next/server";
import {
  createTrialLicense,
  deleteLicense,
  findPendingLicenseByToken,
} from "./lib/keygen";
import { inviteCollaborator, getInvitationUrl } from "./lib/github";
import { sendWelcomeEmail, notifySupport } from "./lib/resend";

const LOG_PREFIX = "[signup]";

interface SignupPayload {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  githubUsername?: unknown;
  token?: unknown;
}

interface ValidatedInput {
  name: string;
  email: string;
  company: string;
  githubUsername: string;
  token: string;
}

export async function POST(request: Request) {
  if (process.env.SIGNUP_ENABLED !== "true") {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Signup is currently disabled. Please contact support@itsbusiness.ch.",
      },
      { status: 503 },
    );
  }

  const dryRun = process.env.DRY_RUN === "true";

  let payload: SignupPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const validation = validate(payload);
  if ("error" in validation) {
    return NextResponse.json(
      { ok: false, message: validation.error },
      { status: 400 },
    );
  }
  const input = validation.value;

  const vetted = process.env.SALES_VETTED_MODE === "true";
  let pendingLicenseId: string | null = null;
  if (vetted) {
    if (!input.token) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Token required. Please request a demo at /demo-request to receive a personalized signup link.",
        },
        { status: 401 },
      );
    }
    try {
      const pending = await findPendingLicenseByToken(input.token, dryRun);
      if (!pending) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Invalid or already used signup token. Please request a fresh demo at /demo-request.",
          },
          { status: 401 },
        );
      }
      if (
        pending.tokenExpiresAt &&
        Date.parse(pending.tokenExpiresAt) < Date.now()
      ) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Your signup link has expired. Please request a fresh demo at /demo-request.",
          },
          { status: 401 },
        );
      }
      pendingLicenseId = pending.id;
    } catch (err) {
      console.error(`${LOG_PREFIX} token lookup failed`, err);
      return NextResponse.json(
        {
          ok: false,
          message:
            "Could not validate your signup token. Please try again or contact support@itsbusiness.ch.",
        },
        { status: 500 },
      );
    }
  }

  console.log(`${LOG_PREFIX} received`, {
    email: input.email,
    githubUsername: input.githubUsername,
    company: input.company,
    vetted,
    tokenPrefix: input.token ? `${input.token.slice(0, 8)}…` : null,
    dryRun,
    at: new Date().toISOString(),
  });

  let license;
  try {
    license = await createTrialLicense(input, dryRun);
  } catch (err) {
    console.error(`${LOG_PREFIX} keygen step failed`, err);
    return NextResponse.json(
      {
        ok: false,
        message:
          "Could not provision your trial license. Please contact support@itsbusiness.ch.",
      },
      { status: 500 },
    );
  }

  try {
    await inviteCollaborator(input.githubUsername, dryRun);
  } catch (err) {
    console.error(`${LOG_PREFIX} github step failed — rolling back license`, err);
    await safeRollback(license.id, dryRun);
    return NextResponse.json(
      {
        ok: false,
        message:
          "Could not send your GitHub invite. Please verify the username and try again, or contact support@itsbusiness.ch.",
      },
      { status: 500 },
    );
  }

  const org = process.env.GH_ORG ?? "meinTest";
  const repo = process.env.GH_REPO ?? "cc-testframework";
  const quickstartUrl =
    process.env.QUICKSTART_URL ??
    "https://meintest.github.io/cc-testframework/en/quickstart/";

  try {
    await sendWelcomeEmail(
      {
        toEmail: input.email,
        customerName: input.name,
        licenseKey: license.key,
        licenseExpiry: license.expiry,
        invitationUrl: getInvitationUrl(org, repo),
        quickstartUrl,
      },
      dryRun,
    );
  } catch (err) {
    console.error(
      `${LOG_PREFIX} welcome email failed — license + invite are valid, customer needs manual outreach`,
      err,
    );
  }

  try {
    await notifySupport(
      {
        customerName: input.name,
        customerEmail: input.email,
        company: input.company,
        githubUsername: input.githubUsername,
        licenseId: license.id,
        licenseKey: license.key,
      },
      dryRun,
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} support notify failed (non-fatal)`, err);
  }

  if (pendingLicenseId) {
    try {
      await deleteLicense(pendingLicenseId, dryRun);
      console.log(
        `${LOG_PREFIX} consumed pending license ${pendingLicenseId}`,
      );
    } catch (err) {
      console.error(
        `${LOG_PREFIX} pending license consume failed (non-fatal)`,
        err,
      );
    }
  }

  console.log(`${LOG_PREFIX} completed`, {
    licenseId: license.id,
    vetted,
    dryRun,
  });

  return NextResponse.json({
    ok: true,
    message: dryRun
      ? "Dry-run completed. Check Vercel function logs for the simulated calls."
      : "Trial activated. Check your email for your license key and GitHub invitation.",
  });
}

function validate(
  payload: SignupPayload,
): { value: ValidatedInput } | { error: string } {
  const name = stringField(payload.name);
  const email = stringField(payload.email);
  const company = stringField(payload.company);
  const githubUsername = stringField(payload.githubUsername);
  const token = stringField(payload.token);

  if (!name) return { error: "Missing field: name" };
  if (!email) return { error: "Missing field: email" };
  if (!company) return { error: "Missing field: company" };
  if (!githubUsername) return { error: "Missing field: githubUsername" };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Invalid email address" };
  }
  if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i.test(githubUsername)) {
    return { error: "Invalid GitHub username" };
  }

  return { value: { name, email, company, githubUsername, token } };
}

function stringField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

async function safeRollback(licenseId: string, dryRun: boolean): Promise<void> {
  try {
    await deleteLicense(licenseId, dryRun);
  } catch (err) {
    console.error(`${LOG_PREFIX} rollback delete itself failed`, err);
  }
}
