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
  "cc-tmgmt": "CC-Testmanagement",
};

/** Coerce an unknown/legacy value into a supported ProductId (defaults to framework). */
export function resolveProduct(value: unknown): ProductId {
  return value === "cc-tmgmt" ? "cc-tmgmt" : DEFAULT_PRODUCT;
}

export function productLabel(value: unknown): string {
  return PRODUCT_LABELS[resolveProduct(value)];
}
