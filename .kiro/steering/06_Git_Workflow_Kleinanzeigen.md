---
inclusion: always
---

# Git-Workflow: Kleinanzeigen-Spezifika

Foundation und 15-Schritt-Reihenfolge stehen in der globalen `23_Git_Workflow.md`. Workspace-Spezifika in `10_Git_Workflow.md` (Arbeitsplatz). Hier nur Kleinanzeigen-Eigenheiten.

## Modus

**Branch-basiert.** Direkter Push auf `main` ist im Repo blockiert (Branch-Protection). Jeder Fix laeuft ueber Feature-Branch + PR + Rebase-Merge.

## Sprache

**Deutsch** fuer:
- README-Release-Notes (Abschnitt "Changelog")
- Issue-Kommentare
- Commit-Messages-Body
- PR-Body

PR-Title und Commit-Subject in Englisch, weil Conventional Commits Standard ist.

## Repository

- **Repo:** `OldRon1977/Kleinanzeigen-Anzeigen-duplizieren`
- **Main-Branch:** `main`
- **Issue-Tracker:** GitHub Issues im selben Repo
- **Distribution:** Userscript via Tampermonkey, der `kleinanzeigen-duplizieren.user.js` direkt vom Repo laedt

## Merge-Methode

Rebase-Merge via `gh pr merge --rebase --delete-branch`.

## Versions-Bump (Schritt 3) -- Pflicht

Pflicht im selben PR, sobald die Aenderung den User-sichtbaren Userscript-Pfad beruehrt.

Folgende Stellen muessen synchron sein:

1. **`package.json`** -- `version` Feld, Single Source of Truth.
2. **`kleinanzeigen-duplizieren.user.js`** -- Userscript-Header `// @version       X.Y.Z`.
3. **`helper.user.js`** -- nur wenn Helper aktualisiert wurde, eigener Header `// @version`.
4. **`README.md`** -- neuer Eintrag im Abschnitt "Changelog" oberhalb des bestehenden.

**Synchronisation aktuell manuell.** Geplant: Build-Script, das `@version` aus `package.json` in den Userscript-Header schreibt. Bis dahin: Pre-Commit-Sweep zwingend:

```powershell
$pkg = (Get-Content package.json -Raw | ConvertFrom-Json).version
$uVer = (Select-String -Path "kleinanzeigen-duplizieren.user.js" -Pattern '@version\s+(\S+)').Matches.Groups[1].Value
if ($pkg -ne $uVer) { Write-Error "Version mismatch: package.json=$pkg, user.js=$uVer" }
```

Beim Bump des Helpers analog `helper.user.js` checken.

## Build (Schritt 4) -- aktuell kein Build

Kein npm-Build-Script. `kleinanzeigen-duplizieren.user.js` wird manuell editiert.

Geplant: Build-Script, das Header und Body synchronisiert. Wenn vorhanden, wird Schritt 4 Pflicht (`npm run build`).

## Release-Notes (Schritt 6) -- Pflicht

- Datei: `README.md`, Abschnitt **`## Changelog`**.
- Sprache: Deutsch.
- Format wie bestehende Eintraege:
  ```
  ### Version X.Y.Z (Monat YYYY)

  - **Neu**: ...
  - **Fix**: ...
  - Intern: ...
  ```
- Neuer Eintrag oberhalb des bestehenden.
- **Keine Issue-Refs** (globale Regel).

## Issue-Kommentare (Schritte 7 und 15) -- Pflicht (wenn Issue)

- Sprache: Deutsch.
- Live-Kommentar nach Merge gemaess globaler Regel.
- Format-Vorlage:
  > Fix ist live in vX.Y.Z. Update via Tampermonkey oder Re-Install ueber den Userscript-Link.
  >
  > [Optional 2-4 Saetze ueber die Ursache.]
- Issue wird NICHT geschlossen, nur referenziert.
- Test-Aufforderungen an Reporter schreibt der User manuell.

## Freigabe-Gate (Schritt 10) -- Pflicht

User testet auf gepushtem Branch via Tampermonkey-Install der Branch-Version. Erst nach Freigabe geht die Auftragskette ab Schritt 11 los.

## VERBOTEN

- Direkt auf `main` committen (durch Branch-Protection ohnehin blockiert, aber explizite Regel).
- Mergen ohne User-OK.
- Issue automatisch schliessen.
- Versions-Bump ohne synchronen `@version`-Header in der `.user.js`.
- Issue-Refs in `README.md` (Changelog), Issue-Kommentaren oder Doku.