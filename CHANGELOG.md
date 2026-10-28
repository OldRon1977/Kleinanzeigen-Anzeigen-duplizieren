# Changelog

Hauptscript (`kleinanzeigen-duplizieren.user.js`) und Helper (`helper.user.js`) haben getrennte Versionsnummern.

## Helper 1.17.0 — Testversion

- Neu: "verlängerbar (N)" in der Schnellwahl und "Auswahl verlängern (N)" im Auswahl-Fenster (Idee: @Atom9989, #70)

## Helper 1.16.1 — Oktober 2026

- Behoben: Titel in der Seitenansicht (Rückfallebene ohne Schnittstelle) ohne vorangestelltes "Anzeige"
- Intern: Tests laufen gegen echte, anonymisierte Seiten von kleinanzeigen.de; Neu-Einstellen, Duplizieren, Batch-Lauf und Seitenstart sind jetzt als ganze Abläufe getestet

## 3.12.0 / Helper 1.16.0 — Oktober 2026

- Neu: Wiederherstellen aus Sicherung — Recovery-Snapshot oder Sicherungs-ZIP befüllt das Formular "Anzeige aufgeben", abgeschickt wird von Hand (@karlvonbonin, #74, #75)
- Neu: "Sicherung importieren (ZIP)" im Auswahl-Fenster; vorhandene Snapshots werden nicht ersetzt
- Neu: Knopf "Wiederherstellen" je Snapshot im Recovery-Kasten
- Neu: ZIP-Leser für STORE und DEFLATE
- Helper 1.15.0 übersprungen (Testversion "Auswahl verlängern", #70)

## Helper 1.14.0 — Oktober 2026

- Neu: Schnellwahl "älter als X Tage" und "noch max. Y Tage bis Ablauf" mit frei wählbaren Werten (Idee: @Atom9989, #70)
- Neu: Hinweis gegen zu häufiges Neu-Einstellen, rot bei Anzeigen unter 7 Tagen (Idee: @Atom9989, AnzeigenChef)

## 3.11.0 / Helper 1.13.0 — September 2026

- Neu: "Auswahl sichern (ZIP)" — Texte, Felder, Bilder und Protokoll der ausgewählten Anzeigen
- Neu: Kategorie, Attribute und Versand (`hiddenFields`) in Snapshot und Sicherung
- Neu: Zeitlimit für jeden Netzwerk-Zugriff
- Geändert: Bildreihenfolge nach `adImages[n]`, Bilder nur aus dem Anzeigen-Formular
- Behoben: Löschauftrag aus einem abgebrochenen Vorgang konnte im selben Tab später ausgeführt werden
- Behoben: Nachladen des CSRF-Tokens verbrauchte das Zeitbudget des Löschauftrags
- Behoben: Unbrauchbarer gespeicherter Pausenwert führte zu einem Batch ohne Pause
- Behoben: Fortschrittszähler um eins versetzt; Stop-Klick ging beim Neuaufbau des Fensters verloren
- Behoben: Preis fehlte in der Sicherung (Feld `priceAmount`)

## Helper 1.12.0 — September 2026

- Neu: Anzeigenkontingent der letzten 30 Tage über der Anzeigenliste
- Geändert: Workflow "Housekeeping" markiert und schließt inaktive Issues

## 3.10.1 / Helper 1.11.1 — September 2026

- Behoben: Stop wirkt auch während der Pause (@KrohnMi, #63)
- Behoben: Snapshot enthielt keine Bilder (CORS) bzw. nur 96-px-Vorschauen (#65)
- Geändert: Snapshot-Bilder werden zu viert parallel geladen (@KrohnMi, #64)

## Helper 1.11.0 — August 2026

- Neu: Anzeigenliste 90 Sekunden zwischengespeichert, mit "Neu laden"

## Helper 1.10.0 — August 2026

- Neu: Pause zwischen zwei Anzeigen einstellbar ("von"/"bis" in Minuten, Standard 3–6), lokal gespeichert (Idee: @halejok, AnzeigenChef)
- Neu: Warnung bei 0 und 0

## 3.10.0 / Helper 1.9.0 — August 2026

- Anlass: Vergleich mit anderen Kleinanzeigen-Tools in #32 (@Atom9989)
- Geändert: Neu-Einstellen legt erst die neue Anzeige an und löscht das Original auf der Bestätigungsseite
- Neu: Anzeigenliste aus `/m-meine-anzeigen-verwalten.json` (alle Seiten, exaktes Alter, Merk-Zähler)
- Neu: Werbeblocker auf allen Seiten von kleinanzeigen.de (Selektoren: Andi/[Zer089](https://github.com/Zer089/Kleinanzeigen.de-Anzeige_duplizieren_neu_einstellen))
- Behoben: Speichern-Klick vor fertig geladenem Formular

## 3.9.0 / Helper 1.8.0 — August 2026

- Neu: Zusatzfilter "nur nicht gemerkte" im Auswahl-Fenster (Idee: @TechHummel, #54)
- Neu: Merk-Status an jeder Anzeige

## 3.8.1 — August 2026

- Behoben: `adId` aus der URL über `URLSearchParams`
- Behoben: Formularwerte nur aus dem Anzeigen-Formular
- Neu: Meldungen als Live-Regionen, `aria-label` an den Toolbar-Buttons

## 3.8.0 / Helper 1.7.0 — August 2026

- Neu: Auswahl-Fenster mit Checkbox je Anzeige, nichts vorausgewählt (@karlvonbonin, #48)
- Neu: Liste zeigt alle Anzeigen statt nur ältere als 7 Tage (Idee: @Atom9989)
- Neu: Schnellwahl, Farbcodierung nach Alter, laufende Zusammenfassung (Idee Farbcodierung: @Atom9989, Andi/Zer089)
- Behoben: Laufzeitschätzung zählte eine Pause zu viel

## 3.7.2 — August 2026

- Neu: Log nennt, wie das Ad-ID-Feld gefunden wurde

## 3.7.1 — August 2026

- Behoben: Ad-ID-Feld wird auch nach einer Umbenennung gefunden (gemeldet von @oldgitdaddy, #49)

## 3.7.0 / Helper 1.5.0 — Juli 2026

- Neu: "Duplizieren" auf "Meine Anzeigen" (Idee: @rabaxy, #46)
- Behoben: Endloser Spinner beim Duplizieren über `#duplicate`

## 3.6.0 / Helper 1.4.0 — Juli 2026

- Behoben: Prüfung von Speichern-Button und Ad-ID-Feld vor jeder Löschung
- Behoben: Snapshot auch im manuellen Modus
- Behoben: Snapshot bleibt bei Timeout erhalten
- Behoben: Oberfläche wird 45 s nach ausbleibender Navigation freigegeben
- Behoben: CSRF-Token und versteckte Felder nicht mehr im Snapshot
- Neu: Unit-Tests (Vitest, jsdom) und CI

## 3.5.2 — Juli 2026

- Behoben: Upsell-Popup wird wiederholt weggeklickt, Zeitlimit 30 s (gemeldet von @ArgonQQ, #39)

## 3.5.1 / Helper 1.3.1 — Mai 2026

- Behoben: Popup-Dismisser klickt nur Knöpfe in Dialogen mit exaktem Text
- Geändert: `@match` nur noch auf `www.kleinanzeigen.de`

## 3.5.0 / Helper 1.3.0 — Mai 2026

- Neu: Batch auf "Meine Anzeigen"
- Neu: Recovery-Snapshot in IndexedDB, Recovery-Kasten mit ZIP-Export
- Neu: Auto-Stop bei Datenverlust

## 3.4.0 — April 2026

- Neu: Banner- und Popup-Blocker auf der Bearbeiten-Seite

## 3.3.x / Helper 1.1.x–1.2.0 — März/April 2026

- Neu: Helper-Script (erste Fassung: @panzli)
- Behoben: Zeichenkodierung in Kommentaren und Texten, Icon-Link (@farOverNinethousand)
- Geändert: Floating-Toolbar, Speichern über den Knopf statt `form.submit()`, Selektoren an neues Layout

## 3.2.0 — Februar 2026

- Geändert: Sicherheits-Härtung

## 3.0.0 — 2025

- Grundgerüst aus dem [Gist von J05HI](https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5) übernommen, Beginn des Ausbaus durch OldRon1977
- Code vollständig überarbeitet
- Neu: Smart neu einstellen
