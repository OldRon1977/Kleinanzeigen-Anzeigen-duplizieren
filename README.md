# eBay Kleinanzeigen - Anzeige duplizieren / Smart neu einstellen

Ein UserScript fÃ¼r Tampermonkey, das zwei praktische Buttons zum Duplizieren und intelligenten Neu-Einstellen von Anzeigen auf eBay Kleinanzeigen/Kleinanzeigen.de hinzufÃ¼gt.

## âœ¨ Features

- **ðŸ“‹ Duplizieren**: Erstellt eine Kopie der Anzeige, Original bleibt erhalten
- **ðŸ”„ Smart neu einstellen**: LÃ¶scht das Original und erstellt eine neue Anzeige
- **ðŸ–¼ï¸ Automatische Bilderhaltung**: Alle Bilder bleiben bei beiden Funktionen erhalten
- **âš¡ Robust & Schnell**: Schlanker Code mit nur ~200 Zeilen
- **ðŸ›¡ï¸ Fehlerbehandlung**: Timeout-Schutz und Retry-Mechanismen

## ðŸ“¦ Installation

### âš¡ Schnelle Installation

[![Install Script](https://img.shields.io/badge/Install%20Script-Kleinanzeigen%20Duplizieren-00aa00?style=for-the-badge&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)

**Wie funktioniert es:**
1. Klick auf den Button oben
2. Tampermonkey Ã¶ffnet sich automatisch
3. Klick "Installieren"
4. Fertig! Script ist aktiv âœ…

> **Hinweis**: Tampermonkey muss vorher installiert sein. Siehe [Voraussetzungen](#voraussetzungen) unten.

### Voraussetzungen
- Browser: Chrome, Firefox, Edge, Safari oder Opera
- [Tampermonkey](https://www.tampermonkey.net/) Browser-Extension

**Tampermonkey installieren:**
- [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Firefox Add-ons](https://addons.mozilla.org/de/firefox/addon/tampermonkey/)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
- [Safari App Store](https://apps.apple.com/de/app/tampermonkey/id1482490089)

### Alternative Installationsmethoden
Siehe [**INSTALL.md**](INSTALL.md) fÃ¼r:
- Manuelle Installation
- Copy-Paste Installation
- Detaillierte Anleitung
- Automatische Updates

### âœ… Auto-Updates aktiviert
Das Script erhÃ¤lt **automatisch Updates**:
- Tampermonkey prÃ¼ft jede Woche nach neuen Versionen
- Updates werden automatisch installiert
- Du wirst benachrichtigt wenn eine neue Version verfÃ¼gbar ist
- Keine zusÃ¤tzliche Aktion erforderlich!

## ðŸŽ¯ Verwendung

1. **Anzeige bearbeiten**: Navigiere zu einer deiner Anzeigen und klicke auf "Bearbeiten"
   ```
   https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=XXXXX
   ```

2. **Neue Buttons nutzen**: Unter dem "Ã„nderungen speichern" Button erscheinen zwei neue Optionen:

   ### ðŸ“‹ Duplizieren
   - Erstellt eine exakte Kopie der Anzeige
   - Original bleibt unverÃ¤ndert bestehen
   - Alle Bilder und Daten werden Ã¼bernommen
   - Ideal fÃ¼r: Ã„hnliche Artikel, Varianten, Backup

   ### ðŸ”„ Smart neu einstellen  
   - LÃ¶scht die Original-Anzeige
   - Erstellt automatisch eine neue Anzeige mit allen Daten
   - Alle Bilder bleiben erhalten
   - Ideal fÃ¼r: Anzeige erneuern, nach oben bringen

## ðŸ–¼ï¸ Bilder-Handhabung

**Wichtig**: Alle Bilder bleiben automatisch erhalten!

Das Script nutzt die Tatsache, dass beim Bearbeiten einer Anzeige alle Bilder bereits im Formular geladen sind. Diese werden beim Submit automatisch mit Ã¼bertragen - egal ob die Original-ID vorhanden ist oder nicht.

## ðŸ”§ Technische Details

### Berechtigungen
Das Script verwendet `@grant none` â€“ es hat keine erweiterten Tampermonkey-Berechtigungen
und kann nur im Kontext der aktuellen Kleinanzeigen-Seite agieren. Es speichert keine Daten
und kommuniziert ausschlieÃŸlich mit kleinanzeigen.de Ã¼ber HTTPS.

### UnterstÃ¼tzte URLs
- `https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*`
- `https://kleinanzeigen.de/p-anzeige-bearbeiten.html*`
- `https://*.kleinanzeigen.de/p-anzeige-bearbeiten.html*`
- `https://www.ebay-kleinanzeigen.de/p-anzeige-bearbeiten.html*`

### API-Endpunkte
- **LÃ¶schen**: `POST /m-anzeigen-loeschen.json?ids={adId}`
- **CSRF-Token**: `meta[name="_csrf"]` oder `meta[name="csrf-token"]`

### Browser-KompatibilitÃ¤t
- âœ… Chrome/Chromium (v88+)
- âœ… Firefox (v78+)
- âœ… Edge (v88+)
- âœ… Safari (v14+)
- âœ… Opera (v74+)

## ðŸ› Fehlerbehebung

### Script lÃ¤dt nicht
1. PrÃ¼fe ob Tampermonkey aktiviert ist
2. Stelle sicher, dass du auf der Bearbeiten-Seite bist
3. Browser-Cache leeren (Strg+F5)
4. Console Ã¶ffnen (F12) und nach Fehlern suchen

### Buttons erscheinen nicht
- Warte 2-3 Sekunden nach Seitenladevorgang
- Das Script sucht automatisch nach dem Submit-Button und platziert die neuen Buttons darunter

### LÃ¶schung schlÃ¤gt fehl
- Session kÃ¶nnte abgelaufen sein â†’ Neu anmelden
- Rate-Limiting â†’ Kurz warten und erneut versuchen

## ðŸ“ Changelog

### Version 3.2.1 (MÃ¤rz 2026) â­ Aktuell
- ðŸ”§ Versions-Inkonsistenzen behoben (Fallback-Datei synchronisiert)
- ðŸ”§ Tippfehler im Dateinamen korrigiert ("Kleinazeigen" â†’ "Kleinanzeigen")
- ðŸ”§ Repository-URL in package.json korrigiert
- ðŸ”§ TestzÃ¤hlungen in Dokumentation korrigiert

### Version 3.2.0 (Februar 2026)
- ðŸ”’ Security-HÃ¤rtung nach ISO 27001/27002 Audit
- âœ… Input-Validierung fÃ¼r Anzeigen-IDs (Defense-in-Depth)
- âœ… Session-Timeout-Erkennung (401/403 â†’ hilfreiche Fehlermeldung)
- âœ… Button-Disabling nach Klick (verhindert Doppelklick)
- âœ… innerHTML durch createElement ersetzt (Code-Hygiene)
- ðŸ“„ SECURITY.md hinzugefÃ¼gt (Responsible Disclosure)
- ðŸ“„ .gitignore erstellt (Repository-Hygiene)
- ðŸ“š Permissions-Dokumentation im README

### Version 3.1.0 (November 2025)
- âœ¨ Auto-Update Support aktiviert
- ðŸ§ª 54 Unit & Integration Tests (100% bestanden)
- ðŸ“š Umfangreiche Dokumentation
- ðŸ”§ Exponential Backoff fÃ¼r Retries
- ðŸ“ Logger System fÃ¼r Debugging
- ðŸŽ¨ CSS Klassen mit Hover-Effekten
- ðŸ›¡ï¸ Verbesserte Error-Handling
- ðŸ“Š Code Quality Score: 8.9/10

### Version 3.0.0 (2025)
- Komplette Code-Ãœberarbeitung
- Von 600 auf ~362 Zeilen optimiert
- Smart Neu-Einstellen Feature
- Retry-Limit mit Max-Versuchen
- CSRF-Token Validation
- User-Warnung bei LÃ¶sch-Fehler

### Version 2.x (2024)
- Erweiterte Bildanalyse (spÃ¤ter als unnÃ¶tig erkannt)
- Komplexe Manager-Strukturen

### Version 1.x (2024)
- Initiale FunktionalitÃ¤t
- Basis-Duplizierung

## ðŸ‘¥ Credits & Lizenz

### Credits
- **Original-Script**: [J05HI](https://github.com/J05HI) - [Original Gist](https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5)
  - Entwickelte die grundlegende Duplikations-FunktionalitÃ¤t
  - API-Integration und CSRF-Token Handling
  
- **Erweiterte Version**: [OldRon1977](https://github.com/OldRon1977)
  - Smart Neu-Einstellen Feature
  - Verbesserte Fehlerbehandlung
  - Code-Optimierungen

### Lizenz
MIT License - Siehe [LICENSE](LICENSE) fÃ¼r Details

## ðŸ¤ Contributing

Contributions sind willkommen! 

1. Fork das Repository
2. Erstelle einen Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Committe deine Ã„nderungen (`git commit -m 'Add some AmazingFeature'`)
4. Push zum Branch (`git push origin feature/AmazingFeature`)
5. Ã–ffne einen Pull Request

## âš ï¸ Haftungsausschluss

Dieses Script wird "as is" zur VerfÃ¼gung gestellt. Die Nutzung erfolgt auf eigene Gefahr. Die Autoren Ã¼bernehmen keine Haftung fÃ¼r eventuelle SchÃ¤den oder VerstÃ¶ÃŸe gegen die Nutzungsbedingungen von eBay Kleinanzeigen.

## ðŸ“ž Support

Bei Problemen oder Fragen:
- [Issue erstellen](https://github.com/OldRon1977/Kleinanzeigen---Duplizieren-Smart-neu-einstellen/issues)
- [Discussions](https://github.com/OldRon1977/Kleinanzeigen---Duplizieren-Smart-neu-einstellen/discussions)

---

**Hinweis**: Dieses Script ist nicht offiziell mit eBay Kleinanzeigen verbunden oder von ihnen unterstÃ¼tzt.

