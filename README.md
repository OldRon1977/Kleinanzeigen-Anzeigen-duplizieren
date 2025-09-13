# 🔄 eBay Kleinanzeigen - Smart Anzeige Duplizieren

> **UserScript für intelligentes Duplizieren und Neu-Einstellen von Kleinanzeigen mit automatischem Bilder-Schutz**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg)](https://github.com/OldRon1977/Kleinanzeigen---Duplizieren-Smart-neu-einstellen)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Compatible-green.svg)](https://tampermonkey.net/)

## 🎯 Überblick

Dieses UserScript erweitert die Bearbeiten-Seite von eBay Kleinanzeigen um zwei intelligente Buttons:

- **📋 Anzeige duplizieren**: Erstellt eine sichere Kopie (Original bleibt bestehen)
- **🔄 Smart neu einstellen**: Intelligente Neuerstellung mit automatischem Bilder-Schutz

### 🚨 **Problem gelöst**: 
Das häufige Problem, dass Bilder beim Neu-Einstellen von Anzeigen verloren gehen, wird durch **automatische Bildanalyse** und **intelligente Benutzerführung** verhindert.

## ✨ Features

### 🛡️ **Automatischer Bilder-Schutz**
- Erkennt automatisch gefährdete Bilder (kleinanzeigen.de-hosted)
- Warnt vor potenziellem Bildverlust
- Bietet sichere Alternativen an

### 🧠 **Intelligente Analyse**
- **Keine problematischen Bilder** → Automatische sichere Neuerstellung
- **Gefährdete Bilder gefunden** → Warndialog mit Optionen
- **Externe Bilder** → Bleiben automatisch erhalten

### 💪 **Robuste Technik**
- Retry-Mechanismus bei API-Fehlern
- Mehrfach-Selektoren für maximale Kompatibilität
- Umfangreiche Fehlerbehandlung
- Debug-Modus für Entwickler

### 🎨 **Benutzerfreundlich**
- Moderne, responsive UI
- Klare Benachrichtigungen
- Tastatur-Shortcuts (ESC zum Abbrechen)
- Loading-Spinner mit Feedback

## 🚀 Installation

### Voraussetzungen
- **Browser**: Chrome, Firefox, Edge, Safari, Opera
- **UserScript Manager**: [Tampermonkey](https://tampermonkey.net/) (empfohlen) oder Violentmonkey

### Schritt-für-Schritt Installation

1. **UserScript Manager installieren**
   ```
   🔗 https://tampermonkey.net/
   ```

2. **Script installieren**
   - [📥 **Direkt installieren**](https://raw.githubusercontent.com/OldRon1977/Kleinanzeigen---Duplizieren-Smart-neu-einstellen/main/Kleinazeigen%20duplizieren%20oder%20smart%20neu%20einstellen.js)
   - Oder: Script-Code kopieren und manuell in Tampermonkey einfügen

3. **Aktivierung überprüfen**
   - Tampermonkey-Icon klicken
   - Script sollte "Enabled" sein

## 📖 Verwendung

### 1. Zur Anzeige-Bearbeitung navigieren
```
https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=XXXXX
```

### 2. Neue Buttons verwenden

#### **📋 Duplizieren** (Immer sicher)
- Erstellt sofortige Kopie der Anzeige
- Original bleibt unverändert bestehen
- Alle Daten werden übernommen

#### **🔄 Smart neu einstellen** (Intelligent)
- **Ohne problematische Bilder**: Läuft automatisch durch
- **Mit gefährdeten Bildern**: Zeigt Warndialog mit Optionen:
  - 🛡️ **Sicher duplizieren**: Original behalten
  - 🗑️ **Trotzdem löschen**: Bewusster Bildverlust
  - ❌ **Abbrechen**: Keine Aktion

### 3. Warndialog-Optionen verstehen

| Option | Original | Bilder | Verwendung |
|--------|----------|---------|------------|
| 🛡️ Sicher duplizieren | ✅ Bleibt | ✅ Bleiben | Du willst beide Anzeigen |
| 🗑️ Trotzdem löschen | ❌ Gelöscht | ❌ Verloren | Du akzeptierst Bildverlust |
| ❌ Abbrechen | ✅ Bleibt | ✅ Bleiben | Du willst nichts ändern |

## 📸 Screenshots

### Buttons auf der Bearbeiten-Seite
```
[Anzeige bearbeiten Seite]
┌─────────────────────────────────┐
│  [Änderungen speichern]         │
│  [📋 Duplizieren]               │  
│  [🔄 Smart neu einstellen]      │
└─────────────────────────────────┘
```

### Intelligenter Warndialog
```
⚠️ Bilder-Warnung

Diese Anzeige enthält 3 Bild(er), die beim Löschen 
der Originalanzeige unwiderruflich verloren gehen.

Ihre Optionen:
🛡️ Sicher duplizieren: Original bleibt erhalten
🗑️ Trotzdem löschen: Original und Bilder werden gelöscht  
❌ Abbrechen: Keine Aktion durchführen

[🛡️ Sicher duplizieren] [🗑️ Trotzdem löschen] [❌ Abbrechen]
```

## 🔧 Technische Details

### Unterstützte URLs
```javascript
// Hauptseite
https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*
https://kleinanzeigen.de/p-anzeige-bearbeiten.html*

// Legacy URLs  
https://www.ebay-kleinanzeigen.de/p-anzeige-bearbeiten.html*
https://ebay-kleinanzeigen.de/p-anzeige-bearbeiten.html*
```

### Bildanalyse-Algorithmus
```javascript
// Gefährdete Bilder (gehen bei Löschung verloren)
src.includes('kleinanzeigen.de') || src.includes('ebay-kleinanzeigen.de')

// Sichere Bilder (externe Hosts)
imgur.com, postimg.cc, etc.
```

### API-Endpunkte
- **Löschen**: `POST /m-anzeigen-loeschen.json?ids={adId}`
- **CSRF-Token**: `meta[name="_csrf"]`
- **Form-Submit**: Standard HTML Form

## 🐛 Troubleshooting

### Script lädt nicht
```javascript
// 1. Console öffnen (F12 → Console)
// 2. Nach diesen Logs suchen:
[Kleinanzeigen-Script] Script geladen, URL: ...
[Kleinanzeigen-Script] ✅ Duplikations-Buttons geladen!
```

**Mögliche Lösungen:**
- ✅ Tampermonkey installiert und aktiviert?
- ✅ Script im Dashboard als "Enabled" markiert?
- ✅ Auf korrekter URL (`/p-anzeige-bearbeiten.html`)?
- ✅ Browser-Cache geleert?

### Buttons nicht sichtbar
```javascript
// Debug-Informationen in Console prüfen:
[Kleinanzeigen-Script] Element gefunden mit Selector: #pstad-submit
[Kleinanzeigen-Script] Buttons erfolgreich eingefügt
```

**Lösungsschritte:**
1. Seite neu laden (Strg + F5)
2. 3 Sekunden warten (Fallback-Timer)
3. Script neu installieren

### API-Fehler beim Löschen
```javascript
// Retry-Mechanismus läuft automatisch
[Kleinanzeigen-Script] Fehler beim Löschen der Anzeige (Versuch 1): HTTP 403
[Kleinanzeigen-Script] Fehler beim Löschen der Anzeige (Versuch 2): HTTP 403  
[Kleinanzeigen-Script] Fehler beim Löschen der Anzeige (Versuch 3): HTTP 403
```

**Mögliche Ursachen:**
- Session abgelaufen → Neu anmelden
- CSRF-Token ungültig → Seite neu laden
- Rate-Limiting → Kurz warten

## 🛠️ Development

### Lokale Entwicklung
```bash
# Repository klonen
git clone https://github.com/OldRon1977/Kleinanzeigen---Duplizieren-Smart-neu-einstellen.git

# In Tampermonkey als lokale Datei laden
file:///path/to/script.user.js
```

### Debug-Modus aktivieren
```javascript
const DEBUG = true; // In Zeile 17 ändern
```

### Build & Release
```bash
# Version in Header aktualisieren
# @version       1.1.0

# GitHub Release erstellen
```

## 🤝 Contributing

Contributions sind willkommen! Bitte beachte:

1. **Issues erstellen** für Bug Reports oder Feature Requests
2. **Pull Requests** mit klarer Beschreibung
3. **Code-Style** beibehalten (ESLint-kompatibel)
4. **Tests** für neue Features hinzufügen

### Entwickler-Guidelines
- Verwende `log()` für Debug-Ausgaben
- Alle UI-Elemente mit `userscript-` prefixen
- Error-Handling ist Pflicht
- Kommentiere komplexe Logik

## 📝 Changelog

### Version 1.0.0 (Latest)
- ✅ **Neu**: Intelligente Bildanalyse mit Warndialog
- ✅ **Neu**: Smart neu einstellen Funktion
- ✅ **Fix**: Robuste Element-Suche mit Fallback-Selektoren
- ✅ **Fix**: Retry-Mechanismus bei API-Fehlern
- ✅ **Verbesserung**: Moderne UI mit Benachrichtigungen

## 📄 Lizenz

```
MIT License

Copyright (c) 2025 OldRon1977

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

⭐ **Hat dir das Script geholfen?** Gib dem Repo einen Stern!  
🐛 **Bug gefunden?** [Issue erstellen](https://github.com/OldRon1977/Kleinanzeigen---Duplizieren-Smart-neu-einstellen/issues)  
💡 **Feature-Idee?** [Discussion starten](https://github.com/OldRon1977/Kleinanzeigen---Duplizieren-Smart-neu-einstellen/discussions)

---

**Made with ❤️ for the eBay Kleinanzeigen Community**