// Runtime feature kill-switches (server-side). Opt-out style: enabled unless the
// env var is explicitly "false", so an unset var keeps the current behaviour.

/** Subscription purchase / upgrade. Set PURCHASE_ENABLED=false to disable. */
export function purchasesEnabled(): boolean {
  return process.env.PURCHASE_ENABLED !== "false";
}

/**
 * Stripe-native trial model (Variante A). Opt-IN: only when STRIPE_TRIAL_ENABLED
 * is exactly "true", a signup creates a Stripe customer + card-less trialing
 * subscription (the customer is "in Stripe" from minute one and self-converts by
 * adding a card in the portal). Otherwise the classic card-less Keygen trial is
 * used. Requires Stripe products/prices + webhook to be configured first.
 */
export function stripeTrialEnabled(): boolean {
  return process.env.STRIPE_TRIAL_ENABLED === "true";
}
