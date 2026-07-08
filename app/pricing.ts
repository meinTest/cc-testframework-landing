// Subscription price config (Phase 1 — display only). CHF is authoritative
// (45 / 450 per user). EUR/USD are placeholders at parity until the real
// amounts are set as Stripe Prices; the currency picker charges in the chosen
// currency once Stripe multi-currency Prices exist. Yearly = 10× monthly
// (2 months free) → 450.

export type Currency = "CHF" | "EUR" | "USD";
export type BillingCycle = "monthly" | "yearly";

export const CURRENCIES: Currency[] = ["CHF", "EUR", "USD"];

// Price per user/seat, per month, by currency. Both products share this today.
const MONTHLY_PER_USER: Record<Currency, number> = {
  CHF: 45,
  EUR: 45,
  USD: 45,
};

const YEARLY_MONTHS = 10; // 2 months free

export function unitPrice(currency: Currency, cycle: BillingCycle): number {
  const monthly = MONTHLY_PER_USER[currency];
  return cycle === "monthly" ? monthly : monthly * YEARLY_MONTHS;
}

/** e.g. "45 CHF". Amounts are whole numbers today, so no decimals needed. */
export function formatPrice(amount: number, currency: Currency): string {
  return `${amount} ${currency}`;
}
