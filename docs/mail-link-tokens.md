# Mail-link tokens (#37)

Customer-facing links we put in mails and portal returns no longer carry the raw
license key in the URL (`?key=…`). They carry a short-lived, opaque **token**
(`?t=…`) that our proxy redeems back into the key.

## Why

The license key is a long-lived standing credential (it gates npm, the update
feed, the billing portal and license status). In a URL it is captured by
infrastructure the customer doesn't control: platform/CDN access logs (Vercel),
corporate mail-scanning proxies, and especially URL-detonation security products
(Microsoft Defender Safe Links, Proofpoint) that **auto-GET every link in an
email**. Keeping the key out of the URL shrinks that leak surface. (The key is
still in the mail *body* — the customer needs it to configure npm / activate the
app — but a body value isn't auto-logged by infrastructure the way a URL is.)

## How

`app/api/license/lib/link-token.ts`:

- The key is **AES-256-GCM encrypted** into the token (not merely signed), so the
  token is opaque — reading it from a log reveals nothing.
- The token carries a **`purpose`** (`portal` | `download` | `add-product` |
  `account`) so a link minted for one action can't be replayed for another, and
  an **`exp`** (default 7 days for mailed links; 24 h for the in-session links the
  portal return and the `/account` page mint themselves). Both are authenticated
  by the GCM tag.
- **Stateless** — no server store. Secret: `LICENSE_LINK_SECRET`, falling back to
  `SALES_API_KEY`.

> **Not single-use.** A strict one-time token would be burned by mail-scanner
> pre-fetch before the human clicks, breaking the link. Tokens are *expiring*,
> not single-use.

Redeemers accept the token via `?t=` and still accept the legacy `?key=` (and the
app's `Authorization: Bearer`): `/api/license/portal`, `/api/license/add-product`,
`/api/tmgmt/download`, and the `/account` page. Links we generate — welcome mails
(`perform.ts`, `resend.ts`), the portal's return URL, and the `/account` buttons —
now emit `?t=`.

## Clients (TMT / FW apps)

**No change required.** These tokens wrap links *we* generate and *we* redeem; the
apps never build them. The app keeps using its license key directly:

- TMT update feed → `GET /api/tmgmt/updates/…` with `Authorization: Bearer <key>` — unchanged.
- "Manage billing" → `POST /api/license/portal` with the key — unchanged (the POST path is untouched).
- npm install (FW key) → `Authorization: Bearer <key>` — unchanged.
- Any in-app link the app opens in a browser with `?key=` (e.g. the add-product
  link from #39) keeps working via the retained `?key=` path. Optional: the app
  could request a token from us for those if it wants the same hardening — not
  needed now.
