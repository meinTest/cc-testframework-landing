import { NextResponse } from "next/server";
import { checkEntitlement, licenseKeyFromRequest } from "../tmgmt/lib/entitlement";
import {
  createIssue,
  listCustomerIssues,
  type CreateIssueInput,
  type FeedbackContext,
  type FeedbackSource,
  type FeedbackType,
} from "./lib/issues";

// In-app feedback proxy for cc-tmgmt: turns license-authenticated feature/bug
// reports into GitHub issues and reads back only the customer's own status.
// The GitHub token stays server-side; company/licenseId are derived from the
// validated license, never from the client.

const LOG_PREFIX = "[feedback]";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  const entitlement = await checkEntitlement(licenseKeyFromRequest(request), dryRun);
  if (!entitlement.ok) {
    return NextResponse.json(
      { ok: false, message: entitlement.reason },
      { status: entitlement.status },
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

  const input: CreateIssueInput = {
    ...validation.value,
    company: entitlement.company,
    licenseId: entitlement.licenseId,
  };

  try {
    const created = await createIssue(input, dryRun);
    return NextResponse.json({
      ok: true,
      issueNumber: created.issueNumber,
      issueId: created.issueId,
      status: "received",
      createdAt: created.createdAt,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} create issue failed`, err);
    return NextResponse.json(
      { ok: false, message: "Could not file your feedback. Please try again later." },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  const entitlement = await checkEntitlement(licenseKeyFromRequest(request), dryRun);
  if (!entitlement.ok) {
    return NextResponse.json(
      { ok: false, message: entitlement.reason },
      { status: entitlement.status },
    );
  }

  try {
    const reports = await listCustomerIssues(entitlement.licenseId, dryRun);
    return NextResponse.json({ ok: true, reports });
  } catch (err) {
    console.error(`${LOG_PREFIX} list issues failed`, err);
    return NextResponse.json(
      { ok: false, message: "Could not load your feedback right now." },
      { status: 502 },
    );
  }
}

interface ValidatedFeedback {
  type: FeedbackType;
  title: string;
  description: string;
  repro?: string;
  source: FeedbackSource;
  context: FeedbackContext;
}

function validate(
  payload: unknown,
): { value: ValidatedFeedback } | { error: string } {
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
  const source: FeedbackSource = str(p.source) === "copilot" ? "copilot" : "user";

  const c = (typeof p.context === "object" && p.context !== null ? p.context : {}) as Record<
    string,
    unknown
  >;
  const lastErrorRaw = c.lastError;
  const context: FeedbackContext = {
    version: str(c.version) || undefined,
    platform: str(c.platform) || undefined,
    osVersion: str(c.osVersion) || undefined,
    view: str(c.view) || undefined,
    lastError:
      lastErrorRaw === null || lastErrorRaw === undefined
        ? null
        : cap(str(lastErrorRaw), 2000) || null,
  };

  return {
    value: {
      type,
      title: cap(title, 200),
      description: cap(description, 10000),
      repro: repro ? cap(repro, 10000) : undefined,
      source,
      context,
    },
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cap(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
