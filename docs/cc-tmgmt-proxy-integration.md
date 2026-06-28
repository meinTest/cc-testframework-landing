# cc-tmgmt Update-/Download-Proxy — Integrations-Info für die App-Session

**Status:** live in Production (2026-06-28). Validiert echt gegen Keygen.
**Gegenstück:** Onboarding-/Lieferketten-Repo `cc-testframework-landing` (Vercel).

---

## Was die cc-tmgmt-Exe tun muss

Die App (Electron) nutzt **`electron-updater` mit dem `generic`-Provider**. Provider-Basis-URL:

```
https://cc-testframework-landing.vercel.app/api/tmgmt/updates/
```

> Diese URL wird in die ausgelieferte App **eingebacken** und ist die **dauerhafte** Update-URL
> (bewusst die stabile `…vercel.app`-Production-Domain, kein Deploy-Hash). Nicht ändern, sonst
> finden bereits installierte Clients keine Updates mehr.

**Auth:** Bei **jedem** Request muss der Header mit:

```
Authorization: Bearer <keygen-lizenzschlüssel>
```

Der Lizenzschlüssel ist der Zugangscode, den der Kunde in der App eingibt (= Keygen-License-Key).

---

## Endpunkte

### Update-Feed (electron-updater)
`electron-updater` hängt selbst die passenden Dateinamen an die Basis-URL an:

- `…/updates/latest.yml` (Windows)
- `…/updates/latest-linux.yml`
- `…/updates/latest-mac.yml`
- `…/updates/<asset-dateiname>` → **302-Redirect** auf eine kurzlebige GitHub-Asset-URL

Der Proxy liest das jeweils **neueste Release** von `meinTest/cc-test-mgmt-ui`, liefert die
yml als Text und Assets als Redirect. **Asset-Namen nicht hartkodieren** — sie werden aus der
yml/Release aufgelöst; neue Versionen/Architekturen funktionieren automatisch.

### Erst-Download (für die Onboarding-Mail / manueller Download)
```
https://cc-testframework-landing.vercel.app/api/tmgmt/download?os=win|mac|linux&key=<lizenzschlüssel>
```
Lizenz-gated, löst das aktuelle Installable für das OS zum Klick-Zeitpunkt auf und 302-redirected
auf die GitHub-Asset-URL. (Hier der Key als `?key=`, weil Browser-/Mail-Links keinen Header setzen
können.)

---

## Antwort-/Fehlercodes

| Code | Bedeutung |
|---|---|
| `200` | yml-Feed (Text) |
| `302` | Redirect auf die (kurzlebige) GitHub-Asset-URL |
| `401` | Kein Lizenzschlüssel mitgeschickt |
| `403` | Lizenz ungültig/abgelaufen/gesperrt **oder** nicht für cc-tmgmt berechtigt |
| `404` | Datei nicht im aktuellen Release vorhanden |
| `502` | Upstream-Fehler (Keygen/GitHub nicht erreichbar) |

## Entitlement-Bedingung
Der Proxy gibt nur frei, wenn die Lizenz **aktiv** ist **und** ihre Metadata `product = "cc-tmgmt"`
trägt. Im echten Flow setzt das die Onboarding-Kette automatisch beim Ausstellen der Lizenz.
Revocation/Ablauf zentral über Keygen (Lizenz deaktivieren / Laufzeit) → Proxy sperrt sofort.

## Verifiziert (Production, ohne gültigen Key)
- `…/updates/latest.yml` ohne Header → `401`
- `…/updates/latest.yml?key=<ungültig>` → `403` (echte Keygen-Antwort)
