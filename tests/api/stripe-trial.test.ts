import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  ensureCustomer,
  createTrialSubscription,
} from "../../app/api/signup/lib/stripe-subscription";
import { POST as SIGNUP } from "../../app/api/public/v1/signup/route";

// Variante A — Stripe-native card-less trial. DRY_RUN throughout (no network).

const BASE = "https://app.itsbusiness.ch";
const ALLOWED = "https://www.itsbusiness.ch";
const VALID = { name: "Jane Doe", email: "jane@acme.test", company: "Acme" };

function req(body: unknown): Request {
  return new Request(`${BASE}/api/public/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ALLOWED },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.DRY_RUN = "true";
  process.env.SIGNUP_ENABLED = "true";
  process.env.STRIPE_TRIAL_ENABLED = "true";
  process.env.PUBLIC_API_ALLOWED_ORIGINS = ALLOWED;
  process.env.LANDING_BASE_URL = BASE;
  delete process.env.SALES_VETTED_MODE;
  delete process.env.PRODUCTS_OFFERED;
  // Env the dryRun Resend paths still read via required().
  process.env.RESEND_FROM = "cc <onboarding@resend.dev>";
  process.env.RESEND_SUPPORT_TO = "support@itsbusiness.ch";
});

describe("stripe-subscription helpers (DRY_RUN)", () => {
  test("ensureCustomer returns a customer id", async () => {
    assert.equal(await ensureCustomer(VALID, true), "cus_DRYRUN");
  });

  test("createTrialSubscription returns a trialing sub with the trial end ~trialDays out", async () => {
    const sub = await createTrialSubscription(
      { customerId: "cus_DRYRUN", product: "cc-tmgmt", cycle: "monthly", currency: "CHF", trialDays: 14, seats: 1 },
      true,
    );
    assert.ok(sub);
    assert.equal(sub!.subscriptionId, "sub_DRYRUN");
    const days = Math.round((Date.parse(sub!.trialEndsAt) - Date.now()) / 86_400_000);
    assert.equal(days, 14);
  });
});

describe("POST /api/public/v1/signup with STRIPE_TRIAL_ENABLED=true (DRY_RUN)", () => {
  test("single product → 200 (Stripe trial path)", async () => {
    const res = await SIGNUP(req({ ...VALID, product: "cc-tmgmt" }));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { ok: boolean }).ok, true);
  });

  test("professional plan → 200 (two subscriptions path)", async () => {
    const res = await SIGNUP(req({ ...VALID, plan: "professional", cycle: "yearly" }));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { ok: boolean }).ok, true);
  });

  test("flag off → still works (classic Keygen trial)", async () => {
    process.env.STRIPE_TRIAL_ENABLED = "false";
    // Keygen dryRun path needs the trial policy env.
    process.env.KEYGEN_ACCOUNT_ID = "acct";
    process.env.KEYGEN_ADMIN_TOKEN = "tok";
    process.env.KEYGEN_TMGMT_TRIAL_POLICY_ID = "pol";
    const res = await SIGNUP(req({ ...VALID, product: "cc-tmgmt" }));
    assert.equal(res.status, 200);
  });
});
