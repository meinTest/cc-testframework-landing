# Public CMS API (`/api/public/v1/*`)

A public, **read-only** API that lets the company marketing website (its CMS)
render our product boxes and live pricing while keeping full control of layout
and copy. The CMS owns presentation; this API delivers **facts + action links**.

- **No auth, no secrets.** Never returns Stripe price IDs or any internal id.
- **No marketing copy.** Headlines, feature bullets and images live in the CMS.
  The API returns only the canonical product name, page slug, pricing numbers
  and the resolved CTA deep-links.
- **Catalog is not self-serve.** The set of products is code-driven on purpose.
  New boxes/products are set up by the app team on request — Marketing does not
  add products via Stripe. Price **amounts** for existing products, however, are
  maintained in Stripe and picked up automatically (see [Pricing source](#pricing-source)).
- **Base URL:** `https://app.itsbusiness.ch`
- **Versioned:** the `/v1/` prefix is stable; breaking changes ship as `/v2/`.

## CORS

Cross-origin browser access is limited to an explicit allowlist, configured via
the `PUBLIC_API_ALLOWED_ORIGINS` env var (comma-separated exact origins). When a
request's `Origin` is allowlisted the API echoes it in
`Access-Control-Allow-Origin`; otherwise no CORS header is sent. `OPTIONS`
preflight returns `204`. Server-to-server calls (no `Origin`) are unaffected.

## Caching

`GET` responses send `Cache-Control: public, max-age=300, stale-while-revalidate=600`
(5 min fresh, 10 min stale-while-revalidate), matching the in-process pricing
cache. Error responses are `no-store`.

---

## `GET /api/public/v1/products`

The offered products with their canonical name, page slug and primary CTA.

The CTA is resolved server-side from the sales-vetted gate:
- `kind: "trial"` → self-serve trial at `/signup` (product is not sales-vetted).
- `kind: "demo"` → sales-gated demo request at `/demo-request`.

Take the CTA URL from `cta.url` rather than building it yourself — that way it
stays correct if the vetting mode is flipped.

### Example

```bash
curl https://app.itsbusiness.ch/api/public/v1/products
```

```json
{
  "products": [
    {
      "id": "cc-testframework",
      "name": "CC-Testframework",
      "slug": "cc-testframework",
      "offered": true,
      "cta": {
        "kind": "trial",
        "url": "https://app.itsbusiness.ch/signup?product=cc-testframework"
      },
      "pricingUrl": "https://app.itsbusiness.ch/cc-testframework/pricing"
    },
    {
      "id": "cc-tmgmt",
      "name": "CC Test Management",
      "slug": "cc-testmanagement",
      "offered": true,
      "cta": {
        "kind": "demo",
        "url": "https://app.itsbusiness.ch/demo-request?product=cc-tmgmt&plan=subscription"
      },
      "pricingUrl": "https://app.itsbusiness.ch/cc-testmanagement/pricing"
    }
  ],
  "generatedAt": "2026-09-15T10:00:00.000Z"
}
```

### Fields

| Field | Type | Notes |
|---|---|---|
| `products[].id` | string | Stable product id: `cc-testframework` \| `cc-tmgmt`. |
| `products[].name` | string | Canonical marketing name (display copy is the CMS's). |
| `products[].slug` | string | URL segment of the product's app pages. |
| `products[].offered` | boolean | Always `true` here (only offered products are listed). |
| `products[].cta.kind` | string | `trial` or `demo`. |
| `products[].cta.url` | string | Absolute deep-link for the primary CTA. |
| `products[].pricingUrl` | string | Absolute link to the product's pricing page. |
| `generatedAt` | string | ISO timestamp the response was built. |

---

## `GET /api/public/v1/pricing`

Live subscription pricing. Amounts are whole units per user/month (and the
discounted yearly total). Currencies: `CHF`, `EUR`, `USD`. Cycles: `monthly`,
`yearly`.

### Query parameters

| Param | Values | Default |
|---|---|---|
| `product` | `cc-testframework` \| `cc-tmgmt` | all offered products |
| `currency` | `CHF` \| `EUR` \| `USD` (case-insensitive) | all currencies |

### Example

```bash
curl "https://app.itsbusiness.ch/api/public/v1/pricing?product=cc-tmgmt&currency=EUR"
```

```json
{
  "yearlyDiscountPct": 10,
  "unit": "per_user_per_month",
  "currencies": ["CHF", "EUR", "USD"],
  "cycles": ["monthly", "yearly"],
  "products": {
    "cc-tmgmt": {
      "source": "stripe",
      "prices": {
        "EUR": { "monthly": 47, "yearly": 510, "monthlyEquivalent": 43 }
      }
    }
  },
  "generatedAt": "2026-09-15T10:00:00.000Z"
}
```

### Fields

| Field | Type | Notes |
|---|---|---|
| `yearlyDiscountPct` | number | Discount on the annual total, e.g. `10`. |
| `unit` | string | `per_user_per_month` (render your own label). |
| `currencies` / `cycles` | string[] | Supported sets, for building toggles. |
| `products[id].source` | string | `stripe` (live) or `fallback` (in-code default). |
| `products[id].prices[cur].monthly` | number | Monthly price per user. |
| `products[id].prices[cur].yearly` | number | Discounted annual total per user. |
| `products[id].prices[cur].monthlyEquivalent` | number | `yearly / 12` rounded — for "X / month, billed yearly". |
| `generatedAt` | string | ISO timestamp. |

### Pricing source

Amounts come from Stripe when a matching Stripe Price exists for the product
(`source: "stripe"`); otherwise the in-code default config is served
(`source: "fallback"`). Marketing maintains the amounts in Stripe — no code
change needed for a price change on an existing product.

---

## Action deep-links (documented; not JSON endpoints)

The CMS links these behind buttons — they are pages/redirects, **not** `fetch`
targets. Prefer taking the primary CTA from the products endpoint's `cta.url`.

| Action | URL | Behaviour |
|---|---|---|
| Trial (self-serve) | `…/signup?product=<id>&lang=<de\|en>` | Only when `cta.kind === "trial"`. |
| Demo / Sales | `…/demo-request?product=<id>&plan=subscription&lang=<de\|en>` | Sales-handled form. |
| Checkout (subscription) | `…/api/checkout?product=<id>&cycle=<monthly\|yearly>&currency=<CHF\|EUR\|USD>&lang=<de\|en>` | `303` → Stripe Checkout; auto-falls back to `/demo-request` or `/unavailable`. |

---

## Errors

Error responses use `{ "error": { "code": "...", "message": "..." } }` with a
matching HTTP status and `Cache-Control: no-store`.

| Status | Code | When |
|---|---|---|
| `404` | `UNKNOWN_PRODUCT` | `product` is not a known/offered product. |
| `400` | `UNKNOWN_CURRENCY` | `currency` is not one of `CHF`, `EUR`, `USD`. |

The pricing endpoint never hard-fails on missing Stripe data — it serves the
fallback config instead, so the marketing page always has numbers.

---

## Adding a new product box

Not self-serve by design. To add a box, tell the app team; setup involves:
a product entry in the code catalog, a Keygen license policy (trial + paid),
the entitlement definition (what the product unlocks), the Stripe product +
prices (with `app_product` metadata), and the CMS page. See the code catalog in
`app/products.ts`.

---

## Tests

Integration tests for both endpoints live in `tests/api/` and run with
`npm test` (Node's built-in test runner via `tsx`, no network needed).
