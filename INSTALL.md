# ðŸš€ Installation & Updates

## Schnelle Installation

### Option 1: Automatische Installation (Empfohlen)
Klick einfach auf diesen Link, um das Script direkt in Tampermonkey zu installieren:

[![Install Script](https://img.shields.io/badge/Install-Kleinanzeigen%20Duplizieren-00aa00?style=flat-square&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)

**Was passiert:**
1. Link wird geklickt
2. Tampermonkey Ã¶ffnet automatisch ein Fenster
3. Du klickst "Installieren"
4. Script ist aktiviert âœ…

### Option 2: Manuelle Installation
1. Gehe zu [Raw Script Datei](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)
2. Tampermonkey sollte automatisch erkannt werden
3. Klick "Installieren"

### Option 3: Copy-Paste
1. Ã–ffne Tampermonkey â†’ "+" (Neues Script)
2. Kopiere den Code aus der [Script-Datei](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)
3. Speichern & Fertig

### Optional: Helper-Script für "Meine Anzeigen"

Das Helper-Script ermöglicht Smart Neu-Einstellen direkt aus der Anzeigenübersicht:

[![Install Helper](https://img.shields.io/badge/Install-Helper%20Script-0077cc?style=flat-square&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js)

Oder manuell: [Raw Helper Script](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js)

---

## âœ… Automatische Updates

Das Script ist so konfiguriert, dass es **automatische Updates** erhÃ¤lt!

### Wie funktioniert Auto-Update?

```javascript
// @updateURL     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/...
// @downloadURL   https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/...
```

**Tampermonkey prÃ¼ft automatisch:**
- âœ… Einmal pro Woche nach neuen Versionen
- âœ… Vergleicht Versionsnummern
- âœ… Installiert Updates automatisch
- âœ… Du wirst benachrichtigt

### Manuelles Update erzwingen
Falls du nicht warten mÃ¶chtest:
1. Ã–ffne Tampermonkey Dashboard
2. Suche "Kleinanzeigen Duplizieren"
3. Klick das Zahnrad âš™ï¸
4. Klick "Nach Updates suchen" ðŸ”„
5. Klick "Jetzt installieren" wenn verfÃ¼gbar

---

## ðŸ“‹ Voraussetzungen

### Erforderlich
- âœ… Browser: Chrome, Firefox, Edge, Safari, Opera
- âœ… Tampermonkey oder Ã¤hnliche Extension
- âœ… eBay Kleinanzeigen Account

### Tampermonkey Installation

**Chrome/Edge/Opera:**
1. Ã–ffne [Chrome Web Store](https://chrome.google.com/webstore)
2. Suche "Tampermonkey"
3. Klick "Zu Chrome hinzufÃ¼gen"

**Firefox:**
1. Ã–ffne [Firefox Add-ons](https://addons.mozilla.org)
2. Suche "Tampermonkey"
3. Klick "Zu Firefox hinzufÃ¼gen"

**Safari:**
1. Ã–ffne [App Store](https://apps.apple.com)
2. Suche "Tampermonkey"
3. Klick "Laden"

---

## ðŸ”§ Verwendung

Nach der Installation:

1. Gehe zu [Kleinanzeigen Edit Page](https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html)
2. Zwei neue Buttons erscheinen:
   - **ðŸ“‹ Duplizieren** - Kopiert die Anzeige
   - **ðŸ”„ Smart neu einstellen** - LÃ¶scht Original & erstellt neue

3. Klick auf einen Button
4. Script lÃ¤dt deine Daten
5. Fertig! âœ…

---

## â“ HÃ¤ufige Fragen

### Q: Warum sehe ich die Buttons nicht?
**A:**
- PrÃ¼fe ob Tampermonkey installiert ist
- PrÃ¼fe ob Script aktiviert ist (Dashboard â†’ HÃ¤kchen)
- Aktualisiere die Seite (F5)
- PrÃ¼fe Console auf Fehler (F12)

### Q: Funktionieren die Auto-Updates?
**A:**
- Ja! Tampermonkey prÃ¼ft jede Woche
- Du kannst manuell in Tampermonkey prÃ¼fen
- Beim Update wird dir eine Benachrichtigung gezeigt

### Q: Kann ich das Script deaktivieren?
**A:**
- Ja, in Tampermonkey Dashboard
- Klick das HÃ¤kchen neben dem Script
- Script wird nicht mehr ausgefÃ¼hrt

### Q: Was passiert mit meinen Daten?
**A:**
- Keine Daten werden gespeichert
- Alles lÃ¤uft lokal in deinem Browser
- Script nutzt nur die Ã¶ffentliche eBay API
- Siehe [Privacy Policy](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren#datenschutz)

### Q: Funktioniert es auf allen Seiten?
**A:**
- Nur auf Kleinanzeigen Edit-Seite
- Siehe `@match` im Script Header
- Andere Seiten sind nicht betroffen

---

## ðŸ› Problembehebung

### "Script wird nicht ausgefÃ¼hrt"
```
1. Ã–ffne F12 (Developer Tools)
2. Gehe zur Console
3. Suche nach "[KA-Script]" Nachrichten
4. Schaue nach Error-Meldungen
5. Melde das Problem auf GitHub
```

### "Buttons erscheinen nicht"
```
1. Warte 2-3 Sekunden auf vollstÃ¤ndiges Laden
2. Aktualisiere die Seite
3. PrÃ¼fe Tampermonkey ist aktiviert
4. PrÃ¼fe Console auf Fehler
```

### "Update funktioniert nicht"
```
1. Ã–ffne Tampermonkey Dashboard
2. Klick âš™ï¸ auf dein Script
3. Klick "Nach Updates suchen"
4. Falls neue Version: "Jetzt installieren"
```

---

## ðŸ“ Version History

| Version | Datum | Changes |
|---------|-------|---------|
| **3.1.0** | Nov 2025 | âœ… Auto-Update Support + Tests |
| 3.0.0 | Nov 2025 | âœ… Smart Republish Feature |
| 2.x | 2024 | âœ… Original Features |

---

## ðŸ”— Ressourcen

- **GitHub**: https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
- **Issues**: https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/issues
- **Tampermonkey Docs**: https://www.tampermonkey.net/documentation.php
- **Kleinanzeigen**: https://www.kleinanzeigen.de

---

## ðŸ“ž Support

Probleme?
1. Schaue [Issues auf GitHub](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/issues)
2. Erstelle ein neues Issue mit Details
3. Include console output (F12 â†’ Console)

---

## âœ… Checkliste nach Installation

- [ ] Tampermonkey installiert
- [ ] Script installiert
- [ ] Auf Kleinanzeigen Edit-Seite
- [ ] Buttons sichtbar
- [ ] Console zeigt "[KA-Script] initialisiert"
- [ ] Bereit zum Duplizieren!

---

**Viel Erfolg beim Nutzen des Scripts!** ðŸš€


