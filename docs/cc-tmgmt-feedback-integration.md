# cc-tmgmt In-App-Feedback → GitHub Issues — Integrations-Info für die App-Session

**Status:** live in Production, end-to-end verifiziert (POST legt Issue an, GET liest
kundeneigenen Status). Stand 2026-06-30.
**Gegenstück:** Onboarding-/Lieferketten-Repo `cc-testframework-landing` (Vercel).

---

## Auth (wie beim Update/Download-Proxy)
Jeder Request trägt den **Keygen-Lizenzschlüssel** als Bearer:
```
Authorization: Bearer <keygen-lizenzschlüssel>
```
Der Proxy validiert das Entitlement (`product = cc-tmgmt`) und ermittelt **serverseitig**
`company` + `licenseId` aus der Lizenz. **Diese Felder NICHT vom Client senden** — sie werden
ohnehin ignoriert und serverseitig gesetzt.

## Basis-URL
```
https://cc-testframework-landing.vercel.app/api/feedback
```

---

## 1) Issue anlegen — `POST /api/feedback`

**Request-Body:**
```jsonc
{
  "type": "bug" | "feature",     // Pflicht
  "title": "string",             // Pflicht (max 200 Zeichen)
  "description": "string",       // Pflicht (max 10000)
  "repro": "string",             // optional (max 10000)
  "source": "user" | "copilot",  // optional, Default "user"
  "context": {                   // optional — NUR Tool-Telemetrie, KEINE AUT-/Testdaten
    "version": "0.6.2",
    "platform": "win32",
    "osVersion": "10.0.26200",
    "view": "workspace",
    "lastError": "string|null"
  }
}
```

**Response (200):**
```jsonc
{ "ok": true, "issueNumber": 3, "issueId": 4776805557, "status": "received", "createdAt": "ISO-8601" }
```

**Beispiel (Client):**
```js
const res = await fetch("https://cc-testframework-landing.vercel.app/api/feedback", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${licenseKey}` },
  body: JSON.stringify({ type, title, description, repro, source, context }),
});
const data = await res.json(); // { ok, issueNumber, issueId, status, createdAt }
```

---

## 2) Eigene Meldungen + Status — `GET /api/feedback`

Liefert **ausschließlich** die Meldungen der anfragenden Lizenz (serverseitig über das
`customer:<licenseId>`-Label gefiltert — der Client kann keine fremden Issues abfragen).

**Response (200):**
```jsonc
{ "ok": true, "reports": [
  { "issueNumber": 12, "status": "done",        "statusReason": null,                 "deliveredVersion": "0.6.6", "updatedAt": "ISO" },
  { "issueNumber": 3,  "status": "received",    "statusReason": null,                 "deliveredVersion": null,    "updatedAt": "ISO" },
  { "issueNumber": 1,  "status": "rejected",    "statusReason": "Außerhalb des Scopes.", "deliveredVersion": null, "updatedAt": "ISO" }
] }
```

**Status-Werte:** `received` · `reviewing` · `in_progress` · `done` · `rejected`.
**`statusReason`:** i. d. R. `null`; nur gefüllt, wenn ein Maintainer beim Schließen eine
**bewusst freigegebene** Begründung hinterlegt hat (sonst werden NIE interne Kommentare
ausgespielt). Praktisch relevant v. a. bei `rejected`.
**`deliveredVersion`:** App-Version, mit der die Meldung ausgeliefert/gefixt wurde (String
wie `"0.6.6"`), sonst `null` — siehe Abschnitt 5.

---

## 3) Bearbeiten — `PATCH /api/feedback/{issueNumber}`

Nur erlaubt, **solange Status = `received`** (offen, kein Workflow-Label). Server erzwingt
Eigentum + Status (Client-Sichtbarkeit ist keine Sicherheit).

**Request-Body:**
```jsonc
{ "type": "bug" | "feature", "title": "string", "description": "string", "repro": "string?" }
```
**Response (200):**
```jsonc
{ "ok": true, "issueNumber": 123, "status": "received", "updatedAt": "ISO" }
```
Der automatisch erfasste **Kontext-Abschnitt bleibt erhalten** (Telemetrie wird nicht neu
gesendet); `company` kommt weiter aus der Lizenz.

## 4) Zurückziehen — `DELETE /api/feedback/{issueNumber}`

Entfernt die Meldung **nur aus der Tool-Liste**. Das **GitHub-Issue bleibt OPEN und
unverändert** — kein Schließen, kein Löschen; das Team arbeitet es normal weiter. Intern
wird es als „client-hidden" markiert; **`GET` blendet diese Meldungen aus**. Nur bei
Status = `received` erlaubt.

**Response (200):** `{ "ok": true }`

---

## 5) `deliveredVersion` im `GET` (App-Feature #9)

Jeder Report kann ein **optionales `deliveredVersion`** tragen — die App-Version, mit der ein
Feature ausgeliefert / ein Bug gefixt wurde (String wie `"0.6.6"`, sonst `null`).

**Quelle (Team-Seite):** der Proxy liest sie aus
1. einem Label **`shipped:<version>`** am Issue (z. B. `shipped:0.6.6`) — hat Vorrang, **sonst**
2. dem **Milestone-Titel** des Issues.

Typischerweise gesetzt, wenn der Status auf `done` geht. Fehlt beides → `deliveredVersion: null`
(App zeigt `—`). Kein Pflichtfeld; die App führt es im lokalen Store mit.

---

## Fehlercodes
| Code | Bedeutung |
|---|---|
| `200` | ok |
| `400` | Validierungsfehler (z. B. fehlender `title`/`description`, ungültiger `type`) |
| `401` | kein Lizenzschlüssel mitgeschickt |
| `403` | Lizenz ungültig/abgelaufen/gesperrt oder nicht für cc-tmgmt berechtigt — **oder** (PATCH/DELETE) nicht die eigene Meldung |
| `404` | (PATCH/DELETE) Meldung unbekannt |
| `409` | (PATCH/DELETE) Status nicht mehr `received` → Bearbeiten/Zurückziehen nicht mehr erlaubt |
| `502` | Upstream-Fehler (Keygen/GitHub nicht erreichbar) |

Bei `4xx/5xx` ist die Antwort `{ "ok": false, "message": "..." }`.

---

## Wichtig fürs Client-Routing (bitte beachten)
- **`company`/`licenseId` nicht senden** — serverseitig aus der Lizenz, Client-Werte ignoriert.
- **`context` ist reine Tool-Telemetrie** — nichts aufnehmen, das AUT-/Testdaten enthält.
- **GET hat ~10–20 s Index-Lag:** Nach `POST` taucht das neue Issue im `GET` erst nach
  wenigen Sekunden auf (GitHub-Label-Index). Deshalb: das gerade erstellte Item
  **optimistisch aus der POST-Response** (`issueNumber` + `status:"received"`) in der Liste
  anzeigen, **nicht** sofort auf `GET` warten — sonst „verschwindet" das Feedback kurz.
- **Felder sind identisch zu euren Stubs:** `createFeedback()`/`listFeedback()`/
  `updateFeedback()`/`withdrawFeedback()` in `app/main.cjs` von Local-Store auf `fetch` gegen
  `POST/GET /api/feedback` bzw. `PATCH/DELETE /api/feedback/{issueNumber}` umstellen;
  `issueNumber`, `status`, `statusReason` matchen 1:1.
- **Bearbeiten/Zurückziehen nur bei `received`:** Aktionen wie gehabt nur dann anzeigen. Der
  Server gibt sonst **`409`** zurück (Status hat sich inzwischen geändert) — die App kann das
  als „nicht mehr möglich, bitte Liste aktualisieren" behandeln.

## Status-Workflow (Server-/Team-Seite, nur zur Info)
Stati werden aus GitHub-Issue-State + Labels gemappt: offen ohne Label → `received`,
`status:reviewing` → `reviewing`, `status:in-progress` → `in_progress`, closed completed /
`status:done` → `done`, closed not-planned / `wontfix` → `rejected`. `type:*`, `customer:<id>`,
`company:<name>`, `source:copilot` setzt der Proxy automatisch.
