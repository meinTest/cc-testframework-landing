# cc-tmgmt — Download/Update-Entitlement: Architektur-Optionen

> **ENTSCHIEDEN (2026-06-28): Option A — keyGen-Proxy.** Die App ist Electron und nutzt
> `electron-updater` (`generic`-Provider) gegen unsere Proxy-Basis-URL mit
> `Authorization: Bearer <keygen-lizenzschlüssel>`. Option B (Collaborator-Invite) ist
> verworfen. Maßgeblicher, aktueller Brief: `docs/onboarding.md`. Dieses Dokument bleibt als
> Entscheidungs-Historie.

**Kontext:** cc-test-mgmt-ui („cc-tmgmt") wird als Windows-Exe über die GitHub-Releases
des privaten Repos `meinTest/cc-test-mgmt-ui` ausgeliefert. Diese Landing/Onboarding-Repo
betreibt die Lieferkette (Keygen + GitHub-App + Vercel + Resend). Offen ist, **wie der
Download/Update autorisiert wird**.

## Der Kern-Konflikt (aus `onboarding.md`)

- **Interface-Vertrag:** Die Exe fragt `GET /repos/meinTest/cc-test-mgmt-ui/releases/latest`
  und schickt einen PAT als Bearer → die Exe spricht **GitHub direkt** an.
- **Gleichzeitig:** „Wir stellen einen Token aus + mailen ihn" mit **per-Kunde-Revocation**.

Ein einzelner, gemailter, GitHub-tauglicher PAT mit sauberem per-Kunde-Widerruf ist
GitHub-seitig unsauber (PATs hängen an User-Accounts, sind pro Kunde nicht sauber
programmatisch erzeugbar). Daraus ergeben sich die folgenden Optionen.

---

## Option A — keyGen-Proxy *(Empfehlung)*

Die Exe spricht **unsere** Vercel-API an (z. B. `/api/tmgmt/releases/latest` + `/download`)
und schickt den **Keygen-Lizenzschlüssel** als Bearer. Unser Server validiert das
Entitlement (Lizenz aktiv, `product = cc-tmgmt`) und streamt/redirected das Release-Asset
mit **unseren** server-seitigen GitHub-App-Credentials.

- **„Token" beim Kunden:** der Keygen-Lizenzschlüssel (nichts GitHub-spezifisches)
- **Entitlement + Revocation:** zentral in Keygen (Lizenz deaktivieren)
- **Rotation:** Lizenzschlüssel neu ausstellen
- **Kunde braucht GitHub-Account:** nein
- **Exe-Contract:** **muss geändert werden** (Exe → unsere API statt GitHub direkt).
  Laut `onboarding.md` noch möglich, da WebView2/SEA-Packaging noch nicht steht.

**Pro:** eine Token-Art, einzige Entitlement-Quelle, kein GitHub-Account/PAT-Friction für
den Fachtester, Revocation trivial.
**Contra:** erfordert Contract-Änderung und Koordination mit der cc-tmgmt-Exe-Session;
wir hosten einen Download-Proxy (Bandbreite/Vercel-Limits beachten, ggf. Redirect auf
eine kurzlebige GitHub-Asset-URL statt Voll-Stream).

---

## Option B — GitHub-Collaborator-Invite

Der Kunde wird (read-only) als Outside-Collaborator ins private Repo
`meinTest/cc-test-mgmt-ui` eingeladen — analog zum bestehenden Framework-Flow
(`inviteCollaborator`). Der Kunde nutzt seinen **eigenen** Fine-grained-PAT; die Exe
spricht **GitHub direkt** an (Contract unverändert).

- **„Token" beim Kunden:** eigener PAT des Kunden
- **Entitlement + Revocation:** Collaborator entfernen, wenn die Lizenz abläuft
  (braucht einen Cron/Job, der Keygen-Status → GitHub-Membership spiegelt)
- **Kunde braucht GitHub-Account:** ja
- **Exe-Contract:** bleibt wie ist

**Pro:** kein Contract-Change, nutzt vorhandene GitHub-App-Invite-Mechanik.
**Contra:** GitHub-Account-Pflicht + PAT-Erstellung (Friction für Fachtester); Read-Zugriff
umfasst i. d. R. den **Repo-Quellcode**, nicht nur Release-Assets (nur akzeptabel, wenn
„Blueprint" ohnehin Code-Einsicht erlaubt); Revocation ist ein zweiter, eigener Mechanismus
neben Keygen.

---

## Option C — Erst mit der cc-tmgmt-Exe-Session klären

Der Interface-Vertrag (Exe → GitHub direkt vs. Exe → unsere API) gehört der
cc-test-mgmt-ui-Session. Bevor wir uns auf A oder B festlegen, wird dort abgestimmt, ob der
Contract geändert werden darf. Diese Repo liefert dazu nur die Spec/Optionen.

- **Pro:** vermeidet, dass beide Seiten widersprüchliche Annahmen implementieren.
- **Contra:** blockiert den Start der cc-tmgmt-Fulfillment-Implementierung hier.

> Faustregel: **Contract darf sich ändern → A.** **Contract ist fix (Exe → GitHub direkt) → B.**

---

## Abhängige Folge-Entscheidungen

- **Token-Lebensdauer / Rotation / Revocation:** an die Keygen-Lizenz koppeln
  (Lifetime = Lizenz-Laufzeit, Revocation = deaktivieren, Rotation = Key neu ausstellen).
  Bei Option A automatisch erfüllt.
- **Ein Token oder mehrere** (Download/Update vs. cc-framework-npm vs. Git-Push):
  getrennt halten, lazy ausstellen. tmgmt-Kunde bekommt zunächst nur den Download-/Update-
  Zugang; npm nur bei zusätzlicher Framework-Lizenz; Git-Push ist Sache der Exe gegen das
  **Customer**-Repo (separater, eigens konfigurierter Token).
- **Customer-Test-Repo-Hosting** (GitHub / Azure DevOps / GitLab): bestimmt den Git-Push-
  Token. Bei GitHub könnte dieselbe GitHub-App greifen; bei Azure DevOps/GitLab ein komplett
  separater Token. Noch zu klären.
