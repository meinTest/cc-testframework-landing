import { NextResponse } from "next/server";
import { notifyDemoRequest } from "../signup/lib/resend";

const LOG_PREFIX = "[demo-request]";

interface DemoRequestPayload {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  useCase?: unknown;
}

interface ValidatedDemoRequest {
  name: string;
  email: string;
  company: string;
  useCase: string;
}

export async function POST(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  let payload: DemoRequestPayload;
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

  console.log(`${LOG_PREFIX} received`, {
    email: input.email,
    company: input.company,
    dryRun,
    at: new Date().toISOString(),
  });

  try {
    await notifyDemoRequest(
      {
        customerName: input.name,
        customerEmail: input.email,
        company: input.company,
        useCase: input.useCase,
      },
      dryRun,
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} sales notify failed`, err);
    return NextResponse.json(
      {
        ok: false,
        message:
          "Could not submit your request. Please reach out to support@itsbusiness.ch.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Request received. We will get back to you within one business day.",
  });
}

function validate(
  payload: DemoRequestPayload,
): { value: ValidatedDemoRequest } | { error: string } {
  const name = stringField(payload.name);
  const email = stringField(payload.email);
  const company = stringField(payload.company);
  const useCase = stringField(payload.useCase);

  if (!name) return { error: "Missing field: name" };
  if (!email) return { error: "Missing field: email" };
  if (!company) return { error: "Missing field: company" };
  if (!useCase) return { error: "Missing field: useCase" };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Invalid email address" };
  }
  if (useCase.length > 2000) {
    return { error: "Use case is too long (max 2000 characters)" };
  }

  return { value: { name, email, company, useCase } };
}

function stringField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}
