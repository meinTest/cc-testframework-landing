import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  validateTrialDays,
  sanitizeTrialDays,
  DEFAULT_TRIAL_DAYS,
  MAX_TRIAL_DAYS,
} from "../../app/api/signup/lib/trial";
import { createTrialLicense } from "../../app/api/signup/lib/keygen";

// Tests for the sales-chosen trial duration (#11): validation, metadata
// read-back, and that createTrialLicense turns trialDays into the license expiry.

describe("validateTrialDays", () => {
  test("empty / absent → default", () => {
    for (const raw of [undefined, null, ""]) {
      assert.deepEqual(validateTrialDays(raw), { value: DEFAULT_TRIAL_DAYS });
    }
  });

  test("accepts numbers and numeric strings, flooring", () => {
    assert.deepEqual(validateTrialDays(30), { value: 30 });
    assert.deepEqual(validateTrialDays("60"), { value: 60 });
    assert.deepEqual(validateTrialDays(14.9), { value: 14 });
  });

  test("accepts the boundaries 1 and MAX_TRIAL_DAYS", () => {
    assert.deepEqual(validateTrialDays(1), { value: 1 });
    assert.deepEqual(validateTrialDays(MAX_TRIAL_DAYS), { value: MAX_TRIAL_DAYS });
  });

  test("rejects out-of-range and non-numeric", () => {
    for (const raw of [0, -5, MAX_TRIAL_DAYS + 1, "abc", NaN]) {
      const r = validateTrialDays(raw);
      assert.ok("error" in r, `expected error for ${String(raw)}`);
    }
  });
});

describe("sanitizeTrialDays", () => {
  test("valid → number, flooring", () => {
    assert.equal(sanitizeTrialDays(30), 30);
    assert.equal(sanitizeTrialDays("90"), 90);
    assert.equal(sanitizeTrialDays(60.7), 60);
  });

  test("absent / invalid / out-of-range → undefined (inherit policy default)", () => {
    for (const raw of [undefined, null, "", 0, -1, MAX_TRIAL_DAYS + 1, "nope"]) {
      assert.equal(sanitizeTrialDays(raw), undefined);
    }
  });
});

describe("createTrialLicense expiry (DRY_RUN)", () => {
  beforeEach(() => {
    process.env.KEYGEN_ACCOUNT_ID = "acct_test";
    process.env.KEYGEN_ADMIN_TOKEN = "tok_test";
    process.env.KEYGEN_TRIAL_POLICY_ID = "pol_test";
  });

  const base = {
    email: "a@b.test",
    name: "A B",
    company: "Acme",
    product: "cc-testframework" as const,
  };

  function daysUntil(iso: string): number {
    return Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  }

  test("trialDays drives the expiry", async () => {
    const lic = await createTrialLicense({ ...base, trialDays: 30 }, true);
    assert.ok(lic.expiry);
    assert.equal(daysUntil(lic.expiry!), 30);
  });

  test("no trialDays → falls back to the default duration", async () => {
    const lic = await createTrialLicense({ ...base }, true);
    assert.ok(lic.expiry);
    assert.equal(daysUntil(lic.expiry!), DEFAULT_TRIAL_DAYS);
  });
});
