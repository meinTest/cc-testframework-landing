# Stripe-native trial (Variante A)

A signup puts the customer **in Stripe from minute one** — a Stripe customer plus
a **card-less trialing subscription** — and lets them self-convert to paid by
adding a payment method in the billing portal. The Keygen license (what the app
validates) mirrors the subscription. No card is asked for at signup.

This is **opt-in** behind a flag. When off (default), the classic card-less
**Keygen** trial is used and nothing changes.

## Flow

1. **Signup** (`/api/public/v1/signup` or `/api/signup`): we create one Stripe
   **customer** and **one trialing subscription per product** (no payment method,
   `trial_period_days` = the sales-chosen/default trial length,
   `trial_settings.end_behavior.missing_payment_method = "cancel"`). A
   single-product plan is one subscription; "Professional" is **two independent
   subscriptions** (FW + TMT), so each product can be managed and cancelled on
   its own in the Customer Portal (#39 — the portal cannot add/remove one product
   from a shared subscription). Each subscription's single line item has
   `quantity` = that product's **seat count** (#39). Keygen licenses mirror the
   subscription (expiry = trial end, `subscriptionId` in metadata):
   **Framework** → ONE floating key with `maxMachines` = seats (#41);
   **Verify Test Management** → one device-bound key per seat. The welcome
   mail(s) go out with the keys — a single-product trial sends that product's
   mail (all seat codes in one mail); "Professional" sends **one combined** mail
   (Framework key + all TMT codes, #42). Provisioning is atomic — a partial
   failure cancels every created subscription and deletes the created licenses.
2. **Convert** — the app/portal shows "manage subscription" from day one (the
   license already has a `subscriptionId`, so `billing.manageable` is true). The
   customer adds a card in the **billing portal** (`/api/license/portal`, #13);
   when the trial ends Stripe charges it and the subscription becomes `active`.
3. **Webhook keeps the license in sync** (`/api/stripe/webhook`):
   `customer.subscription.updated` → expiry follows `current_period_end`
   (trial end during trial, paid period after conversion); a `canceled` /
   `unpaid` subscription (card-less trial that ended, or failed payment) →
   the license is **suspended**; `customer.subscription.deleted` → suspended.

## Enabling it

Set `STRIPE_TRIAL_ENABLED=true` — **only after** the Stripe setup below. Leave it
unset/`false` to keep the classic Keygen trial.

## Stripe configuration (do this first)

1. **Products** — one per app product, each with metadata `app_product` =
   `cc-tmgmt` / `cc-testframework`.
2. **Prices** — recurring, per currency (CHF/EUR/USD) × cycle (monthly/yearly).
   The trial length is set by us on the subscription (`trial_period_days`), not on
   the price — no per-price trial config needed.
3. **Customer portal** (Settings → Billing → Customer portal): enable it and allow
   customers to **add/update a payment method** (that is how they convert). For
   self-serve seat changes (#39) also enable **"Customers can update quantities"**
   (and list the subscription products as updatable) — the webhook then reconciles
   the new quantity (FW `maxMachines`, TMT add/suspend per-seat keys). Leave it off
   to keep seat changes sales-handled.
4. **Webhook** → `https://app.itsbusiness.ch/api/stripe/webhook`, events
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`; set `STRIPE_WEBHOOK_SECRET`.
5. **Stripe emails** (optional but recommended): enable the trial-ending reminder
   and failed-payment (dunning) emails — Stripe then handles those, no cron needed.
6. **Env** (Vercel): `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PORTAL_RETURN_URL`, the Keygen paid policies
   (`KEYGEN_PAID_POLICY_ID` / `KEYGEN_TMGMT_PAID_POLICY_ID`), and finally
   `STRIPE_TRIAL_ENABLED=true`.

## Adding the other product during a trial (#39)

A single-product trial's welcome mail carries an **"add the other product"** link
(`/api/license/add-product?product=<other>&key=<license>`). It resolves the
customer's existing Stripe customer from the license key and opens a Stripe-hosted
**card-less trial Checkout** bound to that customer (`payment_method_collection:
if_required`, `subscription_data.trial_period_days`, `missing_payment_method:
cancel`) — so the added product starts its **own trialing subscription on the same
customer** and appears in the one Customer Portal next to the first. No card is
asked for; a card already on file converts it seamlessly at trial end. The webhook
(`checkout.session.completed` → reconcile) provisions the Keygen license(s) and
mails the key(s), exactly like a signup trial. The endpoint is idempotent — if the
customer already has a (non-dead) subscription for that product it redirects to the
portal instead of opening a second one.

> **Changing seats during a trial:** by Stripe default, *any* subscription change a
> customer makes in the Customer Portal **ends the trial and invoices immediately**.
> To let seat/quantity changes keep the trial running, set
> `features.subscription_update.trial_update_behavior = "continue_trial"` (API
> `2025-09-30.clover`+) on the DEFAULT portal configuration, enable `subscription_update`
> with `default_allowed_updates: ["quantity"]` (no `"price"` → no plan switching) and
> list the products with `adjustable_quantity`.
>
> Gotchas: (1) the API **requires a non-empty `products` list** when
> `subscription_update` is enabled, even for quantity-only (the Dashboard allows it
> empty, the API does not). (2) **Saving the portal settings in the Dashboard — or
> switching the portal version — resets `trial_update_behavior` back to `end_trial`**,
> so re-apply it via the API afterwards. There is no Dashboard toggle for it.

## Framework customers

Same model, no special case: a framework signup also creates a trialing
subscription and gets a **portal link** — so a framework customer (who has no
desktop app) converts by adding a card in the portal, exactly like the app
customer. No separate `/upgrade` page needed.

> Follow-up worth considering: put the **portal link** into the framework welcome
> mail (and/or rely on Stripe's trial-ending email), so a framework customer knows
> where to add their card.

## What stays / what's retired when on

- The card-less **Keygen-only** trial path is bypassed (kept for `false`).
- The separate trial→paid **upgrade checkout** (`/api/license/checkout`, #14) and
  the **cron trial reminder** are not needed for this model (conversion is the
  portal; reminders are Stripe's). They remain for the classic path / legacy
  licenses until migrated.
