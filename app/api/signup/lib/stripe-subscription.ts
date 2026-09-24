import Stripe from "stripe";
import type { ProductId } from "../../../products";
import { getStripePricing } from "../../../lib/stripe-pricing";
import { DEFAULT_TRIAL_DAYS } from "./trial";
import type { BillingCycle, Currency } from "../../../pricing";

// Stripe-native trial (Variante A): a signup creates a Stripe customer and a
// CARD-LESS trialing subscription, so the customer is in Stripe from minute one
// and self-converts by adding a payment method in the billing portal. At trial
// end without a card, the subscription cancels (missing_payment_method: cancel)
// and the mirrored Keygen license expires. All calls are DRY_RUN-aware.

const LOG_PREFIX = "[signup][stripe-trial]";

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing env var: STRIPE_SECRET_KEY");
  return new Stripe(key);
}

/** Create a Stripe customer for this signup. One customer, N product subs. */
export async function ensureCustomer(
  input: { email: string; name: string; company: string },
  dryRun: boolean,
): Promise<string> {
  if (dryRun) {
    console.log(`${LOG_PREFIX} DRY_RUN — would create customer for ${input.email}`);
    return "cus_DRYRUN";
  }
  const customer = await client().customers.create({
    email: input.email,
    name: input.company || input.name,
    metadata: { customerName: input.name, company: input.company },
  });
  return customer.id;
}

export interface TrialSubscription {
  subscriptionId: string;
  trialEndsAt: string; // ISO
  priceId: string;
}

/**
 * Create a card-less trialing subscription for one product. Returns null when no
 * Stripe price is configured for the product/currency/cycle (caller errors out —
 * Stripe must be set up before STRIPE_TRIAL_ENABLED is turned on).
 */
export async function createTrialSubscription(
  input: {
    customerId: string;
    product: ProductId;
    cycle: BillingCycle;
    currency: Currency;
    trialDays: number;
    seats: number;
  },
  dryRun: boolean,
): Promise<TrialSubscription | null> {
  const trialDays = input.trialDays > 0 ? input.trialDays : DEFAULT_TRIAL_DAYS;

  if (dryRun) {
    console.log(
      `${LOG_PREFIX} DRY_RUN — would start ${input.product} trial (${input.cycle}/${input.currency}, ${trialDays}d) on ${input.customerId}`,
    );
    return {
      subscriptionId: "sub_DRYRUN",
      trialEndsAt: new Date(Date.now() + trialDays * 86_400_000).toISOString(),
      priceId: "price_DRYRUN",
    };
  }

  const priceId = (await getStripePricing(input.product))[input.currency]?.[input.cycle]?.priceId;
  if (!priceId) {
    console.error(
      `${LOG_PREFIX} no Stripe price for ${input.product}/${input.currency}/${input.cycle}`,
    );
    return null;
  }

  const sub = await client().subscriptions.create({
    customer: input.customerId,
    items: [{ price: priceId, quantity: Math.max(1, input.seats) }],
    trial_period_days: trialDays,
    // No card now → at trial end without a payment method the subscription cancels.
    trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    // Carried so the webhook can map the subscription back to our product.
    metadata: { app_product: input.product },
  });

  const trialEnd = sub.trial_end ?? Math.floor(Date.now() / 1000) + trialDays * 86_400;
  return {
    subscriptionId: sub.id,
    trialEndsAt: new Date(trialEnd * 1000).toISOString(),
    priceId,
  };
}

/** Best-effort cancel (used to roll back a partially-provisioned signup). */
export async function cancelSubscription(subscriptionId: string, dryRun: boolean): Promise<void> {
  if (dryRun || !subscriptionId || subscriptionId === "sub_DRYRUN") return;
  try {
    await client().subscriptions.cancel(subscriptionId);
  } catch (e) {
    console.error(`${LOG_PREFIX} rollback cancel ${subscriptionId} failed (non-fatal)`, e);
  }
}
