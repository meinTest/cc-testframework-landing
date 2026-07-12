import type { ProductId } from "./products";

// ─────────────────────────────────────────────────────────────────────────
//  PRICING CONFIG — explicit prices per user/seat, PER PRODUCT & currency.
//  Edit DEFAULT_PRICES here, or override everything at once via the
//  PRICING_JSON env var (same shape). Keep these in sync with the Stripe
//  Prices once Stripe is live. `getProductPrices` is server-side (reads env).
// ─────────────────────────────────────────────────────────────────────────

export type Currency = "CHF" | "EUR" | "USD";
export type BillingCycle = "monthly" | "yearly";

export const CURRENCIES: Currency[] = ["CHF", "EUR", "USD"];

export interface PriceRow {
  monthly: number;
  yearly: number;
}
export type ProductPrices = Record<Currency, PriceRow>;

// TODO: replace EUR/USD with the real amounts once sales confirms them.
const DEFAULT_PRICES: Record<ProductId, ProductPrices> = {
  "cc-testframework": {
    CHF: { monthly: 45, yearly: 450 },
    EUR: { monthly: 47, yearly: 470 },
    USD: { monthly: 50, yearly: 500 },
  },
  "cc-tmgmt": {
    CHF: { monthly: 45, yearly: 450 },
    EUR: { monthly: 47, yearly: 470 },
    USD: { monthly: 50, yearly: 500 },
  },
};

/** Optional full override via env (JSON, same shape as DEFAULT_PRICES). */
function loadOverride(): Partial<Record<ProductId, ProductPrices>> | null {
  const raw = process.env.PRICING_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<Record<ProductId, ProductPrices>>;
  } catch {
    console.error("[pricing] PRICING_JSON is not valid JSON — using defaults");
    return null;
  }
}

/** Prices for a product. Server-side (may read PRICING_JSON); falls back to defaults. */
export function getProductPrices(product: ProductId): ProductPrices {
  return loadOverride()?.[product] ?? DEFAULT_PRICES[product];
}

/** e.g. "47 EUR". Amounts are whole numbers, so no decimals needed. */
export function formatPrice(amount: number, currency: Currency): string {
  return `${amount} ${currency}`;
}
