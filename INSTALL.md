# 🚀 Installation & Updates

## Schnelle Installation

### Option 1: Automatische Installation (Empfohlen)
Klick einfach auf diesen Link, um das Script direkt in Tampermonkey zu installieren:

[![Install Script](https://img.shields.io/badge/Install-Kleinanzeigen%20Duplizieren-00aa00?style=flat-square&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)

**Was passiert:**
1. Link wird geklickt
2. Tampermonkey öffnet automatisch ein Fenster
3. Du klickst "Installieren"
4. Script ist aktiviert ✅

### Option 2: Manuelle Installation
1. Gehe zu [Raw Script Datei](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)
2. Tampermonkey sollte automatisch erkannt werden
3. Klick "Installieren"

### Option 3: Copy-Paste
1. Öffne Tampermonkey → "+" (Neues Script)
2. Kopiere den Code aus der [Script-Datei](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)
3. Speichern & Fertig

---

## ✅ Automatische Updates

Das Script ist so konfiguriert, dass es **automatische Updates** erhält!

### Wie funktioniert Auto-Update?

```javascript
// @updateURL     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/...
// @downloadURL   https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/...
```

**Tampermonkey prüft automatisch:**
- ✅ Einmal pro Woche nach neuen Versionen
- ✅ Vergleicht Versionsnummern
- ✅ Installiert Updates automatisch
- ✅ Du wirst benachrichtigt

### Manuelles Update erzwingen
Falls du nicht warten möchtest:
1. Öffne Tampermonkey Dashboard
2. Suche "Kleinanzeigen Duplizieren"
3. Klick das Zahnrad ⚙️
4. Klick "Nach Updates suchen" 🔄
5. Klick "Jetzt installieren" wenn verfügbar

---

## 📋 Voraussetzungen

### Erforderlich
- ✅ Browser: Chrome, Firefox, Edge, Safari, Opera
- ✅ Tampermonkey oder ähnliche Extension
- ✅ eBay Kleinanzeigen Account

### Tampermonkey Installation

**Chrome/Edge/Opera:**
1. Öffne [Chrome Web Store](https://chrome.google.com/webstore)
2. Suche "Tampermonkey"
3. Klick "Zu Chrome hinzufügen"

**Firefox:**
1. Öffne [Firefox Add-ons](https://addons.mozilla.org)
2. Suche "Tampermonkey"
3. Klick "Zu Firefox hinzufügen"

**Safari:**
1. Öffne [App Store](https://apps.apple.com)
2. Suche "Tampermonkey"
3. Klick "Laden"

---

## 🔧 Verwendung

Nach der Installation:

1. Gehe zu [Kleinanzeigen Edit Page](https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html)
2. Zwei neue Buttons erscheinen:
   - **📋 Duplizieren** - Kopiert die Anzeige
   - **🔄 Smart neu einstellen** - Löscht Original & erstellt neue

3. Klick auf einen Button
4. Script lädt deine Daten
5. Fertig! ✅

---

## ❓ Häufige Fragen

### Q: Warum sehe ich die Buttons nicht?
**A:**
- Prüfe ob Tampermonkey installiert ist
- Prüfe ob Script aktiviert ist (Dashboard → Häkchen)
- Aktualisiere die Seite (F5)
- Prüfe Console auf Fehler (F12)

### Q: Funktionieren die Auto-Updates?
**A:**
- Ja! Tampermonkey prüft jede Woche
- Du kannst manuell in Tampermonkey prüfen
- Beim Update wird dir eine Benachrichtigung gezeigt

### Q: Kann ich das Script deaktivieren?
**A:**
- Ja, in Tampermonkey Dashboard
- Klick das Häkchen neben dem Script
- Script wird nicht mehr ausgeführt

### Q: Was passiert mit meinen Daten?
**A:**
- Keine Daten werden gespeichert
- Alles läuft lokal in deinem Browser
- Script nutzt nur die öffentliche eBay API
- Siehe [Privacy Policy](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren#datenschutz)

### Q: Funktioniert es auf allen Seiten?
**A:**
- Nur auf Kleinanzeigen Edit-Seite
- Siehe `@match` im Script Header
- Andere Seiten sind nicht betroffen

---

## 🐛 Problembehebung

### "Script wird nicht ausgeführt"
```
1. Öffne F12 (Developer Tools)
2. Gehe zur Console
3. Suche nach "[KA-Script]" Nachrichten
4. Schaue nach Error-Meldungen
5. Melde das Problem auf GitHub
```

### "Buttons erscheinen nicht"
```
1. Warte 2-3 Sekunden auf vollständiges Laden
2. Aktualisiere die Seite
3. Prüfe Tampermonkey ist aktiviert
4. Prüfe Console auf Fehler
```

### "Update funktioniert nicht"
```
1. Öffne Tampermonkey Dashboard
2. Klick ⚙️ auf dein Script
3. Klick "Nach Updates suchen"
4. Falls neue Version: "Jetzt installieren"
```

---

## 📝 Version History

| Version | Datum | Changes |
|---------|-------|---------|
| **3.1.0** | Nov 2025 | ✅ Auto-Update Support + Tests |
| 3.0.0 | Nov 2025 | ✅ Smart Republish Feature |
| 2.x | 2024 | ✅ Original Features |

---

## 🔗 Ressourcen

- **GitHub**: https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
- **Issues**: https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/issues
- **Tampermonkey Docs**: https://www.tampermonkey.net/documentation.php
- **Kleinanzeigen**: https://www.kleinanzeigen.de

---

## 📞 Support

Probleme?
1. Schaue [Issues auf GitHub](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/issues)
2. Erstelle ein neues Issue mit Details
3. Include console output (F12 → Console)

---

## ✅ Checkliste nach Installation

- [ ] Tampermonkey installiert
- [ ] Script installiert
- [ ] Auf Kleinanzeigen Edit-Seite
- [ ] Buttons sichtbar
- [ ] Console zeigt "[KA-Script] initialisiert"
- [ ] Bereit zum Duplizieren!

---

**Viel Erfolg beim Nutzen des Scripts!** 🚀
