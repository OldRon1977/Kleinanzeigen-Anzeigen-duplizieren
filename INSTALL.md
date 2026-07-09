# Installation

Kurzanleitung zur Installation der beiden Userscripts. Für Verwendung,
Changelog und Fehlerbehebung siehe [README.md](README.md), für
Berechtigungen und lokale Datenspeicherung siehe [SECURITY.md](SECURITY.md).

## Voraussetzungen

- Browser: Chrome, Firefox, Edge, Safari oder Opera
- [Tampermonkey](https://www.tampermonkey.net/) Browser-Extension installiert und aktiviert
- Ein eBay-Kleinanzeigen-Account

## Schritt 1: Hauptscript installieren (Pflicht)

[Hauptscript installieren](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)

Der Link öffnet Tampermonkeys Installationsansicht. Klick auf
"Installieren". Das Script fügt auf der Bearbeiten-Seite einer Anzeige die
Buttons "Duplizieren" und "Smart neu einstellen" hinzu.

## Schritt 2: Helper-Script installieren (empfohlen)

[Helper-Script installieren](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js)

Fügt auf der "Meine Anzeigen"-Seite den Button "Smart neu einstellen"
direkt neben jeder Anzeige hinzu, inklusive Batch-Modus.

## Manuelle Installation (Alternative)

Falls ein Installations-Link nicht automatisch erkannt wird:

1. Öffne Tampermonkey → Dashboard → "+" (Neues Script)
2. Kopiere den Inhalt der jeweiligen Raw-Datei
   ([Hauptscript](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js),
   [Helper](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js))
   in den Editor
3. Speichern (Strg+S)

## Auto-Updates

Beide Scripts enthalten `@updateURL` und `@downloadURL` im Header.
Tampermonkey prüft dadurch automatisch regelmäßig auf neue Versionen und
installiert sie. Manuell erzwingen: Tampermonkey-Dashboard → Zahnrad-Symbol
beim Script → "Nach Updates suchen".

## Nach der Installation

- Verwendung, Features und Fehlerbehebung: siehe [README.md](README.md)
- Berechtigungen (`@grant`), Datenflüsse und die lokal im Browser
  gespeicherten Recovery-Snapshots (IndexedDB, Batch-Modus): siehe
  [SECURITY.md](SECURITY.md)
