// ==UserScript==
// @name          eBay Kleinanzeigen - neu einstellen helper
// @namespace     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @description   Hilfsskript fuer Smart Neu-Einstellen direkt aus "Meine Anzeigen", inkl. Batch-Modus und Recovery-Snapshot
// @icon          https://www.kleinanzeigen.de/favicon.ico
// @copyright     2026
// @license       MIT
// @version       1.3.1
// @author        panzli (Original), OldRon1977 (Anpassungen)
// @match         https://www.kleinanzeigen.de/m-meine-anzeigen.html*
// @match         https://kleinanzeigen.de/m-meine-anzeigen.html*
// @homepage      https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @updateURL     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js
// @downloadURL   https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js
// @run-at        document-idle
// @grant         GM_openInTab
// ==/UserScript==

(function () {
    'use strict';

    // === KONSTANTEN ===
    // Default Anzeigenlaufzeit auf Kleinanzeigen = 60 Tage. Eine Anzeige gilt
    // als "aelter als 7 Tage", wenn das Enddatum hoechstens (60 - 7) = 53 Tage
    // in der Zukunft liegt.
    const MIN_DAYS_TO_END = 53;

    // Jitter-Delay zwischen zwei Smart-Republish-Vorgaengen: 3 +- 1 Minuten.
    const DELAY_BASE_MS = 3 * 60 * 1000;
    const DELAY_JITTER_MS = 1 * 60 * 1000;

    // Maximaler Wartepuffer auf das Result-Signal aus dem Worker-Tab.
    // Nach Saving kann Bilder-Verarbeitung lange dauern; 180s ist grosszuegig.
    const RESULT_WAIT_TIMEOUT_MS = 180 * 1000;

    // localStorage-Schluessel
    const LS_RESULT_PREFIX = 'ka-batch-result-';

    // IndexedDB
    const IDB_NAME = 'ka-batch';
    const IDB_VERSION = 1;
    const IDB_STORE = 'snapshots';

    const MARKER = 'data-ka-smart-helper';
    const TRIGGER_BTN_ID = 'ka-batch-trigger';
    const OVERLAY_ID = 'ka-batch-overlay';

    const log = (msg, data) => console.log('[KA-Helper] ' + msg, data || '');
    const warn = (msg, data) => console.warn('[KA-Helper] ' + msg, data || '');

    // === INDEXEDDB-WRAPPER ===
    function openIDB() {
        return new Promise(function (resolve, reject) {
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = function () {
                const db = req.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'adId' });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }
    async function listSnapshotMeta() {
        const db = await openIDB();
        return new Promise(function (resolve, reject) {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const store = tx.objectStore(IDB_STORE);
            const req = store.getAll();
            req.onsuccess = function () {
                const all = req.result || [];
                const meta = all.map(function (s) {
                    return {
                        adId: s.adId,
                        title: s.title || '(ohne Titel)',
                        capturedAt: s.capturedAt,
                        imageCount: (s.images || []).length
                    };
                });
                resolve(meta);
            };
            req.onerror = function () { reject(req.error); };
        });
    }
    async function getSnapshotsAll() {
        const db = await openIDB();
        return new Promise(function (resolve, reject) {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const store = tx.objectStore(IDB_STORE);
            const req = store.getAll();
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
    }
    async function deleteSnapshot(adId) {
        const db = await openIDB();
        return new Promise(function (resolve, reject) {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            const req = store.delete(adId);
            req.onsuccess = function () { resolve(); };
            req.onerror = function () { reject(req.error); };
        });
    }
    async function clearAllSnapshots() {
        const db = await openIDB();
        return new Promise(function (resolve, reject) {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            const req = store.clear();
            req.onsuccess = function () { resolve(); };
            req.onerror = function () { reject(req.error); };
        });
    }

    // === ZIP (STORE-only, kein Fremdcode) ===
    let CRC_TABLE = null;
    function makeCrcTable() {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            t[n] = c >>> 0;
        }
        return t;
    }
    function crc32(uint8) {
        if (!CRC_TABLE) CRC_TABLE = makeCrcTable();
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < uint8.length; i++) {
            crc = (CRC_TABLE[(crc ^ uint8[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function utf8(str) { return new TextEncoder().encode(str); }
    function dosTime(date) {
        const t = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() / 2) & 0x1F);
        const d = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
        return { t: t & 0xFFFF, d: d & 0xFFFF };
    }
    /**
     * files: [{ name: string, data: Uint8Array }]
     * Returns Blob (application/zip)
     */
    async function buildZip(files) {
        const now = new Date();
        const dt = dosTime(now);
        const localParts = [];
        const centralParts = [];
        let offset = 0;

        for (const f of files) {
            const nameBytes = utf8(f.name);
            const crc = crc32(f.data);
            const size = f.data.length;

            // Local file header
            const lfh = new Uint8Array(30 + nameBytes.length);
            const dv = new DataView(lfh.buffer);
            dv.setUint32(0, 0x04034b50, true);  // signature
            dv.setUint16(4, 20, true);           // version
            dv.setUint16(6, 0x0800, true);       // flags (UTF-8)
            dv.setUint16(8, 0, true);            // compression: STORE
            dv.setUint16(10, dt.t, true);
            dv.setUint16(12, dt.d, true);
            dv.setUint32(14, crc, true);
            dv.setUint32(18, size, true);
            dv.setUint32(22, size, true);
            dv.setUint16(26, nameBytes.length, true);
            dv.setUint16(28, 0, true);
            lfh.set(nameBytes, 30);

            localParts.push(lfh);
            localParts.push(f.data);

            // Central directory entry
            const cdh = new Uint8Array(46 + nameBytes.length);
            const cdv = new DataView(cdh.buffer);
            cdv.setUint32(0, 0x02014b50, true);
            cdv.setUint16(4, 20, true);
            cdv.setUint16(6, 20, true);
            cdv.setUint16(8, 0x0800, true);
            cdv.setUint16(10, 0, true);
            cdv.setUint16(12, dt.t, true);
            cdv.setUint16(14, dt.d, true);
            cdv.setUint32(16, crc, true);
            cdv.setUint32(20, size, true);
            cdv.setUint32(24, size, true);
            cdv.setUint16(28, nameBytes.length, true);
            cdv.setUint16(30, 0, true);
            cdv.setUint16(32, 0, true);
            cdv.setUint16(34, 0, true);
            cdv.setUint16(36, 0, true);
            cdv.setUint32(38, 0, true);
            cdv.setUint32(42, offset, true);
            cdh.set(nameBytes, 46);
            centralParts.push(cdh);

            offset += lfh.length + size;
        }

        // Central dir size + offset
        let cdSize = 0;
        for (const p of centralParts) cdSize += p.length;
        const cdOffset = offset;

        // EOCD
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(4, 0, true);
        ev.setUint16(6, 0, true);
        ev.setUint16(8, files.length, true);
        ev.setUint16(10, files.length, true);
        ev.setUint32(12, cdSize, true);
        ev.setUint32(16, cdOffset, true);
        ev.setUint16(20, 0, true);

        return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
    }

    function sanitize(str) {
        return String(str || '').replace(/[\\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 60);
    }

    async function downloadRecoveryZip() {
        const snaps = await getSnapshotsAll();
        if (!snaps.length) return;
        const files = [];
        for (const s of snaps) {
            const folder = s.adId + '-' + sanitize(s.title || 'untitled') + '/';
            const meta = {
                adId: s.adId,
                capturedAt: new Date(s.capturedAt || Date.now()).toISOString(),
                title: s.title,
                fields: s.fields || {},
                rawFields: s.rawFields || {},
                imageUrls: (s.images || []).map(function (i) { return i.url; })
            };
            files.push({ name: folder + 'data.json', data: utf8(JSON.stringify(meta, null, 2)) });
            const imgs = s.images || [];
            for (let i = 0; i < imgs.length; i++) {
                const img = imgs[i];
                if (!img.blob) continue;
                const buf = new Uint8Array(await img.blob.arrayBuffer());
                const ext = (img.mime && img.mime.indexOf('png') >= 0) ? 'png' : 'jpg';
                const idx = String(i + 1).padStart(2, '0');
                files.push({ name: folder + 'image_' + idx + '.' + ext, data: buf });
            }
        }
        const zip = await buildZip(files);
        const url = URL.createObjectURL(zip);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = 'ka-recovery-' + ts + '.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    // === EINZEL-BUTTON PRO ANZEIGE ===
    function addControlButtons() {
        const elements = document.querySelectorAll('a[href*="/p-anzeige-bearbeiten.html?adId="]');
        elements.forEach(function (element) {
            if (element.hasAttribute(MARKER)) return;
            element.setAttribute(MARKER, 'true');

            const match = element.getAttribute('href').match(/adId=([^&]*)/);
            if (!match || !match[1]) return;
            const adId = match[1];

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '\uD83D\uDD04 Smart neu einstellen';
            btn.title = 'Löscht Original und erstellt neue Anzeige';
            btn.style.cssText = 'margin-left:8px;padding:4px 10px;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;font-size:12px;vertical-align:middle;display:inline-flex;align-items:center;';

            btn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                openSmartRepublish(adId, btn);
            };

            element.after(btn);
        });
    }

    function openSmartRepublish(adId, button) {
        button.disabled = true;
        button.style.color = '#888';
        button.textContent = '\u23F3 Laeuft \u2026';
        processOne({ adId: adId, title: '' }).then(function (res) {
            if (res.ok) {
                button.style.color = '#27ae60';
                button.textContent = '\u2705 Fertig';
                deleteSnapshot(adId).catch(function () {});
            } else {
                button.style.color = '#e74c3c';
                button.textContent = '\u274C ' + (res.code || 'Fehler');
                button.title = res.error || 'unbekannter Fehler';
                button.disabled = false;
            }
        }, function (err) {
            warn('Single-Republish unerwartet abgebrochen', err);
            button.style.color = '#e74c3c';
            button.textContent = '\u274C Abbruch';
            button.disabled = false;
        });
    }

    // === GLOBALER BATCH-TRIGGER-BUTTON ===
    function addBatchTriggerButton() {
        if (document.getElementById(TRIGGER_BTN_ID)) return;

        const list = document.querySelector('#my-manageitems-adlist');
        if (!list) return;

        const btn = document.createElement('button');
        btn.id = TRIGGER_BTN_ID;
        btn.type = 'button';
        btn.textContent = '\u23F0 Alle alten neu einstellen';
        btn.title = 'Stellt alle Anzeigen älter als 7 Tage nacheinander mit Zeitabstand neu ein';
        btn.style.cssText = [
            'margin: 0 0 12px 0',
            'padding: 8px 16px',
            'cursor: pointer',
            'border: 1px solid #007bff',
            'border-radius: 6px',
            'background: #007bff',
            'color: #fff',
            'font-size: 13px',
            'font-weight: 600'
        ].join(';');

        btn.onclick = function () {
            startBatchFlow();
        };

        list.parentElement.insertBefore(btn, list);
    }

    // === KARTEN AUSWAEHLEN ===
    function parseEndDate(dateStr) {
        const m = (dateStr || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (!m) return null;
        const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
        return isNaN(d.getTime()) ? null : d;
    }

    function daysUntil(date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayMs = 24 * 60 * 60 * 1000;
        return Math.round((date.getTime() - today.getTime()) / dayMs);
    }

    function collectCandidates() {
        const cards = document.querySelectorAll('li[data-testid="ad-card"][data-adid]');
        const matches = [];
        const skipped = [];

        cards.forEach(function (card) {
            const adId = card.getAttribute('data-adid');
            const titleEl = card.querySelector('h3 a');
            const title = titleEl ? titleEl.textContent.trim() : '(ohne Titel)';
            const endEl = card.querySelector('.managead-listitem-enddate');
            const endText = endEl ? endEl.textContent.trim() : '';
            const endDate = parseEndDate(endText);

            if (!adId || !endDate) {
                skipped.push({ adId: adId, title: title, reason: 'kein Datum' });
                return;
            }

            const days = daysUntil(endDate);
            if (days <= MIN_DAYS_TO_END) {
                matches.push({ adId: adId, title: title, endText: endText, daysLeft: days });
            }
        });

        return { matches: matches, skipped: skipped };
    }

    // === OVERLAY ===
    function ensureOverlay() {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.cssText = [
            'position: fixed', 'top: 20px', 'right: 20px',
            'width: 380px', 'max-height: 80vh', 'overflow-y: auto',
            'background: #fff', 'border: 1px solid #d0d0d0',
            'border-radius: 8px', 'box-shadow: 0 6px 24px rgba(0,0,0,0.18)',
            'z-index: 100000', 'font-family: system-ui, sans-serif',
            'font-size: 13px', 'color: #222'
        ].join(';');
        document.body.appendChild(overlay);
        return overlay;
    }

    function closeOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.remove();
    }

    function makeButton(label, primary) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = primary
            ? 'padding:6px 14px;border:1px solid #007bff;border-radius:4px;background:#007bff;color:#fff;cursor:pointer;font-weight:600;'
            : 'padding:6px 14px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;cursor:pointer;';
        return b;
    }

    async function appendRecoverySection(parent, snapsMeta) {
        if (!snapsMeta.length) return;
        const sec = document.createElement('div');
        sec.style.cssText = 'padding:10px 14px;border-top:1px solid #eee;background:#fff7e6;';
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:600;color:#a06200;margin-bottom:6px;';
        title.textContent = '\u26A0 ' + snapsMeta.length + ' Recovery-Snapshot(s) verfügbar';
        sec.appendChild(title);

        const ul = document.createElement('ul');
        ul.style.cssText = 'margin:4px 0 8px 18px;font-size:12px;color:#555;';
        snapsMeta.forEach(function (s) {
            const li = document.createElement('li');
            const dt = new Date(s.capturedAt || Date.now());
            li.textContent = (s.title || '(ohne Titel)') + ' (ID ' + s.adId + ', ' + s.imageCount + ' Bilder, ' + dt.toLocaleString() + ')';
            ul.appendChild(li);
        });
        sec.appendChild(ul);

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;';
        const dl = makeButton('Als ZIP herunterladen', true);
        dl.onclick = async function () {
            dl.disabled = true;
            dl.textContent = 'Erzeuge ZIP \u2026';
            try {
                await downloadRecoveryZip();
                dl.textContent = '\u2713 ZIP heruntergeladen';
            } catch (e) {
                warn('ZIP-Download fehlgeschlagen', e);
                dl.textContent = 'Fehler';
            }
        };
        const clr = makeButton('Alle löschen', false);
        clr.onclick = async function () {
            if (!confirm('Alle ' + snapsMeta.length + ' Snapshots wirklich löschen?')) return;
            await clearAllSnapshots();
            sec.remove();
        };
        row.appendChild(dl);
        row.appendChild(clr);
        sec.appendChild(row);

        parent.appendChild(sec);
    }

    async function renderConfirm(matches, skipped, onStart) {
        const overlay = ensureOverlay();
        const totalMs = matches.length * (DELAY_BASE_MS);
        const minutes = Math.round(totalMs / 60000);

        overlay.innerHTML = '';

        const header = document.createElement('div');
        header.style.cssText = 'padding:12px 14px;border-bottom:1px solid #eee;font-weight:600;display:flex;justify-content:space-between;align-items:center;';
        const title = document.createElement('span');
        title.textContent = 'Batch Smart Neu-Einstellen';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '\u2715';
        closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:16px;color:#888;';
        closeBtn.onclick = closeOverlay;
        header.appendChild(closeBtn);
        overlay.appendChild(header);

        const summary = document.createElement('div');
        summary.style.cssText = 'padding:10px 14px;border-bottom:1px solid #eee;';
        if (matches.length === 0) {
            summary.textContent = 'Keine Anzeigen älter als 7 Tage gefunden.';
            overlay.appendChild(summary);
            // Trotzdem Recovery-Section anzeigen, falls Snapshots da sind
            try {
                const meta = await listSnapshotMeta();
                await appendRecoverySection(overlay, meta);
            } catch (e) { warn('Recovery-Listing fehlgeschlagen', e); }
            return;
        }
        const line1 = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = matches.length;
        line1.appendChild(strong);
        line1.appendChild(document.createTextNode(' Anzeige(n) werden bearbeitet.'));
        summary.appendChild(line1);
        const line2 = document.createElement('div');
        line2.style.cssText = 'color:#666;margin-top:4px;';
        line2.textContent = 'Geschätzte Laufzeit: ca. ' + minutes + ' Minuten (3 ± 1 min Pause pro Anzeige).';
        summary.appendChild(line2);
        overlay.appendChild(summary);

        const list = document.createElement('ol');
        list.style.cssText = 'margin:0;padding:8px 14px 8px 32px;max-height:240px;overflow-y:auto;';
        matches.forEach(function (m) {
            const li = document.createElement('li');
            li.style.cssText = 'margin:4px 0;line-height:1.3;';
            const t = document.createElement('div');
            t.style.cssText = 'font-weight:500;';
            t.textContent = m.title;
            const meta = document.createElement('div');
            meta.style.cssText = 'color:#666;font-size:12px;';
            meta.textContent = 'ID ' + m.adId + ' \u00B7 endet ' + m.endText + ' (' + m.daysLeft + ' Tage)';
            li.appendChild(t);
            li.appendChild(meta);
            list.appendChild(li);
        });
        overlay.appendChild(list);

        if (skipped.length > 0) {
            const sk = document.createElement('div');
            sk.style.cssText = 'padding:8px 14px;color:#888;font-size:12px;border-top:1px solid #eee;';
            sk.textContent = skipped.length + ' Karte(n) ohne Datum übersprungen.';
            overlay.appendChild(sk);
        }

        // Recovery-Section vor dem Action-Footer
        try {
            const meta = await listSnapshotMeta();
            await appendRecoverySection(overlay, meta);
        } catch (e) { warn('Recovery-Listing fehlgeschlagen', e); }

        const actions = document.createElement('div');
        actions.style.cssText = 'padding:10px 14px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;';
        const cancel = makeButton('Abbrechen', false);
        cancel.onclick = closeOverlay;
        const start = makeButton('Start', true);
        start.onclick = function () { onStart(matches); };
        actions.appendChild(cancel);
        actions.appendChild(start);
        overlay.appendChild(actions);
    }

    function renderProgress(state, onStop) {
        const overlay = ensureOverlay();
        overlay.innerHTML = '';

        const header = document.createElement('div');
        header.style.cssText = 'padding:12px 14px;border-bottom:1px solid #eee;font-weight:600;';
        header.textContent = 'Batch läuft \u2026';
        overlay.appendChild(header);

        const status = document.createElement('div');
        status.style.cssText = 'padding:10px 14px;line-height:1.4;';
        const idx = state.processed.length + state.failed.length;
        const total = state.queue.length + idx;

        const main = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = idx + ' / ' + total;
        main.appendChild(strong);
        main.appendChild(document.createTextNode(' Anzeigen verarbeitet.'));
        status.appendChild(main);

        const cur = document.createElement('div');
        cur.style.cssText = 'color:#666;margin-top:4px;';
        cur.textContent = 'Aktuell: ' + (state.currentLabel || '\u2013');
        status.appendChild(cur);

        if (state.nextEtaText) {
            const eta = document.createElement('div');
            eta.style.cssText = 'color:#666;margin-top:4px;';
            eta.textContent = 'Nächste in: ' + state.nextEtaText;
            status.appendChild(eta);
        }

        const ok = document.createElement('div');
        ok.style.cssText = 'color:#27ae60;margin-top:6px;';
        ok.textContent = 'OK: ' + state.processed.length;
        status.appendChild(ok);

        const fail = document.createElement('div');
        fail.style.cssText = 'color:#e74c3c;';
        fail.textContent = 'Fehler: ' + state.failed.length;
        status.appendChild(fail);

        overlay.appendChild(status);

        const actions = document.createElement('div');
        actions.style.cssText = 'padding:10px 14px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;';
        const stop = makeButton('Stop', false);
        stop.style.borderColor = '#e74c3c';
        stop.style.color = '#e74c3c';
        stop.style.background = '#fff';
        stop.style.fontWeight = '600';
        stop.onclick = onStop;
        actions.appendChild(stop);
        overlay.appendChild(actions);
    }

    async function renderDone(state) {
        const overlay = ensureOverlay();
        overlay.innerHTML = '';

        const header = document.createElement('div');
        header.style.cssText = 'padding:12px 14px;border-bottom:1px solid #eee;font-weight:600;';
        if (state.autoStopped) {
            header.textContent = '\u26A0 Batch automatisch gestoppt';
            header.style.color = '#a06200';
        } else if (state.aborted) {
            header.textContent = 'Batch abgebrochen';
        } else {
            header.textContent = 'Batch abgeschlossen';
        }
        overlay.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'padding:10px 14px;line-height:1.5;';

        if (state.autoStopped) {
            const note = document.createElement('div');
            note.style.cssText = 'background:#fff7e6;border:1px solid #ffd591;padding:8px;border-radius:4px;margin-bottom:8px;color:#a06200;font-size:12px;';
            note.textContent = 'Möglicher Datenverlust erkannt. Prüfe die Recovery-Snapshots unten.';
            body.appendChild(note);
        }

        const okLine = document.createElement('div');
        okLine.appendChild(document.createTextNode('OK: '));
        const okStrong = document.createElement('strong');
        okStrong.textContent = state.processed.length;
        okLine.appendChild(okStrong);
        body.appendChild(okLine);

        const failLine = document.createElement('div');
        failLine.appendChild(document.createTextNode('Fehler: '));
        const failStrong = document.createElement('strong');
        failStrong.textContent = state.failed.length;
        failLine.appendChild(failStrong);
        body.appendChild(failLine);

        if (state.failed.length > 0) {
            const ul = document.createElement('ul');
            ul.style.cssText = 'margin:6px 0 0 18px;color:#e74c3c;font-size:12px;';
            state.failed.forEach(function (f) {
                const li = document.createElement('li');
                li.textContent = f.adId + ': ' + (f.error || 'unbekannter Fehler');
                ul.appendChild(li);
            });
            body.appendChild(ul);
        }
        overlay.appendChild(body);

        try {
            const meta = await listSnapshotMeta();
            await appendRecoverySection(overlay, meta);
        } catch (e) { warn('Recovery-Listing fehlgeschlagen', e); }

        const actions = document.createElement('div');
        actions.style.cssText = 'padding:10px 14px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;';
        const close = makeButton('Schließen', false);
        close.onclick = closeOverlay;
        actions.appendChild(close);
        overlay.appendChild(actions);
    }

    // === ORCHESTRATOR ===
    let stopRequested = false;

    async function startBatchFlow() {
        const result = collectCandidates();
        log('Kandidaten:', { matches: result.matches.length, skipped: result.skipped.length });
        await renderConfirm(result.matches, result.skipped, function (matches) {
            stopRequested = false;
            runBatch(matches);
        });
    }

    function jitterDelay() {
        const offset = (Math.random() * 2 - 1) * DELAY_JITTER_MS;
        return Math.max(60 * 1000, Math.round(DELAY_BASE_MS + offset));
    }

    function processOne(item) {
        return new Promise(function (resolve) {
            const adId = item.adId;
            const lsKey = LS_RESULT_PREFIX + adId;
            try { localStorage.removeItem(lsKey); } catch (e) {}

            log('Öffne Tab für adId ' + adId);
            // GM_openInTab gibt ein Handle mit close()/closed/onclose zurueck,
            // das auch nach Navigation des Tabs weiter funktioniert.
            // Fallback auf window.open, falls @grant aus irgendeinem Grund fehlt.
            let tabHandle = null;
            try {
                if (typeof GM_openInTab === 'function') {
                    tabHandle = GM_openInTab(
                        'https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=' + adId + '#smartRepublish',
                        { active: true, insert: true, setParent: true }
                    );
                }
            } catch (e) {
                warn('GM_openInTab fehlgeschlagen, fallback auf window.open', e);
            }
            if (!tabHandle) {
                const w = window.open(
                    'https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=' + adId + '#smartRepublish',
                    '_blank'
                );
                if (!w) {
                    resolve({ ok: false, error: 'Popup blockiert', code: 'popup_blocked' });
                    return;
                }
                // Pseudo-Handle, das nicht zuverlaessig schliesst -- aber das ist
                // der Fallback, kein Default.
                tabHandle = { close: function () { try { w.close(); } catch (e) {} }, get closed() { return w.closed; } };
            }

            let done = false;
            const cleanup = function (closeTab) {
                window.removeEventListener('storage', onStorage);
                clearTimeout(timeoutId);
                clearInterval(pollId);
                if (closeTab) {
                    try { tabHandle.close(); } catch (e) {}
                }
                try { localStorage.removeItem(lsKey); } catch (e) {}
            };

            const finish = function (payload) {
                if (done) return;
                done = true;
                cleanup(payload.keepTab !== true);
                resolve(payload);
            };

            const handleValue = function (raw) {
                if (!raw) return false;
                if (raw === 'ok') {
                    finish({ ok: true });
                    return true;
                }
                if (raw.indexOf('error:') === 0) {
                    const tail = raw.slice(6);
                    let code = tail.split(':')[0] || 'unknown';
                    let dataLoss = false;
                    if (code === 'save_failed') {
                        const sub = tail.split(':')[1] || '';
                        dataLoss = (sub === 'delete_ok');
                    }
                    finish({ ok: false, error: tail, code: code, dataLoss: dataLoss, keepTab: dataLoss });
                    return true;
                }
                return false;
            };

            const onStorage = function (e) {
                if (e.key !== lsKey) return;
                handleValue(e.newValue);
            };
            window.addEventListener('storage', onStorage);

            const pollId = setInterval(function () {
                try {
                    const v = localStorage.getItem(lsKey);
                    if (v) handleValue(v);
                } catch (err) {}
            }, 1000);

            const timeoutId = setTimeout(function () {
                finish({ ok: false, error: 'Timeout: kein Result vom Worker-Tab', code: 'timeout', dataLoss: false, keepTab: false, outcomeUnknown: true });
            }, RESULT_WAIT_TIMEOUT_MS);
        });
    }

    function waitMs(ms, onTick) {
        return new Promise(function (resolve) {
            const start = Date.now();
            const tick = setInterval(function () {
                const remaining = Math.max(0, ms - (Date.now() - start));
                if (onTick) onTick(remaining);
                if (remaining <= 0) {
                    clearInterval(tick);
                    resolve();
                }
            }, 1000);
        });
    }

    function formatRemaining(ms) {
        const sec = Math.round(ms / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    async function runBatch(matches) {
        const state = {
            queue: matches.slice(),
            processed: [],
            failed: [],
            currentLabel: '',
            nextEtaText: '',
            aborted: false,
            autoStopped: false
        };

        const onStop = function () {
            stopRequested = true;
            state.aborted = true;
            log('Stop angefordert');
        };

        renderProgress(state, onStop);

        while (state.queue.length > 0) {
            if (stopRequested) break;
            const item = state.queue.shift();
            state.currentLabel = item.title + ' (ID ' + item.adId + ')';
            state.nextEtaText = '';
            renderProgress(state, onStop);

            const res = await processOne(item);
            if (res.ok) {
                state.processed.push({ adId: item.adId });
                log('OK adId ' + item.adId);
                // Snapshot kann gelöscht werden -- kein Datenverlust
                try { await deleteSnapshot(item.adId); } catch (e) { warn('Snapshot-Loeschung fehlgeschlagen', e); }
            } else {
                state.failed.push({ adId: item.adId, error: res.error });
                warn('Fehler adId ' + item.adId, res.error);
                if (res.dataLoss) {
                    // P3: Auto-Stop bei Datenverlust
                    state.autoStopped = true;
                    log('Datenverlust erkannt -- Batch wird gestoppt. Snapshot bleibt erhalten.');
                    break;
                }
                if (res.outcomeUnknown) {
                    // BUG-003: Ausgang unbekannt (z. B. Timeout) -- Snapshot behalten
                    log('Ausgang unbekannt: Snapshot behalten');
                } else {
                    // Kein Datenverlust: Snapshot kann weg
                    try { await deleteSnapshot(item.adId); } catch (e) { warn('Snapshot-Loeschung fehlgeschlagen', e); }
                }
            }
            renderProgress(state, onStop);

            if (state.queue.length > 0 && !stopRequested) {
                const wait = jitterDelay();
                log('Warte ' + Math.round(wait / 1000) + 's vor nächster Anzeige');
                await waitMs(wait, function (remaining) {
                    state.nextEtaText = formatRemaining(remaining);
                    renderProgress(state, onStop);
                });
            }
        }

        log('Batch fertig', { ok: state.processed.length, fail: state.failed.length, aborted: state.aborted, autoStopped: state.autoStopped });
        renderDone(state);
    }

    // === INIT ===
    function tick() {
        addControlButtons();
        addBatchTriggerButton();
    }

    setTimeout(tick, 1500);

    let debounceTimer;
    const observer = new MutationObserver(function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(tick, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();