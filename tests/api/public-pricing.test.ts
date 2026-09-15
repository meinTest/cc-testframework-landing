import { test, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";

import { GET, OPTIONS } from "../../app/api/public/v1/pricing/route";

// Integration tests for GET /api/public/v1/pricing. With no STRIPE_SECRET_KEY
// the route serves the in-code fallback config deterministically (source:
// "fallback"), so these run without any network.

const BASE = "https://app.itsbusiness.ch";
const ALLOWED = "https://www.itsbusiness.ch";

function req(query = "", opts: { origin?: string } = {}): Request {
  const headers = new Headers();
  if (opts.origin) headers.set("origin", opts.origin);
  return new Request(`${BASE}/api/public/v1/pricing${query}`, { headers });
}

interface PriceRow {
  monthly: number;
  yearly: number;
  monthlyEquivalent: number;
}
interface PricingBody {
  yearlyDiscountPct: number;
  unit: string;
  currencies: string[];
  cycles: string[];
  products: Record<string, { source: string; prices: Record<string, PriceRow> }>;
  generatedAt: string;
}

beforeEach(() => {
  process.env.LANDING_BASE_URL = BASE;
  delete process.env.PRODUCTS_OFFERED;
  delete process.env.STRIPE_SECRET_KEY; // force the fallback config
  process.env.PUBLIC_API_ALLOWED_ORIGINS = ALLOWED;
});

describe("GET /api/public/v1/pricing", () => {
  test("returns fallback pricing for all offered products and currencies", async () => {
    const res = await GET(req());
    assert.equal(res.status, 200);

    const body = (await res.json()) as PricingBody;
    assert.equal(body.unit, "per_user_per_month");
    assert.deepEqual(body.currencies, ["CHF", "EUR", "USD"]);
    assert.deepEqual(body.cycles, ["monthly", "yearly"]);
    assert.equal(typeof body.yearlyDiscountPct, "number");
    assert.deepEqual(Object.keys(body.products).sort(), [
      "cc-testframework",
      "cc-tmgmt",
    ]);

    const tmgmt = body.products["cc-tmgmt"];
    assert.equal(tmgmt.source, "fallback");
    // In-code base is 45 CHF/user/month; yearly = 12×45×(1-0.1) = 486.
    assert.equal(tmgmt.prices.CHF.monthly, 45);
    assert.equal(tmgmt.prices.CHF.yearly, 486);
  });

  test("monthlyEquivalent is yearly/12 rounded", async () => {
    const res = await GET(req());
    const body = (await res.json()) as PricingBody;
    for (const product of Object.values(body.products)) {
      for (const row of Object.values(product.prices)) {
        assert.equal(row.monthlyEquivalent, Math.round(row.yearly / 12));
      }
    }
  });

  test("?product filters to a single product", async () => {
    const res = await GET(req("?product=cc-tmgmt"));
    const body = (await res.json()) as PricingBody;
    assert.deepEqual(Object.keys(body.products), ["cc-tmgmt"]);
  });

  test("?currency filters to a single currency", async () => {
    const res = await GET(req("?currency=eur")); // case-insensitive
    const body = (await res.json()) as PricingBody;
    for (const product of Object.values(body.products)) {
      assert.deepEqual(Object.keys(product.prices), ["EUR"]);
    }
  });

  test("unknown product → 404 UNKNOWN_PRODUCT", async () => {
    const res = await GET(req("?product=does-not-exist"));
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "UNKNOWN_PRODUCT");
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  test("unknown currency → 400 UNKNOWN_CURRENCY", async () => {
    const res = await GET(req("?currency=GBP"));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "UNKNOWN_CURRENCY");
  });

  test("never leaks Stripe price IDs or internals", async () => {
    const res = await GET(req());
    const raw = await res.text();
    assert.ok(!/priceId/i.test(raw), "response must not contain priceId");
    assert.ok(!/price_[A-Za-z0-9]/.test(raw), "response must not contain a Stripe price id");
  });

  test("CORS: echoes allowlisted Origin, omits otherwise; OPTIONS 204", async () => {
    const ok = await GET(req("", { origin: ALLOWED }));
    assert.equal(ok.headers.get("access-control-allow-origin"), ALLOWED);

    const bad = await GET(req("", { origin: "https://evil.example" }));
    assert.equal(bad.headers.get("access-control-allow-origin"), null);

    const pre = OPTIONS(req("", { origin: ALLOWED }));
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), ALLOWED);
  });

  test("successful responses are edge-cacheable", async () => {
    const res = await GET(req());
    assert.match(res.headers.get("cache-control") ?? "", /max-age=300/);
  });
});
