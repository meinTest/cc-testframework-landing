import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { validateSignupInput, successMessage } from "../../app/api/signup/lib/perform";
import { PLANS, planProducts } from "../../app/plans";

// Pure-function tests for the plan → product-set mapping and the success message
// (the DRY_RUN route path always returns the dry-run message, so the per-plan
// wording is verified here instead). No network.

const BASE = { name: "Jane", email: "jane@acme.test", company: "Acme" };

describe("validateSignupInput — plans", () => {
  test("starter-framework → [cc-testframework]", () => {
    const r = validateSignupInput({ ...BASE, plan: "starter-framework" });
    assert.ok("value" in r);
    assert.deepEqual(r.value.products, ["cc-testframework"]);
  });

  test("starter-tmt → [cc-tmgmt]", () => {
    const r = validateSignupInput({ ...BASE, plan: "starter-tmt" });
    assert.ok("value" in r);
    assert.deepEqual(r.value.products, ["cc-tmgmt"]);
  });

  test("professional → both products", () => {
    const r = validateSignupInput({ ...BASE, plan: "professional" });
    assert.ok("value" in r);
    assert.deepEqual(r.value.products, ["cc-tmgmt", "cc-testframework"]);
  });

  test("no plan → single product from `product` (default framework)", () => {
    const def = validateSignupInput({ ...BASE });
    assert.ok("value" in def);
    assert.deepEqual(def.value.products, ["cc-testframework"]);

    const tmt = validateSignupInput({ ...BASE, product: "cc-tmgmt" });
    assert.ok("value" in tmt);
    assert.deepEqual(tmt.value.products, ["cc-tmgmt"]);
  });

  test("unknown plan → error", () => {
    const r = validateSignupInput({ ...BASE, plan: "enterprise" });
    assert.ok("error" in r);
    assert.match(r.error, /unknown plan/i);
  });

  test("cycle/currency preferences are parsed; invalid ignored", () => {
    const ok = validateSignupInput({ ...BASE, plan: "starter-tmt", cycle: "yearly", currency: "eur" });
    assert.ok("value" in ok);
    assert.equal(ok.value.cycle, "yearly");
    assert.equal(ok.value.currency, "EUR");

    const bad = validateSignupInput({ ...BASE, cycle: "weekly", currency: "GBP" });
    assert.ok("value" in bad);
    assert.equal(bad.value.cycle, undefined);
    assert.equal(bad.value.currency, undefined);
  });
});

describe("plan config", () => {
  test("professional bundles exactly the two products", () => {
    assert.deepEqual([...planProducts("professional")].sort(), ["cc-testframework", "cc-tmgmt"]);
  });
  test("each plan lists at least one product", () => {
    for (const id of Object.keys(PLANS)) {
      assert.ok(planProducts(id as keyof typeof PLANS).length >= 1);
    }
  });
});

describe("successMessage", () => {
  test("single cc-tmgmt → download/access wording", () => {
    assert.match(successMessage(["cc-tmgmt"], false), /download links and access code/);
  });
  test("single framework → license-key wording", () => {
    assert.match(successMessage(["cc-testframework"], false), /license key and setup instructions/);
  });
  test("both products → names both labels", () => {
    assert.match(
      successMessage(["cc-tmgmt", "cc-testframework"], false),
      /CC Test Management and CC-Testframework/,
    );
  });
  test("dry-run wording regardless of products", () => {
    assert.match(successMessage(["cc-tmgmt", "cc-testframework"], true), /Dry-run/);
  });
});
