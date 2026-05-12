# Kleinanzeigen - Anzeige duplizieren / Smart neu einstellen

Ein UserScript für Tampermonkey, das praktische Buttons zum Duplizieren und intelligenten Neu-Einstellen von Anzeigen auf kleinanzeigen.de hinzufügt.

## Features

- **Duplizieren**: Erstellt eine Kopie der Anzeige, Original bleibt erhalten
- **Smart neu einstellen**: Löscht das Original und erstellt eine neue Anzeige
- **Automatische Bilderhaltung**: Alle Bilder bleiben bei beiden Funktionen erhalten
- **Banner & Popup-Blocker**: Blendet störende Upsell-Banner und Popups automatisch aus
- **Helper-Script**: Buttons direkt auf der "Meine Anzeigen"-Seite
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

Fügt auf der **Meine Anzeigen**-Seite neben jeder Anzeige den Button "Smart neu einstellen" hinzu. Ein Klick öffnet die Bearbeiten-Seite und führt die Aktion automatisch aus.

> **Hinweis**: Beide Scripts müssen in Tampermonkey aktiviert sein, damit der Helper korrekt funktioniert.

### Auto-Updates
Beide Scripts erhalten automatisch Updates über Tampermonkey.

## Verwendung

### Direkt auf der Bearbeiten-Seite
1. Navigiere zu einer Anzeige und klicke "Bearbeiten"
2. Unten rechts erscheint eine Toolbar mit zwei Buttons
3. **Duplizieren**: Erstellt eine Kopie, Original bleibt bestehen
4. **Smart neu einstellen**: Löscht Original, erstellt neue Anzeige

### über die Meine-Anzeigen-Seite (Helper)
1. Öffne "Meine Anzeigen" auf kleinanzeigen.de
2. Neben jedem "Bearbeiten"-Link erscheint der Button "Smart neu einstellen"
3. Ein Klick öffnet die Bearbeiten-Seite und führt die Aktion automatisch aus

### Banner & Popup-Blocker (ab v3.4.0)
Das Script blendet automatisch aus:
- **Kostenpflichtige Feature-Optionen** (Highlight, Galerie, Bumpup) auf der Bearbeiten-Seite
- **Info-Banner** ("Das Bearbeiten deiner Anzeige schiebt sie nicht wieder hoch")
- **Upsell-Popups** ("Ohne Hochschieben weiter", "Ohne Highlight weiter") nach dem Speichern

Kein manuelles Wegklicken mehr nötig.

## Technische Details

### Berechtigungen
Beide Scripts verwenden `@grant none` - keine erweiterten Tampermonkey-Berechtigungen. Sie kommunizieren ausschließlich mit kleinanzeigen.de über HTTPS.

### Unterstützte URLs
- `https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*` (Hauptscript)
- `https://www.kleinanzeigen.de/m-meine-anzeigen.html*` (Helper)

### API-Endpunkte
- **Löschen**: `POST /m-anzeigen-Löschen.json?ids={adId}`
- **CSRF-Token**: `input[name="_csrf"]`

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

## Changelog

### Version 3.5.0 / Helper 1.3.0 (Mai 2026)
- **Neu**: Batch-Modus auf "Meine Anzeigen". Ein Button stellt alle Anzeigen, die älter als 7 Tage sind, nacheinander mit 7 ± 2 Minuten Pause neu ein.
- **Neu**: Kleines Overlay zeigt Trefferliste, Start-/Abbrechen-Buttons, Fortschritt und Stop-Button.
- Tab-übergreifende Kommunikation über `localStorage` (kein zusätzliches `@grant`).
- Helper 1.3.0 bringt den Orchestrator. Hauptscript 3.5.0 ergänzt einen Result-Hook in `smartRepublish`.
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
