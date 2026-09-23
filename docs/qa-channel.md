# Internal QA update/download channel (cc-tmgmt)

Lets internal testers run **release candidates** of the cc-tmgmt app on a quality
stage before a release goes to customers. Customers can never see a candidate.
(#30 · TMT#270. The framework's own QA idea — npm dist-tag `rc`,
cc-testframework#216 — is separate and not built here.)

## How a candidate is published (TMT side, already built)

A `vX.Y.Z-rc.N` tag builds a separate **CC Test Management QA** app (own appId
`ch.itsbusiness.cctmgmt.qa`, own data folder) and publishes a **GitHub
pre-release** with `qa.yml`, the signed `cc-tmgmt-qa-<version>-win-x64.exe` and
its `.blockmap`. The QA app polls `<proxy>/api/tmgmt/updates/qa/qa.yml`; the
customer app still polls `<proxy>/api/tmgmt/updates/latest.yml`.

## Entitlement — internal licenses only

Access requires a valid license that is **explicitly opted into QA** via
`metadata.channel === "qa"`. That is the only marker (no policy/name fallback).

| Case | Response |
|---|---|
| Valid, entitled, `metadata.channel = "qa"` | served |
| Valid, entitled, no/other channel | `403 { "error": "qa-channel-not-entitled" }` |
| Not a resolvable/entitled product | `403 { "error": "qa-channel-not-entitled" }` |
| Missing / invalid key | `401 { "error": "missing-key" \| "invalid-key" }` |

A non-entitled license always gets **403**, never 404, so a misconfiguration
stays visible. No license key is ever logged.

### To grant a tester access (Keygen)

Set `channel = "qa"` in the **license's metadata** in Keygen. Remove it to revoke.
Nothing else changes; the same key still works on the customer channel too.

## `GET /api/tmgmt/updates/qa/<file>`

electron-updater generic provider, `Authorization: Bearer <license key>`. Served
from the **newest pre-release that carries a qa.yml** (not `getLatestRelease`,
which skips pre-releases). `*.yml` is proxied as text; binaries (`.exe`,
`.blockmap`) are a `302` to a short-lived GitHub asset URL. Cached briefly
(≤60s) and separately from the customer channel, since candidates change often.

## `GET /api/tmgmt/download?os=win&channel=qa&key=<license>`

First-install of the QA app: the QA installer of the newest pre-release, behind
the same entitlement gate. **Without `channel`** the download is unchanged (the
customer installer).

## Framework release candidates (npm proxy)

The same visibility rule applies to the framework, which is delivered through the
license-brokered npm proxy (`/api/tmgmt/npm/…`, cc-testframework#216):

- **Customers** (any entitled license without `channel:qa`) see only the stable
  `latest` chain. Pre-release versions (any semver with a `-`, e.g. `1.3.0-rc.1`)
  and the dist-tags pointing at them (`rc`, `next`, …) are stripped from the
  packument, so `npm i @meintest/…@rc` fails with "No matching version". A
  pre-release tarball requested directly (a guessed URL) returns **403**
  `{ "error": "qa-channel-not-entitled" }`, the same as the QA update feed.
- **Internal** licenses (`metadata.channel = "qa"`) get the full packument
  including `rc`, so `npm install @meintest/cc-testframework@rc` works for them.

The gate reuses the same `channel:qa` marker and the cached entitlement verdict —
no extra Keygen call. There is no publishing change here: the framework pipeline
just publishes candidates under the `rc` dist-tag as usual.

## Unchanged

`GET /api/tmgmt/updates/<file>` keeps using `getLatestRelease`, which skips
pre-releases and drafts — so a candidate can never reach a customer through the
stable feed. Not touched by this change.
