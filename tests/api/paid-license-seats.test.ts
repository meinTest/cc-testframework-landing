import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { createPaidLicense, updateLicenseMaxMachines } from "../../app/api/signup/lib/keygen";

// #41 — FW floating provisioning: ONE key with maxMachines = seats. These verify
// the Keygen request bodies (fetch is stubbed; no network). TMT is unchanged:
// per-seat keys carry NO maxMachines override (they inherit the policy's 1).

const base = {
  company: "Acme",
  email: "a@acme.test",
  subscriptionId: "sub_1",
  stripeCustomerId: "cus_1",
  seatIndex: 0,
  expiresAt: "2026-12-31T00:00:00.000Z",
};

let calls: { url: string; method: string; body: any }[];
const realFetch = globalThis.fetch;

beforeEach(() => {
  delete process.env.DRY_RUN;
  process.env.KEYGEN_ACCOUNT_ID = "acc";
  process.env.KEYGEN_ADMIN_TOKEN = "tok";
  process.env.KEYGEN_PAID_POLICY_ID = "pol_fw";
  process.env.KEYGEN_TMGMT_PAID_POLICY_ID = "pol_tmt";
  calls = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : null });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: "lic_1", attributes: { key: "KEY-1", status: "ACTIVE" } } }),
      text: async () => "",
    } as any;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("createPaidLicense — maxMachines (#41)", () => {
  test("FW: maxMachines is sent = seats", async () => {
    await createPaidLicense({ ...base, product: "FW", maxMachines: 5 }, false);
    const attrs = calls[0].body.data.attributes;
    assert.equal(attrs.maxMachines, 5);
    assert.equal(attrs.metadata.product, "FW");
  });

  test("TMT: NO maxMachines override (inherits the policy's 1)", async () => {
    await createPaidLicense({ ...base, product: "TMT" }, false);
    const attrs = calls[0].body.data.attributes;
    assert.equal("maxMachines" in attrs, false);
    assert.equal(attrs.metadata.product, "TMT");
  });
});

describe("updateLicenseMaxMachines (#41)", () => {
  test("PATCHes the license with the new maxMachines", async () => {
    await updateLicenseMaxMachines("lic_1", 8, false);
    assert.equal(calls[0].method, "PATCH");
    assert.match(calls[0].url, /\/licenses\/lic_1$/);
    assert.equal(calls[0].body.data.attributes.maxMachines, 8);
  });

  test("DRY_RUN makes no request", async () => {
    await updateLicenseMaxMachines("lic_1", 8, true);
    assert.equal(calls.length, 0);
  });
});
