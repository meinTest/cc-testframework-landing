import { test, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";

import { GET, OPTIONS } from "../../app/api/public/v1/products/route";

// Integration tests for GET /api/public/v1/products — the CMS-facing catalog.
// The route reads env at call time, so each test sets a known baseline.

const BASE = "https://app.itsbusiness.ch";
const ALLOWED = "https://www.itsbusiness.ch";

function req(opts: { origin?: string } = {}): Request {
  const headers = new Headers();
  if (opts.origin) headers.set("origin", opts.origin);
  return new Request(`${BASE}/api/public/v1/products`, { headers });
}

beforeEach(() => {
  process.env.LANDING_BASE_URL = BASE;
  delete process.env.PRODUCTS_OFFERED;
  delete process.env.SALES_VETTED_MODE;
  delete process.env.SALES_VETTED_MODE_TMGMT;
  process.env.PUBLIC_API_ALLOWED_ORIGINS = ALLOWED;
});

describe("GET /api/public/v1/products", () => {
  test("returns both offered products with the documented shape", async () => {
    const res = await GET(req());
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      products: Array<{
        id: string;
        name: string;
        slug: string;
        offered: boolean;
        cta: { kind: string; url: string };
        pricingUrl: string;
      }>;
      generatedAt: string;
    };

    assert.equal(body.products.length, 2);
    const ids = body.products.map((p) => p.id).sort();
    assert.deepEqual(ids, ["cc-testframework", "cc-tmgmt"]);
    assert.ok(!Number.isNaN(Date.parse(body.generatedAt)));

    const tmgmt = body.products.find((p) => p.id === "cc-tmgmt")!;
    assert.equal(tmgmt.name, "CC Test Management");
    assert.equal(tmgmt.slug, "cc-testmanagement");
    assert.equal(tmgmt.offered, true);
    assert.equal(tmgmt.pricingUrl, `${BASE}/cc-testmanagement/pricing`);
  });

  test("CTA is a self-serve trial when the product is not sales-vetted", async () => {
    delete process.env.SALES_VETTED_MODE; // → not vetted → trial
    const res = await GET(req());
    const body = (await res.json()) as {
      products: Array<{ id: string; cta: { kind: string; url: string } }>;
    };
    const fw = body.products.find((p) => p.id === "cc-testframework")!;
    assert.equal(fw.cta.kind, "trial");
    assert.equal(fw.cta.url, `${BASE}/signup?product=cc-testframework`);
  });

  test("CTA is a demo request when the product is sales-vetted", async () => {
    process.env.SALES_VETTED_MODE = "true";
    const res = await GET(req());
    const body = (await res.json()) as {
      products: Array<{ id: string; cta: { kind: string; url: string } }>;
    };
    const tmgmt = body.products.find((p) => p.id === "cc-tmgmt")!;
    assert.equal(tmgmt.cta.kind, "demo");
    assert.equal(
      tmgmt.cta.url,
      `${BASE}/demo-request?product=cc-tmgmt&plan=subscription`,
    );
  });

  test("respects the per-product vetting override", async () => {
    process.env.SALES_VETTED_MODE = "true"; // global vetted
    process.env.SALES_VETTED_MODE_TMGMT = "false"; // but tmgmt self-serve
    const res = await GET(req());
    const body = (await res.json()) as {
      products: Array<{ id: string; cta: { kind: string } }>;
    };
    assert.equal(body.products.find((p) => p.id === "cc-tmgmt")!.cta.kind, "trial");
    assert.equal(
      body.products.find((p) => p.id === "cc-testframework")!.cta.kind,
      "demo",
    );
  });

  test("PRODUCTS_OFFERED narrows the catalog", async () => {
    process.env.PRODUCTS_OFFERED = "cc-tmgmt";
    const res = await GET(req());
    const body = (await res.json()) as { products: Array<{ id: string }> };
    assert.equal(body.products.length, 1);
    assert.equal(body.products[0].id, "cc-tmgmt");
  });

  test("builds links from LANDING_BASE_URL", async () => {
    process.env.LANDING_BASE_URL = "https://example.test";
    const res = await GET(req());
    const body = (await res.json()) as {
      products: Array<{ pricingUrl: string; cta: { url: string } }>;
    };
    assert.ok(body.products.every((p) => p.pricingUrl.startsWith("https://example.test/")));
    assert.ok(body.products.every((p) => p.cta.url.startsWith("https://example.test/")));
  });

  describe("CORS", () => {
    test("echoes an allowlisted Origin", async () => {
      const res = await GET(req({ origin: ALLOWED }));
      assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
      assert.equal(res.headers.get("vary"), "Origin");
    });

    test("omits ACAO for a non-allowlisted Origin", async () => {
      const res = await GET(req({ origin: "https://evil.example" }));
      assert.equal(res.headers.get("access-control-allow-origin"), null);
    });

    test("OPTIONS preflight returns 204 with CORS headers", async () => {
      const res = OPTIONS(req({ origin: ALLOWED }));
      assert.equal(res.status, 204);
      assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
      assert.equal(res.headers.get("access-control-allow-methods"), "GET, OPTIONS");
    });
  });

  test("is edge-cacheable", async () => {
    const res = await GET(req());
    assert.match(res.headers.get("cache-control") ?? "", /max-age=300/);
  });
});
