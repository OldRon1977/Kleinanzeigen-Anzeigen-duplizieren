# eBay Kleinanzeigen - Anzeige duplizieren / Smart neu einstellen

Ein UserScript für Tampermonkey, das zwei praktische Buttons zum Duplizieren und intelligenten Neu-Einstellen von Anzeigen auf eBay Kleinanzeigen/Kleinanzeigen.de hinzufügt.

## ✨ Features

- **📋 Duplizieren**: Erstellt eine Kopie der Anzeige, Original bleibt erhalten
- **🔄 Smart neu einstellen**: Löscht das Original und erstellt eine neue Anzeige
- **🖼️ Automatische Bilderhaltung**: Alle Bilder bleiben bei beiden Funktionen erhalten
- **⚡ Robust & Schnell**: Schlanker Code mit nur ~200 Zeilen
- **🛡️ Fehlerbehandlung**: Timeout-Schutz und Retry-Mechanismen

## 📦 Installation

### ⚡ Schnelle Installation

[![Install Script](https://img.shields.io/badge/Install%20Script-Kleinanzeigen%20Duplizieren-00aa00?style=for-the-badge&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/Kleinazeigen%20duplizieren%20oder%20smart%20neu%20einstellen.js)

**Wie funktioniert es:**
1. Klick auf den Button oben
2. Tampermonkey öffnet sich automatisch
3. Klick "Installieren"
4. Fertig! Script ist aktiv ✅

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
Siehe [**INSTALL.md**](INSTALL.md) für:
- Manuelle Installation
- Copy-Paste Installation
- Detaillierte Anleitung
- Automatische Updates

### ✅ Auto-Updates aktiviert
Das Script erhält **automatisch Updates**:
- Tampermonkey prüft jede Woche nach neuen Versionen
- Updates werden automatisch installiert
- Du wirst benachrichtigt wenn eine neue Version verfügbar ist
- Keine zusätzliche Aktion erforderlich!

## 🎯 Verwendung

1. **Anzeige bearbeiten**: Navigiere zu einer deiner Anzeigen und klicke auf "Bearbeiten"
   ```
   https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=XXXXX
   ```

2. **Neue Buttons nutzen**: Unter dem "Änderungen speichern" Button erscheinen zwei neue Optionen:

   ### 📋 Duplizieren
   - Erstellt eine exakte Kopie der Anzeige
   - Original bleibt unverändert bestehen
   - Alle Bilder und Daten werden übernommen
   - Ideal für: Ähnliche Artikel, Varianten, Backup

   ### 🔄 Smart neu einstellen  
   - Löscht die Original-Anzeige
   - Erstellt automatisch eine neue Anzeige mit allen Daten
   - Alle Bilder bleiben erhalten
   - Ideal für: Anzeige erneuern, nach oben bringen

## 🖼️ Bilder-Handhabung

**Wichtig**: Alle Bilder bleiben automatisch erhalten!

Das Script nutzt die Tatsache, dass beim Bearbeiten einer Anzeige alle Bilder bereits im Formular geladen sind. Diese werden beim Submit automatisch mit übertragen - egal ob die Original-ID vorhanden ist oder nicht.

## 🔧 Technische Details

### Unterstützte URLs
- `https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*`
- `https://kleinanzeigen.de/p-anzeige-bearbeiten.html*`
- `https://*.kleinanzeigen.de/p-anzeige-bearbeiten.html*`
- `https://www.ebay-kleinanzeigen.de/p-anzeige-bearbeiten.html*`

### API-Endpunkte
- **Löschen**: `POST /m-anzeigen-loeschen.json?ids={adId}`
- **CSRF-Token**: `meta[name="_csrf"]` oder `meta[name="csrf-token"]`

### Browser-Kompatibilität
- ✅ Chrome/Chromium (v88+)
- ✅ Firefox (v78+)
- ✅ Edge (v88+)
- ✅ Safari (v14+)
- ✅ Opera (v74+)

## 🐛 Fehlerbehebung

### Script lädt nicht
1. Prüfe ob Tampermonkey aktiviert ist
2. Stelle sicher, dass du auf der Bearbeiten-Seite bist
3. Browser-Cache leeren (Strg+F5)
4. Console öffnen (F12) und nach Fehlern suchen

### Buttons erscheinen nicht
- Warte 2-3 Sekunden nach Seitenladevorgang
- Das Script sucht automatisch nach dem Submit-Button und platziert die neuen Buttons darunter

### Löschung schlägt fehl
- Session könnte abgelaufen sein → Neu anmelden
- Rate-Limiting → Kurz warten und erneut versuchen

## 📝 Changelog

### Version 3.1.0 (November 2025) ⭐ Aktuell
- ✨ Auto-Update Support aktiviert
- 🧪 54 Unit & Integration Tests (100% bestanden)
- 📚 Umfangreiche Dokumentation
- 🔧 Exponential Backoff für Retries
- 📝 Logger System für Debugging
- 🎨 CSS Klassen mit Hover-Effekten
- 🛡️ Verbesserte Error-Handling
- 📊 Code Quality Score: 8.9/10

### Version 3.0.0 (2025)
- Komplette Code-Überarbeitung
- Von 600 auf ~362 Zeilen optimiert
- Smart Neu-Einstellen Feature
- Retry-Limit mit Max-Versuchen
- CSRF-Token Validation
- User-Warnung bei Lösch-Fehler

### Version 2.x (2024)
- Erweiterte Bildanalyse (später als unnötig erkannt)
- Komplexe Manager-Strukturen

### Version 1.x (2024)
- Initiale Funktionalität
- Basis-Duplizierung

## 👥 Credits & Lizenz

### Credits
- **Original-Script**: [J05HI](https://github.com/J05HI) - [Original Gist](https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5)
  - Entwickelte die grundlegende Duplikations-Funktionalität
  - API-Integration und CSRF-Token Handling
  
- **Erweiterte Version**: [OldRon1977](https://github.com/OldRon1977)
  - Smart Neu-Einstellen Feature
  - Verbesserte Fehlerbehandlung
  - Code-Optimierungen

### Lizenz
MIT License - Siehe [LICENSE](LICENSE) für Details

## 🤝 Contributing

Contributions sind willkommen! 

1. Fork das Repository
2. Erstelle einen Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Committe deine Änderungen (`git commit -m 'Add some AmazingFeature'`)
4. Push zum Branch (`git push origin feature/AmazingFeature`)
5. Öffne einen Pull Request

## ⚠️ Haftungsausschluss

Dieses Script wird "as is" zur Verfügung gestellt. Die Nutzung erfolgt auf eigene Gefahr. Die Autoren übernehmen keine Haftung für eventuelle Schäden oder Verstöße gegen die Nutzungsbedingungen von eBay Kleinanzeigen.

## 📞 Support

Bei Problemen oder Fragen:
- [Issue erstellen](https://github.com/OldRon1977/Kleinanzeigen---Duplizieren-Smart-neu-einstellen/issues)
- [Discussions](https://github.com/OldRon1977/Kleinanzeigen---Duplizieren-Smart-neu-einstellen/discussions)

---

**Hinweis**: Dieses Script ist nicht offiziell mit eBay Kleinanzeigen verbunden oder von ihnen unterstützt.