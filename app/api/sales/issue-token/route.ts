import { NextResponse } from "next/server";
import { checkSalesBearer } from "../lib/auth";
import {
  issueToken,
  validateIssuePayload,
  type IssuePayload,
} from "../lib/issue";

const LOG_PREFIX = "[sales][issue-token]";

export async function POST(request: Request) {
  const authFail = checkSalesBearer(request);
  if (authFail) {
    return NextResponse.json(
      { ok: false, message: authFail.message },
      { status: authFail.status },
    );
  }

  const dryRun = process.env.DRY_RUN === "true";

  let payload: IssuePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const validation = validateIssuePayload(payload);
  if ("error" in validation) {
    return NextResponse.json(
      { ok: false, message: validation.error },
      { status: 400 },
    );
  }

  const origin = originFromRequest(request);

  try {
    const result = await issueToken(validation.value, origin, dryRun);
    console.log(`${LOG_PREFIX} issued`, {
      email: validation.value.email,
      expiresAt: result.expiresAt,
      dryRun,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`${LOG_PREFIX} keygen step failed`, err);
    return NextResponse.json(
      { ok: false, message: "Could not issue token" },
      { status: 500 },
    );
  }
}

function originFromRequest(request: Request): string {
  const explicit = process.env.LANDING_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
