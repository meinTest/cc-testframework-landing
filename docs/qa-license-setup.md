# Setting up a QA (internal) license

A **QA license** is a normal license that is allowed to see internal
**release candidates** in addition to the customer releases. It is marked by a
single piece of metadata:

```
metadata.channel = "qa"
```

That one marker unlocks both QA channels:

- **cc-tmgmt app:** the QA update feed `/api/tmgmt/updates/qa/…` and
  `/api/tmgmt/download?channel=qa` (the "CC Test Management QA" app).
- **Framework (npm):** pre-release / `rc` versions of `@meintest/*` via the
  npm proxy (`npm i @meintest/cc-testframework@rc`).

A QA license is **not** a separate license type: it is any valid, entitled
license with `channel = "qa"` added. The same key keeps working on the normal
customer channels too.

## Set it (Keygen)

Use an existing internal tester's license, or create a fresh one on the normal
cc-tmgmt policy — then add the metadata.

### Option A — Keygen dashboard (recommended)

1. Open the license in the Keygen dashboard.
2. Edit **Metadata** and add a key/value: `channel` = `qa`.
3. Save.

### Option B — Keygen API

`PATCH` the license's metadata with your **admin token**:

```bash
curl -X PATCH "https://api.keygen.sh/v1/accounts/$KEYGEN_ACCOUNT_ID/licenses/<LICENSE_ID>" \
  -H "Authorization: Bearer $KEYGEN_ADMIN_TOKEN" \
  -H "Content-Type: application/vnd.api+json" \
  -H "Accept: application/vnd.api+json" \
  -d '{ "data": { "type": "licenses", "attributes": { "metadata": { "channel": "qa" } } } }'
```

> ⚠️ Keygen **replaces** the whole `metadata` object on update — include any
> existing metadata fields (e.g. `product`, `email`, `company`) in the same call,
> or edit in the dashboard which changes it in place.

## Verify

With the QA license key:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <QA_LICENSE_KEY>" \
  https://app.itsbusiness.ch/api/tmgmt/updates/qa/qa.yml
```

- **QA license** → `200` (the qa.yml is served).
- **Normal customer license** → `403 {"error":"qa-channel-not-entitled"}`.
- **No key** → `401`.

For the framework, a QA license sees the pre-release in
`npm view @meintest/cc-testframework versions`; a customer license does not.

## Revoke

Remove the `channel` metadata (or set it to anything other than `"qa"`). Access
to both QA channels stops immediately (allow up to ~5 min for the entitlement
cache to expire); the license keeps working on the customer channels.

## Notes

- `channel = "qa"` is the **only** marker — there is no policy/name fallback.
- Never put a real customer license on `channel = "qa"` — it would expose
  candidates to that customer.
- Full contract: see [`qa-channel.md`](./qa-channel.md).
