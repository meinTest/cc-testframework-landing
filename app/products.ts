// Shared product registry. Both products ride the same onboarding/delivery
// chain; the `ProductId` discriminator is threaded from the demo-request form
// through the signed action token, the Keygen pending/trial license metadata,
// and into signup fulfillment. Missing values default to the framework so that
// pre-existing tokens, links, and API calls stay valid (backward compatible).

export type ProductId = "cc-testframework" | "cc-tmgmt";

export const DEFAULT_PRODUCT: ProductId = "cc-testframework";

export const PRODUCT_IDS: ProductId[] = ["cc-testframework", "cc-tmgmt"];

/** Customer-facing marketing names. */
export const PRODUCT_LABELS: Record<ProductId, string> = {
  "cc-testframework": "CC-Testframework",
  "cc-tmgmt": "CC Test Management",
};

/** Coerce an unknown/legacy value into a supported ProductId (defaults to framework). */
export function resolveProduct(value: unknown): ProductId {
  return value === "cc-tmgmt" ? "cc-tmgmt" : DEFAULT_PRODUCT;
}

export function productLabel(value: unknown): string {
  return PRODUCT_LABELS[resolveProduct(value)];
}

/**
 * Which products the site currently offers, controlled by the `PRODUCTS_OFFERED`
 * env var (comma-separated product ids). Server-side only.
 *
 *   PRODUCTS_OFFERED="cc-testframework"            → only CC-Testframework
 *   PRODUCTS_OFFERED="cc-tmgmt"                    → only CC Test Management
 *   PRODUCTS_OFFERED="cc-testframework,cc-tmgmt"   → both
 *   (unset / empty / unrecognized)                → both (default)
 *
 * Order follows PRODUCT_IDS, not the env string, so the overview layout is stable.
 */
export function offeredProducts(): ProductId[] {
  const raw = process.env.PRODUCTS_OFFERED?.trim();
  if (!raw) return [...PRODUCT_IDS];
  const requested = raw.split(",").map((s) => s.trim());
  const offered = PRODUCT_IDS.filter((id) => requested.includes(id));
  // A misconfigured value (nothing valid) falls back to offering everything
  // rather than taking the whole site down.
  return offered.length > 0 ? offered : [...PRODUCT_IDS];
}

export function isOffered(product: ProductId): boolean {
  return offeredProducts().includes(product);
}
