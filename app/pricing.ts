// ─────────────────────────────────────────────────────────────────────────
//  PRICING CONFIG — edit here when sales recalculates prices/rates.
//  Base price is per user/month in CHF; other currencies are DERIVED from the
//  exchange rates below (not a live feed — maintained here so it's a one-line
//  change). Yearly = monthly × yearlyMonths.
// ─────────────────────────────────────────────────────────────────────────

export type Currency = "CHF" | "EUR" | "USD";
export type BillingCycle = "monthly" | "yearly";

export const PRICING = {
  /** Base price per user and month, in the base currency (CHF). */
  baseMonthly: 45,
  /** Yearly = this many months of the monthly price (10 → 2 months free → 450). */
  yearlyMonths: 10,
  /** CHF → currency conversion factor. Update to the current rate when needed. */
  rates: {
    CHF: 1,
    EUR: 1.05,
    USD: 1.12,
  } as Record<Currency, number>,
};

export const CURRENCIES: Currency[] = ["CHF", "EUR", "USD"];

/** Monthly price per user in the given currency (base × rate, rounded). */
function monthlyPrice(currency: Currency): number {
  return Math.round(PRICING.baseMonthly * PRICING.rates[currency]);
}

export function unitPrice(currency: Currency, cycle: BillingCycle): number {
  const monthly = monthlyPrice(currency);
  return cycle === "monthly" ? monthly : monthly * PRICING.yearlyMonths;
}

/** e.g. "47 EUR". Amounts are whole numbers, so no decimals needed. */
export function formatPrice(amount: number, currency: Currency): string {
  return `${amount} ${currency}`;
}
