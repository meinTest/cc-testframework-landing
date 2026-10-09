import { isOffered, isVetted, PRODUCT_LABELS } from "../../../../products";
import { PLAN_IDS, PLANS, planProducts } from "../../../../plans";
import { appBaseUrl, publicJson, preflight } from "../../../lib/public-http";

// Public, read-only plan catalog for the CMS — the companion to /products.
// A plan is a delivery BUNDLE: "Starter" plans deliver a single product, the
// "Professional" plan delivers both (FW + TMT) in one signup. The CMS renders
// its own marketing copy; this endpoint only returns the structural facts —
// which products a plan contains and the resolved primary CTA deep-link.
//
// A plan is listed only when EVERY product it contains is offered. The CTA is a
// self-serve trial (/signup?plan=<id>) when no product in the plan is sales-
// vetted; otherwise the bundle is sales-handled and the CTA points at the demo
// request. Carries no prices (see /pricing) and no secrets.

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export function GET(request: Request) {
  const base = appBaseUrl(request);

  const plans = PLAN_IDS
    .map((id) => {
      const products = planProducts(id);
      // Only offer a plan when all of its products are offered.
      if (!products.every(isOffered)) return null;

      // Self-serve only when no product in the plan is sales-vetted; otherwise
      // the whole bundle goes through sales (mirrors the /signup plan gate).
      const selfServe = !products.some(isVetted);
      const cta = selfServe
        ? { kind: "trial" as const, url: `${base}/signup?plan=${id}` }
        : { kind: "demo" as const, url: `${base}/demo-request` };

      return {
        id,
        label: PLANS[id].label,
        products: products.map((p) => ({ id: p, name: PRODUCT_LABELS[p] })),
        offered: true,
        selfServe,
        cta,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return publicJson(request, {
    plans,
    generatedAt: new Date().toISOString(),
  });
}
