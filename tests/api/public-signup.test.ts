import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { OPTIONS, POST } from "../../app/api/public/v1/signup/route";

// Integration tests for POST /api/public/v1/signup — the CORS-enabled CMS signup.
// The success path runs in DRY_RUN (no network): Keygen/Resend calls are mocked
// by their own dryRun branches, so we set the env they still require up front.

const BASE = "https://app.itsbusiness.ch";
const ALLOWED = "https://www.itsbusiness.ch";

function req(body: unknown, opts: { origin?: string } = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.origin) headers.set("origin", opts.origin);
  return new Request(`${BASE}/api/public/v1/signup`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID = { name: "Jane Doe", email: "jane@acme.test", company: "Acme" };

beforeEach(() => {
  process.env.SIGNUP_ENABLED = "true";
  process.env.DRY_RUN = "true";
  process.env.PUBLIC_API_ALLOWED_ORIGINS = ALLOWED;
  process.env.LANDING_BASE_URL = BASE;
  delete process.env.SALES_VETTED_MODE;
  delete process.env.SALES_VETTED_MODE_TMGMT;
  delete process.env.PRODUCTS_OFFERED;
  // Env the dryRun Keygen/Resend paths still read via required().
  process.env.KEYGEN_ACCOUNT_ID = "acct_test";
  process.env.KEYGEN_ADMIN_TOKEN = "tok_test";
  process.env.KEYGEN_TRIAL_POLICY_ID = "pol_test";
  process.env.KEYGEN_TMGMT_TRIAL_POLICY_ID = "pol_tmgmt_test";
  process.env.RESEND_FROM = "cc <onboarding@resend.dev>";
  process.env.RESEND_SUPPORT_TO = "support@itsbusiness.ch";
});

describe("POST /api/public/v1/signup", () => {
  test("registers an open self-serve trial and returns 200", async () => {
    const res = await POST(req({ ...VALID, product: "cc-testframework" }, { origin: ALLOWED }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; message: string };
    assert.equal(body.ok, true);
    assert.match(body.message, /Dry-run/); // DRY_RUN message
    // CORS + no-store
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  test("missing field → 400", async () => {
    const res = await POST(req({ email: "a@b.test", company: "X" })); // no name
    assert.equal(res.status, 400);
    const body = (await res.json()) as { ok: boolean; message: string };
    assert.equal(body.ok, false);
    assert.match(body.message, /name/i);
  });

  test("invalid email → 400", async () => {
    const res = await POST(req({ ...VALID, email: "not-an-email" }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { message: string };
    assert.match(body.message, /email/i);
  });

  test("invalid JSON → 400", async () => {
    const res = await POST(req("{not json", {}));
    assert.equal(res.status, 400);
  });

  test("a sales-vetted product cannot self-serve → 401", async () => {
    process.env.SALES_VETTED_MODE = "true"; // both products vetted
    const res = await POST(req({ ...VALID, product: "cc-testframework" }));
    assert.equal(res.status, 401);
    const body = (await res.json()) as { message: string };
    assert.match(body.message, /token required/i);
  });

  test("signup disabled → 503", async () => {
    process.env.SIGNUP_ENABLED = "false";
    const res = await POST(req({ ...VALID, product: "cc-testframework" }));
    assert.equal(res.status, 503);
  });

  test("a token in the body is ignored (open path enforced)", async () => {
    // Even with a token, the public endpoint runs the open path — a vetted
    // product is therefore rejected rather than consuming the token.
    process.env.SALES_VETTED_MODE = "true";
    const res = await POST(req({ ...VALID, product: "cc-testframework", token: "abc" }));
    assert.equal(res.status, 401);
  });

  test("non-allowlisted origin gets no CORS header", async () => {
    const res = await POST(
      req({ ...VALID, product: "cc-testframework" }, { origin: "https://evil.example" }),
    );
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  test("OPTIONS preflight → 204 with CORS", () => {
    const res = OPTIONS(req({}, { origin: ALLOWED }));
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
    assert.equal(res.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  });
});

describe("POST /api/public/v1/signup — plans (route level, DRY_RUN)", () => {
  test("plan=professional → 200", async () => {
    const res = await POST(req({ ...VALID, plan: "professional", cycle: "yearly" }));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { ok: boolean }).ok, true);
  });

  test("plan=starter-tmt → 200", async () => {
    const res = await POST(req({ ...VALID, plan: "starter-tmt" }));
    assert.equal(res.status, 200);
  });

  test("unknown plan → 400", async () => {
    const res = await POST(req({ ...VALID, plan: "enterprise" }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { message: string };
    assert.match(body.message, /unknown plan/i);
  });
});
