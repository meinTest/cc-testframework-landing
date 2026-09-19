# License device/seat binding (`/api/license` machine activation)

Binds a license to a limited set of devices (#29, TMT#240). One key = one device:
each license allows `maxMachines` machines, and the trial policy's fingerprint
uniqueness prevents a device that already ran a trial from activating a second
trial of the same product (a new key won't bind → won't run).

Machine operations run server-side with the Keygen **admin token**; the client
only ever sends its own license key (Bearer) plus a device fingerprint.

## Required Keygen configuration (not code — set in Keygen)

On the trial (and paid) policies:

- **`maxMachines = 1`** — one device per key. (Paid licenses are already one key
  per seat, so 1 machine/key = 1 device/user.)
- **`machineUniquenessStrategy = UNIQUE_PER_PRODUCT`** — a fingerprint can be
  active on at most one license *per product*. This is what stops a second trial
  on the same device. It **must be per-product, not per-account**: the
  "Professional" plan gives one device a framework trial *and* a tmgmt trial —
  different products, so per-product lets both activate while still blocking a
  second trial of the same product.
- **`overageStrategy = NO_OVERAGE`** (or equivalent) so the limit is hard.

Without these, the proxy still runs but nothing is enforced.

## The device fingerprint

The app sends a **stable, PII-free** fingerprint (e.g. a hash of hostname +
`userData` path + OS machine GUID). Transport: header `X-Device-Fingerprint`
**or** JSON body `{ "fingerprint": "…" }`. Enforcement is a **deterrent**: a
determined user who deliberately changes the fingerprint (VM, OS reinstall,
spoofing) can bypass it; casual re-trials are reliably blocked.

## `POST /api/license/activate`

Binds the calling device to the license. Idempotent — re-activating a known
device just returns `already-active`.

Request: `Authorization: Bearer <key>` + fingerprint (header or body).

| Result | Status | Body |
|---|---|---|
| Bound (new) | `200` | `{ ok: true, status: "activated", machineId, limit, used }` |
| Already bound | `200` | `{ ok: true, status: "already-active", machineId, limit, used }` |
| Seat limit reached | `403` | `{ ok: false, reason: "seat-limit", limit, used }` |
| Device already used a license of this product | `403` | `{ ok: false, reason: "device-already-registered" }` |
| License expired | `403` | `{ ok: false, reason: "expired" }` |
| License suspended | `403` | `{ ok: false, reason: "suspended" }` |
| Missing fingerprint | `400` | `{ ok: false, reason: "missing-fingerprint" }` |
| Missing/invalid key | `401` | `{ ok: false, reason: "invalid" }` |
| Keygen unavailable | `502` | `{ ok: false, reason: "unavailable" }` |

The app should treat anything but `ok: true` as "not activated → do not run",
and show the customer a clear message for `seat-limit` / `device-already-registered`
("license limit reached — free a device in the portal") rather than "invalid".

## `GET /api/license/machines`

The devices currently bound to the calling license (for an in-app / portal
"your devices" view). `Authorization: Bearer <key>`.

```json
{ "ok": true, "limit": 1, "devices": [ { "id": "…", "fingerprint": "…", "name": null, "createdAt": "ISO" } ] }
```

## `DELETE /api/license/machines/<machineId>`

Frees a seat so a reinstall / device change doesn't permanently consume one.
Bearer-scoped and ownership-checked (the machine must belong to the calling
license → otherwise `403`/`404`). Works on an expired license too, so a customer
can still move their seat. Returns `{ ok: true }`.

## Trial → paid upgrade takeover (implemented)

The paid upgrade (#14) issues a **new** license/key. Activating it on a device
that still holds the expired trial's machine (same product) hits the per-product
uniqueness conflict. The activation path handles this automatically:

- On a `device-already-registered` conflict, if the **currently activating
  license is paid** and the conflicting machine belongs to the **same customer
  (email) + same product**, the proxy frees the old machine and re-activates the
  device on the new license.
- **Only paid licenses take over.** A trial activating on a device that already
  ran a trial of the product is **not** taken over → stays blocked. So a customer
  can't dodge trial expiry by requesting a fresh trial, but a paying customer can
  always activate on the device they trialed on.
- A machine belonging to a **different** customer is never touched.

"Same customer" = the normalized (trim + lowercase) `metadata.email` matches, and
`metadata.product` matches; "paid" = the license carries `metadata.subscriptionId`
or `metadata.kind === "paid"` (set by the paid-license provisioning). No extra
Keygen configuration is required for takeover — it uses the admin token to list
the fingerprint's machines, read the owning license, and free the old machine.

## Rollout

Backward-compatible: activation only happens when the app calls
`/api/license/activate` with a fingerprint; the existing `/api/license` and
`/api/license/status` are unchanged. Turn enforcement on by (1) setting the
Keygen policy config above and (2) shipping the app change (TMT#240) that sends
the fingerprint and handles the `seat-limit` / `device-already-registered`
messages.
