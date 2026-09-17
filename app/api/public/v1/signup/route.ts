import { performSignup, validateSignupInput } from "../../../signup/lib/perform";
import { appBaseUrl, publicJson, preflight } from "../../../lib/public-http";

// Public, CORS-enabled self-serve signup for the CMS. The marketing site hosts
// its own form (full name, business email, company) and POSTs it here; we run
// the open self-serve trial registration and return { ok, message }. No sales
// token is ever accepted on this path — a sales-vetted product returns 401
// (the CMS should then link to /demo-request instead; the products endpoint's
// cta.kind tells it which). Same-origin /api/signup still serves the /signup page.

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  if (process.env.SIGNUP_ENABLED !== "true") {
    return publicJson(
      request,
      { ok: false, message: "Signup is currently disabled. Please contact support@itsbusiness.ch." },
      { status: 503, cache: false },
    );
  }

  const dryRun = process.env.DRY_RUN === "true";

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return publicJson(request, { ok: false, message: "Invalid JSON payload" }, { status: 400, cache: false });
  }

  const validation = validateSignupInput(payload as Record<string, unknown>);
  if ("error" in validation) {
    return publicJson(request, { ok: false, message: validation.error }, { status: 400, cache: false });
  }

  // Force the open self-serve path — never honour a token from a public form.
  const outcome = await performSignup(
    { ...validation.value, token: "" },
    { origin: appBaseUrl(request), dryRun },
  );
  return publicJson(request, outcome.body, { status: outcome.status, cache: false });
}
