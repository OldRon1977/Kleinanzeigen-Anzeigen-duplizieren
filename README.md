# Kleinanzeigen - Anzeige duplizieren / Smart neu einstellen

Ein UserScript für Tampermonkey, das praktische Buttons zum Duplizieren und intelligenten Neu-Einstellen von Anzeigen auf kleinanzeigen.de hinzufügt.

## Features

- **Duplizieren**: Erstellt eine Kopie der Anzeige, Original bleibt erhalten
- **Smart neu einstellen**: Löscht das Original und erstellt eine neue Anzeige
- **Automatische Bilderhaltung**: Alle Bilder bleiben bei beiden Funktionen erhalten
- **Banner & Popup-Blocker**: Blendet störende Upsell-Banner und Popups automatisch aus
- **Helper-Script**: Buttons "Duplizieren" und "Smart neu einstellen" direkt auf der "Meine Anzeigen"-Seite
- **Batch mit Auswahl**: Mehrere Anzeigen in einem Durchgang neu einstellen — ausgewählt per Checkbox, mit Farbcodierung nach Alter
- **Recovery-Snapshot**: Vor jeder Löschung werden Texte, Felder und Bilder lokal gesichert
- **Fehlerbehandlung**: Timeout-Schutz und Retry-Mechanismen

## Installation

### Voraussetzungen
- Browser: Chrome, Firefox, Edge, Safari oder Opera
- [Tampermonkey](https://www.tampermonkey.net/) Browser-Extension
- Bei einigen Browser (bspw. Chrome) muss noch einmal separat zugelassen werden, ob Skripte ausgeführt werden können. Bei Chrome --> Erweiterungen --> Tampermonkey --> Nutzerskripte zulassen

### Schritt 1: Hauptscript installieren (Pflicht)

[![Install Script](https://img.shields.io/badge/Install-Hauptscript-00aa00?style=for-the-badge&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)

Fügt auf der **Bearbeiten-Seite** einer Anzeige die Buttons "Duplizieren" und "Smart neu einstellen" hinzu.

### Schritt 2: Helper-Script installieren (Empfohlen)

[![Install Helper](https://img.shields.io/badge/Install-Helper_Script-0077cc?style=for-the-badge&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js)

Fügt auf der **Meine Anzeigen**-Seite neben jeder Anzeige die Buttons "Duplizieren" und "Smart neu einstellen" hinzu. Ein Klick öffnet die Bearbeiten-Seite und führt die Aktion automatisch aus. Dazu kommt der Batch über der Anzeigenliste.

> **Hinweis**: Beide Scripts müssen in Tampermonkey aktiviert sein, damit der Helper korrekt funktioniert.

### Auto-Updates
Beide Scripts erhalten automatisch Updates über Tampermonkey.

## Verwendung

### Direkt auf der Bearbeiten-Seite
1. Navigiere zu einer Anzeige und klicke "Bearbeiten"
2. Unten rechts erscheint eine Toolbar mit zwei Buttons
3. **Duplizieren**: Erstellt eine Kopie, Original bleibt bestehen
4. **Smart neu einstellen**: Löscht Original, erstellt neue Anzeige

### Über die Meine-Anzeigen-Seite (Helper)
1. Öffne "Meine Anzeigen" auf kleinanzeigen.de
2. Neben jedem "Bearbeiten"-Link erscheinen zwei Buttons: **Duplizieren** (ab Helper v1.5.0) und **Smart neu einstellen**
3. Ein Klick öffnet die Bearbeiten-Seite in einem neuen Tab und führt die Aktion automatisch aus; nach Erfolg schließt sich der Tab von selbst

### Batch mit Auswahl (Helper ab v1.7.0, Merk-Filter ab v1.8.0)
1. Öffne "Meine Anzeigen" auf kleinanzeigen.de
2. Über der Anzeigenliste erscheint der Button **"Anzeigen auswählen & neu einstellen"**
3. Das Overlay listet **alle** Anzeigen mit Checkbox. Beim Öffnen ist **nichts angehakt** — ein versehentlicher Start kann also nichts löschen
4. **Schnellwahl** unter der Liste: "Alle", "Keine", "älter als 7 Tage", "älter als 14 Tage". Jede Schnellwahl *ersetzt* die bestehende Auswahl
5. **Zusatzfilter "nur nicht gemerkte"**: die Checkbox rechts neben der Schnellwahl **blendet gemerkte Anzeigen aus der Liste aus** und wirkt *zusätzlich* zur Schnellwahl, nicht anstelle. "älter als 7 Tage" plus Häkchen wählt also genau die alten Anzeigen, die niemand auf der Merkliste hat. Der Haken ist umkehrbar: Ausgeblendete Anzeigen werden abgewählt, beim Einblenden kommt genau der vorherige Auswahlstand zurück. Die Zusammenfassung zählt nur die sichtbaren Anzeigen und nennt die Zahl der ausgeblendeten
6. **Farbcodierung** nach Alter: dunkelgrün ab 14 Tagen, grün 7–13 Tage, gelb 5–6 Tage, rot bis 4 Tage. Das Alter steht zusätzlich als Text neben jedem Eintrag
7. **Start** verarbeitet die angehakten Anzeigen nacheinander, mit 3 ± 1 Minuten Pause. Vor jeder Löschung wird ein Recovery-Snapshot in IndexedDB abgelegt

> **Sicherheitsnetz (zwei Haken)**: Jede Zeile trägt neben der sichtbaren Checkbox einen zweiten, unsichtbaren Haken (`input[data-ka-gate="fav"]`), den ausschließlich der Merk-Filter setzt — nie ein Klick. Verarbeitet wird eine Anzeige nur, wenn **fünf** Bedingungen zugleich gelten: im Auswahl-Set, sichtbarer Haken gesetzt, zweiter Haken gesetzt, dieselbe Erlaubnis beim Start noch einmal frisch aus dem Merk-Zähler abgeleitet, und Zeile sichtbar in der Liste. Der zweite Haken ist gespeicherter Zustand, die frische Ableitung ist die Rechnung von jetzt — ein einzelnes falsches Bit reicht damit nicht mehr aus, um eine gemerkte Anzeige durchzulassen. Der Haken steht als echtes Element im DOM und lässt sich in den Entwicklertools nachprüfen. Die Zahl in der Zusammenfassung stammt aus derselben Prüfung, ist also exakt die Zahl der Anzeigen, die neu eingestellt werden.

> **Woher die Daten kommen**: Die Anzeigenliste wird primär über die JSON-Schnittstelle von "Meine Anzeigen" geladen (`/m-meine-anzeigen-verwalten.json`). Das bringt drei Vorteile gegenüber dem Auslesen der sichtbaren Seite: das **echte Erstelldatum** statt einer Schätzung, **alle Seiten** statt nur der gerade angezeigten, und den Merk-Zähler als Zahl statt als Text. Ist die Schnittstelle nicht erreichbar oder liefert sie nichts, fällt das Script automatisch auf die Seitenansicht zurück — dann eben nur mit der sichtbaren Seite und geschätztem Alter, wie bis Helper 1.8.0. Welche Quelle benutzt wurde, steht in der Konsole (`Kandidaten: … quelle: json|dom`).

> **Zur Merkliste**: Der Zähler wird aus der Statistikzeile der Anzeigenkarte gelesen ("N mal gemerkt"). Lässt er sich nicht lesen — etwa nach einem Layout-Umbau bei Kleinanzeigen —, gilt die Anzeige als *unbekannt* und wird bei aktivem Filter mit ausgeblendet, also **nicht** neu eingestellt. Sind bei keiner Anzeige Zähler lesbar, erscheint die Checkbox gar nicht erst.

> **Woher das Alter kommt**: In dieser Reihenfolge — (1) `adLifeTimeInSeconds`, das der Server direkt mitliefert, ganz ohne Datumsrechnung und unabhängig von der Uhr des Browsers; (2) das Erstelldatum `creationDate`; (3) als Notnagel die alte Schätzung aus der Restlaufzeit. Nur im dritten Fall steht "(geschätzt)" am Eintrag. Live gegengeprüft: (1) und (2) liefern dieselben Werte.

> **Zum Alter**: Aus der JSON-Quelle ist das Alter exakt. Nur wenn auf die Seitenansicht zurückgefallen wird, muss es aus der Restlaufzeit abgeleitet werden (60 Tage Regellaufzeit) — bei verlängerten Anzeigen ist es dann ungenau. Betroffene Einträge sind im Overlay mit "(geschätzt)" markiert, und die Fußnote erscheint nur dann.

### Reihenfolge beim Neu-Einstellen (geändert in v3.10.0)
Bis v3.9.0 löschte das Script zuerst die alte Anzeige und legte danach die neue an. Scheiterte der zweite Schritt, war die Anzeige weg — dagegen halfen nur der Recovery-Snapshot und der Auto-Stop.

Ab v3.10.0 ist es umgekehrt: **Erst wird die neue Anzeige angelegt, dann die alte gelöscht.** Das Original bleibt bestehen, bis der Server die Neuanlage bestätigt hat; gelöscht wird erst auf der Bestätigungsseite, deren Erreichen der Beweis für die erfolgreiche Anlage ist.

Was das praktisch ändert:
- **Ein Abbruch mitten im Vorgang kann keine Anzeige mehr kosten.** Der schlimmste Fall ist ein Duplikat: beide Anzeigen stehen online.
- Tritt dieser Fall ein, meldet der Batch ihn im Abschlussbildschirm als Hinweis mit der betroffenen Anzeigen-ID zum manuellen Löschen — er verschweigt ihn nicht.
- Der Recovery-Snapshot bleibt trotzdem erhalten. Er kostet nichts und deckt Fälle ab, die außerhalb dieses Ablaufs liegen.

### Banner & Popup-Blocker (ab v3.4.0)
Auf der Bearbeiten-Seite blendet das Script automatisch aus:
- **Kostenpflichtige Feature-Optionen** (Highlight, Galerie, Bumpup)
- **Info-Banner** ("Das Bearbeiten deiner Anzeige schiebt sie nicht wieder hoch")
- **Upsell-Popups** ("Ohne Hochschieben weiter", "Ohne Highlight weiter") nach dem Speichern

Kein manuelles Wegklicken mehr nötig.

### Werbeblocker (ab v3.10.0)
Zusätzlich blendet das Script Werbung auf **allen** Seiten von kleinanzeigen.de aus: Seitenbanner links und rechts, Billboards auf Startseite und Detailansicht, Werbung über den Suchergebnissen, Werbe-Kacheln innerhalb der Trefferliste, gesponserte Blöcke unter Anzeigen sowie die Above-the-fold-Werbung in Merkliste, Nachrichten und Konto.

Dafür ist der `@match` auf `https://www.kleinanzeigen.de/*` erweitert. Wichtig zum Einordnen: Auf allen Seiten außer der Bearbeiten-Seite tut das Script **ausschließlich** dieses eine — es hängt ein `<style>`-Element an und kehrt sofort zurück. Keine Buttons, keine Observer, kein Zugriff auf Formulare, kein JavaScript, das ins Seiten-DOM eingreift. Trifft ein Selektor daneben, verschwindet schlimmstenfalls ein Layout-Element; klicken oder senden kann der Blocker nichts.

Der Cookie-Banner ist ausdrücklich von der Ausblendung ausgenommen — ohne Zustimmung lädt die Seite sonst nicht weiter.

Die Selektoren sind adaptiert aus dem [Userscript von Andi (Zer089)](https://github.com/Zer089/Kleinanzeigen.de-Anzeige_duplizieren_neu_einstellen), MIT-lizenziert.

**Live geprüft** (18.08.2026, Startseite / Suchergebnis / Detailseite, ohne Login): Getroffen haben `.liberty-filled` (4 / 16 / 5 Treffer), `#home-billboard` (6), `#btf-billboard` (1), die Werbe-Kacheln in der Trefferliste (7) und die Seitenbanner der Detailseite (je 1). Die übrigen Selektoren fanden auf den erreichbaren Seiten nichts — sie betreffen entweder eingeloggte Seiten (Merkliste, Nachrichten) oder stammen aus einer älteren Fassung der Seite. Sie bleiben drin, weil ein Selektor ohne Treffer folgenlos ist; im Code sind sie als `[ungeprueft]` markiert.

**Gegenprobe**: In einer Trefferliste mit 34 Einträgen blieben nach dem Blocker alle **27 echten Anzeigen** sichtbar, ausgeblendet wurden genau die **7 Werbekacheln**. Auf der Detailseite blieben Titel, Preis und Bild unverändert sichtbar.

## Technische Details

### Berechtigungen
Hauptscript verwendet `@grant none`. Helper-Script verwendet ab v1.3.0 `@grant GM_openInTab` für das robuste Schließen von Worker-Tabs im Batch-Modus -- ohne diese Berechtigung kann ein Userscript Tabs nach einer Navigation nicht mehr zuverlässig schließen. Beide Scripts kommunizieren ausschließlich mit kleinanzeigen.de über HTTPS.

### Unterstützte URLs
- `https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*` (Hauptscript)
- `https://www.kleinanzeigen.de/m-meine-anzeigen.html*` (Helper)

### API-Endpunkte
- **Löschen**: `POST /m-anzeigen-loeschen.json?ids={adId}`
- **CSRF-Token**: wird in dieser Reihenfolge gesucht: `meta[name="_csrf"]`, `meta[name="csrf-token"]`, dann `input[name="_csrf"]`

## Fehlerbehebung

### Buttons erscheinen nicht auf der Bearbeiten-Seite
- Warte 2-3 Sekunden nach dem Laden
- Prüfe ob das Hauptscript in Tampermonkey aktiviert ist
- Browser-Cache leeren (Strg+F5)

### Buttons erscheinen nicht auf Meine Anzeigen
- Prüfe ob das Helper-Script installiert und aktiviert ist
- Tampermonkey-Icon sollte eine "2" anzeigen (beide Scripts aktiv)

### Loeschung schlägt fehl
- Session könnte abgelaufen sein - neu anmelden
- Rate-Limiting - kurz warten und erneut versuchen

### Upsell-Popup blockiert den Vorgang
- Ab v3.4.0 wird das Popup automatisch weggeklickt
- Falls es trotzdem hängt: Seite neu laden und erneut versuchen
- In der Konsole (F12) nach `[KA-Script] Popup erkannt` suchen

## Entwicklung

- `npm test` führt die Unit-Tests aus (Vitest + jsdom, siehe Ordner `tests/`). Getestet werden die puren Logik-Anteile beider Userscripts (Protokoll-Klassifikation, Datums-, ZIP- und Formularlogik) über Test-Exports, die nur in Node aktiv sind — im Browser bleiben beide Scripts unverändert.
- `npm run validate` synchronisiert die `@version`-Header mit `package.json` und prüft die Syntax beider `.user.js`-Dateien.
- Das Tab-übergreifende Protokoll zwischen Haupt- und Helper-Script (localStorage-Result-Keys, Fehlercodes, IndexedDB-Snapshots) wird durch die Tests in `tests/helper.protocol.test.js` abgesichert; Änderungen daran müssen in beiden Scripts synchron erfolgen.

## Changelog

### Version 3.9.0 / Helper 1.8.0 (August 2026)

Das Batch-Overlay kann jetzt Anzeigen aussparen, die jemand auf die Merkliste gesetzt hat — Wunsch aus Issue #54. Wer eine gemerkte Anzeige neu einstellt, reißt sie aus der Merkliste des Interessenten; eine spätere Preisanpassung erreicht ihn dann nicht mehr.

- **Neu**: Zusatzfilter **"nur nicht gemerkte"** neben der Schnellwahl. Er *ergänzt* die Schnellwahl, statt sie zu ersetzen: "älter als 7 Tage" plus Häkchen wählt genau die alten Anzeigen, die niemand gemerkt hat.
- **Neu**: Der Filter blendet die betroffenen Zeilen aus, statt sie nur abzuwählen — und ist umkehrbar. Beim Ausblenden werden sie abgewählt, beim Einblenden kommt genau der vorherige Auswahlstand zurück. Hinzugefügt wird dabei nie etwas, das nicht vorher schon angehakt war.
- **Neu**: Der Merk-Status steht im Klartext an jeder Anzeige ("nicht gemerkt" / "2× gemerkt"), damit nachvollziehbar bleibt, warum eine Anzeige aussortiert wurde. Die Zusammenfassung zählt die sichtbaren Anzeigen und nennt die Zahl der ausgeblendeten.
- **Sicherheit**: Verarbeitet wird eine Anzeige nur, wenn **fünf** Bedingungen zugleich gelten — im Auswahl-Set, sichtbarer Haken gesetzt, zweiter (unsichtbarer) Haken des Filters gesetzt, dieselbe Erlaubnis beim Start noch einmal frisch aus dem Merk-Zähler abgeleitet, und Zeile sichtbar in der Liste. Der zweite Haken ist gespeicherter Zustand, die frische Ableitung die Rechnung von jetzt: Ein einzelnes falsches Bit lässt damit keine ausgeblendete Anzeige mehr durch. Weichen Auswahl und Darstellung voneinander ab, wird die Differenz verworfen und protokolliert.
- **Sicherheit**: Lässt sich der Merk-Zähler nicht lesen, gilt die Anzeige als *unbekannt* und wird bei aktivem Filter mit ausgeblendet — nicht als "nicht gemerkt" behandelt. Findet sich bei keiner Karte ein Zähler, erscheint die Checkbox gar nicht erst.
- **Tests**: 109 Tests. Neu sind `parseFavCount` gegen echtes Karten-Markup, die Integrationssuite `helper.integration.dom.test.js` über die ganze Kette (Markup → `collectCandidates` → Overlay → Übergabe an den Batch) und das Szenario "Alle → filtern → Start" mit allen Prüfschichten einzeln. Die Wirksamkeit ist per Mutationsproben belegt: Wird eine der Schichten entfernt, fallen Tests.

### Version 3.8.1 (August 2026)

- **Fix**: Die `adId` wird über `URLSearchParams` statt per Regex aus der URL gelesen. Das bisherige Muster kannte keine Parametergrenze und hätte auch in `?myadId=123` getroffen. Die Ziffernprüfung bleibt, weil der Wert in Fetch-URLs und Storage-Schlüssel wandert.
- **Fix**: `readFormFields()` liest nur noch innerhalb des Anzeigen-Formulars statt im ganzen Dokument — Felder aus Suchleiste, Newsletter-Box oder Cookie-Bannern landen damit nicht mehr im Snapshot. Ohne auffindbares Formular bleibt das bisherige Verhalten als Rückfallebene.
- **Barrierefreiheit**: Meldungen sind jetzt Live-Regionen (`role="status"` / bei Fehlern `role="alert"`), sodass Screenreader sie ohne Fokuswechsel vorlesen. Die Toolbar-Buttons haben `aria-label`, die die Konsequenz des Klicks nennen statt nur den Namen.
- **Doku**: README, INSTALL und SECURITY auf den aktuellen Stand gebracht — der Duplizieren-Button auf "Meine Anzeigen" (seit Helper 1.5.0) fehlte in der Anleitung ganz, der Batch-Abschnitt beschrieb noch die alte Vorauswahl.

### Version 3.8.0 / Helper 1.7.0 (August 2026)

Das Batch-Overlay ist von "alles Alte, ein Klick" auf eine bewusste Auswahl umgestellt.

- **Neu**: Jede Anzeige bekommt eine Checkbox. Gestartet wird ausschließlich, was angehakt ist. Grundlage beigetragen von @karlvonbonin (PR #48).
- **Neu**: Die Liste zeigt **alle** Anzeigen, nicht mehr nur die älter als 7 Tage. Beim Öffnen ist **nichts** vorangehakt — ein versehentlicher Start kann damit nichts löschen. Der Button heißt entsprechend "Anzeigen auswählen & neu einstellen".
- **Neu**: Schnellwahl unter der Liste: "Alle", "Keine", "älter als 7 Tage", "älter als 14 Tage". Jede Schnellwahl *ersetzt* die bestehende Auswahl.
- **Neu**: Farbcodierung nach Alter — dunkelgrün ab 14 Tagen, grün 7–13 Tage, gelb 5–6 Tage, rot bis 4 Tage. Das Alter steht zusätzlich als Text neben jedem Eintrag, hängt also nicht allein an der Farbe.
- **Neu**: Zusammenfassung und Laufzeitschätzung laufen mit ("3 von 8 ausgewählt"); der Start-Button bleibt gesperrt, solange nichts ausgewählt ist.
- **Fix**: Die Laufzeitschätzung zählt die Pausen *zwischen* den Anzeigen statt einer Pause pro Anzeige — nach der letzten Anzeige wird nicht mehr gewartet (8 Anzeigen: 21 statt 24 Minuten). (@karlvonbonin, PR #48)
- **Hinweis**: Die Kartenliste nennt nur das Enddatum, kein Erstelldatum. Das Alter wird deshalb aus der Restlaufzeit abgeleitet (60 Tage Regellaufzeit) — bei verlängerten Anzeigen ist es ungenau. Die Legende weist darauf hin.
- **Tests**: `estimateRuntimeMinutes`, `ageFromDaysLeft` und `ageBand` als reine Funktionen getestet; die jsdom-Suite `helper.confirm.dom.test.js` prüft das Overlay gegen den echten Produktivcode (leere Vorauswahl, Schnellwahl, Farbbänder, gesperrter Start).
### Version 3.7.2 (August 2026)

- **Diagnose**: Das Log weist jetzt aus, ob das Ad-ID-Feld über einen bekannten Selektor oder über den Fallback (Feldwert) gefunden wurde. Greift nur noch der Fallback, hat Kleinanzeigen das Feld umbenannt — das steht dann als Warnung samt neuem Feldnamen in der Konsole, statt erst beim nächsten Bruch aufzufallen.

### Version 3.7.1 (August 2026)

- **Fix**: Das versteckte Ad-ID-Feld wird jetzt auch dann gefunden, wenn Kleinanzeigen es umbenennt. Greifen die bekannten Selektoren nicht, wird namensunabhängig das Hidden-Feld gesucht, dessen Wert exakt der `adId` aus der URL entspricht — auf der Bearbeiten-Seite ist dieser Treffer eindeutig. Bleibt er mehrdeutig, wird weiterhin abgebrochen statt geraten. (Issue #49)
- **Fix (Diagnose)**: Bricht die Auflösung trotzdem ab, protokolliert das Script eine Bestandsaufnahme der vorhandenen Hidden-Felder (nur Feldnamen und Wertlängen, keine Inhalte) — ohne diese Angaben ist von außen nicht unterscheidbar, ob das Feld umbenannt wurde oder fehlt. (Issue #49)
- **Hinweis**: Der harte Abbruch bei fehlendem Feld bleibt bestehen. Er ist nicht die Ursache des Fehlers, sondern macht ihn sichtbar: ohne Neutralisierung würde der Submit das Original überschreiben statt eine Kopie anzulegen.

### Version 3.7.0 / Helper 1.5.0 (Juli 2026)

- **Neu**: "Duplizieren"-Button direkt auf "Meine Anzeigen" — dupliziert eine Anzeige ohne Umweg über die Bearbeiten-Seite; das Original bleibt erhalten, es wird nichts gelöscht. (Issue #46)
- **Fix**: Endloser Spinner beim Auto-Trigger via `#duplicate`. Der Klick auf "Anzeige speichern" wartet jetzt auf das vollständige Laden der Seite — vorher konnte er verpuffen, solange die Form noch nicht hydratisiert war.
- **Neu**: Der Worker-Tab schließt sich nach erfolgreicher Duplizierung selbst (Signal über die Bestätigungs-Seite an den Helper).

### Version 3.6.0 / Helper 1.4.0 (Juli 2026)

Ergebnis eines vollständigen Code-Reviews (14 Findings). Alle Änderungen sind Härtungen bestehender Abläufe — keine neuen Features, Happy Path unverändert.

- **Fix (Datenverlust-Schutz)**: Smart-Republish prüft jetzt VOR der Löschung, ob Speichern-Button und adId-Feld vorhanden sind (Preflight); fehlt eines, wird ohne Löschung abgebrochen. Die Neutralisierung des adId-Felds ist Pflicht statt optional — kein stilles "Bearbeiten statt Duplizieren" mehr. Nach der Löschung werden veraltete Element-Referenzen neu aufgelöst; Fehlpfade melden datenverlust-korrekte Codes. (BUG-001, BUG-002)
- **Fix (Datenverlust-Schutz)**: Recovery-Snapshot wird jetzt in BEIDEN Modi erstellt (bisher nur Batch); im manuellen Modus räumt der Worker ihn auf der Bestätigungs-Seite selbst wieder ab. (BUG-001)
- **Fix (Datenverlust-Schutz)**: Der Batch löscht den Recovery-Snapshot bei Timeout nicht mehr — ein Timeout ist ein Zustand unbekannten Ausgangs. (BUG-003)
- **Fix**: UI-Watchdog nach dem Save-Klick: Bleibt die Navigation aus, werden Spinner und Buttons nach 45s freigegeben statt die Seite dauerhaft zu blockieren. (BUG-004)
- **Security**: Hidden-Inputs und das CSRF-Token (`_csrf`) werden nicht mehr in Recovery-Snapshots/ZIP-Exporten gespeichert; `SECURITY.md` beschreibt den Snapshot-Umfang jetzt korrekt. (SEC-001)
- **Fix**: non-www-`@match`-Einträge entfernt — die Scripts sind funktional an `www.kleinanzeigen.de` gebunden (Fetch-Credentials, localStorage/IndexedDB sind origin-gebunden). (BUG-005)
- **Fix**: ZIP-Export wirft bei Formatgrenzen (>65535 Dateien, ≥4 GiB) einen Fehler statt stillschweigend ein korruptes Archiv zu erzeugen. (DEBT-003)
- **Neu (Qualität)**: Testinfrastruktur mit Vitest + jsdom, 32 Unit-Tests für Protokoll-, Datums-, ZIP- und Formularlogik; CI-Workflow validiert Build, Syntax, Versions-Sync und Tests bei jedem Push/PR. (TEST-001, BUILD-001)
- **Neu (Doku)**: Das Tab-Protokoll zwischen beiden Scripts (Fehlercode-Grammatik, Datenverlust-Semantik) ist jetzt verbindlich dokumentiert und testgesichert. `INSTALL.md` neu geschrieben (korrektes Encoding, keine falschen Datenschutz-Aussagen). (DEBT-002, DOC-001)
- **Cleanup**: Toter Code entfernt (`getFormElements`), Versionsliteral im Log wird von `scripts/build.js` synchronisiert, README-Fakten korrigiert. (DEBT-001, BUILD-002, DOC-002)

### Version 3.5.2 (Juli 2026)

- **Fix**: Issue #39 — Popup-Dismisser klickt mit Cooldown erneut, solange das "Effektiver verkaufen"-Popup steht (vorher One-Shot, der Klick konnte verpuffen, bevor die Handler des Modals aktiv waren). Popup-Timeout von 10s auf 30s erhöht.

### Version 3.5.1 / Helper 1.3.1 (Mai 2026)

- **Fix**: Popup-Dismisser klickt jetzt nur noch Buttons innerhalb von Modal-Containern (`[role="dialog"]`, `[aria-modal="true"]`) und mit exaktem Text-Match. Verhindert versehentliche Klicks auf gleichnamige Buttons in Form-Bereichen waehrend der save-clicked-Phase.
- **Security**: `@match`-Wildcards entfernt. Hauptscript und Helper laufen nur noch auf `www.kleinanzeigen.de` und `kleinanzeigen.de`, nicht mehr auf beliebigen `*.kleinanzeigen.de`-Subdomains. Veraltete `ebay-kleinanzeigen.de`-Eintraege entfernt.
- **Doku**: `SECURITY.md` auf 3.5.x / 1.3.x aktualisiert. Helper-Grant `GM_openInTab` und Recovery-Snapshot-Persistenz in IndexedDB dokumentiert.
- **Cleanup**: Veralteten Userscript-Stub `Kleinanzeigen duplizieren oder smart neu einstellen.js` entfernt (war seit v3.x deprecated).
- **Cleanup**: Test-Suite und Test-Doku entfernt. Die bisherigen Tests definierten lokale Mocks und pruefen damit ausschliesslich Test-Code gegen Test-Code, ohne den Userscript-Code zu importieren. Sie haben Sicherheit vorgetaeuscht. `npm run lint` validiert weiterhin die Userscript-Syntax fuer beide Files.

### Version 3.5.0 / Helper 1.3.0 (Mai 2026)
- **Neu**: Batch-Modus auf "Meine Anzeigen". Ein Button stellt alle Anzeigen, die älter als 7 Tage sind, nacheinander mit 3 ± 1 Minuten Pause neu ein.
- **Neu**: Recovery-Snapshot vor jedem Smart-Republish im Batch. Texte, Felder und Bilder werden lokal in IndexedDB gespeichert, bei erfolgreicher Neu-Anzeige automatisch verworfen.
- **Neu**: Save-Verifikation. Erfolg wird erst gemeldet, wenn die Bearbeiten-Seite verlassen wurde oder eine neue Anzeigen-ID auftaucht. Kein vorzeitiges OK.
- **Neu**: Auto-Stop bei Datenverlust. Wenn Original gelöscht ist, neue Anzeige aber nicht entstand, bricht der Batch sofort ab und hält den Snapshot.
- **Neu**: Recovery-UI im Done- und Confirm-Overlay. Verbliebene Snapshots lassen sich als ZIP herunterladen (`data.json` plus Bilder pro Anzeige) oder löschen.
- **Neu**: Kleines Overlay zeigt Trefferliste, Start-/Abbrechen-Buttons, Fortschritt und Stop-Button.
- Worker-Timeout von 90 auf 180 Sekunden erhöht (gibt Bilder-Verarbeitung mehr Luft).
- Tab-übergreifende Kommunikation über `localStorage` (Result-Signal) und IndexedDB (Snapshot). Helper nutzt jetzt `GM_openInTab`, um Worker-Tabs nach Erfolg zuverlässig zu schließen. Hauptscript bleibt `@grant none`.
- Helper 1.3.0 bringt Orchestrator und Recovery-UI. Hauptscript 3.5.0 ergänzt Snapshot-Erstellung, Save-Verifikation und differenzierte Fehler-Codes.
- Intern: `package.json`-Version (3.3.11 → 3.5.0) an Userscript-Header angeglichen.

### Version 3.4.0 (April 2026)
- **Neu**: Banner-Blocker blendet kostenpflichtige Feature-Optionen per CSS aus
- **Neu**: Info-Banner ("Bearbeiten schiebt nicht hoch") wird ausgeblendet
- **Neu**: Popup-Dismisser klickt Upsell-Dialoge automatisch weg ("Ohne Hochschieben weiter", etc.)

### Version 3.3.11 / Helper 1.1.2 (April 2026)
- Hauptscript 3.3.9-3.3.11: Bugfixes (React-Render, adId-Handling, doppeltes if)
- Hauptscript 3.3.8: `#duplicate` Hash-Erkennung, README überarbeitet
- Helper: Duplizieren-Button-Versuch (1.2.0) wegen Stabilitätsproblemen auf 1.1.2 zurückgesetzt

### Version 3.3.8 / Helper 1.2.0 (April 2026)
- Helper: Duplizieren-Button hinzugeFügt
- Hauptscript: `#duplicate` Hash-Erkennung für Helper
- README komplett überarbeitet

### Version 3.3.7 (April 2026)
- CSRF-Token aus Hidden Input lesen (Kleinanzeigen-Umbau)

### Version 3.3.6 (April 2026)
- Korrekter Ad-ID Selektor `input[name="adId"]`

### Version 3.3.4-3.3.5 (April 2026)
- Floating-Toolbar statt DOM-Injection (React-kompatibel)
- `saveBtn.click()` statt `form.submit()`

### Version 3.3.0-3.3.3 (März 2026)
- Helper-Script integriert
- Selektoren an neues Kleinanzeigen-Layout angepasst

### Version 3.2.0 (Februar 2026)
- Security-Härtung nach ISO 27001/27002 Review

### Version 3.0.0 (2025)
- Komplette Code-überarbeitung
- Smart Neu-Einstellen Feature

## Credits

- **Original-Script**: [J05HI](https://github.com/J05HI) - [Original Gist](https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5)
- **Helper-Idee**: [panzli](https://github.com/panzli)
- **Erweiterte Version**: [OldRon1977](https://github.com/OldRon1977)

## Lizenz

MIT License - Siehe [LICENSE](LICENSE)

---

Dieses Script ist nicht offiziell mit Kleinanzeigen verbunden oder von ihnen unterstützt.
