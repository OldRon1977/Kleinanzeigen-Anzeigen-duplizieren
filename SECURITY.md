# Security Policy

## Unterstuetzte Versionen

Unterstuetzt wird immer die aktuelle Version auf `main`. Beide Scripts
aktualisieren sich ueber `@updateURL`/`@downloadURL` selbst; eine Pflege
aelterer Staende findet nicht statt.

## Schwachstelle melden

Wenn du eine Sicherheitsluecke findest:

1. Erstelle ein [GitHub Issue](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/issues) mit dem Label "security".
2. Beschreibe das Problem und wie es reproduziert werden kann.
3. Bitte veroeffentliche keine Details, bevor ein Fix verfuegbar ist.

Antwort: so schnell es geht - das ist ein Hobby-Projekt, es kann also auch mal etwas dauern.

## Berechtigungen und Datenfluesse

Beide Userscripts kommunizieren ausschliesslich mit Kleinanzeigen ueber HTTPS:
`https://www.kleinanzeigen.de` fuer Formulare, JSON-Schnittstellen und die
Loeschung, dazu `https://img.kleinanzeigen.de` fuer die Anzeigenbilder des
Recovery-Snapshots (ohne Cookies, `credentials: 'omit'`).

| Script                              | `@grant`       | Begruendung                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kleinanzeigen-duplizieren.user.js` | `none`         | Reines DOM-Skript, keine erweiterten Tampermonkey-Berechtigungen noetig. Auf der Bearbeiten- und der Bestaetigungs-Seite arbeitet es mit dem Anzeigen-Formular. Auf allen uebrigen Seiten von `www.kleinanzeigen.de` haengt es ausschliesslich ein `<style>`-Element an (Werbeblocker, siehe README) und kehrt danach zurueck. |
| `helper.user.js`                    | `GM_openInTab` | Oeffnet Worker-Tabs im Batch-Modus und schliesst sie nach Erfolg. Laut Tampermonkey-Doku gehoert das Schliessen und Fokussieren von Tabs zu den Faehigkeiten, die im `@grant` stehen muessen; das Handle von `GM_openInTab` bietet `close()`. Als Rueckfallebene nutzt der Helper `window.open`.                               |

Genutzte Endpunkte:

- `POST /m-anzeigen-loeschen.json?ids={adId}` - Loeschung des Originals (Hauptscript)
- `GET /m-meine-anzeigen.html` - Nachladen des CSRF-Tokens, wenn keines im DOM steht (Hauptscript)
- `GET /m-meine-anzeigen-verwalten.json` - Anzeigenliste, hoechstens 20 Seiten (Helper)
- `GET /m-einstellungen-bearbeiten.json` - Anzeigenkontingent, Feld `newAdCount` (Helper)
- `GET https://img.kleinanzeigen.de/...` - Anzeigenbilder fuer den Snapshot (Hauptscript)

## Recovery-Snapshots in IndexedDB

In **beiden** Modi - im Batch und beim einzelnen "Smart neu einstellen" -
speichert das Hauptscript vor der Loeschung einen Recovery-Snapshot in
IndexedDB (`ka-batch.snapshots`, keyPath `adId`):

- Kuratierte Form-Felder (Titel, Beschreibung, Preis, Preistyp, Standort)
- Alle uebrigen benannten Formularwerte des Anzeigen-Formulars (`rawFields`, je Feld auf 5000 Zeichen gekuerzt). Ausgeschlossen sind Passwort-, Datei- und `type="hidden"`-Felder (inklusive des CSRF-Tokens `input[name="_csrf"]`), nicht angehakte Checkboxen und Radios sowie leere Werte. Eine Pruefung, ob ein Feld sichtbar ist, findet nicht statt - ein per CSS verstecktes Textfeld landet also im Snapshot.
- Anzeigen-Bilder als Blob in voller Aufloesung, geladen ohne Cookies (`credentials: 'omit'`)

Geht der Vorgang glatt durch, wird der Snapshot wieder verworfen: im manuellen
Modus vom Hauptscript auf der Bestaetigungs-Seite, im Batch vom Helper nach der
Verarbeitung. Bleibt der Ausgang unklar - etwa nach einem Timeout - oder ist
etwas schiefgegangen, bleibt der Snapshot liegen und ist ueber das Recovery-UI
des Helpers als ZIP exportierbar oder loeschbar.

Ein Verfallsdatum haben Snapshots nicht. Auf geteilten Geraeten empfiehlt sich
deshalb nach einem Batch ein Blick ins Recovery-UI und bei Bedarf "Alle
loeschen", um Anzeigen-Daten nicht laenger als noetig lokal vorzuhalten.

## Hinweis

Die Scripts laufen lokal im Browser. Es werden keine Daten an Dritte
uebertragen. CSRF-Token werden zur Laufzeit gelesen - bevorzugt aus dem DOM
(`meta[name="_csrf"]` oder `meta[name="csrf-token"]`, danach
`input[name="_csrf"]`), andernfalls aus der nachgeladenen Seite "Meine
Anzeigen". Gespeichert werden sie nie, auch nicht im Recovery-Snapshot.
