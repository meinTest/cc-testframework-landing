# Handoff — Onboarding-/Lieferketten-Repo (keyGen / Vercel / GitHub-App)

> Dieser Auftrag wird in **diesem** Repo (Landing/Onboarding-Lieferkette) umgesetzt.
> Gegenstück-Konzept im cc-test-mgmt-ui-Repo: `docs/delivery-chain.md`.
> Stand 2026-06-28 (Option A entschieden).

---

## Auftrag: cc-test-mgmt-ui (cc-tmgmt) in die bestehende Onboarding-/Lieferkette einklinken

### Kontext

Wir haben ein neues Produkt: **cc-test-mgmt-ui** ("cc-tmgmt") — ein Git-basiertes
Test-Management-Tool. Es ist eine lokale **Windows-Exe (WebView2-Frame)**, die auf
`localhost` eine UI rendert, mit der Fachtester TypeScript-Test-Specs editieren, OHNE je
bewusst Git zu bedienen (commit/push/pull/PR laufen im Hintergrund). Es integriert das
hausinterne **CC-Framework** (`@meintest/cc-testframework`) als Execution-Engine.
Vertriebsmodell ist **Blueprint** (Code + Expertise, kein SaaS).

Dieses Repo betreibt bereits die Onboarding-/Lieferkette für das **CC-Framework**:
- **keyGen** (GitHub-App, generiert PATs)
- **Vercel**-Onboarding-Site (Kunde requested Demo, mit keyGen verbunden)
- Nach Sales-Deal: PAT-Mail → Kunde lädt Core via NPM → Self-Setup via Doku (GitHub Pages)

**Ziel:** cc-tmgmt als ZWEITES Produkt in genau diese Chain einklinken — bestehende
Patterns wiederverwenden, nicht neu erfinden.

### Arbeitsteilung (wichtig)

NICHT in diesem Repo zu bauen (macht das cc-test-mgmt-ui-Repo selbst):
- die Exe, das Packaging, die GitHub-Release-Action, die Self-Update-Logik in der Exe.

> **ENTSCHEIDUNG (2026-06-28): Option A — keyGen-Proxy.** Die Exe spricht NICHT direkt GitHub an,
> sondern **eure Vercel-API**, und schickt den **Keygen-Lizenzschlüssel** als Bearer. Kein
> GitHub-Account/PAT beim Tester. Der Interface-Vertrag wurde entsprechend geändert (die Exe ist
> noch in Entwicklung). Option B (Collaborator-Invite) ist verworfen.

IN DIESEM Repo umzusetzen:
1. **Produkt-Registrierung**: cc-tmgmt als neues Produkt/SKU neben CC-Framework in keyGen.
2. **Update-/Download-Proxy (Vercel-API)**: Endpunkte, die mit dem Keygen-Lizenzschlüssel
   (Bearer) das Entitlement prüfen (`product = cc-tmgmt`, Lizenz aktiv) und dann das
   GitHub-Release von `meinTest/cc-test-mgmt-ui` bedienen — Details unten im Interface-Vertrag.
3. **Vercel-Onboarding**: cc-tmgmt als Produkt-Option im Demo-Request-Flow, mit keyGen verbunden.
4. **Post-Sales-Flow** (Resend-Mail): (a) Download-Link (über den Proxy, gated),
   (b) **Zugangscode = Keygen-Lizenzschlüssel**, (c) Kurz-Setup ("App herunterladen, starten,
   Zugangscode eingeben").
5. **Entitlement-Gating + Revocation/Rotation** zentral in keyGen (Lizenz deaktivieren / Key neu).
6. **Docs/GitHub-Pages** für das cc-tmgmt-Setup (analog zur CC-Framework-Doku).

### Interface-Vertrag — Option A (worauf sich die cc-tmgmt-Exe verlässt)

Die App ist **Electron** (Windows/Linux/macOS) und nutzt **`electron-updater` mit dem
`generic`-Provider**, der auf eure Proxy-Basis-URL zeigt und einen Auth-Header mitschickt.

- **Auth**: jeder Request der App trägt `Authorization: Bearer <keygen-lizenzschlüssel>`.
  Euer Endpoint validiert die Lizenz (aktiv, `product = cc-tmgmt`).
- **Update-Feed**: unter der Basis-URL müsst ihr die von electron-updater erwarteten Dateien
  bedienen (aus dem GitHub-Release proxien):
  - `…/latest.yml` (Windows), `…/latest-linux.yml`, `…/latest-mac.yml`
  - die darin referenzierten Assets unter `…/<dateiname>` →
    **302-Redirect auf eine kurzlebige GitHub-Asset-URL** (kein Voll-Stream → Bandbreite sparen).
  - sha512/size aus den yml bleiben gültig, solange der Redirect die exakten Bytes liefert.
- **Asset-Namen** (electron-builder): `cc-tmgmt-<version>-win-x64.exe` (portable),
  `cc-tmgmt-<version>-linux-x86_64.AppImage`, `cc-tmgmt-<version>-mac-arm64.dmg`. NICHT hartkodieren
  — über die yml/Release auflösen.
- **Erst-Download** der App: derselbe gated Proxy-Link in der Onboarding-Mail.
- **Artefakt-Quelle**: liegen in GitHub Releases von `meinTest/cc-test-mgmt-ui` (electron-builder
  published dorthin mit **unseren** Credentials). Ihr braucht server-seitige Lese-Credentials
  (GitHub-App) fürs Proxien — der **Kunde** bekommt nie GitHub-Zugriff.
- **Aktueller Stand**: ab Release **v0.5.0** echte Per-OS-Artefakte (noch **unsigniert**).
  ⚠️ Windows-`portable` erzeugt **kein `latest.yml`** → Windows-Auto-Update ist auf unserer Seite
  noch offen (NSIS-Per-User vs. eigener Updater); Linux/macOS-Feeds existieren.

### Vorgehen

- Zuerst die bestehenden keyGen-/Vercel-/GitHub-App-Patterns ERKUNDEN und WIEDERVERWENDEN.
- Vor größeren Änderungen einen kurzen Plan vorschlagen.
- Iterativ, kleine testbare Schritte, je Schritt verifizieren.

### Entschieden (2026-06-28)
- **Entitlement-Mechanik: Option A — keyGen-Proxy** (oben). GitHub-Collaborator-Invite verworfen.
- **Token-Lebensdauer/Rotation/Revocation**: an die Keygen-Lizenz gekoppelt (Lifetime = Laufzeit,
  Revocation = deaktivieren, Rotation = Key neu).
- **Token-Trennung**: Lizenzschlüssel = Download/Update; CC-Framework-PAT separat (nur bei
  Automatisierung, lazy); Git-Push ins Customer-Repo = eigener Credential (siehe offen).

### Noch offen (mit dem Menschen klären)
- **Repo-Hosting der Customer-Test-Repos**: GitHub / Azure DevOps / GitLab? Bestimmt den
  separaten Git-Push-Credential (bei GitHub evtl. dieselbe GitHub-App; sonst eigener Token).
