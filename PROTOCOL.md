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

| Hash | Bedeutung | Ausgelöst von |
|---|---|---|
| `#smartRepublish` | Batch-/Smart-Republish-Flow: Snapshot erstellen, Original löschen, neu einstellen | Helper (`processOne`), auch manuell über den "Smart neu einstellen"-Button im Worker |
| `#duplicate` | Reines Duplizieren ohne Löschung, kein Ergebnis-Signal, kein Snapshot | Worker-intern (Button-Klick), nicht vom Helper verwendet |

`isBatchMode()` im Worker prüft exakt `window.location.hash === '#smartRepublish'`.
Nur in diesem Modus werden Snapshot, Result-Key und Watchdog aktiv.

## IndexedDB: `ka-batch`

Beide Scripts öffnen dieselbe Datenbank mit identischer Struktur (Konstanten
sind in beiden Dateien separat hart kodiert, siehe unten):

| Eigenschaft | Wert |
|---|---|
| DB-Name | `ka-batch` |
| DB-Version | `1` |
| Object Store | `snapshots` |
| keyPath | `adId` |

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
    [name: string]: string  // je auf 5000 Zeichen gekappt, keine Passwort-/File-Felder
  },
  images: [
    { url: string, blob: Blob|null, mime: string|null }
    // blob/mime sind null, wenn der Bild-Fetch fehlgeschlagen ist
    // (URL bleibt trotzdem erhalten)
  ]
}
```

- Geschrieben von: `batchPutSnapshot()` im Worker, **vor** dem Löschversuch
  des Originals, nur wenn `isBatchMode()`.
- Gelesen von: Helper (`listSnapshotMeta`, `getSnapshotsAll`) für die
  Recovery-Übersicht und den ZIP-Export.
- Gelöscht von: Helper (`deleteSnapshot`) nach erfolgreichem Verarbeiten
  einer Anzeige (Erfolg **oder** Fehler ohne Datenverlust). Bei erkanntem
  Datenverlust bleibt der Snapshot bewusst erhalten.

## localStorage: Result-Keys

| Eigenschaft | Wert |
|---|---|
| Key-Präfix | `ka-batch-result-` |
| Vollständiger Key | `ka-batch-result-<adId>` |
| Wertformat | `ok` oder `error:<code>[:<detail>]` |

- **Geschrieben von:** ausschließlich der Worker (`batchSetResult`), an drei
  Stellen:
  1. `smartRepublish()` bei Snapshot-Fehlschlag (vor jeder Löschung).
  2. `smartRepublish()`-Catch-Block bei sonstigen Fehlern (Klassifikation
     nach `phase`, siehe unten).
  3. `init()` auf der Bestätigungs-Seite (`p-anzeige-aufgeben-bestaetigung.html`),
     wenn `sessionStorage['ka-batch-original-adid']` gesetzt ist → schreibt `ok`.
- **Gelesen/gelöscht von:** ausschließlich der Helper (`processOne`), über
  zwei parallele Kanäle:
  - `storage`-Event-Listener (`window.addEventListener('storage', ...)`) —
    reagiert nur zuverlässig, wenn der Worker-Tab ein *anderer* Tab als der
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
error:<code>
error:<code>:<detail>
```

`<detail>` ist entweder ein fester Sub-Code (nur bei `save_failed`:
`delete_ok` | `delete_failed`) oder ein freier Fehlertext (bei
`snapshot_failed`, `exception`). Der Helper parst nur das erste Segment
nach `error:` als `code` (`raw.slice(6).split(':')[0]`) — zusätzliche
Doppelpunkte im Freitext brechen das Parsing nicht.

## Fehlercodes

Vom Worker über localStorage geschrieben:

| Code | Bedeutung | Auslöser |
|---|---|---|
| `snapshot_failed` | Snapshot-Erstellung fehlgeschlagen, **vor** jeder Löschung abgebrochen | Fehler in `buildSnapshot()`/`batchPutSnapshot()` |
| `save_failed:delete_ok` | Speichern der neuen Anzeige fehlgeschlagen, **Original wurde bereits gelöscht** → Datenverlust | Exception nach `phase === 'delete_ok'` oder `'save_clicked'`; oder Watchdog nach 45s, wenn Original erfolgreich gelöscht wurde |
| `save_failed:delete_failed` | Speichern fehlgeschlagen, Original-Löschung war bereits fehlgeschlagen → kein zusätzlicher Datenverlust | Exception nach `phase === 'delete_failed'`; oder Watchdog nach 45s, wenn die Löschung fehlschlug |
| `exception:<message>` | Sonstiger, nicht genauer klassifizierter Fehler vor der Löschung (`phase === 'init'` oder `'snapshot_done'`) | Allgemeiner Catch-Block in `smartRepublish()` |

Ausschließlich Helper-intern erzeugt (**nicht** über localStorage
übertragen, sondern direkt als `code` im Promise-Ergebnis von `processOne`):

| Code | Bedeutung |
|---|---|
| `timeout` | Kein Result-Wert innerhalb von `RESULT_WAIT_TIMEOUT_MS` (180s) empfangen |
| `popup_blocked` | Weder `GM_openInTab` noch `window.open` konnten einen Tab öffnen |

## Datenverlust-Semantik (`handleValue` im Helper)

`dataLoss` wird **ausschließlich** dann `true` gesetzt, wenn
`code === 'save_failed'` **und** der Sub-Code exakt `delete_ok` ist:

```js
let dataLoss = false;
if (code === 'save_failed') {
    const sub = tail.split(':')[1] || '';
    dataLoss = (sub === 'delete_ok');
}
```

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

## sessionStorage: `ka-batch-original-adid`

Rein Worker-intern, überbrückt die Navigation von der Bearbeiten-Seite zur
Bestätigungs-Seite (kein Zugriff durch den Helper):

- Geschrieben in `smartRepublish()` unmittelbar vor dem Klick auf
  "Anzeige speichern", nur wenn `batchMode`.
- Gelesen und sofort entfernt in `init()` auf
  `p-anzeige-aufgeben-bestaetigung.html*`. Ist der Wert vorhanden, schreibt
  der Worker `ok` in den zugehörigen localStorage-Result-Key.

## Timing-Verträge

| Konstante | Wert | Datei | Bedeutung |
|---|---|---|---|
| `RESULT_WAIT_TIMEOUT_MS` | 180 000 ms (180s) | `helper.user.js` | Maximale Wartezeit des Helpers auf einen Result-Wert, bevor `code: 'timeout'` ausgelöst wird |
| Watchdog-Delay | 45 000 ms (45s) | `kleinanzeigen-duplizieren.user.js` (`smartRepublish`) | Prüft nach dem Klick auf "Anzeige speichern", ob der Tab **noch** auf `p-anzeige-bearbeiten.html` steht; falls ja, schreibt er `error:save_failed:<sub>` (siehe Fehlercode-Tabelle) |
| Polling-Intervall | 1 000 ms | `helper.user.js` (`processOne`) | Fallback-Polling auf den Result-Key, redundant zum `storage`-Event |

## Kompatibilitätsregeln

Diese Regeln gelten für jede künftige Änderung an einem der beiden Scripts:

1. **Fehlercodes nur additiv erweitern.** Bestehende Codes (`snapshot_failed`,
   `save_failed:delete_ok`, `save_failed:delete_failed`, `exception`,
   `timeout`, `popup_blocked`) dürfen nicht umbenannt oder in ihrer
   Bedeutung verändert werden. Neue Codes werden ergänzt, alte bleiben
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
