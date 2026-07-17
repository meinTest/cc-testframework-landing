import { NextResponse } from "next/server";
import Stripe from "stripe";
import { resolveProduct, type ProductId } from "../../products";
import { getStripePricing } from "../../lib/stripe-pricing";
import { CURRENCIES, type BillingCycle, type Currency } from "../../pricing";

// Subscription checkout: the "Abo starten" button links here with
// ?product=&cycle=&currency=. We resolve the Stripe Price for that combination,
// create a Checkout Session (subscription mode, adjustable seat quantity) and
// redirect to it. If Stripe isn't configured or the price is missing, we fall
// back to the sales/demo flow so the button always works.

export const dynamic = "force-dynamic";

// App product → pricing-page route segment (for the cancel URL).
const PRICING_PATH: Record<ProductId, string> = {
  "cc-testframework": "cc-testframework",
  "cc-tmgmt": "cc-testmanagement",
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const product = resolveProduct(params.get("product"));
  const cycle: BillingCycle = params.get("cycle") === "yearly" ? "yearly" : "monthly";
  const currencyRaw = (params.get("currency") ?? "CHF").toUpperCase();
  const currency = (
    CURRENCIES.includes(currencyRaw as Currency) ? currencyRaw : "CHF"
  ) as Currency;

  const origin = originFromRequest(request);
  const salesFallback = `${origin}/demo-request?product=${product}&plan=subscription`;

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.redirect(salesFallback, 303);

  const priceId = (await getStripePricing(product))[currency]?.[cycle]?.priceId;
  if (!priceId) return NextResponse.redirect(salesFallback, 303);

  try {
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: 999 },
        },
      ],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/${PRICING_PATH[product]}/pricing`,
      billing_address_collection: "required",
      allow_promotion_codes: true,
      // Carried into the subscription so the webhook can map back to our product.
      metadata: { app_product: product },
      subscription_data: { metadata: { app_product: product } },
    });

    return NextResponse.redirect(session.url ?? salesFallback, 303);
  } catch (err) {
    console.error("[checkout] session create failed", err);
    return NextResponse.redirect(salesFallback, 303);
  }
}

function originFromRequest(request: Request): string {
  const explicit = process.env.LANDING_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
