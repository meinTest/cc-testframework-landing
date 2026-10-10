import { NextResponse } from "next/server";
import Stripe from "stripe";
import { licenseBillingRef, licenseKeyFromRequest } from "../../tmgmt/lib/entitlement";
import { resolveProduct, type ProductId } from "../../../products";
import { getStripePricing } from "../../../lib/stripe-pricing";
import { CURRENCIES, type BillingCycle, type Currency } from "../../../pricing";
import { purchasesEnabled } from "../../../flags";
import { DEFAULT_TRIAL_DAYS } from "../../signup/lib/trial";

// Self-serve "add another product" link (#39). An existing customer (who already
// has one product in trial) adds the OTHER product as its OWN card-less TRIAL,
// without losing or changing the first: we resolve their EXISTING Stripe customer
// from their license key and open a Stripe-hosted Checkout bound to that customer
// with a trial (no card required now), so the new product's trialing subscription
// lands on the SAME customer and shows up in the one Customer Portal next to the
// first. The webhook (checkout.session.completed → reconcile) then provisions the
// Keygen license(s) and mails the key(s), exactly like a signup trial.
//
// Everything the customer touches is on Stripe — this is a redirect endpoint, not
// a page (same pattern as /api/license/portal). The welcome/billing mail links
// here with ?product=<other>&key=<license>. On any problem we redirect to the
// neutral unavailable page rather than leak a code; no-referrer so the ?key=
// never reaches Stripe via the Referer header.

export const dynamic = "force-dynamic";

// Product detail page (used as the cancel URL — these routes still exist).
const PRODUCT_PATH: Record<ProductId, string> = {
  FW: "cc-testframework",
  TMT: "verify-test-management",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "de";
  const origin = `${url.protocol}//${url.host}`;
  const unavailable = `${origin}/unavailable?lang=${lang}`;
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const bail = () => NextResponse.redirect(unavailable, { status: 303, headers });

  if (!purchasesEnabled()) return bail();

  const product = resolveProduct(url.searchParams.get("product"));
  const cycle: BillingCycle = url.searchParams.get("cycle") === "yearly" ? "yearly" : "monthly";
  const currencyRaw = (url.searchParams.get("currency") ?? "CHF").toUpperCase();
  const currency = (
    CURRENCIES.includes(currencyRaw as Currency) ? currencyRaw : "CHF"
  ) as Currency;
  const seats = clampSeats(url.searchParams.get("seats"));

  const dryRun = process.env.DRY_RUN === "true";
  const licenseKey = licenseKeyFromRequest(request);
  // After checkout, send the customer back into the Stripe portal (keyed), not to
  // our thank-you page — our portal endpoint mints a fresh session and redirects.
  const portalUrl = `${origin}/api/license/portal?key=${encodeURIComponent(licenseKey)}&lang=${lang}`;
  const ref = await licenseBillingRef(licenseKey, dryRun);
  if (ref.kind !== "ok") return bail();

  if (dryRun) {
    return NextResponse.redirect("https://checkout.stripe.com/c/pay/DRYRUN", {
      status: 303,
      headers,
    });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return bail();
  const stripe = new Stripe(secret);

  // Resolve the existing Stripe customer (from license metadata, else via the
  // subscription) so the new subscription attaches to the same customer.
  let customerId = ref.customerId;
  if (!customerId && ref.subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(ref.subscriptionId);
      customerId = sub.customer ? String(sub.customer) : null;
    } catch (e) {
      console.error("[license][add-product] subscription lookup failed", e);
    }
  }
  if (!customerId) return bail();

  // Idempotency: don't open a second subscription for a product the customer
  // already has (double-click / re-used mail link). If a non-dead subscription
  // for this product exists, send them to the portal to manage it instead.
  try {
    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const DEAD = new Set(["canceled", "incomplete_expired"]);
    const alreadyHas = existing.data.some(
      (s) => s.metadata?.app_product === product && !DEAD.has(s.status),
    );
    if (alreadyHas) {
      return NextResponse.redirect(portalUrl, { status: 303, headers });
    }
  } catch (e) {
    console.error("[license][add-product] existing-subscription check failed", e);
    // Non-fatal — fall through and let Checkout proceed.
  }

  const priceId = (await getStripePricing(product))[currency]?.[cycle]?.priceId;
  if (!priceId) return bail();

  try {
    const metadata = { app_product: product };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: seats,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: 999 },
        },
      ],
      // Back into the Stripe customer portal after checkout (keyed), so the
      // customer sees both subscriptions — not our thank-you page.
      success_url: portalUrl,
      cancel_url: `${origin}/${PRODUCT_PATH[product]}?lang=${lang}`,
      // Card-less trial: the added product starts as a trial just like the first
      // product did at signup. The customer only confirms on Stripe's page (no
      // card now); at trial end without a payment method it cancels. A card
      // already on file converts it seamlessly when the trial ends.
      payment_method_collection: "if_required",
      allow_promotion_codes: true,
      // Carried into the subscription so the webhook maps it back to our product
      // and provisions + mails the key(s) (checkout.session.completed → reconcile).
      metadata,
      subscription_data: {
        metadata,
        trial_period_days: DEFAULT_TRIAL_DAYS,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      },
    });
    return NextResponse.redirect(session.url ?? unavailable, { status: 303, headers });
  } catch (e) {
    console.error("[license][add-product] checkout create failed", e);
    return bail();
  }
}

function clampSeats(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 999);
}
