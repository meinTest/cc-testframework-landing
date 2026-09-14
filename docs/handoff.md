# Handoff-Briefing für neue Claude-Session

**Datum:** 2026-06-27
**Von:** pl-dev-Session im `cc_framework`-Repo (anderer Devcontainer)
**An:** Neue Claude-Session, primäres Working-Directory ist dieses Landing-Repo
**Zweck:** Du übernimmst die Landing-Page-Entwicklung. Dein konkreter erster Auftrag steht in Abschnitt 6.

> **Hinweis vom User:** Diese Doku ist Handoff-Krücke, keine Repo-Permanent-Doku. Wenn Du sie nicht mehr brauchst, lösch sie oder bitte den User, sie zu löschen.

---

## 1. Was die Landing heute tut

Sie ist **mehr als nur Marketing-Landing** — sie ist der Sales-Vetted-Onboarding-Flow für das Produkt `@meintest/cc-testframework` (ein npm-Paket, distribuiert über GitHub Packages).

**Customer-Flow heute:**

```
Interessent  →  /demo-request (4-Feld-Form: Name, Email, Company, Use-Case)
                  ↓ POST /api/demo-request
                  ↓ Server signiert HMAC-Action-Token (24h gültig)
                  ↓ Resend → Sales-Inbox (mit "Approve and issue signup link"-Button)
                  ↓
Sales         →  klickt Button → /sales/action?t=<HMAC-Token>
                  ↓ verifyActionToken (HMAC + Expiry)
                  ↓ Read-only Customer-Daten + Expiry-Dropdown (default 7 Tage)
                  ↓ klickt "Issue and email signup link"
                  ↓ POST /api/sales/action-issue
                  ↓ Keygen.createPendingLicense (mit salesToken + tokenExpiresAt)
                  ↓ Resend → Customer (mit /signup?token=<X>)
                  ↓
Customer      →  klickt Link → /signup?token=<X>
                  ↓ Token-Validation gegen Keygen (existiert, nicht-expired, nicht-consumed)
                  ↓ Form mit hidden Token-Field
                  ↓ POST /api/signup
                  ↓ Iter-19-Orchestrierung: Trial-Lizenz (Keygen) + GitHub-Invite + Welcome-Mail
                  ↓ deleteLicense(pendingId) ← single-use enforced
                  ↓
Customer      ←  bekommt Welcome-Mail mit License-Key + GitHub-Invite
```

**Wichtig:**
- **Zwei Token-Arten**: Action-Token (HMAC-signed, 24h, stateless) für Sales; Sales-Token (UUID, 7d default, in Keygen Pending-License) für Customer
- **`/sales`**-Admin-UI (Basic-Auth, Username `sales`, Password = `SALES_API_KEY`) existiert als Legacy-Fallback für Out-of-Band-Tokens (Telefonat, Messe, ...)
- **`/api/cron/trial-reminders`** ist als Vercel-Cron (täglich) konfiguriert, sendet 2 Tage vor Trial-Ende eine Reminder-Mail

## 2. Architektur in 60 Sekunden

**Stack:** Next.js 16 (App Router, `force-dynamic` auf flag-aware Pages) + TypeScript + React. Deploy auf Vercel.

**Vendor-Integrationen:**

| Komponente | Wofür | Wo im Code |
|---|---|---|
| **Keygen.io** | License-Management (Trial + Pending) | `app/api/signup/lib/keygen.ts` |
| **GitHub App** | Repo-Invite an Customer-User | `app/api/signup/lib/github.ts` |
| **Resend** | Transactional Mails (Sales-Notify, Welcome, Reminder) | `app/api/signup/lib/resend.ts` |
| **Vercel** | Hosting + Cron + Env-Vars | `vercel.json`, `proxy.ts` |

**Wichtige Code-Pfade (lies sie zuerst):**

```
app/page.tsx                                    Hero, flag-aware CTA
app/demo-request/page.tsx                       4-Feld-Form
app/demo-request/DemoRequestForm.tsx
app/signup/page.tsx                             3-way-Branching: Disclaimer / Open / Vetted+Token
app/signup/SignupForm.tsx
app/sales/page.tsx                              Legacy-Admin-UI (Basic-Auth-protected)
app/sales/SalesIssueForm.tsx
app/sales/action/page.tsx                       Magic-Link-Server-Component (HMAC-verify)
app/sales/action/ActionConfirm.tsx              Client-Component (one-click Issue)

app/api/demo-request/route.ts                   POST: build HMAC, mail Sales
app/api/signup/route.ts                         POST: token-validate, orchestrate
app/api/signup/lib/keygen.ts                    Trial + Pending-License CRUD
app/api/signup/lib/github.ts                    Invite + Welcome-Repo-Setup
app/api/signup/lib/resend.ts                    Mail-Templates + Send
app/api/sales/action-issue/route.ts             POST: re-verify HMAC + issue
app/api/sales/issue-token/route.ts              POST: Bearer-Auth, manual token issue
app/api/sales/issue-token-and-email/route.ts    POST: Bearer-Auth, manual issue + mail
app/api/sales/lib/auth.ts                       Bearer-Auth-Check
app/api/sales/lib/action-token.ts               HMAC sign/verify (Magic-Link)
app/api/sales/lib/issue.ts                      Shared issueToken() + validateIssuePayload()
app/api/cron/trial-reminders/route.ts           Daily Cron

proxy.ts                                        Basic-Auth für /sales (exact match), Next.js 16 (vormals middleware.ts)
```

## 3. Env-Vars in Vercel (Stand 2026-06-27)

Alle konfiguriert. Für Production-Flag-Switches relevant:

| Var | Werte | Wofür |
|---|---|---|
| `SIGNUP_ENABLED` | `"true" \| "false"` | Kill-Switch — bei `false` zeigt `/signup` einen Disclaimer |
| `SALES_VETTED_MODE` | `"true" \| "false"` | Bei `true`: vetted-Flow erzwungen; bei `false`: offener Flow möglich |
| `DRY_RUN` | `"true" \| "false"` | Bei `true`: keine externen Calls, nur Logs (für Smoke-Tests) |
| `KEYGEN_ACCOUNT_ID` | UUID | Keygen-Account |
| `KEYGEN_API_TOKEN` | string | Bearer für Keygen-API |
| `KEYGEN_PRODUCT_ID` | UUID | cc-testframework Product |
| `KEYGEN_TRIAL_POLICY_ID` | UUID | trial-14d Policy |
| `KEYGEN_PENDING_POLICY_ID` | UUID | cc-testframework-trial-pending Policy |
| `RESEND_API_KEY` | string | Resend-API |
| `RESEND_FROM` | string | Absender (heute `cc-testframework <onboarding@resend.dev>` — Sandbox bis Domain-Verify) |
| `RESEND_SUPPORT_TO` | string | `support@itsbusiness.ch` (Welcome-Copy) |
| `SALES_API_KEY` | 64-Hex | Doppelt genutzt: Bearer-Auth für `/api/sales/*` + HMAC-Secret für Action-Tokens + Basic-Auth-Password für `/sales` |
| `SALES_NOTIFY_EMAIL` | string | `support@itsbusiness.ch` heute; später `sales@itsbusiness.ch` |
| `GH_APP_ID` | int | GitHub-App-ID |
| `GH_APP_PRIVATE_KEY` | PEM | GitHub-App-Private-Key |
| `GH_INSTALLATION_ID` | int | GitHub-App-Installation auf der `meinTest`-Org |
| `GH_ORG` | string | `meinTest` |
| `GH_REPO` | string | `cc-testframework` |
| `QUICKSTART_URL_EN` | URL | `https://meintest.github.io/cc-testframework/en/quickstart/` |
| `QUICKSTART_URL_DE` | URL | `https://meintest.github.io/cc-testframework/de/quickstart/` |
| `CRON_SECRET` | string | Vercel setzt das automatisch, schützt Cron-Endpoint |

**Vercel-Settings:**
- Deployment Protection: "Only Preview Deployments" (Production ist public)
- Cron `/api/cron/trial-reminders`: täglich

## 4. Was offen ist (Pre-Live-Constraints)

Aus dem `cc_framework`-Repo dokumentiert, hier kompakt:

| # | Constraint | Status | Blocker für |
|---|---|---|---|
| 1 | **Resend-Subdomain `mail.itsbusiness.ch` verifizieren** | offen | Customer-Mails an Fremd-Empfänger |
| 2 | Vercel Pro-Upgrade ($20/Mt) nach GL-Approval | offen | TOS-Konformität für commercial use |
| 3 | Custom-Domain `cc-testframework.itsbusiness.ch` per CNAME | offen | Customer-Trust + Pitch-Wert |
| 4 | `RESEND_FROM` swap auf `onboarding@mail.itsbusiness.ch` | offen | hängt an #1 |
| 5 | `RESEND_SUPPORT_TO` swap auf `support@itsbusiness.ch` (falls Mailbox anders) | optional | – |
| 6 | GitHub-App-Homepage-URL auf Custom-Domain updaten | offen | hängt an #3 |
| 7 | `SALES_NOTIFY_EMAIL` swap auf `sales@itsbusiness.ch` | offen | sales-Mailbox-Setup |
| 8 | B.6-Live-Smoke-Test gegen echte Customer-Mail (vetted Flow end-to-end) | geparkt | hängt an #1 |
| 9 | Final-Switch: `DRY_RUN=false` + `SIGNUP_ENABLED=true` | offen | hängt an #1, #8 |

**Step-by-step-Runbook für Live-Cutover** liegt im `cc_framework`-Repo unter `output/dev/confluence/runbook_resend_domain_verify.md`. Du kannst es via `gh api repos/meinTest/cc-testframework/contents/output/dev/confluence/runbook_resend_domain_verify.md --jq .content | base64 -d` fetchen, wenn Du es brauchst.

## 5. Was im `cc_framework`-Repo dokumentiert ist

Der ganze Architektur-, Strategie- und Lerndoku-Stack zur Sales-Vetted-Onboarding-Funktionalität lebt im `cc_framework`-Repo (GitHub: `meinTest/cc-testframework`). Du brauchst's nicht zwingend für Deine Aufgabe (Abschnitt 6), aber für tiefen Kontext:

| Datei | Inhalt |
|---|---|
| `output/dev/strategy/initiative_5_license_trial_automation.md` | Strategie-Übersicht (warum Sales-Vetted, Vendor-Wahl, Abgrenzung) |
| `output/dev/strategy/onboarding-trial-strategy.md` | Sales-Flow + Marp-Slide-Deck |
| `output/dev/strategy/ip_protection_gl_vorlage.md` | Warum Sales-Vetted statt Code-Obfuscation (GL-Diskussion) |
| `output/dev/confluence/lernen_6c.md` | GitHub-App + Landing-Skelett (Iter 18) |
| `output/dev/confluence/lernen_6d.md` | Signup-Orchestrierung (Iter 19) |
| `output/dev/confluence/lernen_6e_sales_handoff_und_reminder.md` | Cron + Sales-Workflow (Iter 20) |
| `output/dev/confluence/lernen_6f_sales_vetted_onboarding.md` | **Sales-Vetted + Magic-Link + Smoke-Test-Suite (Iter 21)** — wichtigste Doku, hat alle Architektur-Begründungen + die 6-Step-Smoke-Test-Suite Pass A + B + Negativ-Pfade |
| `output/dev/confluence/runbook_resend_domain_verify.md` | Live-Cutover-Runbook |
| `output/permanent/pl-dev.md` | Initiative-5-Status + die 9 Pre-Live-Constraints (oben in Abschnitt 4 gespiegelt) |

## 6. **Dein Auftrag — Multi-Produkt-Erweiterung**

Der User baut in einem anderen Projekt ein zweites Produkt: ein **Test-Management-Tool** (TMT). Es soll über denselben Kanal ausgeliefert werden:
- GitHub Packages (npm-Paket) → Code-Distribution
- Keygen.io → License-Management
- Vercel → Landing-Page + Customer-Journey

**Deine Aufgabe:** Diese Landing-Page so erweitern, dass sie **beide Produkte** abdecken kann — `@meintest/cc-testframework` UND das neue TMT — ohne Doppelung der Auslieferungs-Infrastruktur.

### Design-Entscheidungen, die Du mit dem User klären solltest

Bevor Du Code schreibst, lass Dir vom User folgende Fragen beantworten:

**Produkt-Discriminator-Strategie:**
1. **Wo wählt der Interessent das Produkt?**
   - Option A: Dropdown auf `/demo-request` (1 Form, 2 Produkte)
   - Option B: Separate Pfade `/demo-request/cc-testframework` + `/demo-request/tm-tool`
   - Option C: Hero-CTA auf `/` führt zur Produkt-Auswahl, dann gemeinsame Form
   - Option D: Zwei eigenständige Sub-Landings (subdomain `tmt.cc-testframework.itsbusiness.ch`?)
2. **Wie diskriminiert die DB / der Code?** Vermutlich ein `product`-Field in der Form, im Action-Token, in der Pending-License-Metadata. Wirkt sich auf die meisten Routes aus.

**Keygen-Setup-Erweiterung:**
3. **Eigene Keygen-Account-Domain** für TMT oder selbe `cc-testframework`-Account erweitern?
4. **Eigene Policies pro Produkt** (`tmt-trial-14d`, `tmt-trial-pending`) oder generische?
5. **Eine License pro Produkt** oder kombinierte "Suite-License"?

**GitHub-Setup-Erweiterung:**
6. **Neues Repo** `meinTest/tm-tool` für den Code? GitHub-App-Installation auf demselben Org?
7. **Eigene Invite-Logik** — Customer wird auf separate Repos eingeladen je nach Produkt?

**Resend-Setup-Erweiterung:**
8. **Eigene Mail-Templates** pro Produkt (Welcome + Reminder + Sales-Notify) oder parametrisierte?
9. **Subdomain `mail.itsbusiness.ch`** deckt beide Produkte ab — keine eigene Resend-Domain pro Produkt nötig

**UI/UX:**
10. **Marketing-Story** auf `/`: zwei Produkte gleichberechtigt, oder TMT als Add-on zu cc-testframework?
11. **Gemeinsame Sales-Mailbox** (`sales@`) oder eigene pro Produkt?

### Was ich (von außen) als sinnvolle Default-Annahmen sehe

Diese kannst Du als Diskussionsgrundlage mit dem User nutzen:

- **Eine Form (`/demo-request`) mit Produkt-Dropdown** — am benutzerfreundlichsten, weniger Code-Duplikation
- **Ein Keygen-Account, ein Product-Eintrag pro Produkt** — saubere Trennung, eigene Policies pro Produkt
- **Ein GitHub-App, mehrere Repos** — Invite-Logik wird parametrisiert nach `product`-Wert
- **Generic Mail-Templates mit Produkt-Variablen** — z. B. `{{ productName }}`, `{{ repoUrl }}`, `{{ quickstartUrl }}` als Template-Vars
- **Action-Token enthält `product`-Field** — wird in HMAC mit-signiert, beim Issue + Signup propagiert
- **Pending-License-Metadata enthält `product`** — damit `/api/signup` weiß, welche Trial-Policy anzuwenden ist
- **Env-Vars werden produkt-spezifisch verzweigt** — z. B. `KEYGEN_TRIAL_POLICY_ID_FRAMEWORK` + `KEYGEN_TRIAL_POLICY_ID_TMT`, oder als JSON-Map `KEYGEN_PRODUCTS={"framework":{"trial":"...","pending":"..."},"tmt":{...}}` — letzteres skaliert besser

### Wo Du anfangen würdest (sequence-Vorschlag)

1. **Discovery + Design** — Klärung der 11 Fragen oben mit dem User, dann Design-Doc schreiben analog zu `lernen_6f` Abschnitt 2 (Architektur). Im Landing-Repo z. B. `docs/multi-product-architecture.md`
2. **Migration der `product`-Field-Propagation** — durch die ganze Token-Chain (Form → DemoRequest-Mail → Action-Token → Pending-License → Signup → Trial-License). Defensive Defaults: existing Calls ohne `product` setzen `product = "cc-testframework"` (backward-compat)
3. **Keygen-Setup für TMT** durch den User (Policies anlegen), dann `lib/keygen.ts` parametrisieren
4. **Mail-Templates parametrisieren** in `lib/resend.ts`
5. **UI: Produkt-Dropdown in DemoRequestForm**, plus optional eine Product-Selector-Seite
6. **Smoke-Tests erweitern** — die 6-Step-Suite aus `lernen_6f` §9 wird auf beide Produkte erweitert
7. **Doku im `cc_framework`-Repo nachpflegen** (oder im Landing-Repo eine eigene Doku-Struktur aufziehen — Diskussion mit User)

### Was Du NICHT angreifen solltest

- Das `cc_framework`-Repo (Test-Framework-Code) — das ist die andere Session
- Die Initiative-3-Arbeit (Appium-Desktop-Strategy) — aktuell laufend in der anderen Session, kann komplett ignoriert werden
- Vercel-Dashboard-Klicks selbst — der User macht die UI-Aktionen, Du lieferst die Spec-Werte

## 7. Wichtige Projekt-weite Konventionen

Aus der `cc_framework`-Memory (gilt auch hier):

**Secret-Handling:**
- **Niemals PATs/API-Keys in Chat oder Files** schreiben
- User bevorzugt `set +o history` + `read -s` Pattern für Token-Eingabe in Bash
- Wenn der User Dir was Secrets-relevantes sagen soll, frag ihn nach `set +o history`

**Code-Sprach-Konvention:**
- **English** für: JSDoc, Inline-Comments, Error-Messages, Console-Output, Unit-Test-Titles, Identifier-Namen
- **Deutsch** für: User-facing UI-Strings (Marketing-Texte können deutsch), interne Strategy/Lerndoku-Files
- Customer-facing Mails: heute Englisch (Welcome-Mail), Pre-Live-Sales-Notify-Mails sind deutsch ok
- **Wichtig:** Wenn Du Sub-Agents dispatchst, sag ihnen explizit, dass Code-Kommentare/JSDoc auf English sind

**Git-Workflow:**
- Conventional Commits Pflicht (`feat:`, `fix:`, `chore:`, `docs:`)
- Commit-Messages mit `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` als Footer
- PAT für `cc-testframework-landing` Push ist im `.git/config` schon gespeichert (nach Clone); für `cc-testframework`-Repo brauchst Du einen separaten PAT (anderer Scope)
- `release-please` ist aktiv auf cc-testframework-Repo (nicht auf Landing) — Conventional Commits triggern dort Version-Bumps

**Test-Disziplin:**
- Vor Live-Deploy: Smoke-Test-Pässe A + B durchspielen (siehe `lernen_6f` §9)
- DRY_RUN=true für initiale Verifikation, dann DRY_RUN=false für echte Tests

## 8. Nützliche Befehle für Dich

```bash
# Status checken
git log --oneline -5
git status

# Build + Lint im Landing-Repo
npm install
npm run build
npm run lint

# Vercel-Deploy-Status (wenn vercel CLI authentisiert wäre — vermutlich nicht)
vercel ls

# cc_framework-Doku-Fetch (Beispiel)
gh api repos/meinTest/cc-testframework/contents/output/dev/confluence/lernen_6f_sales_vetted_onboarding.md --jq .content | base64 -d | less
```

## 9. Wenn Du Architektur-Fragen hast, die ich nicht beantwortet habe

Die andere Session (im `cc_framework`-Repo, anderer Devcontainer) hat den vollen Kontext und kann jederzeit kontaktiert werden — der User leitet weiter wenn nötig. Ich verfolge die `cc_framework`-Seite weiter; tausch Dich mit dem User über das Landing-Themas-Side aus.

---

**Viel Erfolg.** Der User schätzt sehr direkten, faktenbasierten Output, präferiert German für interaktive Diskussion und English für Code/Doku-Content. Er mag's wenn Du proaktiv nach Klärung fragst bei Architektur-Entscheidungen, statt sie still selbst zu fällen.
