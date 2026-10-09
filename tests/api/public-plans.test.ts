import { test, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";

import { GET, OPTIONS } from "../../app/api/public/v1/plans/route";

// Integration tests for GET /api/public/v1/plans — the CMS-facing plan catalog
// (the companion to /products). The route reads env at call time, so each test
// sets a known baseline.

const BASE = "https://app.itsbusiness.ch";
const ALLOWED = "https://www.itsbusiness.ch";

type Plan = {
  id: string;
  label: string;
  products: Array<{ id: string; name: string }>;
  offered: boolean;
  selfServe: boolean;
  cta: { kind: string; url: string };
};

function req(opts: { origin?: string } = {}): Request {
  const headers = new Headers();
  if (opts.origin) headers.set("origin", opts.origin);
  return new Request(`${BASE}/api/public/v1/plans`, { headers });
}

beforeEach(() => {
  process.env.LANDING_BASE_URL = BASE;
  delete process.env.PRODUCTS_OFFERED;
  delete process.env.SALES_VETTED_MODE;
  delete process.env.SALES_VETTED_MODE_TMGMT;
  process.env.PUBLIC_API_ALLOWED_ORIGINS = ALLOWED;
});

describe("GET /api/public/v1/plans", () => {
  test("lists all three plans with the documented shape when both products are offered", async () => {
    const res = await GET(req());
    assert.equal(res.status, 200);

    const body = (await res.json()) as { plans: Plan[]; generatedAt: string };
    const ids = body.plans.map((p) => p.id).sort();
    assert.deepEqual(ids, ["professional", "starter-framework", "starter-tmt"]);
    assert.ok(!Number.isNaN(Date.parse(body.generatedAt)));

    const pro = body.plans.find((p) => p.id === "professional")!;
    assert.equal(pro.label, "Professional");
    assert.deepEqual(
      pro.products.map((p) => p.id),
      ["TMT", "FW"],
    );
    assert.equal(pro.products.find((p) => p.id === "TMT")!.name, "Verify Test Management");
    assert.equal(pro.offered, true);
  });

  test("Professional CTA is a self-serve plan trial when neither product is vetted", async () => {
    const res = await GET(req());
    const body = (await res.json()) as { plans: Plan[] };
    const pro = body.plans.find((p) => p.id === "professional")!;
    assert.equal(pro.selfServe, true);
    assert.equal(pro.cta.kind, "trial");
    assert.equal(pro.cta.url, `${BASE}/signup?plan=professional`);
  });

  test("single-product plans deep-link to /signup?plan=<id>", async () => {
    const res = await GET(req());
    const body = (await res.json()) as { plans: Plan[] };
    const fw = body.plans.find((p) => p.id === "starter-framework")!;
    assert.equal(fw.cta.url, `${BASE}/signup?plan=starter-framework`);
  });

  test("a vetted product makes its plans sales-handled (demo CTA)", async () => {
    process.env.SALES_VETTED_MODE = "true"; // both vetted
    const res = await GET(req());
    const body = (await res.json()) as { plans: Plan[] };
    for (const plan of body.plans) {
      assert.equal(plan.selfServe, false);
      assert.equal(plan.cta.kind, "demo");
      assert.equal(plan.cta.url, `${BASE}/demo-request`);
    }
  });

  test("a plan is omitted when any of its products is not offered", async () => {
    process.env.PRODUCTS_OFFERED = "FW"; // TMT not offered
    const res = await GET(req());
    const body = (await res.json()) as { plans: Plan[] };
    const ids = body.plans.map((p) => p.id).sort();
    // Only the FW-only plan survives; starter-tmt and professional need TMT.
    assert.deepEqual(ids, ["starter-framework"]);
  });

  test("builds links from LANDING_BASE_URL", async () => {
    process.env.LANDING_BASE_URL = "https://example.test";
    const res = await GET(req());
    const body = (await res.json()) as { plans: Plan[] };
    assert.ok(body.plans.every((p) => p.cta.url.startsWith("https://example.test/")));
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
