import { coerceProduct, offeredProducts } from "../../../../products";
import { CURRENCIES, type Currency } from "../../../../pricing";
import {
  getDisplayPrices,
  hasStripePrices,
  stripeYearlyDiscountPct,
} from "../../../../lib/stripe-pricing";
import { publicJson, publicError, preflight } from "../../../lib/public-http";

// Public, read-only pricing for the CMS. Amounts come from Stripe ONLY (#35):
// there is no in-code fallback. A product with no Stripe price has
// `available:false`; a missing currency/cycle amount is `null`. The CMS must
// render "price unavailable" for null/unavailable rather than a stale number.
//   ?product=TMT       → just that product (default: all offered)
//   ?currency=EUR       → just that currency (default: CHF, EUR, USD)
// Returns whole-unit amounts only — never Stripe price IDs or other internals.

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const offered = offeredProducts();

  // Optional product filter. Accept canonical (FW/TMT) and legacy (cc-*) ids
  // (coerceProduct), but the resolved product must be offered.
  const productParam = params.get("product");
  const requestedProduct = productParam ? coerceProduct(productParam) : null;
  if (productParam && (!requestedProduct || !offered.includes(requestedProduct))) {
    return publicError(
      request,
      404,
      "UNKNOWN_PRODUCT",
      `Unknown or unavailable product: ${productParam}`,
    );
  }
  const currencyParam = params.get("currency")?.toUpperCase();
  if (currencyParam && !CURRENCIES.includes(currencyParam as Currency)) {
    return publicError(
      request,
      400,
      "UNKNOWN_CURRENCY",
      `Unknown currency: ${currencyParam}. Supported: ${CURRENCIES.join(", ")}`,
    );
  }

  const productIds = requestedProduct ? [requestedProduct] : offered;
  const currencies = currencyParam
    ? [currencyParam as Currency]
    : [...CURRENCIES];

  const products: Record<string, unknown> = {};
  for (const id of productIds) {
    const [display, available] = await Promise.all([
      getDisplayPrices(id),
      hasStripePrices(id),
    ]);

    const prices: Record<string, unknown> = {};
    for (const currency of currencies) {
      const row = display[currency];
      prices[currency] = {
        monthly: row.monthly,
        yearly: row.yearly,
        // Convenience for "X / month, billed yearly" copy; null if no yearly price.
        monthlyEquivalent: row.yearly != null ? Math.round(row.yearly / 12) : null,
      };
    }
    // `available` is false when Stripe has no price for this product at all —
    // the CMS should then show "pricing unavailable", not a number (#35).
    products[id] = { available, prices };
  }

  return publicJson(request, {
    yearlyDiscountPct: await stripeYearlyDiscountPct(),
    unit: "per_user_per_month",
    currencies: [...CURRENCIES],
    cycles: ["monthly", "yearly"],
    products,
    generatedAt: new Date().toISOString(),
  });
}
