# Entwickler-/Onboarding-Doku

> Single Source of Truth zum **Starten, Testen, Ändern und Deployen** dieses Projekts.
> Liegt bewusst im Repo (versioniert, neben dem Code). Für Confluence: diese Datei einfach
> hineinkopieren. Stand 2026-06-29.

---

## 1. Was ist das?

Mehr als eine Marketing-Landing: die **Landing-Page _und_ die Sales-Vetted-Onboarding-/
Lieferkette** für zwei Produkte, die über **dieselbe** Infrastruktur ausgeliefert werden:

| Produkt | Marketing-Name | Auslieferung |
|---|---|---|
| `cc-testframework` | **CC-Testframework** | npm-Paket (GitHub Packages) + Repo-Invite |
| `cc-tmgmt` | **CC-Testmanagement** | Electron-App (GitHub Releases) via Lizenz-gated Proxy |

**Stack:** Next.js 16 (App Router, viele Pages `force-dynamic`) · TypeScript · React 19 ·
Tailwind v4. Hosting/Build/Cron/Env: **Vercel**. Vendors: **Keygen** (Lizenzen),
**GitHub App** (Invites + Release-Reads), **Resend** (Mails).

---

## 2. Architektur in 60 Sekunden

**Customer-Flow (Sales-Vetted, beide Produkte):**

```
Interessent → /demo-request (?product=…)  → POST /api/demo-request
   → HMAC-Action-Token (product mit-signiert) → Mail an Sales
Sales       → /sales/action?t=<token>          → POST /api/sales/action-issue
   → Keygen Pending-License (product in Metadata) → Mail an Customer mit /signup?token=…
Customer    → /signup?token=…  (Daten vorausgefüllt aus Pending-License)
   → POST /api/signup → Trial-License (product-spezifische Policy)
        ├─ cc-testframework: GitHub-Invite + Welcome-Mail (License-Key)
        └─ cc-tmgmt:        KEIN Invite → Welcome-Mail (Zugangscode = License-Key + Download-Links)
```

**cc-tmgmt Update/Download (Option A — keyGen-Proxy):**

```
Electron-App (electron-updater, generic provider)
   → GET /api/tmgmt/updates/<datei>   (Authorization: Bearer <license-key>)
        → Keygen validate-key + product==cc-tmgmt
        → *.yml: Feed-Text aus latest Release | Asset: 302 auf kurzlebige GitHub-Signed-URL
   → GET /api/tmgmt/download?os=win|mac|linux&key=<license-key>  (Erst-Download aus der Mail)
```

Quelle der Releases: privates Repo `meinTest/cc-test-mgmt-ui` (server-seitig via GitHub-App
gelesen; der Kunde bekommt **nie** GitHub-Zugriff).

---

## 3. Lokal starten

```bash
nvm use            # Node 22 (siehe .nvmrc)
npm install
npm run dev        # → http://localhost:3000
npm run lint
npm run build      # Production-Build lokal prüfen
```

Ohne Env-Vars laufen die **Seiten**; die **API-Routes** brauchen je nach Pfad Vendor-Env
(siehe §4). Zum gefahrlosen Testen: **`DRY_RUN=true`** (§5).

---

## 4. Environment-Variablen

Vollständige Referenz mit Kommentaren: **`.env.example`**. In Vercel unter
Settings → Environment Variables gesetzt. Die wichtigsten Gruppen:

- **Flags:** `SIGNUP_ENABLED`, `SALES_VETTED_MODE`, `DRY_RUN`, `PRODUCTS_OFFERED`
  (`cc-testframework` | `cc-tmgmt` | beide).
- **Keygen:** `KEYGEN_ACCOUNT_ID`, `KEYGEN_ADMIN_TOKEN`, `KEYGEN_TRIAL_POLICY_ID`,
  `KEYGEN_TMGMT_TRIAL_POLICY_ID`, `KEYGEN_PENDING_POLICY_ID`.
- **GitHub App:** `GH_APP_ID`, `GH_APP_PRIVATE_KEY`, `GH_APP_INSTALLATION_ID`, `GH_ORG`,
  `GH_REPO` (Framework-Repo), `GH_TMGMT_REPO` (= `cc-test-mgmt-ui`, Release-Quelle).
- **Resend:** `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_SUPPORT_TO`, `SALES_NOTIFY_EMAIL`.
- **Sonstiges:** `SALES_API_KEY` (Bearer für `/api/sales/*` + HMAC-Secret + Basic-Auth für
  `/sales`), `LANDING_BASE_URL` (Basis für gebaute Links), `CRON_SECRET`, `QUICKSTART_URL_*`.
- **Nur Tests:** `DRY_RUN_PRODUCT` (§5).

---

## 5. Testen ohne echte Calls (DRY_RUN)

Bei `DRY_RUN=true` werden keine externen Calls ausgeführt — alles wird geloggt und mockt
Erfolg. Zwei Test-Hooks:

- **`DRY_RUN=true`** — globaler Trockenlauf.
- **`DRY_RUN_PRODUCT=cc-tmgmt`** — simuliert im Vetted-Signup das cc-tmgmt-Produkt
  (echte Lookups lesen `product` aus der Pending-License-Metadata; im DRY_RUN ist es absent →
  Default `cc-testframework`).

### Smoke-Test: cc-tmgmt-Proxy
```bash
DRY_RUN=true KEYGEN_ACCOUNT_ID=acc PORT=3300 npx next start &
base="http://localhost:3300/api/tmgmt"
curl -s -o /dev/null -w "%{http_code}\n" "$base/updates/latest-linux.yml"                 # 401 (kein Key)
curl -s -H "Authorization: Bearer K" "$base/updates/latest-linux.yml"                      # 200 + Fake-yml
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "$base/download?os=win&key=K"     # 302 (Fake-URL)
```

### Smoke-Test: Signup beider Produkte
```bash
common="SIGNUP_ENABLED=true SALES_VETTED_MODE=true DRY_RUN=true KEYGEN_ACCOUNT_ID=a \
  KEYGEN_ADMIN_TOKEN=t KEYGEN_TRIAL_POLICY_ID=tp KEYGEN_TMGMT_TRIAL_POLICY_ID=ttp \
  KEYGEN_PENDING_POLICY_ID=pp RESEND_FROM=f@x RESEND_SUPPORT_TO=s@x \
  GH_ORG=meinTest GH_REPO=cc-testframework GH_APP_ID=1 GH_APP_INSTALLATION_ID=1 GH_APP_PRIVATE_KEY=x"

# Framework: GitHub-Username Pflicht, Invite + Welcome
env $common PORT=3301 npx next start &
curl -s -X POST localhost:3301/api/signup -H 'Content-Type: application/json' \
  -d '{"name":"A","email":"a@x.io","company":"C","githubUsername":"octocat","token":"t1"}'

# cc-tmgmt: kein GitHub, cc-tmgmt-Welcome
env $common DRY_RUN_PRODUCT=cc-tmgmt PORT=3302 npx next start &
curl -s -X POST localhost:3302/api/signup -H 'Content-Type: application/json' \
  -d '{"name":"B","email":"b@x.io","company":"C","token":"t2"}'
```

> Live-Test des Proxys gegen echte Daten: Keygen-Lizenz unter `cc-tmgmt-trial-14d` mit
> Metadata `product=cc-tmgmt` anlegen, dann `…/api/tmgmt/updates/latest.yml?key=<KEY>`.

---

## 6. Deployen

**Push auf `main` → Vercel deployt automatisch** (Production). Env-Änderungen greifen erst
in Deployments, die **nach** dem Speichern erstellt werden → nach Env-Änderung neu deployen.
Es gibt **keine** Dockerfile/CI — Vercel baut Next.js direkt aus dem Repo.

Conventional Commits Pflicht (`feat:`/`fix:`/`docs:`/`chore:`), Footer
`Co-Authored-By: Claude …`.

---

## 7. Datei-Landkarte

```
app/page.tsx                         Produkt-Übersicht (offered-aware, bilingual)
app/cc-testframework/page.tsx        Detailseite Framework
app/cc-testmanagement/page.tsx       Detailseite cc-tmgmt
app/content.ts                       Bilinguale Copy (DE/EN) + lang-Helper
app/products.ts                      Produkt-Registry: ProductId, Labels, offeredProducts()
app/Header.tsx, app/LangToggle.tsx   Site-Chrome + Sprach-Umschalter

app/demo-request/…                   Demo-Form (product-aware) + Page
app/signup/…                         Signup-Form (Vetted-Prefill, product-aware) + Page
app/sales/…                          Sales-Console (Basic-Auth) + Magic-Link-Confirm

app/api/demo-request/route.ts        POST: HMAC bauen, Sales mailen
app/api/sales/action-issue/route.ts  POST: HMAC re-verify + Token ausstellen
app/api/sales/lib/action-token.ts    HMAC sign/verify (product mit-signiert)
app/api/sales/lib/issue.ts           issueToken() + validateIssuePayload()
app/api/signup/route.ts              POST: token-validate, product-Branching, Fulfillment
app/api/signup/lib/keygen.ts         Keygen CRUD + trialPolicyId(product)
app/api/signup/lib/github.ts         Framework-Invite
app/api/signup/lib/resend.ts         Alle Mail-Templates (inkl. sendTmgmtWelcome)
app/api/tmgmt/lib/entitlement.ts     Keygen validate-key + product-Gate (+ ?key Fallback)
app/api/tmgmt/lib/releases.ts        GitHub-App: Release/Feed/Asset auflösen
app/api/tmgmt/updates/[file]/route.ts  Update-Feed-Proxy (Bearer)
app/api/tmgmt/download/route.ts      Erst-Download (?os=&key=)
app/api/cron/trial-reminders/route.ts  Täglicher Reminder-Cron
proxy.ts                             Basic-Auth-Middleware für /sales
```

---

## 8. „Wie ändere ich …?" — Rezepte

- **Welche Produkte angeboten werden:** Env `PRODUCTS_OFFERED` setzen (Übersicht, Detailseiten-
  404, Demo-Auswahl folgen automatisch). Default = beide.
- **Marketing-Texte / Sprache:** `app/content.ts` (DE/EN nebeneinander).
- **Eine Mail anpassen:** `app/api/signup/lib/resend.ts` — passendes Template
  (`sendWelcomeEmail` / `sendTmgmtWelcome` / `notifyDemoRequest` / `sendOnboardInvite` / …).
- **cc-tmgmt-Asset-Naming/OS:** `OS_ASSET_PATTERN` in `app/api/tmgmt/lib/releases.ts`
  (matcht per Extension; Versionsnamen werden aus dem Release aufgelöst, nichts hartkodiert).
- **Neue Trial-Policy/Produkt:** Keygen-Policy anlegen → `trialPolicyId()` in `keygen.ts` +
  `app/products.ts` erweitern.
- **Sales stellt manuell Tokens aus:** `/sales` (Basic-Auth: User `sales`, Passwort
  `SALES_API_KEY`), Produkt-Dropdown.

---

## 9. Offene Punkte / Pre-Live-Constraints

- **cc-tmgmt:** live & verifiziert (Proxy + Signup). Offen: Customer-Test-Repo-Hosting
  (Git-Push-Credential), cc-tmgmt-Docs/GitHub-Pages.
- **Framework-Cutover:** Resend-Subdomain verifizieren, dann `DRY_RUN=false` + `SIGNUP_ENABLED=true`;
  Custom-Domain `cc-testframework.itsbusiness.ch`. Details: `docs/onboarding.md`,
  `docs/cc-tmgmt-proxy-integration.md`, `docs/cc-tmgmt-entitlement-options.md`.
```
