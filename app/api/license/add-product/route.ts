import { NextResponse } from "next/server";
import Stripe from "stripe";
import { licenseBillingRef, licenseKeyFromRequest } from "../../tmgmt/lib/entitlement";
import { resolveProduct, type ProductId } from "../../../products";
import { getStripePricing } from "../../../lib/stripe-pricing";
import { CURRENCIES, type BillingCycle, type Currency } from "../../../pricing";
import { purchasesEnabled } from "../../../flags";

// Self-serve "add another product" link (#39). An existing customer (who already
// has one product) buys the OTHER product without losing the first: we resolve
// their EXISTING Stripe customer from their license key and open a Stripe-hosted
// Checkout bound to that customer, so the new product's subscription lands on the
// SAME customer and shows up in the one Customer Portal next to the first.
//
// Everything after the redirect happens on Stripe — this is a redirect endpoint,
// not a page (same pattern as /api/license/portal). The welcome/billing mail
// links here with ?product=<other>&key=<license>. On any problem we redirect to
// the neutral unavailable page rather than leak a code; no-referrer so the ?key=
// never reaches Stripe via the Referer header.

export const dynamic = "force-dynamic";

const DEFAULT_RETURN_URL = "https://itsbusiness.vercel.app";

// Product detail page (used as the cancel URL — these routes still exist).
const PRODUCT_PATH: Record<ProductId, string> = {
  FW: "cc-testframework",
  TMT: "cc-testmanagement",
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
  const ref = await licenseBillingRef(licenseKeyFromRequest(request), dryRun);
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

  const priceId = (await getStripePricing(product))[currency]?.[cycle]?.priceId;
  if (!priceId) return bail();

  const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || DEFAULT_RETURN_URL;
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
      success_url: `${returnUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/${PRODUCT_PATH[product]}?lang=${lang}`,
      billing_address_collection: "required",
      allow_promotion_codes: true,
      // Carried into the subscription so the webhook maps it back to our product.
      metadata,
      subscription_data: { metadata },
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
