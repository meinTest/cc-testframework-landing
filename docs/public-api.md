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

## `POST /api/public/v1/signup`

Runs the **open self-serve trial registration** from the CMS's own form, so the
marketing site can host the signup UI (full name, business email, company)
instead of deep-linking to `/signup`. On success the trial license is provisioned
and the welcome email is sent — exactly as the on-site form does — and the
endpoint returns `200 { ok: true }`.

This endpoint only runs the **open** path: it never accepts a sales token, so a
**sales-vetted** product returns `401` (use the demo-request deep-link instead —
the products endpoint's `cta.kind` tells you which flow applies). It is
CORS-locked to `PUBLIC_API_ALLOWED_ORIGINS`.

### Request

`Content-Type: application/json`

```json
{
  "name": "Jane Doe",
  "email": "jane@acme.example",
  "company": "Acme AG",
  "plan": "professional",
  "cycle": "yearly"
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Full name. |
| `email` | yes | Business email (basic format check). |
| `company` | yes | Company name. |
| `plan` | no* | Marketing plan (box) — see the table below. Provisions one trial per product in the plan and sends each product's welcome mail. |
| `product` | no* | Single product (`cc-testframework` \| `cc-tmgmt`), for the one-product case. Defaults to `cc-testframework`. Ignored when `plan` is set. |
| `cycle` | no | `monthly` \| `yearly` — the customer's preference from the box, stored on the license so the later trial→paid upgrade pre-selects it. No charge now. |
| `currency` | no | `CHF` \| `EUR` \| `USD` — same, stored as a preference. |

*Send either `plan` (preferred, for the pricing boxes) or `product`. With neither, it defaults to the framework.

### Plans (which products a box delivers)

| `plan` | Delivers | Welcome mail(s) |
|---|---|---|
| `starter-framework` | CC-Testframework | Framework (npm setup) |
| `starter-tmt` | CC Test Management | TMT (app download + access code) |
| `professional` | both | both |

A trial is free — `cycle`/`currency` are only a stored preference for the later
paid upgrade (done in-app), which is where any price applies. "Professional"
provisions a separate license per product (two keys, two mails); a partial
provisioning failure rolls back and returns `500`.

### Example

```bash
# Professional box, yearly preference
curl -X POST https://app.itsbusiness.ch/api/public/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@acme.example","company":"Acme AG","plan":"professional","cycle":"yearly"}'
```

```json
{ "ok": true, "message": "Trial activated. Check your email for your setup instructions for CC Test Management and CC-Testframework." }
```

### Responses

| Status | Body | When |
|---|---|---|
| `200` | `{ ok: true, message }` | Trial provisioned; welcome email sent. |
| `400` | `{ ok: false, message }` | Missing field / invalid email / invalid JSON. |
| `401` | `{ ok: false, message }` | Product is sales-vetted → use `/demo-request`. |
| `503` | `{ ok: false, message }` | Signup is currently disabled (`SIGNUP_ENABLED`). |
| `500` | `{ ok: false, message }` | License provisioning failed. |

All responses carry the CORS headers (for an allowlisted origin) and
`Cache-Control: no-store`. The welcome email delivery is best-effort — a `200`
means the license was provisioned; an email hiccup is logged, not surfaced.

> Note: this creates real trial licenses and sends email. It is no more exposed
> than the on-site `/api/signup` (which is already public), but consider adding
> rate-limiting / a CAPTCHA on the CMS form if abuse becomes a concern.

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
