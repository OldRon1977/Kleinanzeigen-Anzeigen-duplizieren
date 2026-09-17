# Tab-übergreifendes Protokoll: `kleinanzeigen-duplizieren.user.js` ↔ `helper.user.js`

Dieses Dokument ist die **verbindliche Definition** des Protokolls, über das der
Worker-Tab (`kleinanzeigen-duplizieren.user.js`, läuft auf
`p-anzeige-bearbeiten.html*` und `p-anzeige-aufgeben-bestaetigung.html*`) und
der Orchestrator-Tab (`helper.user.js`, läuft auf `m-meine-anzeigen.html*`)
im Batch-Modus ("Alle alten neu einstellen") kommunizieren.

Beide Scripts implementieren dieses Protokoll **unabhängig voneinander**
(kein gemeinsames Modul, kein `@require`). Jede Änderung an einer Seite muss
manuell auf der anderen Seite nachgezogen und hier dokumentiert werden. Bei
Unklarheiten ist der tatsächliche Code in beiden `.user.js`-Dateien die
Quelle der Wahrheit — dieses Dokument beschreibt ihn, ersetzt ihn aber nicht.

## Auslöser: URL-Hashes

Der Helper öffnet den Worker-Tab per `GM_openInTab` (Fallback `window.open`)
mit einer URL, deren Hash das Verhalten des Worker-Scripts steuert:

| Hash              | Bedeutung                                                                                                                           | Ausgelöst von                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#smartRepublish` | Batch-/Smart-Republish-Flow: Snapshot erstellen, neu einstellen, danach das Original löschen (Reihenfolge seit 3.10.0, siehe unten) | Helper (`processOne`), auch manuell über den "Smart neu einstellen"-Button im Worker                                                                            |
| `#duplicate`      | Reines Duplizieren ohne Löschung, kein Ergebnis-Signal, kein Snapshot                                                               | Externe Aufrufe per URL-Hash (historisch Helper 1.2.0); der Duplizieren-Button ruft `duplicateAd()` direkt auf, ohne Hash. Vom aktuellen Helper nicht verwendet |

`isBatchMode()` im Worker prüft exakt `window.location.hash === '#smartRepublish'`.
Nur in diesem Modus werden Result-Key und Batch-Watchdog aktiv. Der Snapshot
wird dagegen in **beiden Modi** erstellt (im manuellen Modus räumt ihn der
Worker selbst wieder ab, siehe Snapshot-Abschnitt).

## IndexedDB: `ka-batch`

Beide Scripts öffnen dieselbe Datenbank mit identischer Struktur (Konstanten
sind in beiden Dateien separat hart kodiert, siehe unten):

| Eigenschaft  | Wert        |
| ------------ | ----------- |
| DB-Name      | `ka-batch`  |
| DB-Version   | `1`         |
| Object Store | `snapshots` |
| keyPath      | `adId`      |

### Snapshot-Objektform (geschrieben vom Worker, gelesen vom Helper)

```
{
  adId: string,          // String(adId)
  capturedAt: number,    // Date.now() zum Zeitpunkt der Erfassung
  title: string,          // fields.title || ''
  fields: {                // ausgewählte, benannte Felder
    title?, description?, price?, priceType?, location?
  },
  rawFields: {              // alle benannten input/textarea/select-Werte
    [name: string]: string  // je auf 5000 Zeichen gekappt; ausgeschlossen sind
                            // Passwort-, File- und Hidden-Felder sowie "_csrf"
  },
  images: [
    { url: string, blob: Blob|null, mime: string|null }
    // blob/mime sind null, wenn der Bild-Fetch fehlgeschlagen ist
    // (URL bleibt trotzdem erhalten)
  ]
}
```

- Geschrieben von: `batchPutSnapshot()` im Worker, **vor** dem Speichern der
  neuen Anzeige, in **beiden Modi** (Batch **und** manuell). Im manuellen
  Modus dient er nur als Sicherung während des Neu-Einstellens.
- Gelesen von: Helper (`listSnapshotMeta`, `getSnapshotsAll`) für die
  Recovery-Übersicht und den ZIP-Export.
- Gelöscht von:
  - **Batch-Modus:** Helper (`deleteSnapshot`) nach erfolgreichem Verarbeiten
    einer Anzeige (Erfolg **oder** Fehler ohne Datenverlust). Bei erkanntem
    Datenverlust bleibt der Snapshot bewusst erhalten.
  - **Manueller Modus:** Worker selbst (`batchDeleteSnapshot()`) auf der
    Bestätigungs-Seite, sobald die Neuanlage erfolgreich war (kein Helper
    beteiligt). So bleiben keine Orphan-Snapshots zurück, die das
    Recovery-UI des Helpers sonst als Warnung anzeigen würde.

### sessionStorage-Schlüssel

**Wertformat ab 3.11.0:** `ka-batch-original-adid` und `ka-delete-after-create`
tragen ihren Wert nicht mehr als nackten String, sondern als JSON mit
Entstehungszeitpunkt:

```
{"v":"<adId>","ts":<Date.now()>}
```

Gelesen wird über `readVorgangMarker()`. Ist der Marker älter als
`CONFIG.MARKER_MAX_AGE_MS` (10 Minuten), liefert die Funktion `null` — die
Bestätigungs-Seite behandelt ihn dann wie nicht vorhanden und löscht nichts.
Grund: `sessionStorage` ist tab-gebunden und überlebt Navigationen. Ein Marker
aus einem abgebrochenen Vorgang wurde vorher von einem _späteren_ Vorgang im
selben Tab ausgeführt, und der Save-Watchdog (45s) fängt das nur ab, solange der
Tab auf der Bearbeiten-Seite bleibt.

Ein Wert im Alt-Format (reiner String ohne Zeitstempel) gilt weiter und hat
keine Verfallszeit — ein Script-Update kann einen Tab mit altem Marker
hinterlassen, und dieser Vorgang soll nicht verloren gehen. Dasselbe gilt für
unlesbares JSON. `ka-manual-mode` bleibt das Flag `'1'`: es löst keine Aktion
aus, sondern steuert nur die Verzweigung, und ohne die beiden anderen Marker
passiert nichts.

| Schlüssel                | Gesetzt von                          | Bedeutung                                                                                                              |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `ka-batch-original-adid` | `smartRepublish()`                   | adId, an die auf der Bestätigungs-Seite das Ergebnis gemeldet wird                                                     |
| `ka-manual-mode`         | `smartRepublish()` (nur ohne Helper) | Bestätigungs-Seite räumt den eigenen Snapshot ab, statt einen Result-Key zu schreiben                                  |
| `ka-delete-after-create` | `smartRepublish()` (ab 3.10.0)       | Auftrag, dieses Original zu löschen, sobald die Neuanlage bestätigt ist. Fehlt der Schlüssel, wird **nichts** gelöscht |
| `ka-duplicate-adid`      | `duplicateAd()`                      | Signalisiert dem Helper den Abschluss einer Duplizierung                                                               |

### localStorage: sonstige Schlüssel

| Schlüssel                    | Besitzer                      | Bedeutung                                                                                                                                                                      |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ka-batch-delay`             | Helper (ab 1.10.0)            | Eingestellte Pausenspanne in Minuten als JSON `{min,max}`. Nur Helper-intern, der Worker liest sie nie. Fehlt der Eintrag oder ist er unbrauchbar, greift der Standard 3 bis 6 |
| `ka-duplicate-result-<adId>` | Worker schreibt, Helper liest | Abschlusssignal einer Duplizierung (Wert `ok`)                                                                                                                                 |

## localStorage: Result-Keys

| Eigenschaft       | Wert                                |
| ----------------- | ----------------------------------- |
| Key-Präfix        | `ka-batch-result-`                  |
| Vollständiger Key | `ka-batch-result-<adId>`            |
| Wertformat        | `ok` oder `error:<code>[:<detail>]` |

- **Geschrieben von:** ausschließlich dem Worker, über sieben Codestellen mit
  sechs Auslösern. Fünf davon laufen über `batchSetResult()`, der Erfolgsfall
  schreibt direkt per `localStorage.setItem`:
  1. `smartRepublish()`, Preflight fehlgeschlagen → `error:precondition_failed:<sub>`.
  2. `smartRepublish()` bei Snapshot-Fehlschlag (vor jeder Löschung) →
     `error:snapshot_failed:<text>`.
  3. `smartRepublish()`, Referenzen vor dem Speichern nicht mehr auflösbar →
     `error:save_failed:not_deleted`.
  4. Batch-Watchdog in `smartRepublish()` nach `CONFIG.SAVE_WATCHDOG_TIMEOUT_MS`
     ohne Navigation → `error:save_failed:not_deleted`.
  5. `smartRepublish()`-Catch-Block bei sonstigen Fehlern (Klassifikation nach
     `phase`, siehe unten) → `error:save_failed:not_deleted` oder
     `error:exception:<message>`.
  6. `handleConfirmationPage()` auf der Bestätigungs-Seite
     (`p-anzeige-aufgeben-bestaetigung.html`, aufgerufen aus `init()`), wenn
     `sessionStorage['ka-batch-original-adid']` gesetzt ist → schreibt `ok`
     bzw. `ok:delete_failed`. Diese Stelle umgeht `batchSetResult` und schreibt
     direkt.
- **Gelesen/gelöscht von:** ausschließlich der Helper (`processOne`), über
  zwei parallele Kanäle:
  - `storage`-Event-Listener (`window.addEventListener('storage', ...)`) —
    reagiert nur zuverlässig, wenn der Worker-Tab ein _anderer_ Tab als der
    Helper-Tab ist (Standardfall).
  - 1-Sekunden-Polling (`setInterval(..., 1000)`) als Fallback/Redundanz.
  - Der Key wird vom Helper vor dem Öffnen des Tabs entfernt (Aufräumen von
    Altlasten) und nach Verarbeitung des Ergebnisses wieder entfernt
    (`cleanup()`).
- Der Worker räumt den Key defensiv ebenfalls vor dem Snapshot ab
  (`localStorage.removeItem('ka-batch-result-' + originalId)`), falls ein
  vorheriger Lauf gecrasht ist und einen Stale-Wert hinterlassen hat.

### Wertgrammatik

```
ok
ok:<hinweis>
error:<code>
error:<code>:<detail>
```

`<detail>` ist entweder ein fester Sub-Code (nur bei `save_failed`:
`delete_ok` | `delete_failed`) oder ein freier Fehlertext (bei
`snapshot_failed`, `exception`). Der Helper parst nur das erste Segment
nach `error:` als `code` (`raw.slice(6).split(':')[0]`) — zusätzliche
Doppelpunkte im Freitext brechen das Parsing nicht.

## Cache der Anzeigenliste (Helper ab 1.11.0)

Kein Bestandteil des Tab-Protokolls, aber für das Verständnis der Abläufe
relevant: Der Helper hält das Ergebnis von `collectCandidatesResilient()` für
**90 Sekunden** in einer Modulvariablen — bewusst **nicht** in `localStorage`,
weil ein persistierter Stand nach einem Batch-Lauf in einem anderen Tab falsch
wäre.

Verworfen wird er über `invalidateAdListCache()` an drei Stellen, an denen sich
die Liste zwangsläufig geändert hat: am Ende von `runBatch()`, nach einem
erfolgreichen `openSmartRepublish()` und nach einem erfolgreichen
`openDuplicate()`. Die DOM-Rückfallebene wird nicht zwischengespeichert.

## Fehlercodes

Vom Worker über localStorage geschrieben:

| Code                        | Bedeutung                                                                                                                                                                 | Auslöser                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `precondition_failed`       | Preflight fehlgeschlagen: Speichern-Button oder adId-Input nicht auffindbar → Abbruch, **kein Datenverlust**. Sub-Detail: `save_button_missing` oder `adid_input_missing` | Worker-seitiger Preflight in `smartRepublish()`, vor dem Speichern                                                             |
| `snapshot_failed`           | Snapshot-Erstellung fehlgeschlagen, vor dem Speichern abgebrochen                                                                                                         | Fehler in `buildSnapshot()`/`batchPutSnapshot()`                                                                               |
| `save_failed:delete_ok`     | **Nur noch aus Worker < 3.10.0.** Speichern fehlgeschlagen, Original bereits gelöscht → Datenverlust                                                                      | Exception nach `phase === 'delete_ok'` oder `'save_clicked'`; oder Watchdog nach 45s, wenn Original erfolgreich gelöscht wurde |
| `save_failed:delete_failed` | **Nur noch aus Worker < 3.10.0.** Speichern fehlgeschlagen, Original-Löschung war bereits fehlgeschlagen                                                                  | Exception nach `phase === 'delete_failed'` — diese Phase existiert seit 3.10.0 nicht mehr                                      |
| `save_failed:not_deleted`   | Speichern der neuen Anzeige fehlgeschlagen. **Original steht noch** — kein Datenverlust. Ab 3.10.0 der einzige `save_failed`-Fall                                         | Referenzen vor dem Speichern nicht auflösbar; Watchdog nach 45s ohne Navigation; Exception nach `phase === 'save_clicked'`     |
| `exception:<message>`       | Sonstiger, nicht genauer klassifizierter Fehler vor dem Speichern (`phase === 'init'` oder `'snapshot_done'`)                                                             | Allgemeiner Catch-Block in `smartRepublish()`                                                                                  |

Ausschließlich Helper-intern erzeugt (**nicht** über localStorage
übertragen, sondern direkt als `code` im Promise-Ergebnis von `processOne`):

| Code            | Bedeutung                                                                |
| --------------- | ------------------------------------------------------------------------ |
| `timeout`       | Kein Result-Wert innerhalb von `RESULT_WAIT_TIMEOUT_MS` (180s) empfangen |
| `popup_blocked` | Weder `GM_openInTab` noch `window.open` konnten einen Tab öffnen         |

### Erfolgswerte mit Hinweis (ab 3.10.0)

| Wert               | Bedeutung                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ok`               | Neue Anzeige erstellt, Original gelöscht                                                                                                                                          |
| `ok:delete_failed` | Neue Anzeige erstellt, **Original blieb bestehen** → Duplikat online. Kein Datenverlust, aber der Nutzer muss es erfahren; der Helper zeigt es im Abschlussbildschirm als Hinweis |

### Reihenfolge (geändert in 3.10.0)

Bis 3.9.0 galt: **erst löschen, dann anlegen.** Scheiterte die Neuanlage, war die
Anzeige weg — daher `save_failed:delete_ok` als Datenverlust-Code, der Auto-Stop
und der Recovery-Snapshot als Rettungsanker.

Ab 3.10.0 gilt: **erst anlegen, dann löschen.**

1. `smartRepublish()` neutralisiert das `adId`-Feld und klickt Speichern. Das
   Original bleibt dabei unangetastet.
2. Der Worker legt `sessionStorage['ka-delete-after-create'] = <originalId>` ab —
   ein Auftrag, kein Vollzug.
3. Erreicht der Tab die Bestätigungs-Seite, **ist das der Beweis**, dass die neue
   Anzeige serverseitig existiert. Erst dort löscht `handleConfirmationPage()`
   das Original und schreibt danach den Result-Wert.

Daraus folgt für die Fehlerbehandlung: Ein Abbruch vor der Bestätigungs-Seite
kann kein Datenverlust mehr sein, weil nie gelöscht wurde. Der schlimmste Fall
ist ein Duplikat (`ok:delete_failed`). Der Marker wird vor dem Löschen entfernt,
damit ein Reload der Bestätigungs-Seite nicht ein zweites Mal löscht.

## Datenverlust-Semantik (`handleValue` im Helper)

`dataLoss` wird **ausschließlich** dann `true` gesetzt, wenn
`code === 'save_failed'` **und** der Sub-Code exakt `delete_ok` ist:

```js
let dataLoss = false;
if (code === "save_failed") {
  const sub = tail.split(":")[1] || "";
  dataLoss = sub === "delete_ok";
}
```

Seit 3.10.0 kann der Worker `save_failed:delete_ok` nicht mehr erzeugen — die
Prüfung bleibt trotzdem stehen, weil ein Nutzer eine ältere Worker-Version
installiert haben kann. Erfolgswerte der Form `ok:<hinweis>` gelten als Erfolg
(`ok: true`) und tragen den Hinweis in `warning`.

**Kompatibilitätsregel:** Jeder unbekannte oder zukünftig neu hinzugefügte
Fehlercode gilt beim Helper implizit als **Nicht-Datenverlust-Fehler**
(`dataLoss = false`), solange er nicht explizit `save_failed` mit Sub-Code
`delete_ok` ist. Das ist kein Bug, sondern die bewusste Fail-Safe-Richtung
des aktuellen Codes: ein unbekannter Code führt **nicht** automatisch zum
Batch-Auto-Stop. Neue Codes, die tatsächlich Datenverlust bedeuten, müssen
also explizit in der `handleValue`-Logik ergänzt werden — sie werden nicht
automatisch als solche erkannt.

Bei `dataLoss === true` setzt `runBatch()` `state.autoStopped = true` und
bricht die Batch-Verarbeitung ab (P3: Auto-Stop bei Datenverlust); der
zugehörige IDB-Snapshot bleibt erhalten. Bei `dataLoss === false` wird der
Snapshot nach Verarbeitung gelöscht (Erfolg oder harmloser Fehler).

`dataLoss` steuert zusätzlich `keepTab` (`keepTab: dataLoss`): Bei
Datenverlust wird der Worker-Tab **nicht** automatisch geschlossen, damit er
zur manuellen Prüfung offen bleibt.

## sessionStorage: `ka-batch-original-adid` und `ka-manual-mode`

Rein Worker-intern, überbrücken die Navigation von der Bearbeiten-Seite zur
Bestätigungs-Seite (kein Zugriff durch den Helper):

- `ka-batch-original-adid` wird in `smartRepublish()` unmittelbar vor dem
  Klick auf "Anzeige speichern" gesetzt — in **beiden Modi** (Batch **und**
  manuell).
- `ka-manual-mode` (`'1'`) wird zusätzlich gesetzt, aber **nur im manuellen
  Modus** (also wenn nicht `isBatchMode()`).
- `ka-delete-after-create` wird ebenfalls dort gesetzt (ab 3.10.0) und traegt
  den Loeschauftrag fuer das Original.
- Entfernt werden alle drei Marker außerdem, wenn der Vorgang **nicht** bis zur
  Bestätigungs-Seite kommt: `startSaveWatchdog()` räumt sie nach
  `CONFIG.SAVE_WATCHDOG_TIMEOUT_MS` ab, falls der Tab dann noch auf der
  Bearbeiten-Seite steht, und der Catch-Block von `smartRepublish()` tut es in
  beiden Modi. Das ist nötig, weil `sessionStorage` tab-gebunden ist und
  Navigationen überlebt: ein liegengebliebener `ka-delete-after-create` würde
  sonst von einem _späteren_ Vorgang im selben Tab ausgeführt und eine Anzeige
  löschen, die in diesem Vorgang niemand neu eingestellt hat.
- Gelesen und sofort entfernt (alle drei Marker) in `handleConfirmationPage()`
  auf `p-anzeige-aufgeben-bestaetigung.html*`:
  - **Batch-Modus** (`ka-manual-mode` fehlt): der Worker löscht das Original
    und schreibt danach `ok` bzw. `ok:delete_failed` in den zugehörigen
    localStorage-Result-Key. Den Snapshot löscht der Helper.
  - **Manueller Modus** (`ka-manual-mode` gesetzt): der Worker schreibt
    **keinen** Result-Key, sondern löscht seinen eigenen Snapshot aus
    IndexedDB (`batchDeleteSnapshot()`), da kein Helper beteiligt ist.

## Timing-Verträge

| Konstante                          | Wert              | Datei                                                                                                    | Bedeutung                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RESULT_WAIT_TIMEOUT_MS`           | 180 000 ms (180s) | `helper.user.js`                                                                                         | Maximale Wartezeit des Helpers auf einen Result-Wert, bevor `code: 'timeout'` ausgelöst wird                                                                                                                                                                                   |
| `CONFIG.SAVE_WATCHDOG_TIMEOUT_MS`  | 45 000 ms (45s)   | `kleinanzeigen-duplizieren.user.js` (`startSaveWatchdog()` und der Batch-Watchdog in `smartRepublish()`) | Prüft nach dem Klick auf "Anzeige speichern", ob der Tab **noch** auf `p-anzeige-bearbeiten.html` steht. Falls ja, gibt `startSaveWatchdog()` die UI frei und räumt alle drei sessionStorage-Marker ab; der Batch-Watchdog schreibt zusätzlich `error:save_failed:not_deleted` |
| `CONFIG.DELETE_REQUEST_TIMEOUT_MS` | 8 000 ms (8s)     | `kleinanzeigen-duplizieren.user.js` (`deleteAd()`)                                                       | Budget des Lösch-Requests. Der Timer startet **erst nach** der Auflösung des CSRF-Tokens, damit ein langsames Nachladen dieses Budget nicht verbraucht                                                                                                                         |
| `CONFIG.CSRF_FETCH_TIMEOUT_MS`     | 8 000 ms (8s)     | `kleinanzeigen-duplizieren.user.js` (`resolveCsrfToken()`)                                               | Eigenes Budget für das Nachladen des CSRF-Tokens aus "Meine Anzeigen". Ein Abbruch meldet `CSRF-Token nicht ermittelbar (Timeout)`. Die Summe beider Budgets plus `DELETE_WAIT_AFTER_CREATE_MS` (18s) bleibt unter `RESULT_WAIT_TIMEOUT_MS`                                    |
| Polling-Intervall                  | 1 000 ms          | `helper.user.js` (`processOne`)                                                                          | Fallback-Polling auf den Result-Key, redundant zum `storage`-Event                                                                                                                                                                                                             |

## Kompatibilitätsregeln

Diese Regeln gelten für jede künftige Änderung an einem der beiden Scripts:

1. **Fehlercodes nur additiv erweitern.** Bestehende Codes
   (`precondition_failed`, `snapshot_failed`, `save_failed:not_deleted`,
   `exception`, `timeout`, `popup_blocked`) dürfen nicht umbenannt oder in
   ihrer Bedeutung verändert werden. Die Alt-Codes `save_failed:delete_ok`
   und `save_failed:delete_failed` erzeugt der Worker seit 3.10.0 nicht mehr,
   der Helper muss sie aber weiter verstehen — ein Nutzer kann eine ältere
   Worker-Version installiert haben. Neue Codes werden ergänzt, alte bleiben
   gültig.
2. **Unbekannte Codes müssen als Nicht-Datenverlust-Fehler behandelt
   werden.** Der Helper darf einen ihm unbekannten `code` niemals als
   `dataLoss = true` interpretieren, es sei denn, er ist explizit
   `save_failed` mit Sub-Code `delete_ok`. Wird ein neuer datenverlust-
   relevanter Code eingeführt, muss `handleValue()` im Helper explizit
   angepasst werden — es gibt keinen impliziten Mechanismus dafür.
3. **IDB-Schema-Änderungen erfordern einen Versions-Bump beider Scripts.**
   `BATCH_IDB_NAME`/`IDB_NAME`, `BATCH_IDB_VERSION`/`IDB_VERSION` und
   `BATCH_IDB_STORE`/`IDB_STORE` sind in beiden Dateien unabhängig
   definiert und müssen synchron gehalten werden. Jede Änderung an der
   Snapshot-Objektform (neue/entfernte Felder, geänderter `keyPath`)
   erfordert einen `IDB_VERSION`-Bump in **beiden** Scripts sowie eine
   Anpassung der `onupgradeneeded`-Handler.
4. **Konstanten bleiben dupliziert, aber synchron.** Es gibt kein
   gemeinsames Modul; `ka-batch-result-`, `ka-batch`, `snapshots`, `adId`
   usw. sind in beiden Dateien hart kodiert. Bei jeder Änderung eines
   dieser Werte müssen beide Scripts und dieses Dokument gemeinsam
   aktualisiert werden.
5. **Vorgangs-Marker werden lesend abwärtskompatibel behandelt.** Die
   sessionStorage-Marker sind Worker-intern (derselbe Tab, dasselbe Script),
   ein Cross-Version-Fall entsteht nur durch ein Script-Update bei offenem
   Tab. `readVorgangMarker()` muss deshalb weiter jeden Wert akzeptieren, der
   kein gültiges JSON-Objekt mit `v` ist, und ihn als adId ohne Verfallszeit
   behandeln. Ein künftiges Format wird additiv ergänzt: neue Felder ja,
   Wegfall von `v` oder `ts` nein.
