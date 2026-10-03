# cc-testframework-landing — Technische Konfiguration & Architektur

Technische Referenz für Betrieb und Konfiguration: Proxy (diese App), Keygen,
Stripe, Resend, GitHub-App und die Produkte. **Stand heute** ist markiert;
geplante Teile tragen ihre Ticket-Nummer.

> Hinweis zu Namen: Intern heißen die Produkte aktuell `cc-tmgmt` und
> `cc-testframework`. Die Umbenennung auf **TMT / FW / BOTH** ist beschlossen,
> aber noch nicht umgesetzt (#43). In diesem Dokument steht meist „TMT"/„FW".

---

## 1. Überblick & Architektur

Eine **Next.js 16 (App Router)**-App, deployed auf **Vercel**, erreichbar unter
**`https://app.itsbusiness.ch`**. Sie ist zweierlei:

1. **Marketing-Landing** (zweisprachig DE/EN, DE Default).
2. **Lizenz-/Onboarding-/Delivery-/Billing-Proxy** für zwei Produkte:
   - **TMT** (`cc-tmgmt`, „CC Test Management") — Electron-Desktop-App.
   - **FW** (`cc-testframework`, „CC-Testframework") — npm-Paket `@meintest/cc-testframework`.

Angebundene Systeme:

| System | Zweck |
|---|---|
| **Keygen** (keygen.sh) | Lizenzen: Ausstellung, Validierung, Geräte/Seats |
| **Stripe** | Abos/Zahlung, Trial→Paid, Billing-Portal |
| **Resend** | Transaktionsmails (Welcome, Reminder, Sales) |
| **GitHub-App** | Release-Auslieferung (TMT-Download/Update), npm-Broker, Feedback→Issues |
| **CMS (Firmenwebseite)** | rendert Marketing-Boxen/Pricing über die Public-API (headless) |

Die Secrets aller Systeme liegen **nur serverseitig** (Vercel Env); der Kunde
authentifiziert sich überall mit seinem **Keygen-Lizenzschlüssel**.

---

## 2. Deployment & Umgebungen

- **Hosting:** Vercel, Production-Branch = `main` (Auto-Deploy bei Push). Env-
  Änderungen greifen erst nach einem **Redeploy**.
- **Domain:** `app.itsbusiness.ch` (Production).
- **Stripe-Modus:** **aktuell Test-Sandbox** (`STRIPE_SECRET_KEY = sk_test_…`).
  Beim Go-Live Key + Webhook-Secret gegen **Live** tauschen.
- **DRY_RUN:** wenn `true`, werden externe Aufrufe (Keygen/Stripe/Resend/GitHub)
  nur geloggt, nicht ausgeführt (für Smoke-Tests). In Production **aus**.

---

## 3. Environment-Variablen (vollständig)

> Vorlage: `.env.example` im Repo. In Vercel unter *Settings → Environment Variables*.

### Feature-Flags
| Variable | Bedeutung |
|---|---|
| `SIGNUP_ENABLED` | `true` = Signup aktiv; sonst 503. |
| `DRY_RUN` | `true` = externe Calls nur simulieren. In Prod aus. |
| `SALES_VETTED_MODE` | `true` = Produkt-CTA → `/demo-request`, Signup braucht Sales-Token. Global/Framework. |
| `SALES_VETTED_MODE_TMGMT` | Per-Produkt-Override für TMT (`true`/`false`; leer = erbt global). |
| `PURCHASE_ENABLED` | Opt-out: Abo-Checkout/Upgrade aktiv, außer `=false`. |
| `PRODUCTS_OFFERED` | Kommaliste angebotener Produkte; leer = beide. |
| `STRIPE_TRIAL_ENABLED` | **Opt-in** (`true`) = Variante A (kartenloser Stripe-Trial). Sonst klassischer Keygen-Trial. |
| `PUBLIC_API_ALLOWED_ORIGINS` | CORS-Allowlist für `/api/public/v1/*` (Komma-getrennt; `*` = alle). |
| `LANDING_BASE_URL` | Absolute Basis-URL (für Links/Redirects); sonst aus dem Request. |

### Keygen
| Variable | Bedeutung |
|---|---|
| `KEYGEN_ACCOUNT_ID` | Keygen-Account-Id. |
| `KEYGEN_ADMIN_TOKEN` | Admin-Token (Lizenzen anlegen/löschen, Maschinen, Policies lesen). Nur serverseitig. |
| `KEYGEN_TRIAL_POLICY_ID` | Trial-Policy **FW**. |
| `KEYGEN_TMGMT_TRIAL_POLICY_ID` | Trial-Policy **TMT**. |
| `KEYGEN_PAID_POLICY_ID` | Paid-Policy **FW**. |
| `KEYGEN_TMGMT_PAID_POLICY_ID` | Paid-Policy **TMT**. |
| `KEYGEN_PENDING_POLICY_ID` | Policy für Sales-„Pending"-Tokens (nie als gültiger Trial gewertet). |

### Sales-Gate
| Variable | Bedeutung |
|---|---|
| `SALES_API_KEY` | Bearer/Basic-Auth für `/api/sales/*` und `/sales`-UI. |
| `SALES_NOTIFY_EMAIL` | Posteingang für Demo-Request-Benachrichtigungen. |

### GitHub-App (Release-Delivery, npm, Feedback)
| Variable | Bedeutung |
|---|---|
| `GH_APP_ID`, `GH_APP_PRIVATE_KEY`, `GH_APP_INSTALLATION_ID` | GitHub-App-Credentials (Installationstoken je Call). |
| `GH_ORG` | Org der Release-Repos (`meinTest`). |
| `GH_TMGMT_REPO` | Privates Repo mit den TMT-Release-Artefakten (`cc-test-mgmt-ui`). |
| `GH_PACKAGES_TOKEN` | **Classic PAT** mit `read:packages` für den npm-Proxy (GitHub Packages akzeptiert keine App-Tokens). |
| `NPM_RATE_LIMIT_PER_MIN` | Rate-Limit npm-Proxy pro Lizenz (Default 60/min). |

### Feedback (In-App → GitHub-Issues)
| Variable | Bedeutung |
|---|---|
| `FEEDBACK_REPO` | `owner/repo` für Feedback-Issues (privat; `meinTest/cc-test-mgmt-ui`). |
| `FEEDBACK_ASSETS_BRANCH` | Orphan-Branch für Screenshots (Default `feedback-assets`). |
| `FEEDBACK_RATE_LIMIT_PER_MIN` | Rate-Limit Feedback (Default 20/min). |

### Stripe
| Variable | Bedeutung |
|---|---|
| `STRIPE_SECRET_KEY` | API-Key (`sk_test_…` / `sk_live_…`). Nur serverseitig. |
| `STRIPE_WEBHOOK_SECRET` | Signing-Secret des Webhook-Endpoints (`whsec_…`). |
| `STRIPE_PORTAL_RETURN_URL` | Rücksprung-URL nach dem Billing-Portal (Default `app.itsbusiness.ch`). |

### Resend
| Variable | Bedeutung |
|---|---|
| `RESEND_API_KEY` | Resend-API-Key. |
| `RESEND_FROM` | Absender (Sandbox bis `itsbusiness.ch` verifiziert). |
| `RESEND_SUPPORT_TO` | Support-Posteingang (Trial-Benachrichtigungen). |

### Kunden-URLs / Cron
| Variable | Bedeutung |
|---|---|
| `QUICKSTART_URL_EN` / `QUICKSTART_URL_DE` | Quickstart-Links in der FW-Welcome-Mail. |
| `CRON_SECRET` | Bearer für `/api/cron/*` (Trial-Reminder). |

---

## 4. Produkte, Pläne & Seat-Modelle

### Produkte (Entitlement)
| Id (heute) | Name | Auslieferung |
|---|---|---|
| `cc-tmgmt` (→ TMT) | CC Test Management | Electron-App via Download/Update-Proxy |
| `cc-testframework` (→ FW) | CC-Testframework | npm `@meintest/cc-testframework` via npm-Proxy |

**Entitlement-Regel (wichtig):**
- Eine **TMT-Lizenz** schaltet **beide** Produkte frei (TMT-App **und** FW-npm).
- Eine **FW-Lizenz** schaltet **nur** FW frei (npm), **nicht** die TMT-App.

### Pläne (verkaufbare Pakete)
| Plan | Liefert | Seat-Modell |
|---|---|---|
| **Starter FW** | FW | FW-Lizenz |
| **Starter TMT** | TMT | TMT-Lizenz |
| **Professional / BOTH** | FW **+** TMT | **1 FW-Key** (`maxMachines=Seats`) **+ 1–n TMT-Keys** (#42) |

### Seat-Modelle (beschlossen, #40)
- **FW = 1 Key mit X Seats** → `maxMachines = Seats`, **Floating-Concurrency**
  (geplant #41/#38): max. N Läufe gleichzeitig. Ein Key für die ganze Org/CI.
- **TMT = Per-User-Key** → ein Key pro Nutzer, je `maxMachines=1` (Geräte-
  Bindung, #29). 3 Lizenzen = 3 Keys.
- **BOTH** = eigenes **Stripe-Produkt** (ein Abo), verkaufbar, **aber kein
  Entitlement-Produkt**: der Webhook fächert auf → 1 FW-Lizenz + n TMT-Lizenzen
  (die zwei bestehenden Keygen-Policies reichen). Eine Menge `n` treibt beides.

### Enterprise
Eigene **CMS-Karte** (Marketing), Button → `/demo-request`. Kein Stripe-Self-
Serve-Preis; Bezahlung sales-/rechnungsbasiert (PO, ggf. XRechnung). Provision
aber über denselben Webhook (1 Kunde, 1 Abo, N Seats).

---

## 5. Keygen

- **Account:** `KEYGEN_ACCOUNT_ID`; Server nutzt den **Admin-Token**.
- **Policies:** je Produkt eine **Trial-** und eine **Paid-Policy** + eine
  **Pending-Policy** (Sales-Tokens). Das Produkt einer Lizenz wird aufgelöst aus
  (1) `metadata.product`, (2) Policy-Id (Env-Mapping), (3) Policy-Name
  (`cc-tmgmt-*` / `cc-testframework-*`). Pending-Policy = nie entitled.
- **Lizenz-Metadaten (Felder):** `product`, `email`, `customerName`, `company`,
  `kind` (`paid`), `subscriptionId`, `stripeCustomerId`, `seatIndex`, `trialDays`,
  `channel` (`qa`), `signupAt`/`issuedAt`; Pending zusätzlich `salesToken`,
  `tokenExpiresAt`.

### Geräte-Bindung (TMT, #29 — live)
- **Policy:** `maxMachines=1`, `machineUniquenessStrategy=UNIQUE_PER_PRODUCT`,
  `overageStrategy=NO_OVERAGE`.
- Aktivierung über `POST /api/license/activate` (Fingerprint). „Ein Trial pro
  Gerät": ein zweiter Trial desselben Produkts auf demselben Gerät wird geblockt
  (`device-already-registered`). **Trial→Paid-Takeover:** eine bezahlte Lizenz
  übernimmt das Gerät desselben Kunden (gleiche E-Mail + Produkt).
- **Wichtig:** Policies desselben Produkts (Trial+Paid) müssen unter demselben
  Keygen-**Product** hängen, damit `UNIQUE_PER_PRODUCT` greift.

### QA-Channel (intern, #30/#31 — live)
- Lizenz mit **`metadata.channel = "qa"`** sieht interne Release-Candidates
  (TMT-QA-Update-Feed + FW-`rc`-npm-Versionen). Nicht gesetzt → nur stabile Kette.

### Floating-Concurrency (FW, **geplant** #38/#41)
- **Policy:** `maxMachines=Seats` (pro Lizenz), `requireHeartbeat=true`,
  `heartbeatDuration≈120s`, `heartbeatCullStrategy=DEACTIVATE_DEAD`,
  `machineUniquenessStrategy=UNIQUE_PER_LICENSE`, `overageStrategy=NO_OVERAGE`.
- Lauf = **Lease** (activate → heartbeat → release). Details: `docs/license-concurrency.md`.

---

## 6. Stripe

### Produkte & Preise
- Je App-Produkt **ein Stripe-Produkt** mit **Metadatum `app_product`**
  (`cc-tmgmt` / `cc-testframework`; geplant zusätzlich `BOTH`). Ohne dieses
  Metadatum findet der Proxy den Preis nicht.
- **Preise:** wiederkehrend, je **CHF/EUR/USD × monatlich/jährlich** (feste Preise
  pro Währung). Beträge heute (Test): CHF 45/486, EUR 47/510, USD 50/544 pro
  User/Monat (Jahr = 12× −10 %). Der Proxy liest sie **live** (`getStripePricing`).

### Customer Portal
In *Settings → Billing → Customer portal* aktiviert; **„Zahlungsmethode
aktualisieren" erlaubt** (nötig für Variante-A-Konvertierung) + Kündigung.

### Webhook
- Endpoint: **`https://app.itsbusiness.ch/api/stripe/webhook`**, Secret =
  `STRIPE_WEBHOOK_SECRET`.
- **Events:** `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`.
- `reconcile` spiegelt Abos → Keygen-Lizenzen: Ablauf = `current_period_end`,
  bei Mengenänderung Seats hinzu/suspendieren, bei `canceled/unpaid` sperren.

### Variante A — kartenloser Trial (`STRIPE_TRIAL_ENABLED=true`)
- Signup legt **Stripe-Customer + `trialing`-Abo** an (ohne Karte,
  `trial_period_days`, `missing_payment_method=cancel`) + spiegelnde Keygen-Lizenz
  (Ablauf = Trial-Ende). Kunde ist ab Minute eins in Stripe.
- **Konvertieren:** im Billing-Portal Karte hinzufügen → am Trial-Ende bucht
  Stripe → Abo `active` → Webhook verlängert die Lizenz. Portal ab Tag eins
  (`billing.manageable=true`). Details: `docs/stripe-trial.md`.
- Flag **aus** = klassischer kartenloser **Keygen-Trial** (ohne Stripe).

---

## 7. Resend (Mail)

- Keys/Absender: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_SUPPORT_TO`.
- **Domain:** bis `itsbusiness.ch` verifiziert ist, Sandbox-Absender.
- Versendete Mails:
  | Mail | Auslöser |
  |---|---|
  | FW-Welcome (Key + npm-Setup + Quickstart + Portal-Link*) | Signup FW |
  | TMT-Welcome (Access-Code + Download-Links + Portal-Link*) | Signup TMT |
  | Trial-Reminder (Cron) | `/api/cron/trial-reminders` |
  | Demo-Request-Notify (→ Sales) | `/api/demo-request` |
  | Onboard-Invite (Sales-Signup-Link) | Sales-Action |
  | Subscription-Keys (Paid-Seats) | Webhook `reconcile` |
  | Support-Notify (neuer Trial) | Signup |

  *Portal-Link nur bei subscription-gebundenen (Variante-A-)Lizenzen (#34, live).

---

## 8. GitHub-App

Ein App-Installations-Token (serverseitig) bedient:
- **TMT-Download/Update-Proxy** (`/api/tmgmt/download`, `/updates/<file>`,
  `/updates/qa/<file>`) → privates Repo `GH_TMGMT_REPO`.
- **npm-Broker** (`/api/tmgmt/npm`) → GitHub Packages (nutzt `GH_PACKAGES_TOKEN`).
- **Feedback→Issues** (`/api/feedback`) → `FEEDBACK_REPO`, Screenshots im
  Orphan-Branch `FEEDBACK_ASSETS_BRANCH`.

Benötigte App-Rechte: Contents:read (Releases), Packages:read, Issues:read/write
(+ Contents:write auf dem Feedback-Repo für Screenshots).

---

## 9. API-Endpunkte (Referenz)

### Public CMS-API (`/api/public/v1/*`, CORS-Allowlist) — Vertrag: `docs/public-api.md`
| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/public/v1/products` | Angebotene Produkte + CTA (trial/demo) |
| GET | `/api/public/v1/pricing` | Live-Preise (Stripe), `?product=`/`?currency=` |
| POST | `/api/public/v1/signup` | Self-Serve-Trial aus dem CMS (`name,email,company,plan|product,cycle,currency`) |

### Lizenz
| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/license` | Stammdaten (`expiresAt, licensee, company, customerId`) |
| GET | `/api/license/status` | `valid, entitled, meta, billing.manageable/upgradeable, customerId` |
| POST | `/api/license/portal` | Billing-Portal-URL (App-Button) |
| GET | `/api/license/portal?key=` | 303-Redirect ins Portal (Mail-Link) |
| POST | `/api/license/activate` | Gerät/Lease aktivieren (Fingerprint) |
| GET | `/api/license/machines` | aktive Geräte/Leases |
| DELETE | `/api/license/machines/<id>` | Gerät/Seat freigeben |
| GET | `/api/license/plans` | Upgrade-Preise (#14) |
| POST | `/api/license/checkout` | Trial→Paid-Checkout-URL (#14) |

### Checkout / Signup / Sales / Feedback
| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/checkout` | Abo-Checkout (Produkt/Zyklus/Währung, Menge wählbar) |
| POST | `/api/signup` | Onsite-Signup (die `/signup`-Seite) |
| — | `/api/sales/*`, `/sales` | Sales-Gate (Token/Action) |
| POST/GET/PATCH/DELETE | `/api/feedback`, `/api/feedback/<n>` | In-App-Feedback |

### Delivery (TMT) + neutrale Aliasse
| Pfad | Zweck |
|---|---|
| `/api/tmgmt/npm/[...]` (+ `/api/npm/...`) | lizenz-brokerte npm-Registry |
| `/api/tmgmt/download` (+ `/api/download`) | Installer-Download (`?os=&key=`, `&channel=qa`) |
| `/api/tmgmt/updates/<file>` (+ `/api/updates/...`) | electron-updater-Feed |
| `/api/tmgmt/updates/qa/<file>` | interner QA-Feed |
| `/api/stripe/webhook` | Stripe-Events |
| `/api/cron/trial-reminders` | Cron (Bearer `CRON_SECRET`) |

---

## 10. Wichtige Flows

- **Trial (Variante A):** CMS/Onsite-Signup → Stripe-Customer + trialing-Abo +
  Keygen-Lizenz (Ablauf=Trial-Ende) + Welcome-Mail. Konvertieren via Portal.
- **Trial (klassisch, Flag aus):** reiner Keygen-Trial, kein Stripe.
- **Direkt-Kauf:** Pricing-Seite „Abo starten" → `/api/checkout` → Stripe-Checkout
  (Menge=Seats) → Webhook provisioniert Keys.
- **Trial→Paid (Alt-Weg #14):** `/api/license/plans` + `/api/license/checkout`.
- **Device/Seat (TMT, #29):** App aktiviert Gerät; 1 Gerät pro Key.
- **QA (#30/#31):** `channel:qa`-Lizenzen sehen RC (TMT-Feed, FW-`rc`-npm).
- **Feedback (#23/#27/#28):** In-App → private GitHub-Issues.

---

## 11. Sicherheit

- Alle System-Secrets **nur** in Vercel-Env (nie im Client/Mail/Log).
  Lizenzschlüssel werden im App-Log **maskiert**.
- **Key-in-URL** (Download-/Portal-Mail-Links `?key=`): gleicher Blast-Radius wie
  der ohnehin gemailte Key; Redirects setzen `Referrer-Policy: no-referrer`.
  Härtung mit Einmal-Token geplant (#37).
- **Public-API** CORS auf `PUBLIC_API_ALLOWED_ORIGINS` beschränkt; keine Secrets,
  keine Stripe-Price-Ids, keine fremden Lizenzen.
- **GitHub Push Protection** + Dependabot aktiv. Kunden-PDFs/Screenshots nie ins
  Haupt-Repo (Feedback-Screenshots im Orphan-Branch).

---

## 12. Offene Punkte / Tickets

| # | Thema | Status |
|---|---|---|
| #43 | Rename TMT/FW/BOTH (interne Ids + Stripe, mit Compat-Mapping) | beschlossen |
| #41 | FW-Provisionierung = 1 Key + `maxMachines=Seats` | offen |
| #42 | Professional/BOTH = 1 FW-Key + n TMT-Keys, Fan-out | beschlossen |
| #40 | Seat-Modell-Entscheidung | beschlossen |
| #38 / cc-testframework#268 | FW-Floating: Proxy-Heartbeat + Runtime-Lease | offen |
| #39 | Mehr-Seat (CMS) + Portal-Seat-Änderung | offen |
| #37 | Mail-Links mit Einmal-Token (Härtung) | offen |
| #36 | Preis-Währungsmodell (feste Preise vs. Adaptive) — Sales | offen |
| #35 | In-Code-Preis-Defaults entfernen (Stripe als einzige Quelle) | offen |
| #34 | Portal-Link in Welcome-Mails | erledigt |

### Weiterführende Docs im Repo
`docs/public-api.md` · `docs/stripe-trial.md` · `docs/license-machines.md` ·
`docs/license-concurrency.md` · `docs/qa-channel.md` · `docs/qa-license-setup.md`.
