import { offeredProducts, type ProductId } from "../../../../products";
import { CURRENCIES, YEARLY_DISCOUNT_PCT, type Currency } from "../../../../pricing";
import { getDisplayPrices, getStripePricing } from "../../../../lib/stripe-pricing";
import { publicJson, publicError, preflight } from "../../../lib/public-http";

// Public, read-only pricing for the CMS. Live Stripe amounts where present, else
// the in-code fallback (source flag says which). Optional query params:
//   ?product=cc-tmgmt   → just that product (default: all offered)
//   ?currency=EUR       → just that currency (default: CHF, EUR, USD)
// Returns whole-unit amounts only — never Stripe price IDs or other internals.

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const offered = offeredProducts();

  // Validate optional filters strictly (no silent coercion of unknown values).
  const productParam = params.get("product");
  if (productParam && !offered.includes(productParam as ProductId)) {
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

  const productIds = productParam ? [productParam as ProductId] : offered;
  const currencies = currencyParam
    ? [currencyParam as Currency]
    : [...CURRENCIES];

  const products: Record<string, unknown> = {};
  for (const id of productIds) {
    const [display, stripe] = await Promise.all([
      getDisplayPrices(id),
      getStripePricing(id),
    ]);
    // Product-level source flag: "stripe" if any Stripe price backs this
    // product, else the in-code fallback config.
    const source = Object.keys(stripe).length > 0 ? "stripe" : "fallback";

    const prices: Record<string, unknown> = {};
    for (const currency of currencies) {
      const row = display[currency];
      prices[currency] = {
        monthly: row.monthly,
        yearly: row.yearly,
        // Convenience for "X / month, billed yearly" copy.
        monthlyEquivalent: Math.round(row.yearly / 12),
      };
    }
    products[id] = { source, prices };
  }

  return publicJson(request, {
    yearlyDiscountPct: YEARLY_DISCOUNT_PCT,
    unit: "per_user_per_month",
    currencies: [...CURRENCIES],
    cycles: ["monthly", "yearly"],
    products,
    generatedAt: new Date().toISOString(),
  });
}
