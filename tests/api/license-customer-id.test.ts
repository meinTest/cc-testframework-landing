import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { resolveCustomerId } from "../../app/api/tmgmt/lib/entitlement";
import { GET as LICENSE } from "../../app/api/license/route";
import { GET as LICENSE_STATUS } from "../../app/api/license/status/route";

// #33 — support-facing customer number in GET /api/license (+ /status).

const BASE = "https://app.itsbusiness.ch";

beforeEach(() => {
  process.env.DRY_RUN = "true";
});

describe("resolveCustomerId", () => {
  test("metadata.customerId wins when set", () => {
    assert.equal(resolveCustomerId({ customerId: "cust_9f2a" }, "lic_1"), "cust_9f2a");
  });
  test("falls back to the Keygen license id", () => {
    assert.equal(resolveCustomerId({}, "lic_1"), "lic_1");
  });
  test("blank metadata.customerId → license id", () => {
    assert.equal(resolveCustomerId({ customerId: "  " }, "lic_1"), "lic_1");
  });
  test("neither → null (no fabricated number)", () => {
    assert.equal(resolveCustomerId({}, ""), null);
  });
});

describe("GET /api/license (DRY_RUN)", () => {
  test("includes a customerId", async () => {
    const res = await LICENSE(
      new Request(`${BASE}/api/license`, { headers: { authorization: "Bearer k" } }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; customerId: string };
    assert.equal(body.ok, true);
    assert.equal(body.customerId, "dry-run-license-id");
  });

  test("no key → 401 (unchanged)", async () => {
    const res = await LICENSE(new Request(`${BASE}/api/license`));
    assert.equal(res.status, 401);
  });
});

describe("GET /api/license/status (DRY_RUN)", () => {
  test("includes a customerId", async () => {
    const res = await LICENSE_STATUS(
      new Request(`${BASE}/api/license/status`, { headers: { authorization: "Bearer k" } }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { customerId: string };
    assert.equal(body.customerId, "dry-run-license-id");
  });
});
