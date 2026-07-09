# REVIEW.md — Vollständiges Code-Review

**Repository:** Kleinanzeigen-Anzeigen-duplizieren
**Stand:** Commit `87dd644` (main), Review-Datum 2026-07-09
**Reviewte Version:** Hauptscript 3.5.2, Helper 1.3.1

---

## Executive Summary

Das Repository enthält zwei Tampermonkey-Userscripts für kleinanzeigen.de (Duplizieren / Smart-Neu-Einstellen von Anzeigen inkl. Batch-Modus mit Recovery-Snapshots), ein Versions-Sync-Skript und Dokumentation. Die Codequalität ist für ein Userscript-Projekt überdurchschnittlich: konsequentes Logging, dokumentierte Design-Entscheidungen, Recovery-Mechanismus gegen Datenverlust, defensive Fehlerklassifikation.

Das Review ergab **14 verifizierte Findings**: 0 Blocker, 0 Kritisch, 3 Hoch, 6 Mittel, 5 Niedrig.

Die drei wichtigsten Risiken:

1. **BUG-001 / BUG-002**: Der destruktive Smart-Republish-Fluss löscht das Original, *bevor* alle Voraussetzungen für die Neuerstellung geprüft sind, und klickt "Speichern" auch dann, wenn das adId-Feld nicht neutralisiert werden konnte.
2. **BUG-003**: Im Batch-Modus wird der Recovery-Snapshot bei einem Timeout gelöscht, obwohl ein Timeout Datenverlust gerade nicht ausschließen kann — das Sicherheitsnetz wird im unklarsten Fall zerstört.
3. **SEC-001**: Der Snapshot persistiert *alle* benannten Formularfelder (inkl. Hidden-Inputs wie `_csrf`) in IndexedDB und exportiert sie ins Recovery-ZIP — im direkten Widerspruch zur Zusicherung in SECURITY.md.

Es existieren keine automatisierten Tests (TEST-001) und keine CI-Validierung (BUILD-001); `npm run lint` ist ein reiner Syntax-Check.

---

## Scope

### Geprüft

| Bereich | Artefakte |
|---|---|
| Repositorystruktur | Gesamtes Arbeitsverzeichnis |
| Quellcode | `kleinanzeigen-duplizieren.user.js` (723 Zeilen), `helper.user.js` (880 Zeilen) |
| Buildsystem | `package.json`, `scripts/build.js` |
| Dependency Management | `package.json` (keine Dependencies deklariert) |
| Tests | `package.json` scripts, Dateisystem-Suche nach `*test*`/`*spec*` |
| Dokumentation | `README.md`, `INSTALL.md`, `SECURITY.md`, `LICENSE` |
| Konfiguration | `.gitignore`, Userscript-Header (@match, @grant, @run-at) |
| CI/CD | `.github/workflows/issues_auto-close.yml` |
| Datenbanken (clientseitig) | IndexedDB-Nutzung (`ka-batch.snapshots`) in beiden Scripts |
| APIs (konsumiert) | `POST /m-anzeigen-loeschen.json`, Bild-Fetches, CSRF-Handling |
| Logging | `logger`-Wrapper (Hauptscript), `log`/`warn` (Helper) |
| Security | OWASP-relevante Aspekte: CSRF-Handling, Datenpersistenz, DOM-Injection, @grant-Minimierung |
| Performance | Polling-Intervalle, MutationObserver, ZIP-Erstellung |
| Architektur | Zwei-Script-Architektur, Tab-übergreifendes Protokoll (localStorage + IndexedDB) |

### Nicht prüfbar (ausdrücklich gekennzeichnet)

- **Docker / Kubernetes / Deployment-Infrastruktur / Monitoring**: nicht vorhanden — für ein Browser-Userscript nicht anwendbar. Deployment erfolgt über GitHub-Raw-URLs (`@updateURL`/`@downloadURL`).
- **Serverseitige Datenbanken / eigene APIs**: nicht vorhanden.
- **Laufzeitverhalten gegen die Live-Site kleinanzeigen.de**: Selektoren, Button-Texte, Redirect-Verhalten, API-Antworten können aus dem Repository nicht verifiziert werden (siehe "Nicht verifizierbare Beobachtungen").
- **Testabdeckung**: nicht messbar, da keine Tests existieren (siehe TEST-001).

---

## Übersicht aller Findings

| ID | Titel | Kategorie | Priorität |
|---|---|---|---|
| BUG-001 | Original wird gelöscht, bevor Voraussetzungen der Neuerstellung geprüft sind | Bug | Hoch |
| BUG-002 | "Speichern" wird auch ohne Neutralisierung des adId-Felds geklickt | Bug | Hoch |
| BUG-003 | Batch löscht Recovery-Snapshot bei Timeout | Bug | Hoch |
| BUG-004 | Kein Recovery nach `saveBtn.click()` außerhalb des Batch-Modus; blockierendes Overlay | Bug | Mittel |
| BUG-005 | Host-Inkonsistenz: non-www `@match` vs. absolute www-URLs (Fetch-Credentials, localStorage-Origin) | Bug | Mittel |
| SEC-001 | Snapshot persistiert alle benannten Formularfelder inkl. `_csrf` — Widerspruch zu SECURITY.md | Security | Mittel |
| TEST-001 | Keine automatisierten Tests; "lint" ist reiner Syntax-Check | Tests | Mittel |
| BUILD-001 | Keine CI-Validierung (`npm run validate` wird nirgends automatisch ausgeführt) | Build | Mittel |
| DOC-001 | INSTALL.md: kaputtes Encoding, veraltete und widersprüchliche Inhalte | Dokumentation | Mittel |
| BUILD-002 | Versionsliteral im Code wird vom Sync-Skript nicht erfasst | Build | Niedrig |
| DOC-002 | README: Changelog endet bei 3.5.1, API-Endpunkt falsch geschrieben, CSRF-Doku unvollständig | Dokumentation | Niedrig |
| DEBT-001 | Toter Code: `getFormElements()` wird nie aufgerufen | Technical Debt | Niedrig |
| DEBT-002 | Tab-Protokoll-Konstanten in beiden Scripts dupliziert, ohne verbindliche Protokolldefinition | Technical Debt | Niedrig |
| DEBT-003 | `buildZip()` ohne Limit-Prüfung (ZIP-Formatgrenzen Uint16/Uint32) | Technical Debt | Niedrig |

---

## Findings

---

### BUG-001 — Original wird gelöscht, bevor Voraussetzungen der Neuerstellung geprüft sind

**ID:** BUG-001
**Kategorie:** Bug
**Priorität:** Hoch
**Status:** Offen

**Betroffene Dateien:** `kleinanzeigen-duplizieren.user.js`
**Betroffene Klassen:** keine (funktionale IIFE-Struktur)
**Betroffene Methoden:** `smartRepublish()`

**Nachweis:**
In `smartRepublish()` wird `deleteAd(originalId)` (Zeile 532) ausgeführt, *bevor* geprüft wird, ob der Speichern-Button existiert (`waitForElement(findSaveButton, 10000)`, Zeile 543) und bevor der adId-Input gesucht wird (Zeile 546). Schlägt die Button-Suche nach der Löschung fehl (`throw new Error('Speichern-Button nicht gefunden (Timeout)')`, Zeile 544), ist das Original bereits gelöscht. Außerhalb des Batch-Modus (`batchMode === false`) existiert kein Snapshot: Die Snapshot-Erstellung (Zeilen 510–525) ist an `if (batchMode)` gebunden. Der `catch`-Block (Zeilen 583–599) zeigt nur eine Notification; eine Wiederherstellung ist nicht möglich.

Zum Vergleich: `duplicateAd()` prüft den Speichern-Button *vor* jeder Aktion (Zeile 356) — die sichere Reihenfolge ist im selben File bereits etabliert.

**Beleg:** `kleinanzeigen-duplizieren.user.js:527-551` (Delete vor Button-Prüfung), `kleinanzeigen-duplizieren.user.js:510` (`if (batchMode)` vor Snapshot), `kleinanzeigen-duplizieren.user.js:356` (Gegenbeispiel in `duplicateAd`).

**Technische Erklärung:**
Bei einer destruktiven, nicht umkehrbaren Operation müssen alle Vorbedingungen der Folgeoperation geprüft werden, bevor die destruktive Operation ausgeführt wird (Fail-Fast, Secure by Default). Die aktuelle Reihenfolge verletzt dieses Prinzip: Der einzige Fehlerpfad nach erfolgreichem Delete ist ein irreversibler Zustand ohne Kompensation (im manuellen Modus zusätzlich ohne Snapshot).

**Auswirkungen:**
- **Stabilität:** Irreversibler Datenverlust der Anzeige (Texte, Bilder, Metadaten) bei DOM-Änderung der Seite oder langsamem Rendering.
- **Sicherheit:** keine.
- **Performance:** keine.
- **Wartbarkeit:** Inkonsistenz zu `duplicateAd()` erschwert das Verständnis des Codes.
- **Betrieb / Entwicklerproduktivität:** Support-Aufwand bei Nutzerbeschwerden über verlorene Anzeigen.

**Risiko:** Der Auslöser (Speichern-Button nach 10 s nicht auffindbar) ist ein im Projekt dokumentiertes, reales Szenario — die Retry-Mechanik in `createButtons()` und der Watchdog-Kommentar (Zeilen 568–570) belegen, dass verzögertes/fehlschlagendes Rendering vorkommt. Eintritt führt direkt zu Datenverlust.

**Root Cause:** Die Ablauflogik wurde um den Löschvorgang herum gebaut ("erst löschen, dann warten, dann neu einstellen"), ohne die Vorbedingungen der Neuerstellung als Guard vor die Löschung zu ziehen. Der Snapshot-Mechanismus wurde nachträglich nur für den Batch-Modus ergänzt.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren, Datei `kleinanzeigen-duplizieren.user.js`, Funktion `smartRepublish()`: Der Aufruf `deleteAd(originalId)` erfolgt derzeit, bevor der Speichern-Button (`waitForElement(findSaveButton, 10000)`) und der adId-Input geprüft wurden, und außerhalb des Batch-Modus existiert kein Recovery-Snapshot. Ziel: Stelle die Reihenfolge so um, dass (1) Speichern-Button und adId-Input *vor* `deleteAd()` aufgelöst werden und die Funktion bei Nichtauffinden abbricht, ohne zu löschen, und (2) der Snapshot (`buildSnapshot` + `batchPutSnapshot`) auch im manuellen Modus (nicht nur `batchMode`) vor der Löschung erstellt wird. Einschränkungen: Ändere nur `smartRepublish()` und, falls für die Snapshot-Wiederverwendung nötig, minimal die Snapshot-Hilfsfunktionen; ändere nicht das Tab-Protokoll (localStorage-Keys, Fehlercodes). Ergänze Tests (nach Einführung einer Testinfrastruktur gemäß TEST-001) für die Reihenfolge: "kein Delete ohne vorher aufgelösten Save-Button". Aktualisiere README.md (Abschnitt "Smart neu einstellen") und den Changelog.

**Akzeptanzkriterien:**
- [ ] `deleteAd()` wird erst aufgerufen, nachdem Speichern-Button und adId-Input erfolgreich aufgelöst wurden.
- [ ] Bei Timeout der Button-/Input-Suche wird abgebrochen, ohne dass ein Delete-Request abgesetzt wurde; das Original bleibt unverändert.
- [ ] Vor jeder Löschung existiert ein Snapshot in IndexedDB — auch im manuellen Modus.
- [ ] `duplicateAd()`-Verhalten bleibt unverändert.
- [ ] README.md und Changelog beschreiben das neue Verhalten.

**Definition of Done:** Code geändert, `npm run validate` grün, manueller Test des manuellen Smart-Republish-Flusses dokumentiert (Erfolgsfall + simulierter Button-Timeout via DevTools), Changelog-Eintrag vorhanden, PR-Review abgeschlossen.

**Empfohlene automatisierte Tests:**
- Unit-Test (nach TEST-001): `smartRepublish()` mit gemocktem DOM ohne Speichern-Button → kein `fetch` auf `m-anzeigen-loeschen.json`.
- Regressionstest: Reihenfolge Snapshot → Delete → Save als Aufruf-Sequenz-Assertion.
- Begründung, falls nicht sofort möglich: Es existiert noch keine Testinfrastruktur (TEST-001); bis dahin manueller Testplan im PR.

---

### BUG-002 — "Speichern" wird auch ohne Neutralisierung des adId-Felds geklickt

**ID:** BUG-002
**Kategorie:** Bug
**Priorität:** Hoch
**Status:** Offen

**Betroffene Dateien:** `kleinanzeigen-duplizieren.user.js`
**Betroffene Klassen:** keine
**Betroffene Methoden:** `duplicateAd()`, `smartRepublish()`

**Nachweis:**
Die Duplikat-Semantik beider Flüsse beruht darauf, dass vor dem Klick auf "Speichern" das adId-Feld neutralisiert wird (`adIdInput.removeAttribute('name'); adIdInput.value = '';`). In beiden Funktionen ist dieser Schritt jedoch optional:
- `duplicateAd()`: `const adIdInput = await waitForElement(...); if (adIdInput) { ... }` (Zeilen 359–367) — bei `null` (Timeout nach 10 s) wird ohne Neutralisierung fortgefahren und `saveBtn.click()` ausgeführt (Zeile 374).
- `smartRepublish()`: `const adIdInput = document.querySelector(...); if (adIdInput) { ... }` (Zeilen 546–551) — einmalige, nicht wartende Abfrage; bei `null` wird ebenfalls `saveBtn.click()` ausgeführt (Zeile 566).

Es existiert kein `else`-Zweig, kein Abbruch und keine Nutzerwarnung für den Fall `adIdInput === null`. Der Klick löst dann ein Formular-Submit aus, bei dem der Schritt, der aus "Bearbeiten" ein "Neu einstellen" macht, nachweislich nicht stattgefunden hat.

**Beleg:** `kleinanzeigen-duplizieren.user.js:359-374` und `kleinanzeigen-duplizieren.user.js:546-566`.

**Technische Erklärung:**
Ein Schritt, der für die Kernsemantik der Operation zwingend ist, darf nicht als optionaler Best-Effort behandelt werden (Fail-Fast). Der stille Fallback ändert die Bedeutung des Klicks: Statt einer Duplikation wird das bestehende Formular mit erhaltener adId submitted. In `smartRepublish()` ist das Original zu diesem Zeitpunkt bereits gelöscht (siehe BUG-001), wodurch das Submit gegen eine gelöschte Anzeigen-ID läuft.

**Auswirkungen:**
- **Stabilität:** Fehlverhalten mit stillem Ergebnis-Unterschied (Edit statt Duplikat); in Kombination mit BUG-001 Datenverlustpfad.
- **Wartbarkeit:** Der Unterschied zwischen `waitForElement` (duplicateAd) und einmaligem `querySelector` (smartRepublish) für denselben Zweck ist inkonsistent.
- **Sicherheit / Performance / Betrieb:** keine direkten.

**Risiko:** Tritt ein, wenn der adId-Input beim Klickzeitpunkt (noch) nicht im DOM ist — auf einer React-gerenderten Seite (Projekthistorie: "Floating-Toolbar statt DOM-Injection (React-kompatibel)", README-Changelog 3.3.4) ein belegtes reales Szenario.

**Root Cause:** Defensive `if (element)`-Guards wurden als Absicherung gegen Nullreferenzen eingesetzt, ohne zu unterscheiden, ob das Element optional oder eine harte Vorbedingung ist.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren, Datei `kleinanzeigen-duplizieren.user.js`: In `duplicateAd()` (Zeilen 359–374) und `smartRepublish()` (Zeilen 546–566) wird `saveBtn.click()` auch dann ausgeführt, wenn der adId-Input nicht gefunden wurde und daher `removeAttribute('name')`/Wert-Leerung nicht stattfanden. Ziel: Behandle das Nichtauffinden des adId-Inputs als harten Fehler — Abbruch mit Fehlernotification (`showNotification(..., 'error')`), Spinner entfernen, Buttons re-enablen, im Batch-Modus `batchSetResult` mit einem eindeutigen Fehlercode (z. B. `error:adid_input_missing:<phase>`). In `smartRepublish()` ist zusätzlich `waitForElement` statt einmaligem `querySelector` zu verwenden. Einschränkungen: Bestehende Fehlercodes nicht umbenennen; der Helper (`helper.user.js`) muss den neuen Code als Nicht-Datenverlust bzw. — falls nach erfolgtem Delete — als Datenverlust klassifizieren können (Prüfe `handleValue` in helper.user.js). Fordere Tests für beide Abbruchpfade und aktualisiere die Fehlercode-Dokumentation.

**Akzeptanzkriterien:**
- [ ] `saveBtn.click()` wird in beiden Funktionen nur ausgeführt, wenn das adId-Feld nachweislich neutralisiert wurde.
- [ ] Abbruchpfad zeigt eine Fehlermeldung, entfernt den Spinner und re-enabled die Buttons.
- [ ] Im Batch-Modus wird ein auswertbarer Fehlercode über localStorage signalisiert; Datenverlust-Klassifikation im Helper korrekt (nach Delete = Datenverlust).
- [ ] `smartRepublish()` wartet auf den adId-Input statt einmaliger Abfrage.

**Definition of Done:** Code geändert, `npm run validate` grün, Helper-Klassifikation des neuen Fehlercodes verifiziert, Changelog aktualisiert, PR-Review abgeschlossen.

**Empfohlene automatisierte Tests:**
- Unit-Test (nach TEST-001): DOM ohne adId-Input → kein Klick auf Save-Button, Fehlercode gesetzt.
- Regressionstest: DOM mit adId-Input → `name`-Attribut entfernt vor Klick.
- Begründung, falls nicht sofort möglich: keine Testinfrastruktur (TEST-001); bis dahin manueller Testplan.

---

### BUG-003 — Batch löscht Recovery-Snapshot bei Timeout

**ID:** BUG-003
**Kategorie:** Bug
**Priorität:** Hoch
**Status:** Offen

**Betroffene Dateien:** `helper.user.js`
**Betroffene Klassen:** keine
**Betroffene Methoden:** `processOne()`, `runBatch()`

**Nachweis:**
`processOne()` löst bei Ausbleiben eines Result-Signals nach 180 s mit `{ ok: false, code: 'timeout', dataLoss: false, keepTab: false }` auf (Zeilen 779–781). `runBatch()` löscht bei jedem Fehler ohne `dataLoss`-Flag den Snapshot: `try { await deleteSnapshot(item.adId); }` (Zeile 848, Kommentar: "Kein Datenverlust: Snapshot kann weg"). Ein Timeout kann jedoch nach Codelage jeden Zustand des Worker-Tabs bedeuten — einschließlich "Original gelöscht (`phase = 'delete_ok'`), aber kein Result geschrieben" (z. B. Tab vom Nutzer geschlossen oder Prozess beendet, bevor Watchdog nach 45 s oder Bestätigungsseite schreiben konnten). Der Timeout-Pfad kann Datenverlust also nicht ausschließen; die Klassifikation `dataLoss: false` ist eine im Code hart kodierte, nicht belegbare Zusicherung. Damit wird genau in dem Fall, für den der Snapshot existiert, das Sicherheitsnetz gelöscht.

Gegenbeispiel im selben File: Der Einzel-Modus (`openSmartRepublish`, Zeilen 297–307) löscht den Snapshot **nur** im Erfolgsfall — bei Fehlern (inkl. Timeout) bleibt er erhalten. Batch- und Einzelmodus verhalten sich beim identischen Fehlercode unterschiedlich.

**Beleg:** `helper.user.js:779-781` (Timeout → `dataLoss: false`), `helper.user.js:838-849` (Snapshot-Löschung im Fehlerpfad), `helper.user.js:297-307` (abweichendes Einzelmodus-Verhalten), `kleinanzeigen-duplizieren.user.js:571-580` (Watchdog schreibt frühestens nach 45 s und nur, wenn der Tab noch lebt).

**Technische Erklärung:**
Der Recovery-Snapshot ist die einzige Kompensation für den irreversiblen Löschvorgang. Ein Timeout ist per Definition ein Zustand unbekannten Ausgangs; ihn als "kein Datenverlust" zu klassifizieren und die Kompensation zu vernichten, invertiert das Secure-by-Default-Prinzip. Korrekt wäre: Bei unbekanntem Ausgang Snapshot behalten (konservativ), ggf. mit Hinweis im Recovery-UI.

**Auswirkungen:**
- **Stabilität:** Verlust der Wiederherstellungsdaten exakt im Worst Case (Original gelöscht, neue Anzeige nicht bestätigt, Ursache unbekannt).
- **Betrieb:** Das in README 3.5.0 beworbene Feature "Auto-Stop bei Datenverlust ... hält den Snapshot" greift im Timeout-Fall nicht.
- **Wartbarkeit:** Inkonsistenz zwischen Batch- und Einzelmodus.

**Risiko:** Eintritt erfordert, dass der Worker-Tab nach dem Delete kein Signal mehr schreibt (Tab-Schließung, Browser-Crash, Navigation weg von beiden gematchten Seiten). Wahrscheinlichkeit gering, Schaden hoch und irreversibel — bei einem Feature, dessen Existenzzweck genau dieser Fall ist.

**Root Cause:** Der Timeout-Pfad wurde pauschal als "kein Datenverlust" modelliert, weil die bekannten Fehlerpfade (`error:save_failed:delete_ok`) den Datenverlust explizit melden; der Fall "kein Signal" wurde nicht als eigener Unbekannt-Zustand behandelt.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren, Datei `helper.user.js`: `processOne()` liefert bei Timeout `dataLoss: false`, und `runBatch()` löscht daraufhin den Recovery-Snapshot (Zeile 848). Ziel: Behandle `code === 'timeout'` als Zustand unbekannten Ausgangs — der Snapshot darf nicht gelöscht werden. Implementiere entweder ein drittes Flag (z. B. `outcomeUnknown: true`) oder setze `dataLoss` für Timeouts auf `true` mit angepasstem UI-Text, und stelle sicher, dass `runBatch()` bei Timeout den Snapshot behält (Batch darf weiterlaufen oder stoppen — begründe die Wahl im PR; konservativ ist Stopp wie bei `dataLoss`). Gleiche das Verhalten mit dem Einzelmodus (`openSmartRepublish`) ab. Einschränkungen: Ändere nur `helper.user.js` und Dokumentation; das localStorage-Protokoll bleibt unverändert. Ergänze Tests für die Snapshot-Erhaltung im Timeout-Pfad und aktualisiere SECURITY.md/README (Recovery-Verhalten).

**Akzeptanzkriterien:**
- [ ] Bei `code === 'timeout'` wird `deleteSnapshot()` nicht aufgerufen.
- [ ] Das Done-/Recovery-UI weist auf den unklaren Ausgang hin und listet den erhaltenen Snapshot.
- [ ] Batch- und Einzelmodus verhalten sich bei Timeout identisch bzgl. Snapshot-Erhalt.
- [ ] Dokumentation (README/SECURITY.md) beschreibt das Timeout-Verhalten.

**Definition of Done:** Code geändert, `npm run validate` grün, manueller Test (Worker-Tab während des Laufs schließen → Snapshot bleibt, Recovery-UI zeigt ihn), Changelog aktualisiert, PR-Review abgeschlossen.

**Empfohlene automatisierte Tests:**
- Unit-Test (nach TEST-001): `runBatch` mit gemocktem `processOne`-Timeout → kein `deleteSnapshot`-Aufruf.
- Regressionstest: Erfolgsfall löscht Snapshot weiterhin.
- Begründung, falls nicht sofort möglich: keine Testinfrastruktur (TEST-001).

---

### BUG-004 — Kein Recovery nach `saveBtn.click()` außerhalb des Batch-Modus; blockierendes Overlay

**ID:** BUG-004
**Kategorie:** Bug
**Priorität:** Mittel
**Status:** Offen

**Betroffene Dateien:** `kleinanzeigen-duplizieren.user.js`
**Betroffene Klassen:** keine
**Betroffene Methoden:** `duplicateAd()`, `smartRepublish()`, `ensureStyles()` (CSS `.ka-spinner`)

**Nachweis:**
Nach `saveBtn.click()` existiert im Nicht-Batch-Fluss kein Codepfad, der den Vollbild-Spinner entfernt oder die Buttons re-enabled: In `duplicateAd()` endet die Funktion nach dem Klick (Zeile 374); der Spinner (`showLoadingSpinner()`, Zeile 354) wird nur im `catch` entfernt (Zeile 379). Gleiches gilt für `smartRepublish()` (Klick Zeile 566, Spinner-Entfernung nur Zeile 586); der 45-s-Watchdog (Zeilen 571–580) ist an `if (batchMode)` gebunden und schreibt zudem nur einen localStorage-Wert, den auf der Seite selbst niemand auswertet. Das Spinner-CSS (`.ka-spinner`, Zeilen 176–184) definiert `position: fixed; inset: 0; z-index: 9999` ohne `pointer-events: none` — das Overlay fängt sämtliche Klicks der Seite ab. Dass "Save klickt, aber navigiert nicht" ein reales Szenario ist, belegt der Code selbst: Der Watchdog-Kommentar (Zeilen 568–570) beschreibt exakt diesen Fall.

**Beleg:** `kleinanzeigen-duplizieren.user.js:176-184`, `:351-382`, `:566-581`.

**Technische Erklärung:**
Das Erfolgsmodell "der Klick führt immer zur Navigation" ist implizit und laut eigenem Code nicht garantiert. Bleibt die Navigation aus (z. B. clientseitige Formularvalidierung), verharrt die Seite in einem für den Nutzer nicht auflösbaren Zustand: unsichtbare Klick-Sperre über der gesamten Seite, deaktivierte Buttons, keine Fehlermeldung — nur ein Reload hilft.

**Auswirkungen:**
- **Stabilität/Betrieb:** Eingefrorene UI; in `smartRepublish()` zusätzlich kritisch, weil das Original zu diesem Zeitpunkt bereits gelöscht ist und der Nutzer das Formular nicht mehr bedienen kann, um manuell zu speichern.
- **Entwicklerproduktivität:** Fehlerbilder wie "Seite hängt" sind ohne Konsole schwer zuzuordnen.

**Risiko:** Auslöser laut Code-Kommentar real (serverseitig nicht durchgreifendes Save); Schaden reicht von Ärgernis (duplicateAd) bis Datenverlust-Verschärfung (smartRepublish).

**Root Cause:** Der Happy Path (Navigation nach Klick) wurde als einziger Ausgang modelliert; der Batch-Modus erhielt nachträglich einen Watchdog, der manuelle Fluss nicht.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren, Datei `kleinanzeigen-duplizieren.user.js`: Nach `saveBtn.click()` in `duplicateAd()` und `smartRepublish()` gibt es außerhalb des Batch-Modus keinen Recovery-Pfad; der Vollbild-Spinner (`.ka-spinner`, ohne `pointer-events: none`) blockiert die Seite dauerhaft, wenn die Navigation ausbleibt. Ziel: (1) Führe einen Watchdog für alle Modi ein: Wenn die Seite N Sekunden nach dem Klick noch auf `/p-anzeige-bearbeiten.html` ist, entferne Spinner, re-enable die Buttons und zeige eine Fehlernotification mit Handlungsempfehlung. (2) Ergänze `pointer-events: none` ist hier NICHT die Lösung (der Spinner soll während des Vorgangs bewusst blockieren) — stattdessen muss der Watchdog das Overlay entfernen. Einschränkungen: Batch-Watchdog-Verhalten (localStorage-Signal) beibehalten; nur diese Datei ändern. Fordere einen manuellen Testplan (Navigation künstlich unterbinden) und Changelog-Eintrag.

**Akzeptanzkriterien:**
- [ ] Bleibt die Navigation nach dem Save-Klick aus, werden Spinner entfernt, Buttons re-enabled und eine Fehlermeldung angezeigt (alle Modi).
- [ ] Batch-Modus signalisiert zusätzlich weiterhin `error:save_failed:...` via localStorage.
- [ ] Erfolgsfall (Navigation) bleibt unverändert.

**Definition of Done:** Code geändert, `npm run validate` grün, manueller Test beider Flüsse mit blockierter Navigation dokumentiert, Changelog aktualisiert, PR-Review abgeschlossen.

**Empfohlene automatisierte Tests:**
- Unit-Test (nach TEST-001): Watchdog-Callback bei unveränderter `location` → Spinner entfernt, Buttons enabled.
- Begründung, falls nicht sofort möglich: keine Testinfrastruktur (TEST-001).

---

### BUG-005 — Host-Inkonsistenz: non-www `@match` vs. absolute www-URLs

**ID:** BUG-005
**Kategorie:** Bug
**Priorität:** Mittel
**Status:** Offen

**Betroffene Dateien:** `kleinanzeigen-duplizieren.user.js`, `helper.user.js`
**Betroffene Klassen:** keine
**Betroffene Methoden:** `deleteAd()`, `fetchAsBlob()`, `processOne()`, Result-Signaling (`batchSetResult`/`onStorage`)

**Nachweis:**
Beide Scripts deklarieren `@match` sowohl für `https://www.kleinanzeigen.de/...` als auch für `https://kleinanzeigen.de/...` (Hauptscript Zeilen 11–14, Helper Zeilen 10–11). Der Code arbeitet jedoch host-gebunden:
1. `deleteAd()` ruft die absolute URL `https://www.kleinanzeigen.de/m-anzeigen-loeschen.json` auf (Zeile 284) — mit `fetch`-Default `credentials: 'same-origin'`. Auf einer unter `https://kleinanzeigen.de` (ohne www) geladenen Seite ist das per Same-Origin-Definition (Schema+Host+Port) ein Cross-Origin-Request, bei dem keine Cookies mitgesendet werden.
2. `processOne()` im Helper öffnet Worker-Tabs immer auf `https://www.kleinanzeigen.de/...` (Zeilen 707, 716), wartet aber auf ein `localStorage`-Signal (Zeilen 766–777). `localStorage` ist origin-gebunden: Läuft der Helper auf `https://kleinanzeigen.de`, kann er Schreibvorgänge eines www-Tabs nie beobachten → jeder Batch-Eintrag endet im 180-s-Timeout. Gleiches gilt für die geteilte IndexedDB (`ka-batch`).

Die Kombination "non-www als unterstützter Ausführungskontext deklariert" + "Funktionalität nur auf www lauffähig" ist aus dem Repository eindeutig nachweisbar.

**Beleg:** `kleinanzeigen-duplizieren.user.js:11-14`, `:284`; `helper.user.js:10-11`, `:707`, `:716`, `:766-777`.

**Technische Erklärung:**
`www.kleinanzeigen.de` und `kleinanzeigen.de` sind verschiedene Origins. Same-Origin-Policy (Cookies bei `credentials: 'same-origin'`), `localStorage` und IndexedDB sind strikt origin-partitioniert. Entweder ist non-www kein realer Anwendungsfall — dann sind die `@match`-Zeilen irreführende Konfiguration —, oder er ist real — dann sind Löschen, Batch-Signaling und Snapshot-Sharing dort nachweislich funktionsunfähig.

**Auswirkungen:**
- **Stabilität:** Auf non-www: Löschung schlägt fehl (fehlende Session-Cookies), Batch läuft in Timeouts.
- **Wartbarkeit:** Widersprüchliche Konfiguration; README/SECURITY.md nennen als unterstützte URLs nur www.

**Risiko:** Abhängig vom (aus dem Repo nicht verifizierbaren) Redirect-Verhalten des Betreibers; der Defekt liegt unabhängig davon in der widersprüchlichen Deklaration.

**Root Cause:** Beim Entfernen der Wildcard-Matches in 3.5.1 (README-Changelog) wurden non-www-Einträge beibehalten, ohne die host-gebundenen Codepfade (absolute URLs, Origin-Storage) anzupassen.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren: Beide Userscripts matchen auch `https://kleinanzeigen.de/...` (ohne www), aber `deleteAd()` (absolute www-URL, Default-Credentials), das localStorage-Result-Signaling und die IndexedDB-Nutzung funktionieren nur, wenn alle Beteiligten auf demselben Origin `https://www.kleinanzeigen.de` laufen. Ziel (Variante A, bevorzugt): Entferne die non-www-`@match`-Zeilen aus beiden Scripts und dokumentiere in README ("Unterstützte URLs"), dass nur www unterstützt wird. Alternativ (Variante B, nur falls non-www nachweislich ohne Redirect erreichbar ist): Baue alle URLs relativ bzw. auf `location.origin` auf und dokumentiere die Origin-Bindung von Batch-Läufen. Einschränkungen: Versionsnummern via `package.json` + `npm run build` erhöhen; keine weiteren Verhaltensänderungen. Ergänze einen Changelog-Eintrag.

**Akzeptanzkriterien:**
- [ ] `@match`-Deklarationen und tatsächlich unterstützte Origins sind deckungsgleich.
- [ ] README "Unterstützte URLs" stimmt mit den Headern überein.
- [ ] Kein Codepfad kombiniert non-www-Ausführung mit www-gebundenen Ressourcen.

**Definition of Done:** Header/Code angepasst, `npm run validate` grün, Doku synchron, Changelog aktualisiert, PR-Review abgeschlossen.

**Empfohlene automatisierte Tests:**
- Statischer Test (nach TEST-001): Konsistenz-Check "alle absoluten URLs im Code liegen innerhalb der @match-Origins" als Lint-Skript — auch ohne Browser-Testinfrastruktur umsetzbar.

---

### SEC-001 — Snapshot persistiert alle benannten Formularfelder inkl. `_csrf` — Widerspruch zu SECURITY.md

**ID:** SEC-001
**Kategorie:** Security
**Priorität:** Mittel
**Status:** Offen

**Betroffene Dateien:** `kleinanzeigen-duplizieren.user.js`, `helper.user.js`, `SECURITY.md`
**Betroffene Klassen:** keine
**Betroffene Methoden:** `readFormFields()`, `buildSnapshot()`, `downloadRecoveryZip()`

**Nachweis:**
`readFormFields()` sammelt in `rawFields` **jedes** `input`/`textarea`/`select` mit `name`-Attribut und nicht-leerem Wert; ausgeschlossen sind nur `type === 'password'` und `type === 'file'` (Zeilen 423–433). Hidden-Inputs sind eingeschlossen. Dass ein Hidden-Input `input[name="_csrf"]` auf der Seite existieren kann, belegt das Repository selbst: `getCsrfToken()` liest ihn als Tokenquelle (Zeilen 267–268), und SECURITY.md dokumentiert ihn ausdrücklich ("CSRF-Token werden zur Laufzeit aus dem DOM (`input[name="_csrf"]` ...) gelesen"). `buildSnapshot()` persistiert `rawFields` in IndexedDB (Zeile 484), `downloadRecoveryZip()` schreibt `rawFields` vollständig in die exportierte `data.json` (Zeile 240, 243). SECURITY.md behauptet dagegen: "CSRF-Token werden ... gelesen, **nicht persistiert**" (Zeile 42) und beschreibt den Snapshot-Umfang als "Form-Felder (Titel, Beschreibung, Preis, Standort)" (Zeile 33). Beides ist durch den Code widerlegt, sofern das dokumentierte `_csrf`-Input vorhanden ist.

**Beleg:** `kleinanzeigen-duplizieren.user.js:423-433`, `:466-487`; `helper.user.js:236-243`; `SECURITY.md:33`, `:42`; Tokenquelle: `kleinanzeigen-duplizieren.user.js:267-268`.

**Technische Erklärung:**
Verletzung von Datenminimierung / Least Privilege (OWASP ASVS V8 – Data Protection; CWE-312: Cleartext Storage of Sensitive Information; CWE-522 sinngemäß): Ein Sitzungs-/Anti-CSRF-Artefakt wird ohne funktionale Notwendigkeit dauerhaft gespeichert und in ein vom Nutzer weitergebbares ZIP-Archiv exportiert. Der praktische Schaden ist begrenzt (CSRF-Token sind typischerweise sitzungsgebunden und kurzlebig), aber der Widerspruch zur eigenen Security-Dokumentation ist ein nachweisbarer Defekt: Die dokumentierte Zusicherung ist falsch.

**Auswirkungen:**
- **Sicherheit:** Persistenz und Export eines Security-Artefakts; erweiterte Angriffsfläche, falls das ZIP geteilt wird (Recovery-Zweck legt Weitergabe nahe).
- **Dokumentation/Vertrauen:** SECURITY.md macht eine falsche Zusicherung.

**Risiko:** Gering bis mittel — abhängig von Lebensdauer/Bindung des Tokens (aus dem Repo nicht verifizierbar). Der Doku-Widerspruch selbst ist unabhängig davon ein Fakt.

**Root Cause:** `rawFields` wurde als Maximal-Backup ("alles, was das Formular enthält") konzipiert; eine Denylist für sicherheitsrelevante Felder bzw. Hidden-Inputs fehlt.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren, Datei `kleinanzeigen-duplizieren.user.js`, Funktion `readFormFields()`: `rawFields` erfasst alle benannten Felder außer password/file — einschließlich Hidden-Inputs wie `_csrf`, die anschließend in IndexedDB persistiert und via `downloadRecoveryZip()` (helper.user.js) in `data.json` exportiert werden. SECURITY.md sichert zu, dass CSRF-Token nicht persistiert werden. Ziel: Schließe sicherheitsrelevante Felder aus `rawFields` aus — mindestens `_csrf` sowie alle Inputs mit `type="hidden"`, deren Name auf Token/Session hindeutet; empfohlen ist eine explizite Denylist (`['_csrf']`) plus Ausschluss von `type="hidden"` insgesamt, sofern kein Hidden-Feld für die Recovery inhaltlich nötig ist (prüfe, welche Hidden-Felder `fields`/Recovery tatsächlich brauchen — die kuratierten `fields` nutzen keine Hidden-Inputs). Aktualisiere SECURITY.md (Snapshot-Umfang ehrlich beschreiben: kuratierte Felder + rawFields-Definition). Einschränkungen: Recovery-Nutzwert (Titel, Beschreibung, Preis, Standort, sichtbare Formularwerte) darf nicht reduziert werden. Fordere einen Test, der belegt, dass `_csrf` in Snapshot und ZIP-`data.json` nicht mehr auftaucht.

**Akzeptanzkriterien:**
- [ ] `rawFields` enthält kein Feld namens `_csrf` und keine Hidden-Inputs ohne Recovery-Nutzen.
- [ ] Exportierte `data.json` enthält keine Security-Artefakte.
- [ ] SECURITY.md beschreibt den tatsächlichen Snapshot-Umfang korrekt.
- [ ] Kuratierte `fields` (Titel, Beschreibung, Preis, Standort) unverändert vollständig.

**Definition of Done:** Code + SECURITY.md geändert, `npm run validate` grün, manueller Nachweis (Snapshot erzeugen, `data.json` prüfen) im PR dokumentiert, Changelog aktualisiert.

**Empfohlene automatisierte Tests:**
- Unit-Test (nach TEST-001): DOM-Fixture mit `input[name="_csrf"][type=hidden]` → `readFormFields().rawFields` enthält `_csrf` nicht.
- Sicherheitstest: Assertion über `data.json`-Inhalt des ZIP-Exports.

---

### TEST-001 — Keine automatisierten Tests; "lint" ist reiner Syntax-Check

**ID:** TEST-001
**Kategorie:** Tests
**Priorität:** Mittel
**Status:** Offen

**Betroffene Dateien:** `package.json`, gesamtes Repository
**Betroffene Klassen/Methoden:** alle

**Nachweis:**
Das Repository enthält keine Testdateien (Dateisystem-Suche nach `*test*`/`*spec*` außerhalb `.git`: 0 Treffer). `package.json` definiert keinen `test`-Script; `lint` ist `node -c <file>` — ein reiner Syntax-Check ohne jede Verhaltensprüfung (verifiziert: `npm run lint` → "Syntax Check PASSED"). Der README-Changelog 3.5.1 dokumentiert die bewusste Entfernung einer wertlosen Alt-Testsuite ("pruefen ... Test-Code gegen Test-Code"); ein Ersatz wurde nicht geschaffen.

**Beleg:** `package.json:7-11`; Dateisystem-Befund; `README.md:100`.

**Technische Erklärung:**
Die Kernlogik (Fehlercode-Protokoll zwischen den Scripts, Datenverlust-Klassifikation, Snapshot-Lebenszyklus, ZIP-Builder, Datums-/Kandidatenlogik) ist reine, DOM-arme bzw. DOM-mockbare Logik und damit testbar. Ohne Tests sind Regressionen in genau den Pfaden, die Datenverlust verhindern sollen (BUG-001/002/003), nicht abgesichert — die Projekthistorie (mehrere Fix-Releases 3.3.x, Issue #39) belegt reale Regressionsanfälligkeit.

**Auswirkungen:**
- **Stabilität:** Regressionen in destruktiven Pfaden werden erst von Endnutzern entdeckt.
- **Entwicklerproduktivität:** Jede Änderung erfordert manuelles Durchtesten gegen die Live-Site.

**Risiko:** Mittel — das Projekt führt destruktive, irreversible Operationen auf Nutzerdaten aus; unentdeckte Regressionen wirken direkt auf Nutzer.

**Root Cause:** Userscript-Umgebung (Tampermonkey, Live-Site-DOM) wurde als nicht testbar behandelt; die alte Fake-Testsuite wurde ersatzlos entfernt.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren existieren keine automatisierten Tests; die Scripts sind IIFEs ohne Export. Ziel: Führe eine minimale Testinfrastruktur ein (Vitest oder Jest mit jsdom), ohne die Auslieferungsform der Userscripts zu ändern: (1) Extrahiere testbare, DOM-arme Funktionen (u. a. `getExponentialBackoffWait`, `parseEndDate`, `daysUntil`, `jitterDelay`-Grenzen, `sanitize`, `crc32`/`buildZip`, `handleValue`-Fehlercode-Parsing) in ein testbares Muster — z. B. via bedingtem Export (`if (typeof module !== 'undefined')`) oder einem Build-Schritt, der die IIFE für Tests aufbricht; die installierbaren .user.js-Dateien müssen funktional identisch bleiben. (2) Schreibe Unit-Tests für Fehlercode-Protokoll (ok/error:save_failed:delete_ok → dataLoss), Datumslogik und ZIP-Erzeugung (Entpackbarkeit der Struktur per Signatur-Checks). (3) Ergänze `"test"`-Script in package.json und binde es in `npm run validate` ein. Einschränkungen: keine Laufzeit-Dependencies für die Userscripts; devDependencies erlaubt. Dokumentiere das Test-Setup in README.

**Akzeptanzkriterien:**
- [ ] `npm test` existiert und läuft lokal grün.
- [ ] Mindestens Fehlercode-Parsing, Datums-/Kandidatenlogik und ZIP-Builder sind unit-getestet.
- [ ] Ausgelieferte .user.js-Dateien bleiben ohne Laufzeit-Dependencies funktional unverändert.
- [ ] `npm run validate` schließt die Tests ein.

**Definition of Done:** Testinfrastruktur committed, Tests grün, README-Abschnitt "Entwicklung/Tests" vorhanden, PR-Review abgeschlossen.

**Empfohlene automatisierte Tests:** Unit-Tests (siehe Prompt); Integrationstests gegen die Live-Site sind ohne stabile Testumgebung nicht seriös automatisierbar — Begründung: Site-DOM und Login-Session liegen außerhalb der Repo-Kontrolle; dieser Teil bleibt manueller Testplan.

---

### BUILD-001 — Keine CI-Validierung

**ID:** BUILD-001
**Kategorie:** Build
**Priorität:** Mittel
**Status:** Offen

**Betroffene Dateien:** `.github/workflows/issues_auto-close.yml` (einziger Workflow), `package.json`
**Betroffene Klassen/Methoden:** n/a

**Nachweis:**
Das Verzeichnis `.github/workflows/` enthält genau eine Datei: `issues_auto-close.yml` (Stale-Issue-Automatik). Es existiert kein Workflow, der bei Push/PR `npm run validate` (Build-Sync + Syntax-Check) ausführt. Die im Repo vorhandene Validierung ist damit ausschließlich manuell aufrufbar; nichts verhindert, dass ein Commit mit Syntaxfehler oder abweichender `@version` auf `main` gelangt — von wo `@updateURL`/`@downloadURL` (Header, Zeilen 16–17 bzw. 13–14) die Datei direkt an alle Installationen ausliefern.

**Beleg:** `.github/workflows/` (Verzeichnisinhalt), `package.json:7-11`, `kleinanzeigen-duplizieren.user.js:16-17`.

**Technische Erklärung:**
`main` ist hier faktisch der Produktions-Deploy-Kanal (Tampermonkey-Auto-Update zieht direkt von Raw-main). Ein Deploy-Kanal ohne automatisierte Mindestprüfung verletzt das Prinzip "Secure by Default" für die Release-Pipeline: Ein einziger fehlerhafter Merge erreicht ungeprüft alle Nutzer.

**Auswirkungen:**
- **Betrieb:** Fehlerhafte Auslieferung an alle Auto-Update-Nutzer möglich.
- **Entwicklerproduktivität:** Review-Last, weil CI nichts abfängt.

**Risiko:** Mittel — Eintrittswahrscheinlichkeit pro Merge gering, aber Wirkung sofort global (Auto-Update).

**Root Cause:** CI wurde nur für Issue-Hygiene eingerichtet; die vorhandenen npm-Scripts wurden nie an GitHub Actions angebunden.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren: Erstelle einen GitHub-Actions-Workflow `.github/workflows/ci.yml`, der bei `push` und `pull_request` auf `main` läuft: Node LTS einrichten, `npm run validate` ausführen, zusätzlich prüfen, dass `scripts/build.js` keine Änderungen hinterlässt (`git diff --exit-code` nach dem Build — sonst sind Header und package.json nicht synchron). Nach Einführung von TEST-001 auch `npm test` aufnehmen. Einschränkungen: keine weiteren Actions außer `actions/checkout` und `actions/setup-node`; minimale Permissions (`contents: read`). Dokumentiere den CI-Status in README (Badge optional).

**Akzeptanzkriterien:**
- [ ] CI läuft bei jedem PR und Push auf main.
- [ ] CI schlägt fehl bei Syntaxfehlern und bei Versions-Desynchronisation zwischen package.json und Userscript-Headern.
- [ ] Workflow nutzt minimale Permissions.

**Definition of Done:** Workflow committed, erster Lauf grün, absichtlicher Fehlversuch (Test-Branch mit Syntaxfehler) nachweislich rot, README ggf. aktualisiert.

**Empfohlene automatisierte Tests:** Der Workflow *ist* die Testautomatisierung dieses Findings; zusätzlich Negativ-Probe wie in DoD.

---

### DOC-001 — INSTALL.md: kaputtes Encoding, veraltete und widersprüchliche Inhalte

**ID:** DOC-001
**Kategorie:** Dokumentation
**Priorität:** Mittel
**Status:** Offen

**Betroffene Dateien:** `INSTALL.md`
**Betroffene Klassen/Methoden:** n/a

**Nachweis:**
1. **Encoding:** Die Datei enthält durchgängig Mojibake (UTF-8 als Latin-1 fehlinterpretiert): "Ã¶ffnet" statt "öffnet", "ðŸš€" statt "🚀", "âœ…" statt "✅" (u. a. Zeilen 1, 12, 22, 36 ff.).
2. **Veraltet:** Die "Version History"-Tabelle endet bei "3.1.0 | Nov 2025 | Auto-Update Support + Tests" (Zeile 173) — aktuelle Version ist 3.5.2; die erwähnten Tests wurden laut README-Changelog 3.5.1 entfernt.
3. **Widerspruch:** "Keine Daten werden gespeichert" (Zeile 127) widerspricht SECURITY.md (Zeilen 29–38: persistente Recovery-Snapshots in IndexedDB) und README (Changelog 3.5.0).
4. **Toter Verweis:** Link auf `README#datenschutz` (Zeile 130) — die README enthält keinen Abschnitt/Anker "Datenschutz" (verifiziert: Abschnitte Features…Lizenz).
5. **Falsch:** "Script nutzt nur die öffentliche eBay API" (Zeile 129) — der Code nutzt authentifizierte kleinanzeigen.de-Endpunkte mit Session-Cookies und CSRF-Token.

**Beleg:** `INSTALL.md:1`, `:127-130`, `:171-175`; Gegenbelege: `SECURITY.md:29-38`, `README.md:92-112`, `kleinanzeigen-duplizieren.user.js:284-292`.

**Technische Erklärung:**
Installationsdokumentation ist der erste Kontaktpunkt für Nutzer; falsche Datenschutz-Aussagen ("keine Daten werden gespeichert") sind bei tatsächlich persistierten Anzeigen-Snapshots nicht nur veraltet, sondern irreführend — insbesondere neben einer SECURITY.md, die das Gegenteil korrekt beschreibt.

**Auswirkungen:**
- **Betrieb/Vertrauen:** Irreführende Zusicherungen; unprofessionelles Erscheinungsbild durch Mojibake.
- **Wartbarkeit:** Zwei parallel gepflegte Installationsdokumente (README + INSTALL.md) driften nachweislich auseinander.

**Risiko:** Kein technisches Laufzeitrisiko; Reputations- und Irreführungsrisiko dokumentiert nachweisbar.

**Root Cause:** INSTALL.md wurde seit ca. 3.1.0 nicht mitgepflegt und irgendwann mit falschem Encoding gespeichert; Inhalte wurden in README dupliziert statt konsolidiert.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren: `INSTALL.md` hat kaputtes UTF-8-Encoding (Mojibake), eine bei 3.1.0 endende Versionstabelle, die falsche Aussage "Keine Daten werden gespeichert" (widerspricht SECURITY.md: IndexedDB-Recovery-Snapshots), einen toten Link auf `README#datenschutz` und die falsche Angabe "öffentliche eBay API". Ziel: Konsolidiere — entweder (bevorzugt) INSTALL.md auf einen kurzen, korrekten Installations-Quickstart reduzieren, der für Details auf README und SECURITY.md verweist, oder die Datei löschen und README als einzige Quelle führen (dann alle Links auf INSTALL.md prüfen). In jedem Fall: Encoding als korrektes UTF-8, Datenspeicherungs-Aussage an SECURITY.md angleichen, Versionstabelle entfernen oder auf den README-Changelog verweisen. Einschränkungen: keine Code-Änderungen.

**Akzeptanzkriterien:**
- [ ] Keine Mojibake-Zeichen mehr in INSTALL.md (bzw. Datei entfernt und Verweise bereinigt).
- [ ] Keine Aussage widerspricht SECURITY.md/README.
- [ ] Keine toten Anker/Links.
- [ ] Versionsangaben aktuell oder delegiert an den README-Changelog.

**Definition of Done:** Doku geändert, Link-Check der Markdown-Dateien durchgeführt, PR-Review abgeschlossen.

**Empfohlene automatisierte Tests:** Markdown-Link-Check als optionaler CI-Schritt (BUILD-001-Workflow); ansonsten nicht sinnvoll automatisierbar (reine Doku) — manuelle Prüfung genügt.

---

### BUILD-002 — Versionsliteral im Code wird vom Sync-Skript nicht erfasst

**ID:** BUILD-002
**Kategorie:** Build
**Priorität:** Niedrig
**Status:** Offen

**Betroffene Dateien:** `scripts/build.js`, `kleinanzeigen-duplizieren.user.js`
**Betroffene Klassen:** keine
**Betroffene Methoden:** `init()` (Log-Statement), Header-Kommentarblock

**Nachweis:**
`scripts/build.js` synchronisiert ausschließlich die `@version`-Zeile im Userscript-Header (Regex `^(\/\/\s*@version\s+)(\S+)(\s*)$`, Zeile 56, angewendet nur auf den Header-Slice vor `// ==/UserScript==`). Das Versionsliteral im Code — `logger.log('UserScript initialisiert (v3.5.2)')` (Zeile 678) — und der Changelog-Kommentarblock (Zeilen 31–35) werden nicht erfasst. Aktuell sind die Werte zufällig synchron; der Prozess erzwingt es nicht.

**Beleg:** `scripts/build.js:48-56`; `kleinanzeigen-duplizieren.user.js:678`.

**Technische Erklärung:**
DRY-Verletzung mit Prozesslücke: Dieselbe Information (Versionsnummer) existiert an drei Stellen, von denen das als "Source of Truth"-Mechanismus dokumentierte Build-Skript (Kommentar Zeilen 2–9) nur eine synchronisiert. Nach dem nächsten Versions-Bump loggt das Script eine falsche Version — das Log ist laut README ("Console zeigt '[KA-Script] initialisiert'") explizit Diagnose-Werkzeug für Support.

**Auswirkungen:**
- **Entwicklerproduktivität/Betrieb:** Irreführende Versionsangabe in Support-Logs nach Version-Bumps.

**Risiko:** Niedrig, aber Eintritt beim nächsten Bump praktisch sicher, sofern nicht manuell daran gedacht wird.

**Root Cause:** Log-String wurde hart kodiert statt aus einer synchronisierten Quelle gespeist.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren: `scripts/build.js` synchronisiert nur die `@version`-Headerzeile; das Literal `(v3.5.2)` in `logger.log('UserScript initialisiert (v3.5.2)')` (kleinanzeigen-duplizieren.user.js:678) bleibt unsynchronisiert. Ziel: Entweder (bevorzugt, `@grant none`-kompatibel) definiere im Script eine Konstante `const SCRIPT_VERSION = '3.5.2';` direkt nach der IIFE-Öffnung, nutze sie im Log, und erweitere build.js um die Synchronisation dieser Konstante (Regex auf `const SCRIPT_VERSION = '...';`); oder entferne die Versionsangabe aus dem Log. Einschränkungen: keine Nutzung von `GM_info` (erfordert @grant-Änderung). Ergänze in build.js eine Fehlermeldung, falls das Muster nicht gefunden wird.

**Akzeptanzkriterien:**
- [ ] Nach `npm run build` sind Header-@version und geloggte Version garantiert identisch (oder das Log enthält keine Version mehr).
- [ ] build.js schlägt fehl, wenn das Sync-Muster fehlt.

**Definition of Done:** Code + build.js geändert, `npm run validate` grün, Test-Bump auf Wegwerf-Branch verifiziert, PR-Review abgeschlossen.

**Empfohlene automatisierte Tests:** CI-Konsistenz-Check aus BUILD-001 (`git diff --exit-code` nach Build) deckt dieses Finding nach der Behebung automatisch mit ab.

---

### DOC-002 — README: Changelog endet bei 3.5.1, API-Endpunkt falsch geschrieben, CSRF-Doku unvollständig

**ID:** DOC-002
**Kategorie:** Dokumentation
**Priorität:** Niedrig
**Status:** Offen

**Betroffene Dateien:** `README.md`
**Betroffene Klassen/Methoden:** n/a

**Nachweis:**
1. Der README-Changelog beginnt mit "Version 3.5.1 / Helper 1.3.1" (Zeile 94); die ausgelieferte Version ist 3.5.2 (Header Zeile 8, package.json Zeile 3, Fix zu Issue #39 laut Commit `784cdd9` und Code-Kommentar Zeilen 31–35). Der 3.5.2-Eintrag fehlt.
2. README dokumentiert den Lösch-Endpunkt als `POST /m-anzeigen-Löschen.json` (Zeile 69); der Code ruft `m-anzeigen-loeschen.json` auf (Zeile 284) — die dokumentierte URL ist als URL-Pfad falsch (Umlaut/Großschreibung).
3. README nennt als CSRF-Quelle nur `input[name="_csrf"]` (Zeile 70); der Code prüft zuerst `meta[name="_csrf"], meta[name="csrf-token"]`, dann das Input (Zeilen 262–268).

**Beleg:** `README.md:69-70`, `:94`; `kleinanzeigen-duplizieren.user.js:8`, `:262-268`, `:284`; `package.json:3`.

**Technische Erklärung:** Dokumentation, die Code-Fakten (Endpunkt-URL, Token-Quellen, aktuelle Version) falsch wiedergibt, verfehlt ihren Zweck als Referenz und erschwert Debugging/Support.

**Auswirkungen:** Wartbarkeit/Entwicklerproduktivität (geringfügig).

**Risiko:** Niedrig — reine Doku-Drift, kein Laufzeiteffekt.

**Root Cause:** Changelog-Pflege und technischer Referenzteil sind manuelle, ungeprüfte Schritte im Release-Prozess.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren, Datei `README.md`: (1) Ergänze den Changelog-Eintrag "Version 3.5.2" (Fix Issue #39: Popup-Dismisser re-klickt mit Cooldown statt One-Shot, Timeout 10s→30s — Quelle: Kommentarblock kleinanzeigen-duplizieren.user.js:31-35 und Commit 784cdd9). (2) Korrigiere den Endpunkt zu `POST /m-anzeigen-loeschen.json?ids={adId}`. (3) Ergänze bei "CSRF-Token" die Meta-Tag-Quellen `meta[name="_csrf"]`/`meta[name="csrf-token"]` (werden vor dem Input geprüft). Einschränkungen: nur README.md ändern.

**Akzeptanzkriterien:**
- [ ] Changelog enthält 3.5.2 mit korrektem Inhalt.
- [ ] Endpunkt-Doku stimmt zeichengenau mit dem Code überein.
- [ ] CSRF-Dokumentation nennt alle drei Quellen in Code-Reihenfolge.

**Definition of Done:** README aktualisiert, Abgleich gegen Code im PR belegt, Review abgeschlossen.

**Empfohlene automatisierte Tests:** Nicht sinnvoll automatisierbar (Prosa-Doku); optional CI-Grep, dass die aktuelle package.json-Version im Changelog vorkommt.

---

### DEBT-001 — Toter Code: `getFormElements()` wird nie aufgerufen

**ID:** DEBT-001
**Kategorie:** Technical Debt
**Priorität:** Niedrig
**Status:** Offen

**Betroffene Dateien:** `kleinanzeigen-duplizieren.user.js`
**Betroffene Klassen:** keine
**Betroffene Methoden:** `getFormElements()`

**Nachweis:** `getFormElements` wird in Zeile 320 definiert und im gesamten Repository nirgends referenziert (verifiziert per `grep -n "getFormElements" *.js scripts/*.js` — einziger Treffer ist die Definition).

**Beleg:** `kleinanzeigen-duplizieren.user.js:320-331`; grep-Befund.

**Technische Erklärung:** Toter Code (Clean Code / YAGNI): erhöht Lesekomplexität und suggeriert eine Nutzung (inkl. eigener Fehlerpfade "Formular nicht gefunden"), die nicht existiert. Der jüngste Commit-Verlauf ("drop dead code", `07d041f`) zeigt, dass das Projekt tote Pfade aktiv entfernt — dieser wurde übersehen.

**Auswirkungen:** Wartbarkeit (gering).

**Risiko:** Niedrig — kein Laufzeiteffekt, reine Pflegeschuld.

**Root Cause:** Refactoring der Aufrufer (duplicateAd/smartRepublish nutzen heute `waitForElement`/direkte Selektoren) ohne Entfernung der alten Hilfsfunktion.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren, Datei `kleinanzeigen-duplizieren.user.js`: Die Funktion `getFormElements()` (Zeilen 320–331) wird nirgends aufgerufen. Ziel: Entferne die Funktion ersatzlos. Einschränkungen: keine weiteren Änderungen; `npm run validate` muss grün bleiben.

**Akzeptanzkriterien:**
- [ ] `getFormElements` existiert nicht mehr im Repository.
- [ ] `npm run validate` grün; kein weiterer Diff.

**Definition of Done:** Funktion entfernt, Validate grün, PR gemerged.

**Empfohlene automatisierte Tests:** Keine — Löschung toten Codes ohne Verhaltensrelevanz; Syntax-Check genügt (Begründung: kein beobachtbares Verhalten betroffen).

---

### DEBT-002 — Tab-Protokoll-Konstanten dupliziert, ohne verbindliche Protokolldefinition

**ID:** DEBT-002
**Kategorie:** Technical Debt / Architektur
**Priorität:** Niedrig
**Status:** Offen

**Betroffene Dateien:** `kleinanzeigen-duplizieren.user.js`, `helper.user.js`
**Betroffene Klassen:** keine
**Betroffene Methoden:** `batchOpenIDB`/`openIDB`, `batchSetResult`/`handleValue`, `isBatchMode`/`processOne`, `init()`

**Nachweis:**
Das Tab-übergreifende Protokoll besteht aus in beiden Dateien unabhängig hart kodierten Werten, die exakt übereinstimmen müssen:
- IndexedDB: `'ka-batch'` / Version `1` / Store `'snapshots'` (Hauptscript Zeilen 385–387; Helper Zeilen 40–42).
- localStorage-Key-Präfix: `'ka-batch-result-'` (Hauptscript Zeilen 414, 506, 689; Helper Zeile 37).
- sessionStorage-Key: `'ka-batch-original-adid'` (Hauptscript Zeilen 563, 685).
- Trigger-Hash: `'#smartRepublish'` (Hauptscript Zeile 418, 702; Helper Zeilen 707, 716).
- Fehlercode-Grammatik `error:<code>[:<sub>]` inkl. Spezialwert `save_failed:delete_ok` → Datenverlust (Hauptscript Zeilen 522, 577, 592–596; Helper Zeilen 752–760).

Es existiert keine gemeinsame Datei, kein Build-Schritt und keine Dokumentationsdatei im Repo, die dieses Protokoll verbindlich definiert (README erwähnt die Kommunikation nur als Feature-Beschreibung im Changelog 3.5.0).

**Beleg:** siehe Zeilenangaben oben.

**Technische Erklärung:** DRY-Verletzung mit Architektur-Charakter: Zwei getrennt versionierte, getrennt auto-updatende Artefakte (unterschiedliche `@version`-Stände sind laut `@updateURL`-Mechanik im Feld garantiert möglich) teilen ein implizites Protokoll. Eine einseitige Änderung (z. B. neuer Fehlercode, IDB-Schema-Bump) bricht die Gegenstelle ohne jede Warnung; die Fehlercode-Auswertung entscheidet über Datenverlust-Klassifikation (siehe BUG-003).

**Auswirkungen:** Wartbarkeit, Stabilität bei künftigen Änderungen (Versions-Skew zwischen den beiden installierten Scripts).

**Risiko:** Niedrig heute, steigend mit jeder Protokolländerung.

**Root Cause:** Userscripts können ohne `@require`/Build-Schritt keinen Code teilen; das Protokoll entstand inkrementell ohne zentrale Definition.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren: Das Tab-Protokoll zwischen `kleinanzeigen-duplizieren.user.js` und `helper.user.js` (IndexedDB `ka-batch`/`snapshots`, localStorage-Präfix `ka-batch-result-`, sessionStorage `ka-batch-original-adid`, Hash `#smartRepublish`, Fehlercode-Grammatik `error:<code>[:<sub>]`) ist in beiden Dateien dupliziert und nirgends verbindlich dokumentiert. Ziel: (1) Erstelle `PROTOCOL.md` im Repo-Root, das alle Schlüssel, Werte, Fehlercodes und deren Datenverlust-Semantik tabellarisch definiert, inklusive Kompatibilitätsregel (Codes dürfen nur additiv erweitert werden; unbekannte Codes gelten als Nicht-Datenverlust-Fehler — prüfe, ob der Helper das heute erfüllt). (2) Verweise in beiden Scripts per Kommentar an den Konstanten-Blöcken auf PROTOCOL.md. (3) Optional: kleines Lint-Skript, das per Regex prüft, dass die Literale in beiden Dateien mit PROTOCOL.md übereinstimmen, eingebunden in `npm run validate`. Einschränkungen: kein geteilter Laufzeitcode, keine @require-Einführung.

**Akzeptanzkriterien:**
- [ ] PROTOCOL.md definiert alle geteilten Schlüssel/Codes vollständig.
- [ ] Beide Scripts verweisen an den relevanten Stellen auf PROTOCOL.md.
- [ ] (Optional) Konsistenz-Lint in `npm run validate`.

**Definition of Done:** PROTOCOL.md committed, Kommentare gesetzt, Validate grün, PR-Review abgeschlossen.

**Empfohlene automatisierte Tests:** Konsistenz-Lint (Regex-Abgleich der Literale) — als statischer Test ohne Browser umsetzbar.

---

### DEBT-003 — `buildZip()` ohne Limit-Prüfung (ZIP-Formatgrenzen)

**ID:** DEBT-003
**Kategorie:** Technical Debt
**Priorität:** Niedrig
**Status:** Offen

**Betroffene Dateien:** `helper.user.js`
**Betroffene Klassen:** keine
**Betroffene Methoden:** `buildZip()`

**Nachweis:**
`buildZip()` schreibt die Dateianzahl als Uint16 (`ev.setUint16(8, files.length, true)`, Zeilen 216–217) und Größen/Offsets als Uint32 (Zeilen 170–171, 190–191, 198, 218–219) ohne jede Bereichsprüfung und ohne ZIP64-Unterstützung. Bei mehr als 65 535 Einträgen oder Gesamt-/Einzelgrößen ≥ 4 GiB entstehen per `DataView`-Semantik stillschweigend abgeschnittene Werte und damit ein korruptes Archiv — ausgerechnet beim Recovery-Export, dessen Zweck die Datenrettung ist.

**Beleg:** `helper.user.js:148-223`.

**Technische Erklärung:** Fehlende Eingabevalidierung an Formatgrenzen (CWE-190 sinngemäß: Integer-Truncation). Die Eigenimplementierung (bewusst dependency-frei, Kommentar "STORE-only, kein Fremdcode" — nachvollziehbare Entscheidung) übernimmt damit auch die Pflicht zur Grenzenprüfung.

**Auswirkungen:** Stabilität des Recovery-Exports im Extremfall.

**Risiko:** Sehr geringe Eintrittswahrscheinlichkeit (erfordert tausende Snapshots bzw. ≥ 4 GiB Bilddaten); Schaden im Eintrittsfall hoch (unbrauchbares Recovery-Archiv ohne Fehlermeldung).

**Root Cause:** Minimal-Implementierung des ZIP-Formats ohne Absicherung der Formatgrenzen.

**KI-Prompt zur Behebung:**
> Im Repository Kleinanzeigen-Anzeigen-duplizieren, Datei `helper.user.js`, Funktion `buildZip()`: Die STORE-only-ZIP-Implementierung schreibt Anzahl (Uint16) und Größen/Offsets (Uint32) ohne Bereichsprüfung; Überläufe erzeugen stillschweigend korrupte Archive. Ziel: Wirf vor dem Schreiben einen aussagekräftigen Error, wenn `files.length > 65535`, eine Einzeldatei ≥ 4 GiB ist oder der laufende Offset 4 GiB überschreitet; fange den Fehler in `downloadRecoveryZip()`/UI ab (bestehender catch in `appendRecoverySection` zeigt bereits "Fehler"). ZIP64 ist ausdrücklich nicht gefordert. Ergänze einen Unit-Test (nach TEST-001) für die Fehlerauslösung.

**Akzeptanzkriterien:**
- [ ] Überschreitung der Formatgrenzen führt zu einem Error statt zu einem korrupten Archiv.
- [ ] UI zeigt im Fehlerfall eine Meldung (bestehender Pfad).
- [ ] Normale Exporte unverändert.

**Definition of Done:** Guard implementiert, Validate grün, Unit-Test (sobald TEST-001 umgesetzt) vorhanden, PR-Review abgeschlossen.

**Empfohlene automatisierte Tests:** Unit-Test mit synthetischer Dateiliste (`length`-Mock > 65535) → erwarteter Error; Positivtest: kleines Archiv besitzt korrekte Signaturen (`PK\x03\x04`, EOCD).

---

## Nicht verifizierbare Beobachtungen

Diese Punkte sind aus dem Repository **nicht** beweisbar und daher ausdrücklich **keine Findings**:

1. **DOM-Selektoren und Button-Texte** (`li[data-testid="ad-card"]`, `.managead-listitem-enddate`, `h3 a`, "Anzeige speichern", Popup-Texte wie "Ohne Hochschieben weiter", CSS-Klassen `bg-accentContainer`): Ob sie zur aktuellen Live-Site passen, ist ohne Zugriff auf kleinanzeigen.de nicht prüfbar. Die Projekthistorie zeigt wiederkehrende Anpassungen an UI-Drift.
2. **`MIN_DAYS_TO_END = 53`** (helper.user.js:26) basiert auf der im Kommentar angenommenen 60-Tage-Standardlaufzeit von Anzeigen. Die Annahme selbst ist nicht aus dem Repo verifizierbar.
3. **Bild-URL-Normalisierung** auf `?rule=$_57.JPG` (kleinanzeigen-duplizieren.user.js:453) unterstellt ein bestimmtes CDN-Verhalten (größte Variante); nicht prüfbar.
4. **Redirect-Verhalten `kleinanzeigen.de` → `www.kleinanzeigen.de`**: beeinflusst die Eintrittswahrscheinlichkeit von BUG-005, ist aber serverseitig und nicht aus dem Repo belegbar.
5. **Nutzungsbedingungen von kleinanzeigen.de**: Ob automatisiertes Löschen/Neu-Einstellen (insb. der Batch-Modus mit Jitter-Delays) den ToS des Betreibers entspricht, ist aus dem Repository nicht bewertbar.
6. **Wirksamkeit des Popup-Dismissers** (Issue #39-Fix): Das Cooldown-Re-Klick-Verhalten ist implementiert wie kommentiert; ob es das Live-Problem löst, ist nur gegen die Site testbar.
7. **Tampermonkey-`GM_openInTab`-Verhalten** nach Tab-Navigation (Kommentar helper.user.js:700-702): plausibel dokumentiert, aber nur zur Laufzeit verifizierbar.

---

## Quick Wins

| ID | Aufwand | Wirkung |
|---|---|---|
| DEBT-001 | Minuten | Toten Code entfernen |
| DOC-002 | < 1 h | README faktisch korrekt |
| BUILD-001 | < 1 h | Jeder Merge wird validiert (Deploy-Kanal abgesichert) |
| BUG-003 | < 2 h | Ein-Zeilen-Logikänderung + UI-Text schützt das Recovery-Sicherheitsnetz |
| BUILD-002 | < 1 h | Versions-Log dauerhaft korrekt |

---

## Empfohlene Testergänzungen

Priorisierte Reihenfolge (Voraussetzung: TEST-001-Infrastruktur):

1. **Fehlercode-Protokoll** (`handleValue`-Parsing, Datenverlust-Klassifikation) — schützt BUG-003-Fix.
2. **Ablauf-Reihenfolge Smart-Republish** (kein Delete ohne Save-Button/adId-Input) — schützt BUG-001/002-Fix.
3. **Snapshot-Lebenszyklus** (behalten bei Timeout/Datenverlust, löschen bei Erfolg).
4. **`readFormFields`-Denylist** (kein `_csrf` in rawFields) — schützt SEC-001-Fix.
5. **Datums-/Kandidatenlogik** (`parseEndDate`, `daysUntil`, Grenzfall `days === 53`).
6. **ZIP-Builder** (Signaturen, CRC, Grenzen-Guard).
7. **Statischer Konsistenz-Check** (@match vs. absolute URLs; Protokoll-Literale; Version im Changelog) — läuft ohne Browser in CI.

---

## Abschlussbewertung

### Architekturbewertung

Die Zwei-Script-Architektur (Orchestrator auf "Meine Anzeigen", Worker auf der Bearbeiten-Seite, Kommunikation über localStorage-Signale + IndexedDB-Snapshots) ist dem Tampermonkey-Umfeld angemessen und bewusst minimal-privilegiert (`@grant none` im Hauptscript, nur `GM_openInTab` im Helper — dokumentiert begründet). Positiv: Phasen-basierte Fehlerklassifikation, Recovery-Snapshot-Konzept, dependency-freie Umsetzung. Strukturelle Schwächen: implizites, dupliziertes Tab-Protokoll ohne verbindliche Definition (DEBT-002) und eine destruktive Operations-Reihenfolge, die Vorbedingungen nicht vollständig vor der Löschung prüft (BUG-001/002). **Gesamturteil: solide für den Projekttyp, mit zwei konkreten strukturellen Korrekturen.**

### Sicherheitsbewertung

Keine kritischen Schwachstellen gefunden. Positiv: minimale `@grant`-Berechtigungen, kein `innerHTML` mit Fremddaten (durchgängig `textContent`/`createElement` — XSS-arm), adId-Validierung vor dem Delete-Request (`/^\d{1,20}$/`), enge `@match`-Muster (Wildcards in 3.5.1 entfernt), HTTPS-only, keine Secrets im Repo, vorhandene SECURITY.md mit Meldeprozess. Abzüge: SEC-001 (Persistenz/Export von `_csrf` in rawFields, im Widerspruch zur eigenen SECURITY.md) und die falsche Datenschutz-Aussage in INSTALL.md (DOC-001). **Gesamturteil: gutes Sicherheitsniveau, ein konkreter Datenminimierungs-Defekt.**

### Testqualitätsbewertung

**Testabdeckung: 0 %** — keine Tests vorhanden (TEST-001), keine CI (BUILD-001); `npm run lint` prüft nur Syntax. Die bewusste Entfernung einer wertlosen Fake-Testsuite (README 3.5.1) war fachlich richtig, ließ aber eine Lücke ohne Ersatz. Für ein Projekt, das irreversible Löschoperationen auf Nutzerdaten ausführt und dessen Historie mehrere Regressions-Fixes zeigt, ist das der größte prozessuale Mangel. **Gesamturteil: ungenügend; testbare Logik ist vorhanden und extraktionsfähig.**

### Technische Schulden

Überschaubar und lokalisiert: ein toter Codeblock (DEBT-001), dupliziertes Protokoll (DEBT-002), fehlende Formatgrenzen im ZIP-Builder (DEBT-003), unsynchronisiertes Versionsliteral (BUILD-002), zwei driftende Doku-Dateien (DOC-001/002). Keine strukturelle Verschuldung, die einer Weiterentwicklung im Weg steht. Empfohlene Tilgungsreihenfolge: siehe BACKLOG.md.

---

*Alle Findings wurden gegen den Repository-Stand `87dd644` verifiziert; jede Zeilenangabe ist reproduzierbar. Spekulative Punkte stehen ausschließlich unter "Nicht verifizierbare Beobachtungen".*
