import { NextResponse } from "next/server";
import { performSignup, validateSignupInput } from "./lib/perform";

// On-site signup endpoint (the /signup page form posts here, same-origin). The
// signup core is shared with the public CMS endpoint (/api/public/v1/signup);
// this route adds the SIGNUP_ENABLED gate and returns the plain { ok, message }.

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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const validation = validateSignupInput(payload as Record<string, unknown>);
  if ("error" in validation) {
    return NextResponse.json(
      { ok: false, message: validation.error },
      { status: 400 },
    );
  }

  const outcome = await performSignup(validation.value, {
    origin: originFromRequest(request),
    dryRun,
  });
  return NextResponse.json(outcome.body, { status: outcome.status });
}

function originFromRequest(request: Request): string {
  const explicit = process.env.LANDING_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
