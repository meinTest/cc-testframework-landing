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
  { "issueNumber": 3, "status": "received",    "statusReason": null,                 "updatedAt": "ISO" },
  { "issueNumber": 2, "status": "in_progress", "statusReason": null,                 "updatedAt": "ISO" },
  { "issueNumber": 1, "status": "rejected",    "statusReason": "Außerhalb des Scopes.", "updatedAt": "ISO" }
] }
```

**Status-Werte:** `received` · `reviewing` · `in_progress` · `done` · `rejected`.
**`statusReason`:** i. d. R. `null`; nur gefüllt, wenn ein Maintainer beim Schließen eine
**bewusst freigegebene** Begründung hinterlegt hat (sonst werden NIE interne Kommentare
ausgespielt). Praktisch relevant v. a. bei `rejected`.

---

## Fehlercodes
| Code | Bedeutung |
|---|---|
| `200` | ok |
| `400` | Validierungsfehler (z. B. fehlender `title`/`description`, ungültiger `type`) |
| `401` | kein Lizenzschlüssel mitgeschickt |
| `403` | Lizenz ungültig/abgelaufen/gesperrt oder nicht für cc-tmgmt berechtigt |
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
- **Felder sind identisch zu euren Stubs:** `createFeedback()`/`listFeedback()` in
  `app/main.cjs` einfach von Local-Store auf `fetch` gegen `POST/GET /api/feedback` umstellen;
  `issueNumber`, `status`, `statusReason` matchen 1:1.

## Status-Workflow (Server-/Team-Seite, nur zur Info)
Stati werden aus GitHub-Issue-State + Labels gemappt: offen ohne Label → `received`,
`status:reviewing` → `reviewing`, `status:in-progress` → `in_progress`, closed completed /
`status:done` → `done`, closed not-planned / `wontfix` → `rejected`. `type:*`, `customer:<id>`,
`company:<name>`, `source:copilot` setzt der Proxy automatisch.
