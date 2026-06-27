import { NextResponse } from "next/server";
import { notifyDemoRequest } from "../signup/lib/resend";
import { signActionToken } from "../sales/lib/action-token";
import { resolveProduct, type ProductId } from "../../products";

const LOG_PREFIX = "[demo-request]";

interface DemoRequestPayload {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  useCase?: unknown;
  product?: unknown;
}

interface ValidatedDemoRequest {
  name: string;
  email: string;
  company: string;
  useCase: string;
  product: ProductId;
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
    product: input.product,
    dryRun,
    at: new Date().toISOString(),
  });

  const origin = originFromRequest(request);
  let salesActionUrl: string;
  try {
    const actionToken = signActionToken({
      name: input.name,
      email: input.email,
      company: input.company,
      useCase: input.useCase,
      product: input.product,
    });
    salesActionUrl = `${origin}/sales/action?t=${actionToken}`;
  } catch (err) {
    console.error(`${LOG_PREFIX} action-token signing failed`, err);
    return NextResponse.json(
      {
        ok: false,
        message:
          "Could not submit your request. Please reach out to support@itsbusiness.ch.",
      },
      { status: 500 },
    );
  }

  try {
    await notifyDemoRequest(
      {
        customerName: input.name,
        customerEmail: input.email,
        company: input.company,
        useCase: input.useCase,
        salesActionUrl,
        product: input.product,
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
  const product = resolveProduct(payload.product);

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

  return { value: { name, email, company, useCase, product } };
}

function stringField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function originFromRequest(request: Request): string {
  const explicit = process.env.LANDING_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
