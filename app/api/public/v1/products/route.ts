import {
  offeredProducts,
  isVetted,
  PRODUCT_LABELS,
  PRODUCT_SLUGS,
} from "../../../../products";
import { appBaseUrl, publicJson, preflight } from "../../../lib/public-http";

// Public, read-only product catalog for the CMS. Returns the offered products
// with their canonical name, page slug and the resolved primary CTA (trial vs.
// demo, derived from the sales-vetted gate) as an absolute deep-link. Carries no
// marketing copy (headlines/features live in the CMS) and no secrets. The
// catalog itself is code-driven on purpose — new products are set up by us, not
// self-served (see docs/public-api.md).

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export function GET(request: Request) {
  const base = appBaseUrl(request);

  const products = offeredProducts().map((id) => {
    const slug = PRODUCT_SLUGS[id];
    const cta = isVetted(id)
      ? {
          kind: "demo" as const,
          url: `${base}/demo-request?product=${id}&plan=subscription`,
        }
      : { kind: "trial" as const, url: `${base}/signup?product=${id}` };

    return {
      id,
      name: PRODUCT_LABELS[id],
      slug,
      offered: true,
      cta,
      pricingUrl: `${base}/${slug}/pricing`,
    };
  });

  return publicJson(request, {
    products,
    generatedAt: new Date().toISOString(),
  });
}
