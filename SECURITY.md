# Security Policy

## Unterstützte Versionen

Unterstützt wird immer die aktuelle Version auf `main`. Beide Scripts
aktualisieren sich über `@updateURL`/`@downloadURL` selbst; eine Pflege älterer
Stände findet nicht statt.

## Schwachstelle melden

Wenn du eine Sicherheitslücke findest:

1. Erstelle ein [GitHub Issue](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/issues) mit dem Label "security".
2. Beschreibe das Problem und wie es reproduziert werden kann.
3. Bitte veröffentliche keine Details, bevor ein Fix verfügbar ist.

Antwort: so schnell es geht – das ist ein Hobby-Projekt, es kann also auch mal etwas dauern.

## Berechtigungen und Datenflüsse

Beide Userscripts kommunizieren ausschließlich mit Kleinanzeigen über HTTPS:
`https://www.kleinanzeigen.de` für Formulare, JSON-Schnittstellen und die
Löschung, dazu `https://img.kleinanzeigen.de` für die Anzeigenbilder des
Recovery-Snapshots (ohne Cookies, `credentials: 'omit'`).

| Script                              | `@grant`       | Begründung                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kleinanzeigen-duplizieren.user.js` | `none`         | Reines DOM-Skript, keine erweiterten Tampermonkey-Berechtigungen nötig. Auf der Bearbeiten- und der Bestätigungs-Seite arbeitet es mit dem Anzeigen-Formular. Auf allen übrigen Seiten von `www.kleinanzeigen.de` hängt es ausschließlich ein `<style>`-Element an (Werbeblocker, siehe README) und kehrt danach zurück. |
| `helper.user.js`                    | `GM_openInTab` | Öffnet Worker-Tabs im Batch-Modus und schließt sie nach Erfolg. Laut Tampermonkey-Doku gehört das Schließen und Fokussieren von Tabs zu den Fähigkeiten, die im `@grant` stehen müssen; das Handle von `GM_openInTab` bietet `close()`. Als Rückfallebene nutzt der Helper `window.open`.                                |

Genutzte Endpunkte:

- `POST /m-anzeigen-loeschen.json?ids={adId}` – Löschung des Originals (Hauptscript)
- `GET /m-meine-anzeigen.html` – Nachladen des CSRF-Tokens, wenn keines im DOM steht (Hauptscript)
- `GET /m-meine-anzeigen-verwalten.json` – Anzeigenliste, höchstens 20 Seiten (Helper)
- `GET /m-einstellungen-bearbeiten.json` – Anzeigenkontingent, Feld `newAdCount` (Helper)
- `GET https://img.kleinanzeigen.de/...` – Anzeigenbilder für den Snapshot (Hauptscript)

## Recovery-Snapshots in IndexedDB

In **beiden** Modi – im Batch und beim einzelnen "Smart neu einstellen" –
speichert das Hauptscript vor der Löschung einen Recovery-Snapshot in
IndexedDB (`ka-batch.snapshots`, keyPath `adId`):

- Kuratierte Form-Felder (Titel, Beschreibung, Preis, Preistyp, Standort)
- Alle übrigen benannten Formularwerte des Anzeigen-Formulars (`rawFields`, je Feld auf 5000 Zeichen gekürzt). Ausgeschlossen sind Passwort-, Datei- und `type="hidden"`-Felder (inklusive des CSRF-Tokens `input[name="_csrf"]`), nicht angehakte Checkboxen und Radios sowie leere Werte. Eine Prüfung, ob ein Feld sichtbar ist, findet nicht statt – ein per CSS verstecktes Textfeld landet also im Snapshot.
- Anzeigen-Bilder als Blob in voller Auflösung, geladen ohne Cookies (`credentials: 'omit'`)

Geht der Vorgang glatt durch, wird der Snapshot wieder verworfen: im manuellen
Modus vom Hauptscript auf der Bestätigungs-Seite, im Batch vom Helper nach der
Verarbeitung. Bleibt der Ausgang unklar – etwa nach einem Timeout – oder ist
etwas schiefgegangen, bleibt der Snapshot liegen und ist über das Recovery-UI
des Helpers als ZIP exportierbar oder löschbar.

Ein Verfallsdatum haben Snapshots nicht. Auf geteilten Geräten empfiehlt sich
deshalb nach einem Batch ein Blick ins Recovery-UI und bei Bedarf "Alle
löschen", um Anzeigen-Daten nicht länger als nötig lokal vorzuhalten.

## Hinweis

Die Scripts laufen lokal im Browser. Es werden keine Daten an Dritte übertragen.
CSRF-Token werden zur Laufzeit gelesen – bevorzugt aus dem DOM
(`meta[name="_csrf"]` oder `meta[name="csrf-token"]`, danach
`input[name="_csrf"]`), andernfalls aus der nachgeladenen Seite "Meine
Anzeigen". Gespeichert werden sie nie, auch nicht im Recovery-Snapshot.
