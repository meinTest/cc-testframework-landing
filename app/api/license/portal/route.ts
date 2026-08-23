import { NextResponse } from "next/server";
import Stripe from "stripe";
import { licenseBillingRef, licenseKeyFromRequest } from "../../tmgmt/lib/entitlement";

// On-demand Stripe billing-portal link for a license (#13). The customer (App or
// Framework via CC_LICENSE_KEY) authenticates with their license key; we resolve
// the Stripe customer from the license's keygen metadata and mint a short-lived,
// customer-scoped portal session. Cancel/update-payment/invoices happen there.
// Never returns customer/subscription ids — only the portal URL.

export const dynamic = "force-dynamic";

const DEFAULT_RETURN_URL = "https://itsbusiness.vercel.app";

export async function POST(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  const ref = await licenseBillingRef(licenseKeyFromRequest(request), dryRun);
  if (ref.kind === "missing") return err(401, "MISSING_KEY", "Missing license key");
  if (ref.kind === "invalid") return err(401, "INVALID", "Invalid license key");
  if (ref.kind === "forbidden")
    return err(403, "FORBIDDEN", "License is not entitled");
  if (ref.kind === "unavailable")
    return err(502, "UNAVAILABLE", "License validation unavailable");

  if (dryRun) {
    return ok({ ok: true, portalUrl: "https://billing.stripe.com/p/session/DRYRUN" });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return err(502, "BILLING_UNAVAILABLE", "Billing is not configured");

  const stripe = new Stripe(secret);
  const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || DEFAULT_RETURN_URL;

  // Prefer the stored customer id; fall back to resolving it from the
  // subscription (covers licenses provisioned before stripeCustomerId existed).
  let customerId = ref.customerId;
  if (!customerId && ref.subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(ref.subscriptionId);
      customerId = sub.customer ? String(sub.customer) : null;
    } catch (e) {
      console.error("[license][portal] subscription lookup failed", e);
    }
  }

  if (!customerId) {
    // Valid license but no subscription (e.g. trial) — nothing to manage.
    return ok({ ok: false, manageable: false, code: "NO_SUBSCRIPTION" });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return ok({ ok: true, portalUrl: session.url });
  } catch (e) {
    // Most likely the Customer Portal isn't enabled/configured in the Stripe
    // dashboard yet (one-time setup).
    console.error("[license][portal] portal session create failed", e);
    return err(502, "PORTAL_UNAVAILABLE", "Could not open the billing portal");
  }
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
