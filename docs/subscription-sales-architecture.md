# Abo-/Verkaufsmodell — Architektur, Verrechnung & Lizenz-Provisionierung

**Zweck:** Framework **und** CC Test Management als **Abo** (Self-Service) + **Einmalkauf**
(Preis auf Anfrage), inkl. Seat-basierter Lizenzierung und Ausbaustufe „Kunde verwaltet Lizenzen
selbst". Maßgebliche Referenz. Stand 2026-07-17.

**Grundsatz-Entscheidungen (getroffen):**
- Self-Service-**Stripe-Checkout**; **Stripe = Merchant of Record** (Rechnung im eigenen Namen,
  MwSt über Stripe Tax). Kein Reseller/MoR-Broker.
- **Echte Mehrwährung** (CHF/EUR/USD) — Preise **leben in Stripe** (Sales pflegt sie).
- **Zahlarten:** Kreditkarte **und** Rechnung.
- **Seat-Modell:** **1 Keygen-Lizenz (Key) pro Seat/User** — usergebunden, einzeln widerrufbar.
- **QR-Rechnung (CH):** Stripe erzeugt keine Swiss-QR-Bill → Hybrid: Stripe für Karte +
  Self-Service; klassische „auf Rechnung"-B2B-Deals über Buchhaltung (QR-Bill) + Sales-Flow.

---

## 1. Die 3 Buckets (je Produkt, Verkaufsseite `/[produkt]/pricing`)

| Bucket | Inhalt | Flow |
|---|---|---|
| **Trial** | 14 Tage kostenlos | „Trial anfragen" → Demo/Sales-Flow (steht) |
| **Abo** | pro User/Monat oder /Jahr, Seats | **Stripe-Checkout** (adjustable quantity) |
| **Einmalkauf** | „Preis auf Anfrage" | Demo/Sales-Formular (steht) |

## 2. Preise — Stripe ist Source of Truth *(implementiert)*

- Die Pricing-Seiten **lesen die Preise live aus Stripe** (`app/lib/stripe-pricing.ts`,
  In-Process-Cache ~5 Min). Zuordnung Stripe-Produkt → App-Produkt über **Product-Metadata**
  `app_product` = `cc-testframework` | `cc-tmgmt`.
- **Sales pflegt Preise komplett im Stripe-Dashboard** — Dev fasst dafür nichts an.
- **Fallback:** fehlt Stripe / ein Preis, greift pro Währung die In-Code-Config
  (`app/pricing.ts`) → Seite ist nie leer.
- Rabatt-Badge („X% gespart") wird real aus Monats-/Jahrespreis berechnet.

## 3. Verrechnung (Stripe Billing)

- **Karte** (Checkout) **und** **Rechnung/Bank-Transfer** in einem System.
- **Stripe Tax** für MwSt (CH 8.1 %, EU-Reverse-Charge). Ihr bleibt Merchant of Record.
- Karte → sofort aktiv; Rechnung → Lizenz erst bei `invoice.paid`.

## 4. Seat ↔ Lizenz-Modell

- **Menge (Seats) = Anzahl User = Anzahl Keygen-Keys.**
- Seat-Auswahl über Stripe **`adjustable_quantity`** (im Checkout **und** später im
  Customer-Portal) → kein eigener Mengen-UI-Bau nötig.
- **Pro Seat eine eigene Keygen-Lizenz** (eigener Key). Begründung: die Produkte
  authentifizieren per **Key** (Zugangscode), nicht per User-Login → ein geteilter Key mit
  Zähler wäre nicht usergebunden. N Keys = usergebunden + einzeln widerrufbar/neu zuweisbar
  (Standard für key-basierte Enterprise-Produkte).

## 5. Checkout — `/api/checkout` *(zu bauen, Schritt 1)*

- Erzeugt eine Stripe **Checkout Session** (`mode=subscription`) mit:
  - **Preis-ID** aus gewählter Währung/Zyklus (kommt aus `getStripePricing`),
  - **`adjustable_quantity`** (Seats),
  - **payment_method_types**: Karte + Rechnung,
  - Success-/Cancel-URLs.
- Der „Abo starten"-Button ruft das auf.

## 6. Webhook — `/api/stripe/webhook` → Keygen-Lifecycle *(zu bauen, Schritt 2)*

| Stripe-Event | Aktion in Keygen |
|---|---|
| `checkout.session.completed` / `invoice.paid` | **N Keygen-Lizenzen** (paid policy) anlegen, je mit Metadata `company`, `subscriptionId`, `product`, `seatIndex` |
| `customer.subscription.updated` (Menge ±) | hoch → zusätzliche Keys anlegen; runter → überzählige Keys **suspendieren** (Reconcile) |
| `customer.subscription.deleted` / `past_due` | alle Keys der Subscription **suspendieren/ablaufen** |

- **Idempotenz:** Keys pro `subscriptionId` + `seatIndex` eindeutig, damit Retries keine
  Duplikate erzeugen.
- **Zustellung:** Mail an Käufer/Admin mit **allen Keys** (+ optional Lizenz-PDF pro Key /
  eine Sammel-PDF). Für viele Seats eher Liste/CSV statt N PDFs.

## 7. Daten-Erfassung / User-Zuordnung

- **v1 (schlank):** Beim Kauf kennen wir nur den **Käufer**. Keys werden als **„unassigned
  Seats"** von Firma X angelegt; die **User-Zuordnung** entsteht bei der **ersten Aktivierung**
  (Keygen erfasst User/Machine). Kein Extra-Bau.
- **Metadata pro Key:** `company`, `subscriptionId`, `product`, `seatIndex`, später `assignedUser`.

---

## 8. Ausbaustufe — Kunde verwaltet Lizenzen selbst

Zwei Ebenen, unabhängig aktivierbar:

### 8a. Stripe Customer Portal *(billing — sehr wenig Bau)*
Stripe-gehostet, nur aktivieren + Portal-Link erzeugen. Der Kunde kann selbst:
- **Zahlungsmittel** ändern, **Rechnungen** herunterladen,
- **Seats hoch-/runterstufen** (Menge ändern → Webhook reconciled die Keys),
- **kündigen**.
→ Deckt die **kaufmännische** Selbstverwaltung komplett ab, ohne Eigenbau.

### 8b. meinTest Lizenz-Admin-Bereich *(Lizenz-/User-Verwaltung — Eigenbau, Folge-Feature)*
Ein authentifizierter Bereich (z. B. `/account`) für den **Kunden-Admin**:
- **Übersicht** aller Lizenzen/Keys + Status (aktiv/suspendiert, letzte Aktivierung),
- **Key einem User zuweisen** (Name/E-Mail) → schreibt Keygen-Metadata/legt Keygen-User an,
- **Key entziehen/neu zuweisen** (MA verlässt Firma → Seat freigeben),
- **Nutzung** einsehen, **Lizenz-PDF(s)** herunterladen,
- Seats kaufen/ändern → Deep-Link ins Stripe-Portal (Billing bleibt in Stripe).

**Auth (Vorschlag):**
- **v1 Portal:** Magic-Link an die Billing-/Admin-E-Mail (wie unsere bestehenden Signup-Links).
- **Enterprise-Ausbau:** SSO/SAML, mehrere Admins, Rollen.

**Datenmodell:** Stripe = Quelle für **Billing/Seat-Anzahl**; Keygen = Quelle für **Keys +
User-Zuordnung**; der Admin-Bereich ist die **UI darüber** (liest/schreibt Keygen, verlinkt
Stripe). Seats erhöhen läuft **immer über Stripe** (Billing), der Webhook legt die Keys an, der
Admin weist sie zu.

**Abgrenzung:** 8a löst „Kunde verwaltet **Abo/Zahlung** selbst" mit minimalem Bau. 8b löst
„Kunde verwaltet **Keys/User** selbst" und ist der eigentliche Enterprise-Ausbau — **nicht Teil
von v1**.

---

## 9. Roadmap

1. **Preise aus Stripe** ✅ (implementiert, live).
2. **`/api/checkout`** (Session + adjustable quantity + Karte/Rechnung) + Success/Cancel.
3. **`/api/stripe/webhook`** → Keygen-Key-Provisionierung (N Keys) + Zustellung + Reconcile.
4. **Stripe Customer Portal** aktivieren (8a) — Billing-Selfservice.
5. **Lizenz-Admin-Bereich** (8b) — Key/User-Selbstverwaltung (Enterprise-Ausbau).

## 10. Extern aufzusetzen (du/GL)

- **Stripe:** Account (Test/Live), Produkte + Preise (Metadata `app_product`), Stripe Tax,
  Webhook-Endpoint + Signing-Secret, Customer Portal aktivieren.
- **Keygen:** **bezahlte Policy(s)** (unbefristet bzw. jährlich verlängerbar) neben der Trial-
  Policy — pro Produkt oder gemeinsam.
- **Vercel-Env:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `KEYGEN_*_PAID_POLICY_ID`.

## 11. Offene Punkte

- Bezahlte Keygen-Policy(s) anlegen (pro Produkt vs. gemeinsam).
- Zustellformat bei vielen Seats (Key-Liste/CSV vs. N PDFs).
- Verlängerung: `renew`/Policy-Wechsel derselben Lizenz (Key bleibt) statt neu ausstellen.
- Device-/Concurrency-Politik: nicht gerätegebunden; optional später Keygen-Concurrency
  („1 aktive Session pro Key") gegen Sharing.
