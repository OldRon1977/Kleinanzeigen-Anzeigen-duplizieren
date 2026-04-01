# Kleinanzeigen - Anzeige duplizieren / Smart neu einstellen

Ein UserScript fuer Tampermonkey, das praktische Buttons zum Duplizieren und intelligenten Neu-Einstellen von Anzeigen auf kleinanzeigen.de hinzufuegt.

## Features

- **Duplizieren**: Erstellt eine Kopie der Anzeige, Original bleibt erhalten
- **Smart neu einstellen**: Loescht das Original und erstellt eine neue Anzeige
- **Automatische Bilderhaltung**: Alle Bilder bleiben bei beiden Funktionen erhalten
- **Helper-Script**: Buttons direkt auf der "Meine Anzeigen"-Seite
- **Fehlerbehandlung**: Timeout-Schutz und Retry-Mechanismen

## Installation

### Voraussetzungen
- Browser: Chrome, Firefox, Edge, Safari oder Opera
- [Tampermonkey](https://www.tampermonkey.net/) Browser-Extension

### Schritt 1: Hauptscript installieren (Pflicht)

[![Install Script](https://img.shields.io/badge/Install-Hauptscript-00aa00?style=for-the-badge&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)

Fuegt auf der **Bearbeiten-Seite** einer Anzeige die Buttons "Duplizieren" und "Smart neu einstellen" hinzu.

### Schritt 2: Helper-Script installieren (Empfohlen)

[![Install Helper](https://img.shields.io/badge/Install-Helper_Script-0077cc?style=for-the-badge&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js)

Fuegt auf der **Meine Anzeigen**-Seite neben jeder Anzeige die Buttons "Duplizieren" und "Neu einstellen" hinzu. Ein Klick oeffnet die Bearbeiten-Seite und fuehrt die Aktion automatisch aus.

> **Hinweis**: Beide Scripts muessen in Tampermonkey aktiviert sein, damit der Helper korrekt funktioniert.

### Auto-Updates
Beide Scripts erhalten automatisch Updates ueber Tampermonkey.

## Verwendung

### Direkt auf der Bearbeiten-Seite
1. Navigiere zu einer Anzeige und klicke "Bearbeiten"
2. Unten rechts erscheint eine Toolbar mit zwei Buttons
3. **Duplizieren**: Erstellt eine Kopie, Original bleibt bestehen
4. **Smart neu einstellen**: Loescht Original, erstellt neue Anzeige

### Ueber die Meine-Anzeigen-Seite (Helper)
1. Oeffne "Meine Anzeigen" auf kleinanzeigen.de
2. Neben jedem "Bearbeiten"-Link erscheinen zwei neue Buttons
3. Ein Klick oeffnet die Bearbeiten-Seite und fuehrt die Aktion automatisch aus

## Technische Details

### Berechtigungen
Beide Scripts verwenden `@grant none` - keine erweiterten Tampermonkey-Berechtigungen. Sie kommunizieren ausschliesslich mit kleinanzeigen.de ueber HTTPS.

### Unterstuetzte URLs
- `https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*` (Hauptscript)
- `https://www.kleinanzeigen.de/m-meine-anzeigen.html*` (Helper)

### API-Endpunkte
- **Loeschen**: `POST /m-anzeigen-loeschen.json?ids={adId}`
- **CSRF-Token**: `input[name="_csrf"]`

## Fehlerbehebung

### Buttons erscheinen nicht auf der Bearbeiten-Seite
- Warte 2-3 Sekunden nach dem Laden
- Pruefe ob das Hauptscript in Tampermonkey aktiviert ist
- Browser-Cache leeren (Strg+F5)

### Buttons erscheinen nicht auf Meine Anzeigen
- Pruefe ob das Helper-Script installiert und aktiviert ist
- Tampermonkey-Icon sollte eine "2" anzeigen (beide Scripts aktiv)

### Loeschung schlaegt fehl
- Session koennte abgelaufen sein - neu anmelden
- Rate-Limiting - kurz warten und erneut versuchen

## Changelog

### Version 3.3.8 / Helper 1.2.0 (April 2026)
- Helper: Duplizieren-Button hinzugefuegt
- Hauptscript: `#duplicate` Hash-Erkennung fuer Helper
- README komplett ueberarbeitet

### Version 3.3.7 (April 2026)
- CSRF-Token aus Hidden Input lesen (Kleinanzeigen-Umbau)

### Version 3.3.6 (April 2026)
- Korrekter Ad-ID Selektor `input[name="adId"]`

### Version 3.3.4-3.3.5 (April 2026)
- Floating-Toolbar statt DOM-Injection (React-kompatibel)
- `saveBtn.click()` statt `form.submit()`

### Version 3.3.0-3.3.3 (Maerz 2026)
- Helper-Script integriert
- Selektoren an neues Kleinanzeigen-Layout angepasst

### Version 3.2.0 (Februar 2026)
- Security-Haertung nach ISO 27001/27002 Review

### Version 3.0.0 (2025)
- Komplette Code-Ueberarbeitung
- Smart Neu-Einstellen Feature

## Credits

- **Original-Script**: [J05HI](https://github.com/J05HI) - [Original Gist](https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5)
- **Helper-Idee**: [panzli](https://github.com/panzli)
- **Erweiterte Version**: [OldRon1977](https://github.com/OldRon1977)

## Lizenz

MIT License - Siehe [LICENSE](LICENSE)

---

Dieses Script ist nicht offiziell mit Kleinanzeigen verbunden oder von ihnen unterstuetzt.