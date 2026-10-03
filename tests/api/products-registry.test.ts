import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  coerceProduct,
  resolveProduct,
  DEFAULT_PRODUCT,
  PRODUCT_IDS,
  offeredProducts,
} from "../../app/products";

// #43: the canonical product ids are FW / TMT. The legacy ids
// cc-testframework / cc-tmgmt still arrive from existing Keygen metadata, Stripe
// app_product metadata and in-flight CMS/client payloads, so the resolvers must
// map them to the canonical ids. No network.

describe("coerceProduct (strict: known id → canonical, else null)", () => {
  test("canonical ids pass through", () => {
    assert.equal(coerceProduct("FW"), "FW");
    assert.equal(coerceProduct("TMT"), "TMT");
  });

  test("legacy ids map to canonical (backward-compat)", () => {
    assert.equal(coerceProduct("cc-testframework"), "FW");
    assert.equal(coerceProduct("cc-tmgmt"), "TMT");
  });

  test("unknown / non-string → null (no silent default)", () => {
    assert.equal(coerceProduct("BOTH"), null); // sellable bundle, not an entitlement id
    assert.equal(coerceProduct("cc-framework"), null);
    assert.equal(coerceProduct("nope"), null);
    assert.equal(coerceProduct(""), null);
    assert.equal(coerceProduct(undefined), null);
    assert.equal(coerceProduct(null), null);
    assert.equal(coerceProduct(42), null);
  });
});

describe("resolveProduct (lenient: unknown → DEFAULT_PRODUCT)", () => {
  test("legacy + canonical resolve", () => {
    assert.equal(resolveProduct("cc-tmgmt"), "TMT");
    assert.equal(resolveProduct("TMT"), "TMT");
    assert.equal(resolveProduct("cc-testframework"), "FW");
  });
  test("unknown / missing → default (FW)", () => {
    assert.equal(DEFAULT_PRODUCT, "FW");
    assert.equal(resolveProduct(undefined), "FW");
    assert.equal(resolveProduct("garbage"), "FW");
  });
});

describe("offeredProducts (PRODUCTS_OFFERED env, legacy tolerated)", () => {
  const prev = process.env.PRODUCTS_OFFERED;
  const restore = () => {
    if (prev === undefined) delete process.env.PRODUCTS_OFFERED;
    else process.env.PRODUCTS_OFFERED = prev;
  };

  test("unset → both, in PRODUCT_IDS order", () => {
    delete process.env.PRODUCTS_OFFERED;
    assert.deepEqual(offeredProducts(), [...PRODUCT_IDS]);
    restore();
  });

  test("legacy id in env narrows to the canonical product", () => {
    process.env.PRODUCTS_OFFERED = "cc-tmgmt";
    assert.deepEqual(offeredProducts(), ["TMT"]);
    restore();
  });

  test("mixed canonical + legacy, de-duped, stable order", () => {
    process.env.PRODUCTS_OFFERED = "TMT, cc-testframework";
    assert.deepEqual(offeredProducts(), ["FW", "TMT"]);
    restore();
  });

  test("all-invalid → falls back to both (never an empty catalog)", () => {
    process.env.PRODUCTS_OFFERED = "nonsense";
    assert.deepEqual(offeredProducts(), [...PRODUCT_IDS]);
    restore();
  });
});
