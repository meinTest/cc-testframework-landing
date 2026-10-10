// Shared product registry. Both products ride the same onboarding/delivery
// chain; the `ProductId` discriminator is threaded from the demo-request form
// through the signed action token, the Keygen pending/trial license metadata,
// and into signup fulfillment. Missing values default to the framework so that
// pre-existing tokens, links, and API calls stay valid (backward compatible).
//
// #43: the canonical product ids are **FW** (framework) and **TMT** (test
// management). The legacy ids `cc-testframework` / `cc-tmgmt` still appear in
// existing Keygen license metadata, Stripe `app_product` metadata and in-flight
// client/CMS payloads, so every resolver below ACCEPTS the legacy ids too and
// maps them to the canonical ones. (These are entitlement/license products; the
// sellable "BOTH" bundle is a plan, not a ProductId — see plans.ts / #42.)

export type ProductId = "FW" | "TMT";

export const DEFAULT_PRODUCT: ProductId = "FW";

export const PRODUCT_IDS: ProductId[] = ["FW", "TMT"];

/** Customer-facing marketing names. */
export const PRODUCT_LABELS: Record<ProductId, string> = {
  FW: "CC-Testframework",
  TMT: "Verify Test Management",
};

/**
 * URL slug of each product's detail page (e.g. /cc-testframework,
 * /verify-test-management). Single source of truth for the checkout cancel URL
 * and the public products API links. The old TMT slug `cc-testmanagement` is
 * redirected to `verify-test-management` in next.config.ts for existing links.
 */
export const PRODUCT_SLUGS: Record<ProductId, string> = {
  FW: "cc-testframework",
  TMT: "verify-test-management",
};

// Canonical + legacy identifiers → canonical ProductId. Keep the legacy ids for
// backward compatibility (existing licenses/Stripe metadata/in-flight clients).
const PRODUCT_ALIASES: Record<string, ProductId> = {
  FW: "FW",
  TMT: "TMT",
  "cc-testframework": "FW",
  "cc-tmgmt": "TMT",
};

/** Exact match against a known id (canonical OR legacy), else null. */
export function coerceProduct(value: unknown): ProductId | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PRODUCT_ALIASES, value)
    ? PRODUCT_ALIASES[value]
    : null;
}

/** Lenient: coerce an unknown/legacy value into a ProductId (defaults to FW). */
export function resolveProduct(value: unknown): ProductId {
  return coerceProduct(value) ?? DEFAULT_PRODUCT;
}

export function productLabel(value: unknown): string {
  return PRODUCT_LABELS[resolveProduct(value)];
}

/**
 * Which products the site currently offers, controlled by the `PRODUCTS_OFFERED`
 * env var (comma-separated product ids; canonical FW/TMT or legacy accepted).
 * Server-side only.
 *
 *   PRODUCTS_OFFERED="FW"        → only CC-Testframework
 *   PRODUCTS_OFFERED="TMT"       → only Verify Test Management
 *   PRODUCTS_OFFERED="FW,TMT"    → both
 *   (unset / empty / unrecognized) → both (default)
 *
 * Order follows PRODUCT_IDS, not the env string, so the overview layout is stable.
 */
export function offeredProducts(): ProductId[] {
  const raw = process.env.PRODUCTS_OFFERED?.trim();
  if (!raw) return [...PRODUCT_IDS];
  const requested = raw
    .split(",")
    .map((s) => coerceProduct(s.trim()))
    .filter((p): p is ProductId => p !== null);
  // A misconfigured value (nothing valid) falls back to offering everything
  // rather than taking the whole site down.
  return requested.length > 0
    ? PRODUCT_IDS.filter((id) => requested.includes(id))
    : [...PRODUCT_IDS];
}

export function isOffered(product: ProductId): boolean {
  return offeredProducts().includes(product);
}

/**
 * Whether the sales-vetted onboarding gate is active for a product. Server-side.
 *
 *   SALES_VETTED_MODE        → global default (and the framework's control)
 *   SALES_VETTED_MODE_TMGMT  → per-product override for TMT
 *                              ("true"/"false"; unset → inherits the global)
 *
 * When vetting is OFF for a product, its trial is self-served directly at
 * `/signup?product=<id>` (no demo-request / sales approval). When ON, `/signup`
 * requires a sales-issued token and the CTA points at `/demo-request`.
 */
export function isVetted(product: ProductId): boolean {
  const global = process.env.SALES_VETTED_MODE === "true";
  if (product === "TMT") {
    const override = process.env.SALES_VETTED_MODE_TMGMT;
    if (override === "true") return true;
    if (override === "false") return false;
  }
  return global;
}
