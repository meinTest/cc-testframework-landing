import { NextResponse } from "next/server";
import { licenseCheckoutInfo, licenseKeyFromRequest } from "../../tmgmt/lib/entitlement";
import { getDisplayPrices } from "../../../lib/stripe-pricing";
import { CURRENCIES } from "../../../pricing";

// Upgrade plan options for the presented license (#14). The client (TMT) renders
// these, the user picks currency/cycle/seats, and POSTs the choice to
// /api/license/checkout. Prices come from Stripe (getDisplayPrices), so sales
// controls them; auth is the same Bearer <license-key>.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const dryRun = process.env.DRY_RUN === "true";

  const info = await licenseCheckoutInfo(licenseKeyFromRequest(request), dryRun);
  if (info.kind === "missing") return err(401, "MISSING_KEY", "Missing license key");
  if (info.kind === "invalid") return err(401, "INVALID", "Invalid license key");
  if (info.kind === "forbidden")
    return err(403, "FORBIDDEN", "License is not entitled");
  if (info.kind === "unavailable")
    return err(502, "UNAVAILABLE", "License validation unavailable");

  const prices = await getDisplayPrices(info.product);
  return ok({
    ok: true,
    product: info.product,
    currencies: CURRENCIES,
    cycles: ["monthly", "yearly"],
    prices, // { CHF: { monthly, yearly }, EUR: {…}, USD: {…} }
    manageable: info.manageable,
    upgradeable: info.upgradeable,
  });
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
