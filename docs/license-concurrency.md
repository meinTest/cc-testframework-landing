# Floating concurrency for the Framework license (lease + heartbeat)

## Goal

Stop one framework license from being used by many parallel agents/CI runs at
once ("1 license → 20 agents"). Enforce **at most N test runs active at the same
time** (N = concurrency limit; start with **1**). The framework runs in ephemeral
CI/dev — fingerprints change every run — so permanent device binding (like the
TMT app, #29) won't work. Use Keygen **machine leases + heartbeats** (floating
license), not fixed device binding.

## Model

- **Run start → acquire a lease:** the framework activates a Keygen machine with
  a **per-process random fingerprint** (a lease id, not a device id).
- **During the run → heartbeat:** the framework pings periodically so the lease
  stays alive.
- **Run end → release:** the framework deactivates the machine. A crash (no
  release) → Keygen auto-culls the dead machine after `heartbeatDuration` → the
  seat frees itself.
- **Enforcement:** if N machines are already alive, the (N+1)th activation is
  refused (`seat-limit`) → the run fails with a clear message. When one finishes
  (or its lease expires), the next can start.

So: 1 concurrent run per license by default; 20 parallel agents → 19 are blocked
until a slot frees.

## Keygen policy config (on the FRAMEWORK policy) — your part

- `maxMachines = 1` — the concurrency limit. (Later: set per-license to the
  purchased seat count → N parallel runs.)
- `requireHeartbeat = true`
- `heartbeatDuration = 120` (seconds) — also the max time a crashed run holds a seat.
- `heartbeatCullStrategy = DEACTIVATE_DEAD` — auto-remove dead machines.
- `machineUniquenessStrategy = UNIQUE_PER_LICENSE`
- `overageStrategy = NO_OVERAGE`

## ⚠️ Critical interaction: install must NOT consume a seat

With `requireHeartbeat`/`maxMachines` on the framework policy, an **unscoped**
`validate-key` returns `NO_MACHINES` (i.e. `meta.valid !== true`) whenever no
machine is active. Today the **npm proxy** (`/api/tmgmt/npm`), `/api/license/status`
and the feedback gate treat `valid !== true` as **not entitled** — so installing
`@meintest/cc-testframework` (and status/feedback) would **break** for a license
with no active run.

Installing ≠ running — install must not consume a concurrency seat. So the
entitlement check is **tolerant of `NO_MACHINE`/`NO_MACHINES`**: the license is
treated as entitled for install/status/feedback (it's a valid license that simply
has no live lease right now). **Only the run-time lease (activate + heartbeat)
enforces concurrency.**

**Implemented (#47):** `isEffectivelyValid()` in `app/api/tmgmt/lib/entitlement.ts`
returns true for `valid` OR `NO_MACHINE`/`NO_MACHINES` (but not EXPIRED/
SUSPENDED/BANNED/NOT_FOUND). It gates `checkEntitlement` (npm broker, feedback),
`licenseStatus`/`describeLicense` (status), the QA-channel verdict and the
billing/checkout lookups. The raw Keygen `valid` flag is still reported verbatim
on `/license/status`; `entitled` is what tolerates the dormant lease.

## Proxy endpoints (this repo)

- **Acquire** — `POST /api/license/activate` (exists, #29): send a per-run
  fingerprint + optional name (CI job / hostname) for visibility. `403 seat-limit`
  = concurrency reached. Keep the returned `machineId`.
- **Heartbeat** — **NEW** `POST /api/license/machines/<machineId>/ping`
  (Bearer-scoped, ownership-checked) → Keygen `ping-heartbeat` action. `200` =
  lease extended; `404` = lease already gone (re-activate or stop).
- **Release** — `DELETE /api/license/machines/<machineId>` (exists, #29).

## Framework runtime (repo `cc-testframework`)

- On run start: generate a run UUID → `activate`. On `seat-limit` → **fail the run**
  with "license limit reached — N concurrent runs in use". Store the `machineId`.
- Start a heartbeat timer (~`heartbeatDuration / 2`, e.g. every 60 s).
- On run end (success/fail/signal/exit): `release` (DELETE). Register process-exit
  handlers so a normal stop frees the seat immediately.
- Must reach the proxy — define the **offline/air-gapped** behaviour (fail closed
  vs. a grace allowance). Product decision.

## Caveats (honest)

- **Deterrent, not airtight:** the framework is a locally-run npm package; a
  determined user can patch out the lease code. It reliably stops honest misuse
  ("1 key for 20 agents") but is not cryptographically hard.
- **Crash window:** a crashed run holds a seat for up to `heartbeatDuration`
  (keep it short, 60–120 s).
- **Offline runs:** need the grace policy above.

## Limit = 1 vs. purchased seats

Start with `maxMachines = 1` (addresses the abuse now). **Implemented (#41):** the
limit is driven by the subscription's seat count — provisioning sets the FW
license's per-license `maxMachines` to the purchased `quantity` (one floating
key), and a quantity change updates that single number in place (webhook
`reconcile` → `reconcileFloating`). So a customer paying for N seats gets N
parallel runs. TMT is unchanged (one device-bound key per seat).

## Related

#29 (TMT device binding — reuses activate/DELETE), #31 (npm rc gating),
`app/api/tmgmt/lib/entitlement.ts` (the NO_MACHINES tolerance change),
`app/api/tmgmt/lib/machines.ts` (activate/heartbeat/release).
