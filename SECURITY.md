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
Löschung, dazu `https://img.kleinanzeigen.de` für die Anzeigenbilder von
Recovery-Snapshot, Sicherung und Wiederherstellung (ohne Cookies,
`credentials: 'omit'`).

| Script                              | `@grant`       | Begründung                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kleinanzeigen-duplizieren.user.js` | `none`         | Reines DOM-Skript, keine erweiterten Tampermonkey-Berechtigungen nötig. Auf der Bearbeiten- und der Bestätigungs-Seite arbeitet es mit dem Anzeigen-Formular; auf "Anzeige aufgeben" (Schritt 1 und 2) nur mit Wiederherstellungs-Auftrag (`#kaRestore=<adId>`), dann befüllt es das Formular aus einem Snapshot und sendet nichts ab. Auf allen übrigen Seiten von `www.kleinanzeigen.de` hängt es ausschließlich ein `<style>`-Element an (Werbeblocker, siehe README) und kehrt danach zurück. |
| `helper.user.js`                    | `GM_openInTab` | Öffnet Worker-Tabs im Batch-Modus und schließt sie nach Erfolg. Laut Tampermonkey-Doku gehört das Schließen und Fokussieren von Tabs zu den Fähigkeiten, die im `@grant` stehen müssen; das Handle von `GM_openInTab` bietet `close()`. Als Rückfallebene nutzt der Helper `window.open`.                                |

Genutzte Endpunkte:

- `POST /m-anzeigen-loeschen.json?ids={adId}` – Löschung des Originals (Hauptscript)
- `GET /m-meine-anzeigen.html` – Nachladen des CSRF-Tokens, wenn keines im DOM steht (Hauptscript)
- `GET /m-meine-anzeigen-verwalten.json` – Anzeigenliste, höchstens 20 Seiten (Helper)
- `GET /m-einstellungen-bearbeiten.json` – Anzeigenkontingent, Feld `newAdCount` (Helper)
- `GET https://img.kleinanzeigen.de/...` – Anzeigenbilder für Snapshot, Wiederherstellung und Sicherung (Hauptscript, Helper)
- `GET /p-anzeige-bearbeiten.html?adId={adId}` – Bearbeiten-Seite je Anzeige für "Auswahl sichern (ZIP)", nur lesend (Helper)
- `POST /m-anzeigen-verlaengern.json?ids={adId}` – kostenloses Verlängern der Auswahl, eine Anzeige pro Request (Helper ab 1.17.0, Testversion). Kostenpflichtige Verlängerungen (`extensionFee`) schickt der Helper nie
- `GET /m-mein-profil.json` – CSRF-Token für das Verlängern, Feld `csrfToken` (Helper)

## Recovery-Snapshots in IndexedDB

In **beiden** Modi – im Batch und beim einzelnen "Smart neu einstellen" –
speichert das Hauptscript vor der Löschung einen Recovery-Snapshot in
IndexedDB (`ka-batch.snapshots`, keyPath `adId`):

- Kuratierte Form-Felder (Titel, Beschreibung, Preis, Preistyp, Standort)
- Alle übrigen benannten Formularwerte des Anzeigen-Formulars (`rawFields`, je Feld auf 5000 Zeichen gekürzt). Ausgeschlossen sind Passwort-, Datei- und `type="hidden"`-Felder, nicht angehakte Checkboxen und Radios sowie leere Werte. Eine Prüfung, ob ein Feld sichtbar ist, findet nicht statt – ein per CSS verstecktes Textfeld landet also im Snapshot.
- Versteckte Felder getrennt als `hiddenFields` (je Feld auf 500 Zeichen gekürzt), weil dort Kategorie, Attribute und Versandart stehen. Nie gespeichert werden:
  - Felder, deren Name auf `csrf|xsrf|token|jwt|session|captcha|secret|password|auth` passt – darunter das CSRF-Token `input[name="_csrf"]`. Das gilt für jede Feldart.
  - `adImages[n].url`: signierte Vorschau-Adressen mit `jwt`. Aus ihnen wird nur die Reihenfolge der Bilder gelesen.
- Anzeigen-Bilder als Blob in voller Auflösung, geladen ohne Cookies (`credentials: 'omit'`). Gespeichert wird die Bildadresse ohne `AccessKeyId` und `jwt`.

Geht der Vorgang glatt durch, wird der Snapshot wieder verworfen: im manuellen
Modus vom Hauptscript auf der Bestätigungs-Seite, im Batch vom Helper nach der
Verarbeitung. Bleibt der Ausgang unklar – etwa nach einem Timeout – oder ist
etwas schiefgegangen, bleibt der Snapshot liegen und ist über das Recovery-UI
des Helpers als ZIP exportierbar oder löschbar.

Ein Verfallsdatum haben Snapshots nicht. Auf geteilten Geräten empfiehlt sich
deshalb nach einem Batch ein Blick ins Recovery-UI und bei Bedarf "Alle
löschen", um Anzeigen-Daten nicht länger als nötig lokal vorzuhalten.

Seit Helper 1.16.0 lassen sich Snapshots auch aus einer Recovery- oder
Sicherungs-ZIP importieren ("Sicherung importieren (ZIP)"). Die Datei wird
lokal gelesen und verlässt den Browser nicht; ihre Anzeigen liegen danach wie
alle anderen Snapshots in IndexedDB, mit denselben Hinweisen zur Aufbewahrung.
"Wiederherstellen" befüllt nur das Formular "Anzeige aufgeben" aus dem Snapshot
(Hauptscript ab 3.12.0); abgeschickt wird ausschließlich durch den Nutzer, und
erst die Bestätigungs-Seite entfernt den Snapshot wieder. Das Script klickt
dabei nur Auswahlknöpfe der Attribute (`type="button"`), nie einen Knopf, der
das Formular absendet.

Fehlen einem Snapshot die Bilddaten, lädt das Hauptscript sie nur von
`img.kleinanzeigen.de` nach. Bildadressen anderer Hosts – etwa aus einer
veränderten `data.json` in einer importierten ZIP – werden nicht abgerufen.
Die angehängten Bilder lädt Kleinanzeigen selbst sofort hoch
(`p-bild-hochladen.html`), wie bei einer Auswahl von Hand; die Anzeige entsteht
erst mit dem Absenden.

## Sicherung der Auswahl (ZIP)

"Auswahl sichern (ZIP)" im Auswahl-Fenster des Helpers liest dieselben Daten wie
der Recovery-Snapshot, nach denselben Regeln, aus der per `fetch` geholten
Bearbeiten-Seite. Nichts davon landet in IndexedDB: die Daten liegen nur im
Speicher des Tabs, bis die ZIP heruntergeladen oder das Fenster geschlossen
wird. Die ZIP enthält personenbezogene Angaben aus der Anzeige (z. B.
Kontaktname und PLZ).

## Hinweis

Die Scripts laufen lokal im Browser. Es werden keine Daten an Dritte übertragen.
CSRF-Token werden zur Laufzeit gelesen – bevorzugt aus dem DOM
(`meta[name="_csrf"]` oder `meta[name="csrf-token"]`, danach
`input[name="_csrf"]`), andernfalls aus der nachgeladenen Seite "Meine
Anzeigen". Der Helper holt das Token für das Verlängern aus
`/m-mein-profil.json`, wie die Seite selbst. Gespeichert werden Token nie, auch
nicht im Recovery-Snapshot.
