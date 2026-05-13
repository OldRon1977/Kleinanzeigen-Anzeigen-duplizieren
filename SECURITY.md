# Security Policy

## Unterstuetzte Versionen

| Version       | Unterstuetzt |
|---------------|--------------|
| 3.5.x / 1.3.x | Ja           |
| < 3.5         | Nein         |

## Schwachstelle melden

Wenn du eine Sicherheitsluecke findest:

1. Erstelle ein [GitHub Issue](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/issues) mit dem Label "security".
2. Beschreibe das Problem und wie es reproduziert werden kann.
3. Bitte veroeffentliche keine Details, bevor ein Fix verfuegbar ist.

Antwortzeit: innerhalb von 7 Tagen.

## Berechtigungen und Datenfluesse

Beide Userscripts kommunizieren ausschliesslich mit `https://www.kleinanzeigen.de` ueber HTTPS.

| Script | `@grant` | Begruendung |
|---|---|---|
| `kleinanzeigen-duplizieren.user.js` | `none` | Reines DOM-Skript auf Bearbeiten- und Bestaetigungs-Seite. Keine erweiterten Tampermonkey-Berechtigungen noetig. |
| `helper.user.js` | `GM_openInTab` | Oeffnet Worker-Tabs im Batch-Modus und schliesst sie nach Erfolg. Ohne diese Berechtigung kann ein Userscript navigierte Tabs nicht zuverlaessig schliessen. |

## Recovery-Snapshots in IndexedDB

Im Batch-Modus speichert das Hauptscript vor jeder Loeschung einen Recovery-Snapshot in IndexedDB (`ka-batch.snapshots`):

- Form-Felder (Titel, Beschreibung, Preis, Standort)
- Anzeigen-Bilder als Blob (gefetcht mit `credentials: 'include'`)

Bei erfolgreicher Neu-Anzeige werden Snapshots automatisch verworfen. Bei Datenverlust bleiben sie persistent und sind ueber das Recovery-UI als ZIP exportierbar oder loeschbar.

Auf geteilten Geraeten empfiehlt sich nach erfolgreichem Batch ein manuelles "Alle loeschen" im Recovery-UI, um Anzeigen-Daten nicht laenger als noetig lokal vorzuhalten.

## Hinweis

Die Scripts laufen lokal im Browser. Es werden keine Daten an Dritte uebertragen. CSRF-Token werden zur Laufzeit aus dem DOM (`input[name="_csrf"]` oder `meta[name="_csrf"]`) gelesen, nicht persistiert.