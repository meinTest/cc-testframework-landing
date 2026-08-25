import { NextResponse } from "next/server";
import Stripe from "stripe";
import { licenseCheckoutInfo, licenseKeyFromRequest } from "../../tmgmt/lib/entitlement";
import { getStripePricing } from "../../../lib/stripe-pricing";
import { CURRENCIES, type BillingCycle, type Currency } from "../../../pricing";
import { purchasesEnabled } from "../../../flags";

// Trial→Paid upgrade (#14). The customer (TMT) picks currency/cycle/seats from
// /api/license/plans and POSTs them here with their license key; we create a
// Stripe Checkout session for that price. On completion the existing webhook
// provisions a fresh paid license/key (chosen "variant Y" — no in-place
// conversion). Never returns customer/subscription ids — only the checkout URL.

export const dynamic = "force-dynamic";

const DEFAULT_RETURN_URL = "https://itsbusiness.vercel.app";

export async function POST(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  // Purchase kill-switch (PURCHASE_ENABLED=false).
  if (!purchasesEnabled()) {
    return err(503, "PURCHASE_DISABLED", "Dienst vorübergehend nicht verfügbar.");
  }

  const info = await licenseCheckoutInfo(licenseKeyFromRequest(request), dryRun);
  if (info.kind === "missing") return err(401, "MISSING_KEY", "Missing license key");
  if (info.kind === "invalid") return err(401, "INVALID", "Invalid license key");
  if (info.kind === "forbidden")
    return err(403, "FORBIDDEN", "License is not entitled");
  if (info.kind === "unavailable")
    return err(502, "UNAVAILABLE", "License validation unavailable");

  if (info.manageable) return ok({ ok: false, code: "ALREADY_SUBSCRIBED" });
  if (!info.upgradeable) return ok({ ok: false, code: "NOT_UPGRADEABLE" });

  // Customer's selection (defaults: monthly / CHF / 1 seat).
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    /* empty body → defaults */
  }
  const cycle: BillingCycle = payload?.cycle === "yearly" ? "yearly" : "monthly";
  const currencyRaw = String(payload?.currency ?? "CHF").toUpperCase();
  const currency = (
    CURRENCIES.includes(currencyRaw as Currency) ? currencyRaw : "CHF"
  ) as Currency;
  const seats = clampSeats(payload?.seats);

  if (dryRun) {
    return ok({ ok: true, checkoutUrl: "https://checkout.stripe.com/c/pay/DRYRUN" });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return err(502, "BILLING_UNAVAILABLE", "Billing is not configured");

  const priceId = (await getStripePricing(info.product))[currency]?.[cycle]?.priceId;
  if (!priceId) {
    return err(400, "PRICE_UNAVAILABLE", "No price for that product/currency/cycle");
  }

  const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || DEFAULT_RETURN_URL;
  try {
    const stripe = new Stripe(secret);
    const metadata = { app_product: info.product, upgrade_license_id: info.licenseId };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: seats,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: 999 },
        },
      ],
      success_url: `${returnUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnUrl,
      billing_address_collection: "required",
      allow_promotion_codes: true,
      ...(info.email ? { customer_email: info.email } : {}),
      metadata,
      subscription_data: { metadata },
    });
    return ok({ ok: true, checkoutUrl: session.url });
  } catch (e) {
    console.error("[license][checkout] session create failed", e);
    return err(502, "CHECKOUT_UNAVAILABLE", "Could not start checkout");
  }
}

function clampSeats(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 999);
}

function ok(payload: unknown) {
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

function err(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, code, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
