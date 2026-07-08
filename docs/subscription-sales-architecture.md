# Abo-/Verkaufsmodell — Architektur & Verrechnung

**Ziel (GL):** Framework **und** Testmanagement als **Abo** anbieten, plus **Einmalkauf**
(Preis auf Anfrage). Pro Produkt eine Verkaufsseite mit **3 Buckets**. Stand 2026-07-01, Entwurf.

**Entschieden:** Self-Service-**Direkt-Checkout** · **Stripe** (Kreditkarte **und** Rechnung) ·
**echte Mehrwährungs-Abrechnung**.

---

## 1. Die 3 Buckets (je Produkt)

| Bucket | Inhalt | Flow |
|---|---|---|
| **Trial** | 14 Tage, kostenlos | bestehender Signup-/Demo-Flow (steht) |
| **Abo** | 45 CHF/User·Monat · 450 CHF/User·Jahr, Monats-/Jahres-Toggle, Währungspicker | **Stripe-Checkout** (neu) |
| **Einmalkauf** | „Preis auf Anfrage" | bestehendes Demo-/Sales-Formular (steht) |

Preis ist **pro User pro Lizenz** → im Abo ist die **Menge = Seats = Anzahl User**.

## 2. Verrechnung (Stripe)

- **Stripe Billing** deckt in *einem* System ab: **Kreditkarte** (Checkout) **und** **Rechnung/
  Bank-Transfer** (Checkout mit `payment_method_types` inkl. Invoice), **Abo** monatlich/jährlich,
  **Mengen (Seats)** und **Mehrwährung** (echte Preise je Währung).
- **Steuern:** **Stripe Tax** aktivieren → Schweizer MwSt (8.1 %) automatisch, EU-Reverse-Charge
  für Geschäftskunden mit UID. Erspart manuelle Steuerlogik.
- **Rechnung vs. Karte:** Karte = sofort aktiv; Rechnung = Lizenz erst bei Zahlungseingang aktiv
  (Stripe-Invoice-`paid`-Webhook).
- **Rolle Stripe:** Zahlungsabwickler + Billing-Engine — **ihr bleibt Merchant of Record**
  (Rechnung im eigenen Namen, MwSt-Abführung bei euch; Stripe Tax berechnet). Kein Reseller/MoR.
- **CH-Haken QR-Rechnung:** Stripe erzeugt **keine** Schweizer QR-Bill. Lösung = **Hybrid**:
  Stripe für Karte + Self-Service-Abo; klassische „auf Rechnung"-B2B-Deals über das
  Buchhaltungstool (QR-Bill) + den bestehenden Sales-Flow.

## 3. Der Kern: Stripe ↔ Keygen

Die Lizenz-Infra (Keygen) steht schon; neu ist nur die **Kopplung über Webhooks**:

```
Kunde → /[produkt]/pricing → "Abo starten"
  → POST /api/checkout  (Seats, Zyklus, Währung, Produkt)
      → Stripe Checkout Session (mode=subscription, quantity=Seats)
  → Zahlung
  → Stripe-Webhook /api/stripe/webhook:
      checkout.session.completed / invoice.paid   → Keygen-Lizenz(en) ausstellen/aktivieren
      customer.subscription.updated (Seats±)       → Lizenzen nach-/abbauen
      customer.subscription.deleted / past_due     → Lizenz(en) suspend/ablaufen
  → Welcome-Mail mit Lizenzschlüssel(n)  (bestehendes Resend-Template, erweitert)
```

**Seat-Modell (Empfehlung):** **eine Keygen-Lizenz pro Seat** → jeder User hat einen eigenen,
individuell entziehbaren/neu zuweisbaren Key. Menge in Stripe = Anzahl Keygen-Lizenzen.
(Alternative: *eine* Lizenz mit `users`-Limit — weniger Keys, aber kein individuelles Sperren.)

**Trial → Paid & Verlängerung:** dieselbe Lizenz **behalten** und per Keygen `renew`/Policy-Wechsel
aktualisieren → `licenseId` **und** Key bleiben (Kunde behält Zugangscode + Feedback-Historie;
siehe frühere Keygen-Analyse). Nicht löschen + neu ausstellen.

## 4. Device-Bindung / Weitergabe

Die Keygen-Policy ist **nicht maschinengebunden** → ein MA kann seinen Key faktisch einem
Kollegen geben (Absprache nötig). **Bewusst so gewünscht.** Da pro User verrechnet wird, aber
nichts die Parallelnutzung technisch verhindert:
- **Jetzt:** vertraglich/AGB regeln („1 Named User pro Seat").
- **Optional später:** Keygen **Concurrency/Heartbeat** („max. 1 aktive Session pro Lizenz") —
  bremst Sharing, ohne Gerätebindung.

## 5. Was extern aufzusetzen ist (du/GL)

- **Stripe-Account** (Live + Test), Firmen-/Bankdaten, Stripe Tax aktivieren.
- **Produkte & Preise** in Stripe: je Produkt × {Monat, Jahr} × {CHF, EUR, USD} → Preis-IDs.
- **Webhook-Endpoint** `…/api/stripe/webhook` registrieren → Signing-Secret.
- **Keygen:** bezahlte Policy(s) (unbefristet bzw. jährlich verlängerbar) neben der Trial-Policy.
- **Env in Vercel:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (oder eine
  JSON-Map Produkt→Währung→Zyklus→PriceId), `KEYGEN_*_PAID_POLICY_ID`.

## 6. Roadmap (klein & testbar)

1. **Phase 1 — Verkaufsseiten-UI** ✅ **erledigt**: `/cc-testframework/pricing` +
   `/cc-testmanagement/pricing`, 3 Buckets, Monats-/Jahres-Toggle, Währungspicker (CHF/EUR/USD),
   Preise aus `app/pricing.ts`. Abo-CTA führt **vorerst** in den Sales-/Demo-Flow (trägt
   product/plan/cycle/currency mit); wird in Phase 2 auf Stripe-Checkout umgestellt.
2. **Phase 2 — Stripe-Checkout** (`/api/checkout`) + Success/Cancel-Seiten.
3. **Phase 3 — Webhook** (`/api/stripe/webhook`) → Keygen-Lizenz-Lifecycle + Welcome-Mail.
4. **Phase 4 — Self-Service-Verwaltung** (Stripe Customer Portal: Seats ändern, Kündigen, Rechnungen).

## 7. Offene Punkte (bitte bestätigen)

- **Währungen + Beträge:** CHF 45/450 fix. EUR/USD-Beträge? (Vorschlag: Parität 45/450, in Stripe
  final gepflegt.) Welche Währungen insgesamt (CHF/EUR/USD)?
- **Gleicher Preis für beide Produkte?** (Annahme: ja, 45/450 je User.)
- **Seat-Modell:** eine Lizenz pro Seat (empfohlen) vs. eine Lizenz mit User-Limit.
- **MwSt:** Stripe Tax aktivieren? (empfohlen)
- **Mindest-Seats / Rabatt bei Jahreszahlung?** (450 = 10×45 → 2 Monate gratis bei Jahr — ok?)
