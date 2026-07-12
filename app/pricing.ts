import type { ProductId } from "./products";

// ─────────────────────────────────────────────────────────────────────────
//  PRICING CONFIG — edit here.
//  Base is CHF per user/month (per product). Yearly = 12× monthly minus the
//  yearly discount. EUR/USD are DERIVED from the CHF base via the exchange
//  rates below (maintain the current rate here — not a live feed). Keep in sync
//  with the Stripe Prices once Stripe is live.
// ─────────────────────────────────────────────────────────────────────────

export type Currency = "CHF" | "EUR" | "USD";
export type BillingCycle = "monthly" | "yearly";

export const CURRENCIES: Currency[] = ["CHF", "EUR", "USD"];

export const PRICING = {
  /** Base price per user/month in CHF, per product (both 45 today; editable). */
  baseMonthlyCHF: {
    "cc-testframework": 45,
    "cc-tmgmt": 45,
  } as Record<ProductId, number>,
  /** Discount on the annual total (12× monthly). 0.10 = 10% off. */
  yearlyDiscount: 0.1,
  /** CHF → currency conversion factor (current rate; maintain here). */
  rates: {
    CHF: 1,
    EUR: 1.05,
    USD: 1.12,
  } as Record<Currency, number>,
};

/** Rounded yearly-discount percentage for display, e.g. 10. */
export const YEARLY_DISCOUNT_PCT = Math.round(PRICING.yearlyDiscount * 100);

export interface PriceRow {
  monthly: number;
  yearly: number;
}
export type ProductPrices = Record<Currency, PriceRow>;

/** Prices for a product across all currencies (base × rate, rounded). */
export function getProductPrices(product: ProductId): ProductPrices {
  const monthlyCHF = PRICING.baseMonthlyCHF[product];
  const yearlyCHF = Math.round(monthlyCHF * 12 * (1 - PRICING.yearlyDiscount));

  const out = {} as ProductPrices;
  for (const currency of CURRENCIES) {
    const rate = PRICING.rates[currency];
    out[currency] = {
      monthly: Math.round(monthlyCHF * rate),
      yearly: Math.round(yearlyCHF * rate),
    };
  }
  return out;
}

/** e.g. "47 EUR". Amounts are whole numbers, so no decimals needed. */
export function formatPrice(amount: number, currency: Currency): string {
  return `${amount} ${currency}`;
}
