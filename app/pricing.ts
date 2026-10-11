// Pricing enums only. The amounts themselves live in Stripe — the single source
// of truth (sales manages them in the dashboard) — and are read via
// app/lib/stripe-pricing.ts. There are intentionally NO in-code price defaults:
// a missing Stripe price surfaces as "unavailable" rather than a silently-wrong
// hardcoded number (#35).

export type Currency = "CHF" | "EUR" | "USD";
export type BillingCycle = "monthly" | "yearly";

export const CURRENCIES: Currency[] = ["CHF", "EUR", "USD"];
