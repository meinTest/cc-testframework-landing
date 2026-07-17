import Stripe from "stripe";
import type { ProductId } from "../products";
import {
  CURRENCIES,
  getProductPrices,
  type BillingCycle,
  type Currency,
  type ProductPrices,
} from "../pricing";

// Reads subscription prices from Stripe (the single source of truth: sales
// manages them in the dashboard). Each Stripe Product is mapped to our product
// via a `app_product` metadata key ("cc-testframework" | "cc-tmgmt"). Results
// are cached in-process for a few minutes. If Stripe is not configured/reachable
// or a price is missing, the pricing pages fall back to the in-code config.

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

function isAppProduct(value: unknown): value is ProductId {
  return value === "cc-testframework" || value === "cc-tmgmt";
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

    const appProduct = product.metadata?.app_product;
    if (!isAppProduct(appProduct)) continue;

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

/** Display prices: Stripe amount where present, else the in-code config default. */
export async function getDisplayPrices(product: ProductId): Promise<ProductPrices> {
  const config = getProductPrices(product);
  const stripe = await getStripePricing(product);

  const out = {} as ProductPrices;
  for (const currency of CURRENCIES) {
    out[currency] = {
      monthly: stripe[currency]?.monthly?.amount ?? config[currency].monthly,
      yearly: stripe[currency]?.yearly?.amount ?? config[currency].yearly,
    };
  }
  return out;
}
