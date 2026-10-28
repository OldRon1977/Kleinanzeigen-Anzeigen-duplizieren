# Protokoll zwischen Hauptscript und Helper

Vertrag zwischen dem Worker (`kleinanzeigen-duplizieren.user.js`) und dem Orchestrator (`helper.user.js`). Beide implementieren ihn unabhängig, ohne gemeinsames Modul. Jede Änderung muss in beiden Scripts und hier nachgezogen werden. Bei Abweichung gilt der Code.

| Script | Läuft auf |
| --- | --- |
| Worker | `p-anzeige-bearbeiten.html*`, `p-anzeige-aufgeben-bestaetigung.html*`; mit Auftrag `#kaRestore=` auch `p-anzeige-aufgeben.html*` und `p-anzeige-aufgeben-schritt2.html*` |
| Helper | `m-meine-anzeigen.html*` |

## Auslöser: URL-Hashes

Der Helper öffnet Worker-Tabs per `GM_openInTab`, ersatzweise `window.open`.

| Hash | Bedeutung | Ausgelöst von |
| --- | --- | --- |
| `#smartRepublish` | Snapshot erstellen, neue Anzeige anlegen, Original auf der Bestätigungsseite löschen | Helper (`processOne`); der Toolbar-Button ruft `smartRepublish()` direkt auf |
| `#duplicate` | Duplizieren ohne Löschung und ohne Snapshot | Helper (`openDuplicate`); der Toolbar-Button ruft `duplicateAd()` direkt auf |
| `#kaRestore=<adId>` | Formular "Anzeige aufgeben" aus Snapshot `<adId>` befüllen, nichts absenden. Nur Ziffern gelten als adId | Helper (`openRestore`): mit `categoryId` `p-anzeige-aufgeben-schritt2.html?categoryId=<id>`, sonst `p-anzeige-aufgeben.html` |

`isBatchMode()` prüft exakt `location.hash === '#smartRepublish'`. Nur dann sind Result-Key und Batch-Watchdog aktiv. Der Snapshot entsteht in beiden Modi.

## IndexedDB `ka-batch`

| Eigenschaft | Wert |
| --- | --- |
| DB-Name | `ka-batch` |
| Version | `1` |
| Store | `snapshots` |
| keyPath | `adId` |

### Snapshot-Objekt

```
{
  adId: string,
  capturedAt: number,          // Date.now()
  title: string,
  fields: { title?, description?, price?, priceType?, location? },
                               // price aus "priceAmount" oder "price"
  rawFields: { [name]: string },    // sichtbare input/textarea/select, je max. 5000 Zeichen;
                                    // ohne Passwort-, Datei- und Hidden-Felder, ohne "_csrf",
                                    // ohne nicht angehakte Checkboxen/Radios, ohne leere Werte
  hiddenFields: { [name]: string }, // Hidden-Felder, je max. 500 Zeichen; ohne adImages[n].url;
                                    // kann fehlen oder leer sein (alte Snapshots, Import ohne Angabe)
  images: [ { url: string, blob: Blob|null, mime: string|null } ]
                               // Reihenfolge = adImages[n]; blob null, wenn der Download scheiterte
}
```

Feldnamen nach `csrf|xsrf|token|jwt|session|captcha|secret|password|auth` werden nie gespeichert, in keiner Feldart.

**Geschrieben**
- Worker `batchPutSnapshot()` vor dem Speichern der neuen Anzeige, in beiden Modi.
- Helper `importBackupZip()` aus einer Recovery- oder Sicherungs-ZIP: `capturedAt` aus dem ISO-String, Bilder ohne Datei als `{ url, blob: null, mime: null }`. Per `add`: Ein vorhandener Snapshot derselben `adId` bleibt unverändert, der Import meldet ihn in `kept`.

**Gelesen**
- Helper `listSnapshotMeta()` (zusätzlich `categoryId` aus `hiddenFields`), `getSnapshotsAll()` für Recovery-Kasten und ZIP-Export.
- Worker `batchGetSnapshot()` beim Wiederherstellen.

**Gelöscht**
- Batch: Helper `deleteSnapshot()` nach Erfolg oder Fehler ohne Datenverlust. Bei Datenverlust bleibt er.
- Manuell: Worker `batchDeleteSnapshot()` auf der Bestätigungsseite (`ka-manual-mode` gesetzt).
- Wiederherstellung: Worker auf der Bestätigungsseite, wenn `ka-restore-pending-adid` gilt; danach `ka-restore-result-<adId>` = `ok`.

## sessionStorage (Worker-intern)

Format für alle Marker außer `ka-manual-mode` und `ka-duplicate-adid`:

```
{"v":"<adId>","ts":<Date.now()>}
```

`readVorgangMarker(key, maxAgeMs)` liefert `null`, wenn `ts` älter als `maxAgeMs` ist (Standard `CONFIG.MARKER_MAX_AGE_MS`). Ein Wert ohne JSON-Form (reiner String, kaputtes JSON) gilt als adId ohne Verfall.

| Schlüssel | Gesetzt von | Bedeutung | Verfall |
| --- | --- | --- | --- |
| `ka-batch-original-adid` | `smartRepublish()` vor dem Speichern | adId, an die die Bestätigungsseite das Ergebnis meldet | 10 min |
| `ka-delete-after-create` | `smartRepublish()` | Auftrag, dieses Original nach bestätigter Neuanlage zu löschen. Fehlt er, wird nichts gelöscht | 10 min |
| `ka-manual-mode` | `smartRepublish()` ohne Batch | `'1'`: Bestätigungsseite löscht den eigenen Snapshot statt einen Result-Key zu schreiben | – |
| `ka-duplicate-adid` | `duplicateAd()` | Bestätigungsseite schreibt `ka-duplicate-result-<adId>` | – |
| `ka-restore-adid` | `handleRestorePages()` | Auftrag, das Formular aus Snapshot `<adId>` zu befüllen; trägt den Auftrag über die Kategoriewahl. Entfernt nach dem Befüllen oder wenn kein Snapshot existiert | 10 min |
| `ka-restore-pending-adid` | `restoreFromSnapshot()` nach dem Befüllen | Bestätigungsseite löscht den Snapshot und schreibt `ka-restore-result-<adId>`. Schritt 1 ohne Auftrag entfernt ihn | 30 min |

Entfernt werden `ka-batch-original-adid`, `ka-manual-mode` und `ka-delete-after-create`
- in `handleConfirmationPage()` vor jeder Aktion (ein Reload löscht nicht zweimal),
- durch `startSaveWatchdog()`, wenn der Tab nach `SAVE_WATCHDOG_TIMEOUT_MS` noch auf der Bearbeiten-Seite steht,
- im Catch-Block von `smartRepublish()`.

## localStorage

| Schlüssel | Schreibt / liest | Wert |
| --- | --- | --- |
| `ka-batch-result-<adId>` | Worker / Helper `processOne` | siehe Result-Werte |
| `ka-duplicate-result-<adId>` | Worker / Helper `openDuplicate` | `ok` |
| `ka-restore-result-<adId>` | Worker / Helper `openRestore` | `ok`. Der Helper schließt dabei keinen Tab |
| `ka-batch-delay` | Helper | Pause `{min,max}` in Minuten; unbrauchbar oder fehlend → 3 bis 6 |

Der Helper liest Result-Keys über das `storage`-Event und zusätzlich per 1-Sekunden-Polling. Er entfernt den Key vor dem Öffnen des Tabs und nach der Auswertung. Der Worker entfernt `ka-batch-result-<adId>` vor dem Snapshot.

### Result-Werte (`ka-batch-result-<adId>`)

```
ok
ok:<hinweis>
error:<code>
error:<code>:<detail>
```

Der Helper liest den Code als `raw.slice(6).split(':')[0]`; Doppelpunkte im Detail stören nicht.

| Wert | Bedeutung | Auslöser im Worker |
| --- | --- | --- |
| `ok` | Neue Anzeige angelegt, Original gelöscht | `handleConfirmationPage()` |
| `ok:delete_failed` | Neue Anzeige angelegt, Original steht noch (Duplikat online) | `handleConfirmationPage()` |
| `error:precondition_failed:<sub>` | Speichern-Button (`save_button_missing`) oder adId-Feld (`adid_input_missing`) fehlt. Nichts geändert | Preflight in `smartRepublish()` |
| `error:snapshot_failed:<text>` | Snapshot gescheitert, nichts gespeichert | `buildSnapshot()`/`batchPutSnapshot()` |
| `error:save_failed:not_deleted` | Neue Anzeige nicht angelegt, Original steht | Referenzen nicht auflösbar; Batch-Watchdog; Fehler nach `phase === 'save_clicked'` |
| `error:exception:<message>` | Sonstiger Fehler vor dem Speichern (`phase` `init` oder `snapshot_done`) | Catch-Block |

Nur im Helper erzeugt, nicht über localStorage: `timeout` (kein Wert innerhalb `RESULT_WAIT_TIMEOUT_MS`), `popup_blocked` (kein Tab zu öffnen).

Der Helper versteht außerdem `error:save_failed:delete_ok` und `error:save_failed:delete_failed`, die der aktuelle Worker nicht erzeugt. Ein installierter älterer Worker kann sie noch schreiben.

### Datenverlust (`handleValue` im Helper)

`dataLoss` ist nur bei `code === 'save_failed'` mit Sub-Code `delete_ok` wahr. Dann setzt `runBatch()` `autoStopped`, bricht ab, behält den Snapshot und lässt den Worker-Tab offen (`keepTab`). Jeder andere, auch unbekannte Code gilt als Fehler ohne Datenverlust: Snapshot wird gelöscht, kein Auto-Stop. Ein neuer Code mit Datenverlust muss in `handleValue()` ausdrücklich ergänzt werden.

## Ablauf Neu-Einstellen

1. `smartRepublish()`: Preflight, Snapshot, `adId`-Feld neutralisieren, Marker setzen, Speichern klicken. Das Original bleibt.
2. Bestätigungsseite erreicht = neue Anzeige existiert. `handleConfirmationPage()` entfernt die Marker, wartet `DELETE_WAIT_AFTER_CREATE_MS`, löscht das Original (`deleteAd`) und schreibt `ok` bzw. `ok:delete_failed`.
3. Kein Erreichen der Bestätigungsseite → nichts gelöscht.

## Zwischenspeicher der Anzeigenliste (Helper)

`collectCandidatesResilient()` wird 90 s in einer Modulvariablen gehalten, nicht in `localStorage`. `invalidateAdListCache()` am Ende von `runBatch()`, nach erfolgreichem `openSmartRepublish()`, `openDuplicate()` und `openRestore()`. Die DOM-Rückfallebene wird nicht zwischengespeichert.

## Zeiten

| Konstante | Wert | Datei | Bedeutung |
| --- | --- | --- | --- |
| `RESULT_WAIT_TIMEOUT_MS` | 180 s | Helper | Wartezeit auf `ka-batch-result-`, danach `timeout` |
| `CONFIG.SAVE_WATCHDOG_TIMEOUT_MS` | 45 s | Worker | Tab nach Speichern-Klick noch auf der Bearbeiten-Seite → UI frei, Marker weg; im Batch `error:save_failed:not_deleted` |
| `CONFIG.CSRF_FETCH_TIMEOUT_MS` | 8 s | Worker | Nachladen des CSRF-Tokens; Abbruch meldet "CSRF-Token nicht ermittelbar (Timeout)" |
| `CONFIG.DELETE_REQUEST_TIMEOUT_MS` | 8 s | Worker | Lösch-Request; startet erst nach dem Token |
| `CONFIG.DELETE_WAIT_AFTER_CREATE_MS` | 2 s | Worker | Pause vor dem Löschen. 8 + 8 + 2 s bleiben unter `RESULT_WAIT_TIMEOUT_MS` |
| `CONFIG.MARKER_MAX_AGE_MS` | 10 min | Worker | Verfall der Marker außer `ka-restore-pending-adid` |
| `CONFIG.RESTORE_PENDING_MAX_AGE_MS` | 30 min | Worker | Verfall von `ka-restore-pending-adid`; muss gleich `RESTORE_WAIT_TIMEOUT_MS` sein |
| `RESTORE_WAIT_TIMEOUT_MS` | 30 min | Helper | Wartezeit auf `ka-restore-result-`; danach wird nur der Knopf freigegeben |
| Polling | 1 s | Helper | zusätzlich zum `storage`-Event |

## Regeln für Änderungen

1. Fehlercodes nur ergänzen, nie umbenennen oder umdeuten. Der Helper muss alle oben genannten Codes weiter verstehen.
2. Unbekannte Codes sind nie Datenverlust (siehe `handleValue`).
3. Änderung an Snapshot-Form, DB-Name, Store oder `keyPath` → `IDB_VERSION`/`BATCH_IDB_VERSION` in beiden Scripts erhöhen und `onupgradeneeded` anpassen.
4. Doppelt definierte Konstanten synchron halten: `ka-batch`, `snapshots`, `adId`, `ka-batch-result-`, `ka-duplicate-result-`, `#kaRestore=`, `ka-restore-result-`, `RESTORE_PENDING_MAX_AGE_MS` = `RESTORE_WAIT_TIMEOUT_MS`.
5. `readVorgangMarker()` muss Werte ohne JSON-Form weiter als adId ohne Verfall akzeptieren. Neue Marker-Felder nur ergänzen; `v` und `ts` bleiben.
