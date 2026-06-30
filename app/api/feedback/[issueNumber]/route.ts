import { NextResponse } from "next/server";
import { checkEntitlement, licenseKeyFromRequest } from "../../tmgmt/lib/entitlement";
import {
  loadEditableIssue,
  updateIssue,
  withdrawIssue,
  type FeedbackType,
} from "../lib/issues";

// Edit / withdraw a customer's own feedback report — allowed ONLY while the
// report is still in the `received` state. Ownership and state are enforced
// server-side (loadEditableIssue); client-side visibility is not security.

const LOG_PREFIX = "[feedback]";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ issueNumber: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const dryRun = process.env.DRY_RUN === "true";

  const entitlement = await checkEntitlement(licenseKeyFromRequest(request), dryRun);
  if (!entitlement.ok) {
    return NextResponse.json(
      { ok: false, message: entitlement.reason },
      { status: entitlement.status },
    );
  }

  const issueNumber = parseIssueNumber((await params).issueNumber);
  if (issueNumber === null) {
    return NextResponse.json(
      { ok: false, message: "Invalid issue number" },
      { status: 400 },
    );
  }

  let payload: unknown;
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

  const guard = await loadEditableIssue(entitlement.licenseId, issueNumber, dryRun);
  if (!guard.ok) {
    return NextResponse.json(
      { ok: false, message: guard.reason },
      { status: guard.status },
    );
  }

  try {
    const result = await updateIssue(
      guard.issue,
      { ...validation.value, company: entitlement.company },
      dryRun,
    );
    return NextResponse.json({
      ok: true,
      issueNumber,
      status: "received",
      updatedAt: result.updatedAt,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} update issue failed`, err);
    return NextResponse.json(
      { ok: false, message: "Could not update your report. Please try again later." },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const dryRun = process.env.DRY_RUN === "true";

  const entitlement = await checkEntitlement(licenseKeyFromRequest(request), dryRun);
  if (!entitlement.ok) {
    return NextResponse.json(
      { ok: false, message: entitlement.reason },
      { status: entitlement.status },
    );
  }

  const issueNumber = parseIssueNumber((await params).issueNumber);
  if (issueNumber === null) {
    return NextResponse.json(
      { ok: false, message: "Invalid issue number" },
      { status: 400 },
    );
  }

  const guard = await loadEditableIssue(entitlement.licenseId, issueNumber, dryRun);
  if (!guard.ok) {
    return NextResponse.json(
      { ok: false, message: guard.reason },
      { status: guard.status },
    );
  }

  try {
    await withdrawIssue(guard.issue, dryRun);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`${LOG_PREFIX} withdraw issue failed`, err);
    return NextResponse.json(
      { ok: false, message: "Could not withdraw your report. Please try again later." },
      { status: 502 },
    );
  }
}

interface ValidatedPatch {
  type: FeedbackType;
  title: string;
  description: string;
  repro?: string;
}

function validate(payload: unknown): { value: ValidatedPatch } | { error: string } {
  const p = (typeof payload === "object" && payload !== null ? payload : {}) as Record<
    string,
    unknown
  >;

  const type = str(p.type);
  if (type !== "bug" && type !== "feature") {
    return { error: "Field 'type' must be 'bug' or 'feature'" };
  }
  const title = str(p.title);
  if (!title) return { error: "Missing field: title" };
  const description = str(p.description);
  if (!description) return { error: "Missing field: description" };
  const repro = str(p.repro);

  return {
    value: {
      type,
      title: cap(title, 200),
      description: cap(description, 10000),
      repro: repro ? cap(repro, 10000) : undefined,
    },
  };
}

function parseIssueNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cap(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
