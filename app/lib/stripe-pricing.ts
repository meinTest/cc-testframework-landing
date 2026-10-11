import Stripe from "stripe";
import { coerceProduct, type ProductId } from "../products";
import { CURRENCIES, type BillingCycle, type Currency } from "../pricing";

// Reads subscription prices from Stripe (the single source of truth: sales
// manages them in the dashboard). Each Stripe Product is mapped to our product
// via an `app_product` metadata key — canonical "FW"/"TMT" OR the legacy
// "cc-testframework"/"cc-tmgmt" (coerced to canonical, #43). Results are cached
// in-process for a few minutes. There is NO in-code fallback (#35): if a Stripe
// price is missing or Stripe is unreachable, the amount is reported as `null`
// ("unavailable") rather than a silently-wrong hardcoded number.

export interface CyclePrice {
  amount: number; // major units (whole CHF/EUR/USD)
  priceId: string;
}
export type StripeProductPricing = Partial<
  Record<Currency, Partial<Record<BillingCycle, CyclePrice>>>
>;

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; data: Record<string, StripeProductPricing> } | null = null;

function client(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}


function intervalToCycle(interval: string): BillingCycle | null {
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  return null;
}

async function fetchAll(): Promise<Record<string, StripeProductPricing>> {
  const stripe = client();
  if (!stripe) return {};

  const out: Record<string, StripeProductPricing> = {};
  const prices = await stripe.prices.list({
    active: true,
    limit: 100,
    expand: ["data.product"],
  });

  for (const price of prices.data) {
    if (!price.recurring || price.unit_amount == null) continue;

    const product = price.product;
    if (typeof product === "string" || "deleted" in product) continue;
    if (product.active === false) continue;

    // Accept canonical (FW/TMT) and legacy (cc-*) app_product; key by canonical.
    const appProduct = coerceProduct(product.metadata?.app_product);
    if (!appProduct) continue;

    const currency = price.currency.toUpperCase() as Currency;
    if (!CURRENCIES.includes(currency)) continue;

    const cycle = intervalToCycle(price.recurring.interval);
    if (!cycle) continue;

    const byCurrency = (out[appProduct] ??= {});
    const entry = (byCurrency[currency] ??= {});
    entry[cycle] = { amount: Math.round(price.unit_amount / 100), priceId: price.id };
  }

  return out;
}

async function getAll(): Promise<Record<string, StripeProductPricing>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;
  try {
    const data = await fetchAll();
    cache = { at: now, data };
    return data;
  } catch (err) {
    console.error("[stripe-pricing] fetch failed", err);
    return cache?.data ?? {};
  }
}

/** Stripe pricing (incl. price IDs, for checkout) for a product. */
export async function getStripePricing(
  product: ProductId,
): Promise<StripeProductPricing> {
  return (await getAll())[product] ?? {};
}

export interface DisplayRow {
  monthly: number | null;
  yearly: number | null;
}
export type DisplayPrices = Record<Currency, DisplayRow>;

/**
 * Display prices from Stripe ONLY (#35). A currency/cycle with no Stripe price
 * (or Stripe unreachable) is `null` — "unavailable" — never a hardcoded default.
 */
export async function getDisplayPrices(product: ProductId): Promise<DisplayPrices> {
  const stripe = await getStripePricing(product);
  const out = {} as DisplayPrices;
  for (const currency of CURRENCIES) {
    out[currency] = {
      monthly: stripe[currency]?.monthly?.amount ?? null,
      yearly: stripe[currency]?.yearly?.amount ?? null,
    };
  }
  return out;
}

/** True if Stripe has any price for this product (→ "available" for display). */
export async function hasStripePrices(product: ProductId): Promise<boolean> {
  return Object.keys(await getStripePricing(product)).length > 0;
}

/**
 * Representative yearly-discount percentage, DERIVED from Stripe (first product/
 * currency that has both a monthly and a yearly price): round((1 − yearly/(12×
 * monthly)) × 100). `null` when no such pair exists in Stripe — no hardcoded
 * default (#35).
 */
export async function stripeYearlyDiscountPct(): Promise<number | null> {
  const all = await getAll();
  for (const product of Object.values(all)) {
    for (const byCurrency of Object.values(product)) {
      const m = byCurrency?.monthly?.amount;
      const y = byCurrency?.yearly?.amount;
      if (m && y && m > 0) return Math.round((1 - y / (12 * m)) * 100);
    }
  }
  return null;
}
