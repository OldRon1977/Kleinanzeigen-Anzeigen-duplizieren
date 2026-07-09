# BACKLOG.md — Umsetzbare Tickets aus dem Code-Review

**Basis:** REVIEW.md, Repository-Stand `87dd644`, 2026-07-09
**Empfohlene Umsetzungsreihenfolge:** BUG-003 → BUILD-001 → BUG-001 → BUG-002 → BUG-004 → SEC-001 → TEST-001 → DOC-001 → BUG-005 → DOC-002 → BUILD-002 → DEBT-001 → DEBT-002 → DEBT-003

---

## BUG-003 — Batch löscht Recovery-Snapshot bei Timeout

- **Priorität:** Hoch
- **Aufwand:** S
- **Abhängigkeiten:** keine
- **Beschreibung:** `processOne()` in `helper.user.js` klassifiziert Timeouts hart als `dataLoss: false`; `runBatch()` löscht daraufhin den Recovery-Snapshot (Zeile 848). Ein Timeout kann jedoch bedeuten, dass das Original bereits gelöscht, die neue Anzeige aber nicht bestätigt wurde — genau der Fall, für den der Snapshot existiert. Der Einzelmodus (`openSmartRepublish`) behält den Snapshot bei Fehlern bereits korrekt.
- **Akzeptanzkriterien:**
  - [ ] Bei `code === 'timeout'` wird `deleteSnapshot()` nicht aufgerufen.
  - [ ] Recovery-/Done-UI weist auf den unklaren Ausgang hin und listet den Snapshot.
  - [ ] Batch- und Einzelmodus verhalten sich bei Timeout identisch.
  - [ ] README/SECURITY.md beschreiben das Timeout-Verhalten.
- **Definition of Done:** Code geändert, `npm run validate` grün, manueller Test (Worker-Tab während des Laufs schließen → Snapshot bleibt erhalten) dokumentiert, Changelog-Eintrag, PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → BUG-003.
- **Risiko bei Nichtbehebung:** Irreversibler Verlust von Anzeigendaten samt Vernichtung der einzigen Wiederherstellungskopie im unklarsten Fehlerfall; das beworbene Sicherheitsnetz ("Auto-Stop bei Datenverlust, hält den Snapshot") greift nicht.

---

## BUILD-001 — CI-Validierung einführen

- **Priorität:** Mittel
- **Aufwand:** S
- **Abhängigkeiten:** keine (später um TEST-001 erweiterbar)
- **Beschreibung:** `.github/workflows/` enthält nur die Stale-Issue-Automatik. `npm run validate` (Versions-Sync + Syntax-Check) wird nirgends automatisch ausgeführt, obwohl `main` über `@updateURL`/`@downloadURL` der direkte Auslieferungskanal an alle Installationen ist.
- **Akzeptanzkriterien:**
  - [ ] Workflow `ci.yml` läuft bei Push/PR auf main: `npm run validate` + `git diff --exit-code` nach Build.
  - [ ] Syntaxfehler und Versions-Desync schlagen den Build fehl.
  - [ ] Minimale Permissions (`contents: read`).
- **Definition of Done:** Erster CI-Lauf grün, Negativ-Probe (absichtlicher Syntaxfehler auf Test-Branch) nachweislich rot.
- **KI-Prompt:** siehe REVIEW.md → BUILD-001.
- **Risiko bei Nichtbehebung:** Ein einziger fehlerhafter Merge erreicht via Tampermonkey-Auto-Update ungeprüft alle Nutzer.

---

## BUG-001 — Original wird gelöscht, bevor Voraussetzungen der Neuerstellung geprüft sind

- **Priorität:** Hoch
- **Aufwand:** M
- **Abhängigkeiten:** sinnvoll gemeinsam mit BUG-002 umzusetzen
- **Beschreibung:** `smartRepublish()` ruft `deleteAd()` auf, bevor Speichern-Button und adId-Input aufgelöst wurden; außerhalb des Batch-Modus existiert zudem kein Snapshot. Schlägt die Button-Suche nach der Löschung fehl, ist die Anzeige unwiederbringlich weg. `duplicateAd()` zeigt im selben File die korrekte Reihenfolge (Button-Prüfung zuerst).
- **Akzeptanzkriterien:**
  - [ ] Kein `deleteAd()`-Aufruf ohne vorher aufgelösten Save-Button und adId-Input.
  - [ ] Abbruch vor Löschung lässt das Original unangetastet.
  - [ ] Snapshot vor jeder Löschung, auch im manuellen Modus.
  - [ ] README/Changelog aktualisiert.
- **Definition of Done:** `npm run validate` grün, manueller Test (Erfolgsfall + simulierter Button-Timeout) dokumentiert, PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → BUG-001.
- **Risiko bei Nichtbehebung:** Datenverlust kompletter Anzeigen (Texte, Bilder) bei jedem Rendering-/UI-Drift-Problem der Zielseite — ein laut Projekthistorie wiederkehrendes Ereignis.

---

## BUG-002 — "Speichern" wird auch ohne Neutralisierung des adId-Felds geklickt

- **Priorität:** Hoch
- **Aufwand:** M
- **Abhängigkeiten:** gemeinsam mit BUG-001; Fehlercode-Erweiterung berührt DEBT-002 (Protokoll)
- **Beschreibung:** In `duplicateAd()` und `smartRepublish()` ist die Neutralisierung des adId-Inputs (`removeAttribute('name')`, Wert leeren) als optionales `if (adIdInput)` implementiert. Bei nicht gefundenem Input wird trotzdem `saveBtn.click()` ausgeführt — das Submit hat dann Edit- statt Duplikat-Semantik; in `smartRepublish()` läuft es gegen eine bereits gelöschte Anzeige.
- **Akzeptanzkriterien:**
  - [ ] Save-Klick nur nach nachweislicher Neutralisierung des adId-Felds.
  - [ ] Abbruchpfad: Fehlernotification, Spinner weg, Buttons re-enabled, im Batch eindeutiger Fehlercode.
  - [ ] Helper klassifiziert den neuen Fehlercode korrekt (nach Delete = Datenverlust).
  - [ ] `smartRepublish()` nutzt `waitForElement` statt einmaligem `querySelector`.
- **Definition of Done:** `npm run validate` grün, Helper-Klassifikation verifiziert, Changelog aktualisiert, PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → BUG-002.
- **Risiko bei Nichtbehebung:** Stilles Fehlverhalten (Bearbeitung statt Duplikat) bzw. Submit gegen gelöschte Anzeige mit Datenverlustfolge.

---

## BUG-004 — Kein Recovery nach Save-Klick außerhalb des Batch-Modus; blockierendes Overlay

- **Priorität:** Mittel
- **Aufwand:** M
- **Abhängigkeiten:** keine
- **Beschreibung:** Nach `saveBtn.click()` gibt es im manuellen Fluss keinen Codepfad, der den Vollbild-Spinner (`.ka-spinner`, `inset: 0`, ohne `pointer-events: none`) entfernt oder Buttons re-enabled. Bleibt die Navigation aus — ein laut Watchdog-Kommentar im Code reales Szenario —, ist die Seite dauerhaft klick-blockiert; bei `smartRepublish()` ist das Original zu diesem Zeitpunkt bereits gelöscht.
- **Akzeptanzkriterien:**
  - [ ] Watchdog in allen Modi: bei ausbleibender Navigation Spinner entfernen, Buttons re-enablen, Fehlermeldung zeigen.
  - [ ] Batch-Signalisierung (`error:save_failed:...`) bleibt unverändert.
  - [ ] Erfolgsfall unverändert.
- **Definition of Done:** `npm run validate` grün, manueller Test mit blockierter Navigation dokumentiert, Changelog aktualisiert, PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → BUG-004.
- **Risiko bei Nichtbehebung:** Eingefrorene, unbedienbare Seite im Fehlerfall; bei Smart-Republish verschärft es den Datenverlust, weil der Nutzer nicht mehr manuell speichern kann.

---

## SEC-001 — `_csrf`/Hidden-Inputs aus Snapshot und ZIP-Export ausschließen

- **Priorität:** Mittel
- **Aufwand:** S
- **Abhängigkeiten:** keine; Test dazu nach TEST-001
- **Beschreibung:** `readFormFields()` erfasst in `rawFields` alle benannten Felder außer password/file — inklusive Hidden-Inputs wie `_csrf` (dessen Existenz `getCsrfToken()` und SECURITY.md selbst belegen). Die Daten landen in IndexedDB und im Recovery-ZIP (`data.json`). SECURITY.md sichert das Gegenteil zu ("CSRF-Token ... nicht persistiert").
- **Akzeptanzkriterien:**
  - [ ] `rawFields` ohne `_csrf` und ohne Hidden-Inputs ohne Recovery-Nutzen.
  - [ ] `data.json` im ZIP-Export ohne Security-Artefakte.
  - [ ] SECURITY.md beschreibt den tatsächlichen Snapshot-Umfang.
  - [ ] Kuratierte Recovery-Felder unverändert vollständig.
- **Definition of Done:** Code + SECURITY.md geändert, `npm run validate` grün, `data.json`-Nachweis im PR, Changelog aktualisiert.
- **KI-Prompt:** siehe REVIEW.md → SEC-001.
- **Risiko bei Nichtbehebung:** Persistenz und potenzielle Weitergabe eines Security-Artefakts (Recovery-ZIPs werden naturgemäß geteilt/abgelegt); dokumentierte Security-Zusicherung bleibt falsch.

---

## TEST-001 — Testinfrastruktur und Kern-Unit-Tests einführen

- **Priorität:** Mittel
- **Aufwand:** L
- **Abhängigkeiten:** keine; entfaltet vollen Wert nach BUG-001/002/003 (Regressionsschutz); CI-Anbindung via BUILD-001
- **Beschreibung:** Es existieren keine Tests; `lint` ist reiner Syntax-Check. Die datenverlust-relevanten Logikpfade (Fehlercode-Protokoll, Snapshot-Lebenszyklus, Ablauf-Reihenfolge) sind ungeschützt gegen Regressionen — die 3.3.x-Fixhistorie und Issue #39 belegen die Anfälligkeit.
- **Akzeptanzkriterien:**
  - [ ] `npm test` mit Vitest/Jest + jsdom, lokal grün.
  - [ ] Unit-Tests für Fehlercode-Parsing, Datums-/Kandidatenlogik, ZIP-Builder.
  - [ ] Ausgelieferte .user.js funktional unverändert, keine Laufzeit-Dependencies.
  - [ ] `npm run validate` schließt Tests ein; README dokumentiert das Setup.
- **Definition of Done:** Infrastruktur committed, Tests grün, CI (BUILD-001) führt sie aus, PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → TEST-001.
- **Risiko bei Nichtbehebung:** Jede künftige Änderung an destruktiven Pfaden wird ausschließlich von Endnutzern in Produktion getestet.

---

## DOC-001 — INSTALL.md konsolidieren (Encoding, Widersprüche, tote Links)

- **Priorität:** Mittel
- **Aufwand:** S
- **Abhängigkeiten:** keine
- **Beschreibung:** INSTALL.md hat durchgängig Mojibake-Encoding, eine bei 3.1.0 endende Versionstabelle, die falsche Aussage "Keine Daten werden gespeichert" (Widerspruch zu SECURITY.md/README), einen Link auf den nicht existierenden README-Anker `#datenschutz` und die falsche Angabe "öffentliche eBay API".
- **Akzeptanzkriterien:**
  - [ ] Korrektes UTF-8, keine Mojibake (oder Datei entfernt und Verweise bereinigt).
  - [ ] Keine Aussagen im Widerspruch zu SECURITY.md/README.
  - [ ] Keine toten Links/Anker; Versionsinfo delegiert an README-Changelog.
- **Definition of Done:** Doku geändert, Link-Check durchgeführt, PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → DOC-001.
- **Risiko bei Nichtbehebung:** Irreführende Datenschutz-Zusicherung gegenüber Nutzern; unprofessioneller Ersteindruck.

---

## BUG-005 — Host-Konsistenz herstellen (non-www @match vs. www-URLs)

- **Priorität:** Mittel
- **Aufwand:** S
- **Abhängigkeiten:** keine
- **Beschreibung:** Beide Scripts matchen auch `https://kleinanzeigen.de` (ohne www), aber `deleteAd()` (absolute www-URL, Same-Origin-Credentials), localStorage-Result-Signaling und IndexedDB sind origin-gebunden an `www.kleinanzeigen.de`. Auf non-www wären Löschung und Batch nachweislich funktionsunfähig. Empfehlung: non-www-Matches entfernen (Variante A).
- **Akzeptanzkriterien:**
  - [ ] `@match` und tatsächlich unterstützte Origins deckungsgleich.
  - [ ] README "Unterstützte URLs" synchron zu den Headern.
  - [ ] Versionen via `package.json` + `npm run build` gebumpt.
- **Definition of Done:** Header/Doku angepasst, `npm run validate` grün, Changelog aktualisiert, PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → BUG-005.
- **Risiko bei Nichtbehebung:** Auf non-www-Seiten fehlschlagende Löschungen und in Timeouts laufende Batches; dauerhaft widersprüchliche Konfiguration.

---

## DOC-002 — README korrigieren (Changelog 3.5.2, Endpunkt, CSRF-Quellen)

- **Priorität:** Niedrig
- **Aufwand:** S
- **Abhängigkeiten:** keine
- **Beschreibung:** Changelog endet bei 3.5.1 (aktuell: 3.5.2, Issue-#39-Fix fehlt); Endpunkt als `m-anzeigen-Löschen.json` statt `m-anzeigen-loeschen.json` dokumentiert; CSRF-Doku nennt nur das Input, der Code prüft zuerst die Meta-Tags.
- **Akzeptanzkriterien:**
  - [ ] Changelog-Eintrag 3.5.2 vorhanden und korrekt.
  - [ ] Endpunkt zeichengenau wie im Code.
  - [ ] Alle drei CSRF-Quellen in Code-Reihenfolge dokumentiert.
- **Definition of Done:** README aktualisiert, Abgleich gegen Code im PR belegt, gemerged.
- **KI-Prompt:** siehe REVIEW.md → DOC-002.
- **Risiko bei Nichtbehebung:** Gering — fehlleitende Referenz bei Debugging/Support.

---

## BUILD-002 — Versionsliteral in Sync-Mechanismus aufnehmen

- **Priorität:** Niedrig
- **Aufwand:** S
- **Abhängigkeiten:** BUILD-001 (CI-Diff-Check verifiziert die Behebung automatisch)
- **Beschreibung:** `scripts/build.js` synchronisiert nur die `@version`-Headerzeile; das Log-Literal `(v3.5.2)` in `init()` bleibt unsynchronisiert und loggt nach dem nächsten Bump eine falsche Version — das Log ist laut README das Support-Diagnosewerkzeug.
- **Akzeptanzkriterien:**
  - [ ] Header-@version und geloggte Version nach `npm run build` garantiert identisch (oder Version aus dem Log entfernt).
  - [ ] build.js schlägt fehl, wenn das Sync-Muster fehlt.
- **Definition of Done:** build.js + Script geändert, Test-Bump verifiziert, PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → BUILD-002.
- **Risiko bei Nichtbehebung:** Irreführende Versionsangaben in Support-Logs ab dem nächsten Release.

---

## DEBT-001 — Toten Code `getFormElements()` entfernen

- **Priorität:** Niedrig
- **Aufwand:** S
- **Abhängigkeiten:** keine
- **Beschreibung:** `getFormElements()` (kleinanzeigen-duplizieren.user.js:320-331) wird nirgends aufgerufen (grep-verifiziert).
- **Akzeptanzkriterien:**
  - [ ] Funktion entfernt, kein weiterer Diff.
  - [ ] `npm run validate` grün.
- **Definition of Done:** PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → DEBT-001.
- **Risiko bei Nichtbehebung:** Gering — Lesekomplexität, irreführende Fehlerpfade.

---

## DEBT-002 — Tab-Protokoll verbindlich dokumentieren (PROTOCOL.md)

- **Priorität:** Niedrig
- **Aufwand:** M
- **Abhängigkeiten:** vor BUG-002 sinnvoll (neuer Fehlercode wird dort definiert)
- **Beschreibung:** IndexedDB-Schema, localStorage-/sessionStorage-Keys, Trigger-Hash und Fehlercode-Grammatik sind in beiden Scripts unabhängig hart kodiert; beide Artefakte updaten getrennt (Versions-Skew möglich). Eine verbindliche Protokolldefinition mit Kompatibilitätsregeln fehlt.
- **Akzeptanzkriterien:**
  - [ ] PROTOCOL.md definiert alle geteilten Schlüssel, Codes und deren Datenverlust-Semantik.
  - [ ] Beide Scripts verweisen an den Konstanten-Blöcken auf PROTOCOL.md.
  - [ ] (Optional) Konsistenz-Lint in `npm run validate`.
- **Definition of Done:** PROTOCOL.md committed, Kommentare gesetzt, Validate grün, PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → DEBT-002.
- **Risiko bei Nichtbehebung:** Künftige einseitige Protokolländerungen brechen die Gegenstelle unbemerkt — inklusive der Datenverlust-Klassifikation.

---

## DEBT-003 — ZIP-Formatgrenzen in `buildZip()` absichern

- **Priorität:** Niedrig
- **Aufwand:** S
- **Abhängigkeiten:** Unit-Test nach TEST-001
- **Beschreibung:** `buildZip()` schreibt Dateianzahl (Uint16) und Größen/Offsets (Uint32) ohne Bereichsprüfung; Überschreitungen erzeugen stillschweigend korrupte Recovery-Archive.
- **Akzeptanzkriterien:**
  - [ ] Grenzüberschreitung wirft aussagekräftigen Error statt korruptem Archiv.
  - [ ] UI zeigt den Fehler (bestehender catch-Pfad).
  - [ ] Normale Exporte unverändert.
- **Definition of Done:** Guard implementiert, Validate grün, Test (nach TEST-001) vorhanden, PR gemerged.
- **KI-Prompt:** siehe REVIEW.md → DEBT-003.
- **Risiko bei Nichtbehebung:** Sehr unwahrscheinlich, aber im Eintrittsfall unbrauchbares Recovery-Archiv ohne Warnung — beim Datenrettungs-Feature.
