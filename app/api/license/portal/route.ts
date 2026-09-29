import { NextResponse } from "next/server";
import Stripe from "stripe";
import { licenseBillingRef, licenseKeyFromRequest } from "../../tmgmt/lib/entitlement";

// On-demand Stripe billing-portal link for a license (#13). The customer (App or
// Framework via CC_LICENSE_KEY) authenticates with their license key; we resolve
// the Stripe customer from the license's keygen metadata and mint a short-lived,
// customer-scoped portal session. Cancel/update-payment/invoices happen there.
// Never returns customer/subscription ids — only the portal URL.
//
// POST → JSON { portalUrl } (used by the app). GET ?key=<license> → 303 redirect
// straight to the portal (so the welcome-mail "add a card" link is clickable; a
// mail can't POST). #34.

export const dynamic = "force-dynamic";

const DEFAULT_RETURN_URL = "https://itsbusiness.vercel.app";

type PortalResult =
  | { ok: true; url: string }
  | { ok: false; status: number; code: string; message: string; manageable?: boolean };

async function resolvePortal(licenseKey: string, dryRun: boolean): Promise<PortalResult> {
  const ref = await licenseBillingRef(licenseKey, dryRun);
  if (ref.kind === "missing") return { ok: false, status: 401, code: "MISSING_KEY", message: "Missing license key" };
  if (ref.kind === "invalid") return { ok: false, status: 401, code: "INVALID", message: "Invalid license key" };
  if (ref.kind === "forbidden") return { ok: false, status: 403, code: "FORBIDDEN", message: "License is not entitled" };
  if (ref.kind === "unavailable") return { ok: false, status: 502, code: "UNAVAILABLE", message: "License validation unavailable" };

  if (dryRun) return { ok: true, url: "https://billing.stripe.com/p/session/DRYRUN" };

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return { ok: false, status: 502, code: "BILLING_UNAVAILABLE", message: "Billing is not configured" };

  const stripe = new Stripe(secret);
  const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || DEFAULT_RETURN_URL;

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
    return { ok: false, status: 200, code: "NO_SUBSCRIPTION", message: "No subscription to manage", manageable: false };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[license][portal] portal session create failed", e);
    return { ok: false, status: 502, code: "PORTAL_UNAVAILABLE", message: "Could not open the billing portal" };
  }
}

export async function POST(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";
  const r = await resolvePortal(licenseKeyFromRequest(request), dryRun);
  if (r.ok) return ok({ ok: true, portalUrl: r.url });
  if (r.code === "NO_SUBSCRIPTION") return ok({ ok: false, manageable: false, code: r.code });
  return err(r.status, r.code, r.message);
}

// Clickable entry for the welcome-mail link. Redirects to the portal; on any
// problem redirects to the neutral "unavailable" page rather than leaking a code.
export async function GET(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "de";
  const origin = `${url.protocol}//${url.host}`;

  const r = await resolvePortal(licenseKeyFromRequest(request), dryRun);
  // no-referrer so the ?key= never leaks to the Stripe host via the Referer header.
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const target = r.ok ? r.url : `${origin}/unavailable?lang=${lang}`;
  return NextResponse.redirect(target, { status: 303, headers });
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
