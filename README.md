# Kleinanzeigen – Anzeigen duplizieren und neu einstellen

Zwei Userscripts für Tampermonkey, die auf kleinanzeigen.de Anzeigen duplizieren, neu einstellen, sichern und wiederherstellen.

- **Hauptscript** (`kleinanzeigen-duplizieren.user.js`): arbeitet auf der Bearbeiten-Seite einer Anzeige, auf der Bestätigungsseite und – nur mit Wiederherstellungs-Auftrag – auf "Anzeige aufgeben". Auf allen anderen Seiten blendet es nur Werbung aus.
- **Helper** (`helper.user.js`): arbeitet auf "Meine Anzeigen" – Buttons je Anzeige, Batch, Sicherung, Recovery und Wiederherstellen.

## Funktionen

- **Duplizieren**: legt eine Kopie der Anzeige an, das Original bleibt
- **Smart neu einstellen**: legt die Anzeige neu an und löscht danach das Original; Bilder bleiben erhalten
- **Batch**: mehrere ausgewählte Anzeigen nacheinander neu einstellen, mit einstellbarer Pause
- **Anzeigenkontingent**: Zahl der in den letzten 30 Tagen neu aufgegebenen Anzeigen
- **Recovery-Snapshot**: lokale Sicherung jeder Anzeige vor dem Neu-Einstellen
- **Auswahl sichern**: ausgewählte Anzeigen samt Bildern als ZIP speichern, ohne sie zu ändern
- **Wiederherstellen**: verlorene Anzeige aus Snapshot oder ZIP ins Formular "Anzeige aufgeben" eintragen; abgeschickt wird von Hand
- **Banner- und Werbeblocker**: blendet Upsell-Optionen, Upsell-Popups und Werbung aus

## Installation

### Voraussetzungen

- Chrome, Firefox, Edge, Safari oder Opera
- Browser-Erweiterung [Tampermonkey](https://www.tampermonkey.net/)
- In Chrome zusätzlich: Erweiterungen → Tampermonkey → "Nutzerskripte zulassen"

### Hauptscript (Pflicht)

[![Install Script](https://img.shields.io/badge/Install-Hauptscript-00aa00?style=for-the-badge&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js)

### Helper (empfohlen)

[![Install Helper](https://img.shields.io/badge/Install-Helper_Script-0077cc?style=for-the-badge&logo=tampermonkey)](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js)

Der Helper braucht das Hauptscript: Er öffnet Tabs, in denen das Hauptscript die eigentliche Arbeit macht. Beide müssen in Tampermonkey aktiviert sein.

### Manuelle Installation

Wird ein Installationslink nicht als Userscript erkannt:

1. Tampermonkey → Dashboard → "+" (neues Script)
2. Inhalt der Raw-Datei einfügen ([Hauptscript](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js), [Helper](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js))
3. Speichern (Strg+S)

### Updates

Beide Scripts aktualisieren sich über `@updateURL`/`@downloadURL` selbst. Von Hand: Tampermonkey-Dashboard → Zahnrad beim Script → "Nach Updates suchen". Was sich je Version geändert hat, steht im [CHANGELOG](CHANGELOG.md).

## Bedienung

### Auf der Bearbeiten-Seite

Anzeige öffnen → "Bearbeiten". Unten rechts erscheint eine Leiste mit zwei Buttons:

- **Duplizieren**: speichert das Formular als neue Anzeige, das Original bleibt
- **Smart neu einstellen**: nach einer Rückfrage wird die Anzeige neu angelegt und das Original gelöscht

### Auf "Meine Anzeigen"

Neben jedem "Bearbeiten"-Link stehen **Duplizieren** und **Smart neu einstellen**. Ein Klick öffnet die Bearbeiten-Seite in einem neuen Tab und führt die Aktion dort aus; nach Erfolg schließt sich der Tab.

Über der Anzeigenliste steht das **Anzeigenkontingent**, z. B. "Kostenloses Kontingent (letzte 30 Tage): 14 von 100 verbraucht · 86 verfügbar". Die Zahl ist der Serverwert `newAdCount` und zählt alle in den letzten 30 Tagen neu aufgegebenen Anzeigen, auch inzwischen gelöschte – jedes Neu-Einstellen zählt mit. Ob eine Anzeige kostet, entscheidet Kleinanzeigen je Kategorie; die Zeile ist keine Kostenprognose. Liefert der Server keinen gültigen Wert, steht dort "Anzeigenkontingent derzeit nicht verfügbar".

### Anzeigen auswählen und neu einstellen (Batch)

Der Button **"Anzeigen auswählen & neu einstellen"** über der Anzeigenliste öffnet das Auswahl-Fenster.

1. Es listet alle Anzeigen mit Checkbox. Beim Öffnen ist nichts angehakt. Unter der Zusammenfassung steht, ob die Liste frisch geladen oder zwischengespeichert ist, mit **Neu laden**.
2. **Schnellwahl**: "Alle", "Keine", **"älter als X Tage"** (Standard 14) und **"noch max. Y Tage bis Ablauf"** (Standard 5; abgelaufene zählen dazu, Anzeigen ohne Enddatum nicht). Wert eintragen, **auswählen** klicken. Jede Schnellwahl ersetzt die bisherige Auswahl. Erlaubt sind ganze Tage von 0 bis 365; gültige Werte werden lokal gespeichert.
3. **"nur nicht gemerkte"** blendet Anzeigen aus, die jemand auf der Merkliste hat, und wählt sie ab. Der Filter wirkt zusätzlich zur Schnellwahl. Beim Einblenden kommt die vorherige Auswahl zurück. Ist der Merk-Zähler einer Anzeige nicht lesbar, gilt sie als gemerkt. Ist bei keiner Anzeige ein Zähler lesbar, fehlt die Checkbox.
4. **Hinweis zum Alter**: Empfohlen ist, Anzeigen 7 bis 14 Tage stehen zu lassen. Sind jüngere ausgewählt, wird der Hinweis rot und nennt ihre Zahl. Gesperrt wird nichts.
5. **Farbcodierung**: dunkelgrün ab 14 Tagen, grün 7–13, gelb 5–6, rot bis 4 Tage. Das Alter steht zusätzlich als Text an jeder Anzeige.
6. **Pause zwischen zwei Anzeigen**: "von" und "bis" in Minuten, Standard 3 bis 6. Vor jeder weiteren Anzeige wartet das Script eine zufällige Dauer aus diesem Bereich. Erlaubt sind ganze Minuten von 0 bis 180, "von" ≤ "bis"; sonst bleibt Start gesperrt. Die Werte werden lokal gespeichert.
7. **Start** stellt die angehakten Anzeigen nacheinander neu ein. **Stop** beendet den Batch nach der laufenden Anzeige, auch während einer Pause.

> **0 und 0 Minuten** schalten die Pause ab. Das ist für Kleinanzeigen als automatisiertes Verhalten erkennbar und kann zur Sperrung des Kontos führen. Das Fenster warnt dann rot, verhindert es aber nicht.

Verarbeitet wird eine Anzeige nur, wenn alle diese Bedingungen gelten: Sie ist im Auswahl-Set, ihr sichtbarer Haken ist gesetzt, der zweite Haken des Merk-Filters (`input[data-ka-gate="fav"]`) ist gesetzt, der Merk-Zähler erlaubt es auch beim Start noch, und die Zeile ist sichtbar. Die Zahl in der Zusammenfassung kommt aus derselben Prüfung.

Die Liste kommt aus `/m-meine-anzeigen-verwalten.json` (alle Seiten, höchstens 20). Das Alter kommt aus `adLifeTimeInSeconds`, ersatzweise aus `creationDate`. Ist die Schnittstelle nicht erreichbar, liest das Script die sichtbare Seite: dann nur diese Seite, und das Alter wird aus der Restlaufzeit geschätzt (Markierung "(geschätzt)"). Welche Quelle benutzt wurde, steht in der Konsole (`Kandidaten: … quelle: json|dom`).

Die geladene Liste wird 90 Sekunden zwischengespeichert und nach einem Batch, einem einzelnen Neu-Einstellen oder Duplizieren verworfen.

### Ablauf beim Neu-Einstellen

1. Das Script sichert die Anzeige als Recovery-Snapshot.
2. Es speichert das Formular als neue Anzeige. Das Original bleibt unverändert.
3. Erst auf der Bestätigungsseite – sie beweist, dass die neue Anzeige existiert – löscht es das Original.

Bricht der Vorgang vorher ab, wird nichts gelöscht. Scheitert nur das Löschen, stehen beide Anzeigen online; der Batch nennt die ID zum Löschen von Hand. Der Löschauftrag liegt im Speicher des Tabs, wird bei einem Abbruch entfernt und verfällt nach zehn Minuten.

### Recovery-Snapshots

Vor jedem Neu-Einstellen speichert das Hauptscript die Anzeige lokal im Browser (IndexedDB). Nach Erfolg wird der Snapshot wieder gelöscht. Bleibt einer übrig, zeigt das Auswahl-Fenster einen gelben Kasten mit **Als ZIP herunterladen**, **Alle löschen** und je Snapshot **Wiederherstellen**. Snapshots verfallen nicht; auf geteilten Geräten nach einem Batch prüfen und bei Bedarf löschen.

### Auswahl sichern (ZIP)

**"Auswahl sichern (ZIP)"** im Auswahl-Fenster sichert die angehakten Anzeigen, ohne sie zu ändern. Es gilt dieselbe Auswahl wie für Start. Das Script holt je Anzeige die Bearbeiten-Seite im Hintergrund (1–2 Sekunden Abstand, kein Tab); **Stop** beendet nach der laufenden Anzeige. Am Ende lädt **ZIP herunterladen** die Datei.

Die ZIP enthält je Anzeige einen Ordner `<adId>-<Titel>/` mit `data.json` und `image_01.jpg`, `image_02.jpg`, … in voller Auflösung (`image_01` = Titelbild), dazu `protokoll.txt` mit Feldern, Bildern und Fehlern je Anzeige. Recovery-ZIP und Sicherung haben dasselbe Format. Scheitert eine Anzeige, läuft die Sicherung weiter und die Anzeige steht als FEHLER im Protokoll.

### Wiederherstellen aus Sicherung

Benötigt Hauptscript 3.12.0 und Helper 1.16.0 oder neuer.

1. Im Auswahl-Fenster **"Sicherung importieren (ZIP)"** klicken und eine Recovery- oder Sicherungs-ZIP wählen. Die Datei bleibt im Browser. Die Anzeigen erscheinen im gelben Kasten; ein vorhandener Snapshot derselben Anzeige wird nicht ersetzt. Liegt die Anzeige schon als Snapshot vor, entfällt der Import.
2. **Wiederherstellen** klicken. Ein neuer Tab öffnet "Anzeige aufgeben" – mit bekannter Kategorie direkt das Formular, sonst die Kategoriewahl. Nach der Wahl geht es von allein weiter (innerhalb von zehn Minuten).
3. Das Script trägt Titel, Beschreibung, Preis, Preistyp, "Versand möglich", PLZ, Kontaktname und Kategorie-Attribute ein und hängt die Bilder in der gespeicherten Reihenfolge an. Ein Panel unten rechts nennt, was übernommen wurde und was von Hand zu wählen ist.
4. Formular prüfen und selbst auf **Anzeige aufgeben** klicken. Die Bestätigungsseite löscht dann den Snapshot, der Knopf im Auswahl-Fenster zeigt "Wiederhergestellt". Wird später als 30 Minuten nach dem Befüllen abgeschickt, bleibt der Snapshot stehen.

Was das Panel zum Prüfen nennt:

- **Attribute** wie Art, Farbe, Zustand wählt das Script über die Auswahlknöpfe von Kleinanzeigen und prüft danach den Wert. Was sich nicht zuordnen lässt, steht unter "Von Hand wählen".
- **Marke**: ein Eingabefeld mit Vorschlagsliste; das Script trägt sie nicht ein, das Panel nennt den gesicherten Wert.
- **Versandmethoden** (Hermes, DHL, …) wählt Kleinanzeigen selbst vor. Weicht die Vorauswahl von der Sicherung ab, nennt das Panel beide.
- **Bilder**: Fehlen in der Sicherung die Bilddaten, lädt das Script sie in voller Auflösung von `img.kleinanzeigen.de` nach, solange Kleinanzeigen sie ausliefert. Angehängte Bilder lädt Kleinanzeigen sofort hoch; die Anzeige entsteht erst beim Absenden.
- **Kategorie**: Enthält die Sicherung keine, beginnt die Wiederherstellung in der Kategoriewahl. Die Kategorie im Formular wird nie getauscht.

Nicht übernommen werden kostenpflichtige Extras, die Marketing-Einwilligung und interne Sitzungswerte.

### Banner- und Werbeblocker

Auf der Bearbeiten-Seite blendet das Hauptscript kostenpflichtige Feature-Optionen (Highlight, Galerie, Bumpup) und den Hinweis "Das Bearbeiten deiner Anzeige schiebt sie nicht wieder hoch" aus und klickt Upsell-Popups nach dem Speichern weg ("Ohne Hochschieben weiter", "Ohne Highlight weiter").

Auf allen Seiten von kleinanzeigen.de blendet es Werbung aus: Seitenbanner, Billboards, Werbung über und in der Trefferliste, gesponserte Blöcke und Werbung in Merkliste, Nachrichten und Konto. Außerhalb von Bearbeiten-Seite, Bestätigungsseite und "Anzeige aufgeben" mit Wiederherstellungs-Auftrag hängt das Script dafür nur ein `<style>`-Element an. Der Cookie-Banner bleibt sichtbar. Die Selektoren stammen aus dem [Userscript von Andi (Zer089)](https://github.com/Zer089/Kleinanzeigen.de-Anzeige_duplizieren_neu_einstellen) (MIT).

## Berechtigungen und Daten

- Hauptscript: `@grant none`. Helper: `@grant GM_openInTab` zum Öffnen und Schließen der Arbeits-Tabs, ersatzweise `window.open`.
- Beide Scripts sprechen nur mit `www.kleinanzeigen.de` und `img.kleinanzeigen.de` (Bilder ohne Cookies). Es geht nichts an Dritte.
- Snapshots und Sicherungen enthalten Titel, Beschreibung, Preis, Formularwerte (z. B. Kontaktname, PLZ), Kategorie, Attribute, Versand und Bilder. Nie gespeichert werden CSRF-Token, Felder mit Namen wie `csrf`, `token`, `jwt`, `session`, `password`, `auth`, Passwort- und Datei-Felder sowie signierte Bildadressen.
- Snapshots liegen in IndexedDB (`ka-batch`) dieses Browsers, Sicherungen nur in der heruntergeladenen ZIP. Eine importierte ZIP verlässt den Browser nicht.

### Seiten

- `p-anzeige-bearbeiten.html*` – Hauptscript: Buttons, Duplizieren, Neu-Einstellen
- `p-anzeige-aufgeben-bestaetigung.html*` – Hauptscript: Original löschen, Ergebnis an den Helper melden
- `p-anzeige-aufgeben.html*`, `p-anzeige-aufgeben-schritt2.html*` – Hauptscript, nur mit Auftrag `#kaRestore=<adId>`: Formular aus dem Snapshot befüllen
- alle übrigen Seiten – Hauptscript: Werbeblocker
- `m-meine-anzeigen.html*` – Helper

### Endpunkte

- `POST /m-anzeigen-loeschen.json?ids={adId}` – Original löschen (Hauptscript)
- `GET /m-meine-anzeigen.html` – CSRF-Token nachladen, wenn keines im DOM steht (Hauptscript)
- `GET /m-meine-anzeigen-verwalten.json?pageNum={n}&sort=DEFAULT` – Anzeigenliste, höchstens 20 Seiten (Helper)
- `GET /m-einstellungen-bearbeiten.json` – Anzeigenkontingent, Feld `newAdCount` (Helper)
- `GET /p-anzeige-bearbeiten.html?adId={adId}` – Bearbeiten-Seite für "Auswahl sichern", nur lesend (Helper)
- `GET https://img.kleinanzeigen.de/...?rule=$_57.JPG` – Bilder in voller Auflösung (beide)

## Fehlerbehebung

**Buttons fehlen auf der Bearbeiten-Seite**: 2–3 Sekunden warten; prüfen, ob das Hauptscript aktiv ist; Seite mit Strg+F5 neu laden.

**Buttons fehlen auf "Meine Anzeigen"**: prüfen, ob der Helper installiert und aktiv ist; das Tampermonkey-Symbol zeigt dann "2".

**Löschen schlägt fehl**:
- Sitzung abgelaufen → neu anmelden.
- "CSRF-Token nicht ermittelbar (Timeout)": "Meine Anzeigen" hat nicht innerhalb von 8 Sekunden geantwortet. Nichts wurde gelöscht. Kurz warten, erneut versuchen.
- "Timeout beim Löschen": Der Löschauftrag kam nicht innerhalb von 8 Sekunden zurück. Ob gelöscht wurde, zeigt "Meine Anzeigen".

**Upsell-Popup blockiert den Vorgang**: Seite neu laden und erneut versuchen. In der Konsole (F12) nach `[KA-Script] Popup erkannt` suchen.

**Wiederherstellen befüllt das Formular nicht**:
- Hauptscript 3.12.0 und Helper 1.16.0 oder neuer müssen aktiv sein.
- Am Knopf steht "Popup blockiert": Popups für kleinanzeigen.de zulassen.
- Kategoriewahl länger als zehn Minuten offen: Auftrag verfallen, erneut auf **Wiederherstellen** klicken.
- "Keine Sicherung mit der ID … gefunden": Der Snapshot fehlt in diesem Browser (z. B. nach "Alle löschen" oder in einem anderen Profil). ZIP erneut importieren.
- Konsole (F12), Filter `[KA-Script]`: "Formular aus Snapshot befuellt" nennt übernommene und fehlende Felder, "Attribut nicht zuordenbar" jedes Attribut für die Handwahl.

## Fehler melden

Über [Issues → New issue](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/issues/new/choose) die Vorlage "Fehler melden" oder "Wunsch" wählen. Für einen Fehler werden gebraucht: beide Script-Versionen, Browser, privates oder gewerbliches Konto, die Schritte und die Konsolenausgabe (F12, Filter `[KA-`). Keine Zugangsdaten, Token oder Cookies posten.

## Entwicklung

- `npm test` – Tests (Vitest, jsdom) für beide Scripts über Test-Exporte, die nur in Node aktiv sind
- `npm run test:coverage` – dasselbe mit Abdeckungsbericht
- `tests/fixtures/` – echte Seitenteile von kleinanzeigen.de (Bearbeiten-Seite, "Anzeige aufgeben" Schritt 2 mit Auswahlliste und Zustand-Dialog, "Meine Anzeigen" samt JSON), anonymisiert. Die `*.fixture.test.js` prüfen die Abläufe darauf. Gemockt sind Netz, Tabs und das React-Verhalten hinter den Auswahlknöpfen
- `npm run validate` – synchronisiert die `@version`-Header mit `package.json` und prüft die Syntax beider Scripts
- `tests/setup.storage.js` – stellt `localStorage` bereit; Node ab v22 bringt ein eigenes, ohne `--localstorage-file` leeres `localStorage` mit, das die jsdom-Variante überdeckt
- `tests/setup.indexeddb.js` – `indexedDB` über `fake-indexeddb` (Version gepinnt). Reset je Test über eine neue `IDBFactory`; `deleteDatabase` blockiert, weil die Wrapper ihre Verbindungen nie schließen
- [PROTOCOL.md](PROTOCOL.md) – Vertrag zwischen Hauptscript und Helper (Hashes, Storage-Schlüssel, Fehlercodes, IndexedDB). Änderungen daran müssen in beiden Scripts und dort nachgezogen werden

## Credits

- **Autor und Maintainer**: [OldRon1977](https://github.com/OldRon1977)
- **Grundlage**: [J05HI](https://github.com/J05HI) – [Original-Gist](https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5)
- **Erste Fassung des Helpers**: [panzli](https://github.com/panzli)

### Beiträge und Ideen

- **[karlvonbonin](https://github.com/karlvonbonin)** – Auswahl im Batch-Fenster ([#48](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/pull/48)); Wiederherstellen aus Sicherung, Idee und Code ([#74](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/pull/74))
- **[KrohnMi](https://github.com/KrohnMi)** – Stop während der Pause, paralleles Laden der Snapshot-Bilder und Aufräumarbeiten (#61–#64)
- **[Andi (Zer089)](https://github.com/Zer089/Kleinanzeigen.de-Anzeige_duplizieren_neu_einstellen)** – Alter mit Farbcode, Dashboard-Ansicht; Selektoren des Werbeblockers (MIT, Code übernommen)
- **[AnzeigenChef](https://anzeigenchef-online.de/handhabung/)** – lange Pausen statt Sekunden-Abständen; Anzeigen 7 bis 14 Tage stehen lassen
- **[halejok](https://github.com/halejok)** – Pause von mindestens 3 bis 5 Minuten
- **[Atom9989](https://github.com/Atom9989)** – Batch über alle Anzeigen, Farbcodierung nach Alter, Warnung bei jungen Anzeigen, frei wählbare Schnellwahl

## Lizenz

MIT – siehe [LICENSE](LICENSE)

---

Dieses Script ist nicht offiziell mit Kleinanzeigen verbunden oder von ihnen unterstützt.
