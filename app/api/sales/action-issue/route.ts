import { NextResponse } from "next/server";
import { verifyActionToken } from "../lib/action-token";
import { issueToken } from "../lib/issue";
import { sendOnboardInvite } from "../../signup/lib/resend";

const LOG_PREFIX = "[sales][action-issue]";

interface ActionIssuePayload {
  actionToken?: unknown;
  expiresInDays?: unknown;
}

const DEFAULT_EXPIRES_IN_DAYS = 7;
const MAX_EXPIRES_IN_DAYS = 30;

export async function POST(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  let payload: ActionIssuePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const actionToken =
    typeof payload.actionToken === "string" ? payload.actionToken : "";
  if (!actionToken) {
    return NextResponse.json(
      { ok: false, message: "Missing action token" },
      { status: 400 },
    );
  }

  const verified = verifyActionToken(actionToken);
  if (!verified.ok) {
    const message =
      verified.reason === "expired"
        ? "Action link expired"
        : "Invalid action link";
    return NextResponse.json(
      { ok: false, message },
      { status: 401 },
    );
  }

  let expiresInDays = DEFAULT_EXPIRES_IN_DAYS;
  if (
    payload.expiresInDays !== undefined &&
    payload.expiresInDays !== null &&
    payload.expiresInDays !== ""
  ) {
    const raw = payload.expiresInDays;
    const parsed = typeof raw === "string" ? Number(raw) : (raw as number);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_EXPIRES_IN_DAYS) {
      return NextResponse.json(
        {
          ok: false,
          message: `expiresInDays must be between 1 and ${MAX_EXPIRES_IN_DAYS}`,
        },
        { status: 400 },
      );
    }
    expiresInDays = Math.floor(parsed);
  }

  const input = {
    name: verified.payload.name,
    email: verified.payload.email,
    company: verified.payload.company,
    expiresInDays,
  };
  const origin = originFromRequest(request);

  let result;
  try {
    result = await issueToken(input, origin, dryRun);
  } catch (err) {
    console.error(`${LOG_PREFIX} issue failed`, err);
    return NextResponse.json(
      { ok: false, message: "Could not issue token" },
      { status: 500 },
    );
  }

  try {
    await sendOnboardInvite(
      {
        customerName: input.name,
        toEmail: input.email,
        onboardUrl: result.onboardUrl,
        expiresAt: result.expiresAt,
      },
      dryRun,
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} onboard invite mail failed`, err);
    return NextResponse.json(
      {
        ok: true,
        emailDelivered: false,
        ...result,
        message:
          "Token issued, but the onboard email failed. Send the onboard URL manually.",
      },
      { status: 207 },
    );
  }

  console.log(`${LOG_PREFIX} issued + emailed`, {
    email: input.email,
    expiresAt: result.expiresAt,
    dryRun,
  });

  return NextResponse.json({
    ok: true,
    emailDelivered: true,
    ...result,
  });
}

function originFromRequest(request: Request): string {
  const explicit = process.env.LANDING_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
