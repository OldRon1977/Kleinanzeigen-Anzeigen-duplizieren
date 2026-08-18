// ==UserScript==
// @name          eBay Kleinanzeigen - neu einstellen helper
// @namespace     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @description   Hilfsskript fuer Smart Neu-Einstellen direkt aus "Meine Anzeigen", inkl. Batch-Modus und Recovery-Snapshot
// @icon          https://www.kleinanzeigen.de/favicon.ico
// @copyright     2026
// @license       MIT
// @version       1.8.0
// @author        panzli (Original), OldRon1977 (Anpassungen)
// @credits       karlvonbonin - Idee und Grundlage der Auswahl im Batch-Overlay (PR #48)
// @match         https://www.kleinanzeigen.de/m-meine-anzeigen.html*
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

    // Regellaufzeit einer Kleinanzeige. Die Kartenliste nennt nur das ENDdatum,
    // kein Erstelldatum -- das Alter ist daher immer abgeleitet:
    // Alter = AD_RUNTIME_DAYS - Restlaufzeit. Dieselbe Annahme steckt seit jeher
    // in MIN_DAYS_TO_END (60 - 7 = 53). Bei abweichender Laufzeit (verlaengert,
    // gewerblich) ist das Alter entsprechend ungenau; die UI weist darauf hin.
    const AD_RUNTIME_DAYS = 60;

    // Farbcodierung nach Alter. Untergrenze inklusive, nach oben offen bis zum
    // naechsten Band: rot 0-4, gelb 5-6, gruen 7-13, dunkelgruen ab 14 Tagen.
    const AGE_BANDS = [
        { key: 'sehr-alt', minAge: 14, color: '#1b5e20', label: 'ab 14 Tagen' },
        { key: 'alt', minAge: 7, color: '#43a047', label: '7-13 Tage' },
        { key: 'mittel', minAge: 5, color: '#f9a825', label: '5-6 Tage' },
        { key: 'frisch', minAge: 0, color: '#e53935', label: 'bis 4 Tage' }
    ];

    // Anzeigenliste als JSON. Liefert im Gegensatz zum DOM das echte
    // Erstelldatum, den Merk-Zaehler als Zahl und ALLE Seiten -- das DOM kennt
    // immer nur die gerade sichtbare Seite.
    const AD_LIST_JSON_PATH = '/m-meine-anzeigen-verwalten.json';
    // Obergrenze gegen eine Endlosschleife, falls `paging.last` fehlt oder
    // luegt. 20 Seiten sind weit mehr, als ein privater Account je hat.
    const MAX_JSON_PAGES = 20;

    // Jitter-Delay zwischen zwei Smart-Republish-Vorgaengen: 3 +- 1 Minuten.
    const DELAY_BASE_MS = 3 * 60 * 1000;
    const DELAY_JITTER_MS = 1 * 60 * 1000;

    // Maximaler Wartepuffer auf das Result-Signal aus dem Worker-Tab.
    // Nach Saving kann Bilder-Verarbeitung lange dauern; 180s ist grosszuegig.
    const RESULT_WAIT_TIMEOUT_MS = 180 * 1000;

    // Geteiltes Tab-Protokoll: Werte muessen in beiden Scripts synchron bleiben
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
        if (files.length > 0xFFFF) throw new Error('ZIP-Limit: mehr als 65535 Dateien werden nicht unterstuetzt');

        const now = new Date();
        const dt = dosTime(now);
        const localParts = [];
        const centralParts = [];
        let offset = 0;

        for (const f of files) {
            const nameBytes = utf8(f.name);
            const crc = crc32(f.data);
            const size = f.data.length;
            if (f.data.length >= 0x100000000) throw new Error('ZIP-Limit: Datei "' + f.name + '" ist >= 4 GiB');

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
            if (offset >= 0x100000000) throw new Error('ZIP-Limit: Archiv >= 4 GiB wird nicht unterstuetzt');
        }

        // Central dir size + offset
        let cdSize = 0;
        for (const p of centralParts) cdSize += p.length;
        const cdOffset = offset;
        if (cdOffset >= 0x100000000) throw new Error('ZIP-Limit: Archiv >= 4 GiB wird nicht unterstuetzt');

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

    // === EINZEL-BUTTONS PRO ANZEIGE ===
    const BTN_STYLE = 'margin-left:8px;padding:4px 10px;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;font-size:12px;vertical-align:middle;display:inline-flex;align-items:center;';

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

            const dupBtn = document.createElement('button');
            dupBtn.type = 'button';
            dupBtn.textContent = '📋 Duplizieren';
            dupBtn.title = 'Erstellt eine Kopie in neuem Tab, Original bleibt erhalten';
            dupBtn.style.cssText = BTN_STYLE;
            dupBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                openDuplicate(adId, dupBtn);
            };

            // Reihenfolge im DOM: [Anzeige-Link] [Duplizieren] [Smart neu einstellen]
            element.after(btn);
            element.after(dupBtn);
        });
    }

    // Duplizieren: Das Hauptskript erkennt den Hash '#duplicate' auf der
    // Bearbeiten-Seite und dupliziert selbststaendig (Original bleibt erhalten).
    // Anders als beim Smart-Republish gibt es kein Loeschen und keinen Snapshot.
    // Der Helper behaelt aber das Tab-Handle und wartet auf das 'ok'-Signal, das
    // das Hauptskript auf der Bestaetigungs-Seite ueber localStorage setzt --
    // dann wird der Worker-Tab automatisch geschlossen.
    function openDuplicate(adId, button) {
        const url = 'https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=' + adId + '#duplicate';
        const originalText = button.textContent;
        const lsKey = 'ka-duplicate-result-' + adId;
        try { localStorage.removeItem(lsKey); } catch (e) {}

        let tabHandle = null;
        try {
            if (typeof GM_openInTab === 'function') {
                tabHandle = GM_openInTab(url, { active: true, insert: true, setParent: true });
            }
        } catch (e) {
            warn('GM_openInTab fehlgeschlagen, fallback auf window.open', e);
        }
        if (!tabHandle) {
            const w = window.open(url, '_blank');
            if (!w) {
                button.style.color = '#e74c3c';
                button.textContent = '❌ Popup blockiert';
                setTimeout(function () {
                    button.style.color = '';
                    button.textContent = originalText;
                }, 3000);
                return;
            }
            tabHandle = { close: function () { try { w.close(); } catch (e) {} } };
        }

        button.disabled = true;
        button.style.color = '#888';
        button.textContent = '⏳ Dupliziere …';

        let done = false;
        const finishOk = function () {
            if (done) return;
            done = true;
            window.removeEventListener('storage', onStorage);
            clearInterval(pollId);
            clearTimeout(timeoutId);
            try { localStorage.removeItem(lsKey); } catch (e) {}
            try { tabHandle.close(); } catch (e) {}
            button.style.color = '#27ae60';
            button.textContent = '✅ Dupliziert';
            setTimeout(function () {
                button.style.color = '';
                button.textContent = originalText;
                button.disabled = false;
            }, 3000);
        };

        const onStorage = function (e) {
            if (e.key === lsKey && e.newValue === 'ok') finishOk();
        };
        window.addEventListener('storage', onStorage);

        const pollId = setInterval(function () {
            try { if (localStorage.getItem(lsKey) === 'ok') finishOk(); } catch (e) {}
        }, 1000);

        // Kein Auto-Close bei Timeout: Tab offen lassen, damit der User sehen
        // kann, was passiert ist (z.B. Fehler beim Speichern).
        const timeoutId = setTimeout(function () {
            if (done) return;
            done = true;
            window.removeEventListener('storage', onStorage);
            clearInterval(pollId);
            try { localStorage.removeItem(lsKey); } catch (e) {}
            button.style.color = '';
            button.textContent = originalText;
            button.disabled = false;
        }, RESULT_WAIT_TIMEOUT_MS);
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
        btn.textContent = '\u2611 Anzeigen auswählen & neu einstellen';
        btn.title = 'Öffnet die Auswahl aller Anzeigen; die ausgewählten werden nacheinander mit Zeitabstand neu eingestellt';
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

    // Toleranter als parseEndDate: die JSON-Felder sind nicht dokumentiert,
    // deshalb wird "TT.MM.JJJJ" irgendwo im String akzeptiert und notfalls auf
    // Date.parse zurueckgefallen (ISO-Datum).
    function parseJsonDate(value) {
        if (!value) return null;
        const str = String(value);
        const m = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (m) {
            const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
            return isNaN(d.getTime()) ? null : d;
        }
        const t = Date.parse(str);
        return isNaN(t) ? null : new Date(t);
    }

    function daysSince(date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayMs = 24 * 60 * 60 * 1000;
        return Math.max(0, Math.round((today.getTime() - date.getTime()) / dayMs));
    }

    // Holt alle Seiten der Anzeigenliste. Bricht ab, sobald eine Seite leer ist
    // oder `paging.last` erreicht wurde.
    async function fetchAdListJson() {
        const ads = [];
        let lastPage = null;

        for (let pageNum = 1; pageNum <= MAX_JSON_PAGES; pageNum++) {
            const res = await fetch(AD_LIST_JSON_PATH + '?pageNum=' + pageNum + '&sort=DEFAULT', {
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin'
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);

            const data = await res.json();
            if (!data || !Array.isArray(data.ads) || data.ads.length === 0) break;

            data.ads.forEach(function (ad) { ads.push(ad); });

            if (lastPage === null && data.paging && typeof data.paging.last === 'number') {
                lastPage = data.paging.last;
            }
            if (lastPage !== null && pageNum >= lastPage) break;
        }

        return ads;
    }

    // Ein JSON-Objekt in dieselbe Form bringen, die das Overlay vom DOM kennt.
    // Rueckgabe null = unbrauchbar (fehlende ID oder gar kein Datum).
    function mapJsonAd(ad) {
        if (!ad || ad.id === undefined || ad.id === null) return null;
        const adId = String(ad.id);
        if (!/^\d{1,20}$/.test(adId)) return null;

        const created = parseJsonDate(ad.creationDate);
        const end = parseJsonDate(ad.endDate);
        if (!created && !end) return null;

        // Echtes Erstelldatum schlaegt die Schaetzung aus der Restlaufzeit.
        const daysLeft = end ? daysUntil(end) : null;
        const ageDays = created ? daysSince(created) : ageFromDaysLeft(daysLeft);

        return {
            adId: adId,
            title: (ad.title || '(ohne Titel)').replace(/\s+/g, ' ').trim(),
            endText: end ? formatDate(end) : '',
            daysLeft: daysLeft,
            ageDays: ageDays,
            ageExact: !!created,
            favCount: typeof ad.watchCount === 'number' ? ad.watchCount : null,
            viewCount: typeof ad.viewCount === 'number' ? ad.viewCount : null
        };
    }

    function formatDate(d) {
        const pad = function (n) { return (n < 10 ? '0' : '') + n; };
        return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
    }

    async function collectCandidatesJson() {
        const raw = await fetchAdListJson();
        const matches = [];
        const skipped = [];

        raw.forEach(function (ad) {
            const mapped = mapJsonAd(ad);
            if (mapped) matches.push(mapped);
            else skipped.push({ adId: ad && ad.id ? String(ad.id) : null, title: (ad && ad.title) || '(ohne Titel)', reason: 'kein Datum' });
        });

        return { matches: matches, skipped: skipped, source: 'json' };
    }

    // JSON zuerst, DOM als Rueckfallebene. Die JSON-Quelle kennt alle Seiten und
    // das echte Erstelldatum; faellt sie aus (Schnittstelle geaendert, nicht
    // eingeloggt, Netzfehler), arbeitet der Batch wie bisher mit dem DOM
    // weiter -- dann eben nur mit der sichtbaren Seite und geschaetztem Alter.
    async function collectCandidatesResilient() {
        try {
            const viaJson = await collectCandidatesJson();
            if (viaJson.matches.length > 0) return viaJson;
            warn('JSON-Quelle lieferte keine Anzeigen – falle auf die Seitenansicht zurück');
        } catch (e) {
            warn('JSON-Quelle nicht verfügbar – falle auf die Seitenansicht zurück', e);
        }
        const viaDom = collectCandidates();
        viaDom.source = 'dom';
        return viaDom;
    }

    // Merklisten-Zaehler der Karte. Die Statistikzeile enthaelt immer einen
    // Eintrag "N mal gemerkt" -- auch bei null ("0 mal gemerkt"), das Element
    // fehlt also nicht. Aufgehaengt am Icon-Attribut data-title, weil die
    // Klassen daneben Utility-Klassen sind und sich bei jedem Redesign aendern.
    // Rueckgabe null = nicht lesbar (NICHT 0): sonst wuerde ein Markup-Umbau
    // jede gemerkte Anzeige stillschweigend als "nicht gemerkt" durchwinken.
    function parseFavCount(card) {
        const icon = card.querySelector('svg[data-title="favoriteOutline"]');
        let host = icon ? icon.closest('li') : null;
        if (!host) {
            host = Array.prototype.find.call(card.querySelectorAll('li'), function (li) {
                return /mal gemerkt/i.test(li.textContent || '');
            }) || null;
        }
        const m = (host ? host.textContent : '').match(/([\d.]+)\s*mal gemerkt/i);
        if (!m) return null;
        const n = parseInt(m[1].replace(/\./g, ''), 10);
        return isNaN(n) ? null : n;
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

            // Es werden ALLE Anzeigen mit lesbarem Datum gelistet, nicht mehr nur
            // die aelteren. Was tatsaechlich laeuft, entscheidet die Auswahl im
            // Overlay -- dort ist beim Oeffnen nichts angehakt.
            const days = daysUntil(endDate);
            matches.push({
                adId: adId,
                title: title,
                endText: endText,
                daysLeft: days,
                ageDays: ageFromDaysLeft(days),
                // Die Karte nennt kein Erstelldatum -- das Alter bleibt hier
                // eine Ableitung aus der Restlaufzeit.
                ageExact: false,
                favCount: parseFavCount(card)
            });
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

    // Abgeleitetes Alter in Tagen (siehe AD_RUNTIME_DAYS). Nie negativ: eine
    // frisch verlaengerte Anzeige kann mehr Restlaufzeit haben als die
    // Regellaufzeit, das waere sonst ein negatives Alter.
    function ageFromDaysLeft(daysLeft) {
        return Math.max(0, AD_RUNTIME_DAYS - daysLeft);
    }

    function ageBand(ageDays) {
        return AGE_BANDS.find(function (b) { return ageDays >= b.minAge; }) ||
            AGE_BANDS[AGE_BANDS.length - 1];
    }

    // Geschaetzte Batch-Laufzeit in Minuten. Zwischen zwei Anzeigen liegt eine
    // Pause von DELAY_BASE_MS; nach der letzten Anzeige wird nicht mehr gewartet.
    function estimateRuntimeMinutes(count) {
        if (count <= 0) return 0;
        return Math.round((count - 1) * DELAY_BASE_MS / 60000);
    }

    async function renderConfirm(matches, skipped, onStart) {
        const overlay = ensureOverlay();

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
            summary.textContent = 'Keine Anzeigen mit lesbarem Enddatum gefunden.';
            overlay.appendChild(summary);
            // Trotzdem Recovery-Section anzeigen, falls Snapshots da sind
            try {
                const meta = await listSnapshotMeta();
                await appendRecoverySection(overlay, meta);
            } catch (e) { warn('Recovery-Listing fehlgeschlagen', e); }
            return;
        }
        // Auswahl startet LEER. Gelistet sind alle Anzeigen, auch frische --
        // deshalb waere "alles vorangehakt" ein scharfes Messer: ein Klick auf
        // Start wuerde jede Anzeige loeschen und neu anlegen. Die Schnellwahl
        // unter der Liste nimmt die Klickarbeit fuer die ueblichen Faelle ab.
        const selected = new Set();
        const entries = [];

        const line1 = document.createElement('div');
        summary.appendChild(line1);
        const line2 = document.createElement('div');
        line2.style.cssText = 'color:#666;margin-top:4px;';
        summary.appendChild(line2);
        overlay.appendChild(summary);

        const list = document.createElement('ul');
        list.style.cssText = 'margin:0;padding:8px 14px;max-height:240px;overflow-y:auto;list-style:none;';
        matches.forEach(function (m) {
            const li = document.createElement('li');
            li.style.cssText = 'margin:4px 0;line-height:1.3;';

            const label = document.createElement('label');
            label.style.cssText = 'display:flex;gap:8px;align-items:flex-start;cursor:pointer;';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = false;
            cb.style.cssText = 'margin-top:2px;flex:none;cursor:pointer;';
            cb.onchange = function () {
                if (cb.checked) selected.add(m.adId);
                else selected.delete(m.adId);
                updateSummary();
            };
            // Zweiter, unsichtbarer Haken. Wird NIE vom Nutzer gesetzt, sondern
            // ausschliesslich vom Merk-Filter. Verarbeitet wird nur, was beide
            // Haken hat. Er steht bewusst als echtes Element im DOM und traegt
            // data-ka-gate="fav": so laesst sich die Absicherung im Browser
            // nachpruefen, statt dass man ihr glauben muss.
            const gate = document.createElement('input');
            gate.type = 'checkbox';
            gate.dataset.kaGate = 'fav';
            gate.dataset.adid = m.adId;
            gate.checked = true;
            gate.hidden = true;
            gate.tabIndex = -1;
            gate.setAttribute('aria-hidden', 'true');
            gate.style.cssText = 'display:none;';

            entries.push({ match: m, cb: cb, gate: gate, li: li, hiddenSelected: false });

            // Farbpunkt nach Alter -- traegt die Information doppelt (Farbe und
            // Text daneben), damit sie nicht allein an der Farbe haengt.
            const age = typeof m.ageDays === 'number' ? m.ageDays : ageFromDaysLeft(m.daysLeft);
            const band = ageBand(age);
            const dot = document.createElement('span');
            dot.className = 'ka-age-dot';
            dot.dataset.band = band.key;
            dot.title = 'Alter ' + band.label;
            dot.style.cssText = 'width:10px;height:10px;border-radius:50%;flex:none;margin-top:5px;background:' + band.color + ';';

            const texts = document.createElement('div');
            const t = document.createElement('div');
            t.style.cssText = 'font-weight:500;';
            t.textContent = m.title;
            const meta = document.createElement('div');
            meta.style.cssText = 'color:#666;font-size:12px;';
            let metaText = 'ID ' + m.adId + ' \u00B7 ' + age + ' Tage alt';
            // Aus der JSON-Quelle ist das Alter exakt, aus dem DOM geschaetzt.
            // Der Unterschied gehoert an die Anzeige, nicht nur in die Fussnote.
            if (m.ageExact !== true) metaText += ' (gesch\u00E4tzt)';
            if (m.endText) {
                metaText += ' \u00B7 endet ' + m.endText;
                if (typeof m.daysLeft === 'number') metaText += ' (' + m.daysLeft + ' Tage)';
            }
            if (typeof m.viewCount === 'number') {
                metaText += ' \u00B7 ' + m.viewCount + ' Aufrufe';
            }
            // Merk-Status im Klartext, damit nachvollziehbar bleibt, warum der
            // Zusatzfilter eine Anzeige aussortiert hat.
            if (typeof m.favCount === 'number') {
                metaText += ' \u00B7 ' + (m.favCount === 0
                    ? 'nicht gemerkt'
                    : m.favCount + '\u00D7 gemerkt');
            }
            meta.textContent = metaText;
            texts.appendChild(t);
            texts.appendChild(meta);

            label.appendChild(cb);
            label.appendChild(dot);
            label.appendChild(texts);
            li.appendChild(label);
            li.appendChild(gate);
            list.appendChild(li);
        });
        overlay.appendChild(list);

        // Zusatzfilter statt fuenftem Schnellwahl-Button: nur so laesst sich
        // "aelter als 7 Tage" UND "nicht gemerkt" kombinieren.
        let onlyUnfavored = false;

        // Anzeigen ohne lesbaren Zaehler (favCount === null) werden bei aktivem
        // Filter mit ausgeblendet. Lieber eine Anzeige zu wenig neu einstellen
        // als eine gemerkte zu loeschen, deren Interessent auf die
        // Preisanpassung wartet.
        function passesFavFilter(m) {
            return !onlyUnfavored || m.favCount === 0;
        }

        // Setzt den zweiten Haken. Einzige Quelle sind der Merk-Zaehler der
        // Anzeige und der Zustand des Filters -- nie die Auswahl des Nutzers.
        function applyFavGates() {
            entries.forEach(function (e) {
                e.gate.checked = passesFavFilter(e.match);
            });
        }

        // Der Filter blendet aus, statt nur abzuwaehlen: eine ausgeblendete
        // Anzeige kann nicht angehakt sein, und was beim Ausblenden angehakt
        // war, kommt beim Einblenden zurueck. Damit ist der Haken in beide
        // Richtungen umkehrbar -- reines Abwaehlen war es nicht.
        function applyVisibility() {
            entries.forEach(function (e) {
                const hide = !passesFavFilter(e.match);
                e.li.hidden = hide;
                e.li.style.display = hide ? 'none' : '';
            });
        }

        // Schnellwahl: setzt die Auswahl auf alles, was das Praedikat erfuellt
        // und den Zusatzfilter passiert. Checkboxen werden programmatisch
        // gesetzt (feuert kein onchange), deshalb wird `selected` mitgefuehrt.
        function applySelection(predicate) {
            selected.clear();
            entries.forEach(function (e) {
                const age = typeof e.match.ageDays === 'number'
                    ? e.match.ageDays
                    : ageFromDaysLeft(e.match.daysLeft);
                const hit = predicate(e.match, age) && passesFavFilter(e.match);
                e.cb.checked = hit;
                if (hit) selected.add(e.match.adId);
            });
            updateSummary();
        }

        const bulk = document.createElement('div');
        bulk.style.cssText = 'padding:0 14px 8px;display:flex;gap:12px;font-size:12px;flex-wrap:wrap;';
        [
            ['Alle', function () { return true; }],
            ['Keine', function () { return false; }],
            ['älter als 7 Tage', function (m, age) { return age >= 7; }],
            ['älter als 14 Tage', function (m, age) { return age >= 14; }]
        ].forEach(function (pair) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = pair[0];
            b.style.cssText = 'background:none;border:none;padding:0;color:#007bff;cursor:pointer;font-size:12px;text-decoration:underline;';
            b.onclick = function () { applySelection(pair[1]); };
            bulk.appendChild(b);
        });

        // Nur anbieten, wenn ueberhaupt ein Zaehler gelesen werden konnte --
        // eine Checkbox, die nach einem Markup-Umbau nichts mehr auswaehlt,
        // waere schlimmer als keine.
        if (matches.some(function (m) { return typeof m.favCount === 'number'; })) {
            const favLabel = document.createElement('label');
            favLabel.style.cssText = 'display:flex;gap:5px;align-items:center;cursor:pointer;' +
                'margin-left:auto;color:#333;';
            favLabel.title = 'Blendet gemerkte Anzeigen aus der Liste aus. Wirkt ' +
                'zusammen mit der Schnellwahl. Anzeigen ohne lesbaren Z\u00E4hler ' +
                'werden mit ausgeblendet; beim Einblenden kommt die vorherige ' +
                'Auswahl zur\u00FCck.';
            const favToggle = document.createElement('input');
            favToggle.type = 'checkbox';
            favToggle.style.cssText = 'cursor:pointer;margin:0;';
            favToggle.onchange = function () {
                onlyUnfavored = favToggle.checked;
                entries.forEach(function (e) {
                    if (onlyUnfavored) {
                        if (passesFavFilter(e.match)) return;
                        // Auswahlstand merken, damit das Einblenden ihn
                        // wiederherstellen kann.
                        e.hiddenSelected = selected.has(e.match.adId);
                        selected.delete(e.match.adId);
                        e.cb.checked = false;
                    } else if (e.hiddenSelected) {
                        selected.add(e.match.adId);
                        e.cb.checked = true;
                        e.hiddenSelected = false;
                    }
                });
                applyFavGates();
                applyVisibility();
                updateSummary();
            };
            favLabel.appendChild(favToggle);
            favLabel.appendChild(document.createTextNode('nur nicht gemerkte'));
            bulk.appendChild(favLabel);
        }

        overlay.appendChild(bulk);

        // Legende: erklaert die Farbpunkte und macht transparent, dass das Alter
        // aus der Restlaufzeit abgeleitet ist (die Karte nennt kein Erstelldatum).
        const legend = document.createElement('div');
        legend.style.cssText = 'padding:0 14px 8px;display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:#666;';
        AGE_BANDS.forEach(function (band) {
            const item = document.createElement('span');
            item.style.cssText = 'display:flex;gap:4px;align-items:center;';
            const dot = document.createElement('span');
            dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + band.color + ';';
            item.appendChild(dot);
            item.appendChild(document.createTextNode(band.label));
            legend.appendChild(item);
        });
        overlay.appendChild(legend);

        // Die Fussnote gilt nur fuer geschaetzte Alter. Kommt die Liste aus der
        // JSON-Quelle, steht dort das echte Erstelldatum -- dann waere der
        // Hinweis schlicht falsch.
        if (matches.some(function (m) { return m.ageExact !== true; })) {
            const hint = document.createElement('div');
            hint.style.cssText = 'padding:0 14px 8px;font-size:11px;color:#999;';
            hint.textContent = 'Alter geschätzt aus der Restlaufzeit (' + AD_RUNTIME_DAYS +
                ' Tage Regellaufzeit) – bei verlängerten Anzeigen ungenau.';
            overlay.appendChild(hint);
        }

        if (skipped.length > 0) {
            const sk = document.createElement('div');
            sk.style.cssText = 'padding:8px 14px;color:#888;font-size:12px;border-top:1px solid #eee;';
            sk.textContent = skipped.length + ' Karte(n) ohne Datum übersprungen.';
            overlay.appendChild(sk);
        }

        // === SICHERHEITSNETZ ===
        // Ist eine Zeile wirklich sichtbar? Geprueft wird nicht das Modell,
        // sondern das DOM: hidden-Attribut, Inline-Style und die berechnete
        // Darstellung. getComputedStyle steht bewusst in try/catch -- faellt es
        // aus, entscheiden die beiden ersten Kriterien.
        function isVisible(el) {
            if (el.hidden) return false;
            if (el.style && el.style.display === 'none') return false;
            try {
                const view = el.ownerDocument && el.ownerDocument.defaultView;
                const cs = view && view.getComputedStyle ? view.getComputedStyle(el) : null;
                if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
            } catch (e) { /* ohne Layout-Engine bleibt es bei den Attributen */ }
            return true;
        }

        // Was tatsaechlich verarbeitet wird. Eine Anzeige muss FUENF Bedingungen
        // gleichzeitig erfuellen:
        //   1. im Auswahl-Set (Modell)
        //   2. sichtbarer Haken angehakt (was der Nutzer geklickt hat)
        //   3. zweiter, unsichtbarer Haken gesetzt (was der Filter erlaubt hat)
        //   4. dieselbe Erlaubnis JETZT neu abgeleitet, direkt aus favCount
        //   5. Zeile sichtbar in der Liste
        // 3 und 4 sind absichtlich zwei verschiedene Dinge: 3 ist gespeicherter
        // Zustand von damals, 4 ist die Ableitung von jetzt aus den Rohdaten.
        // Nur wenn beide zum selben Ergebnis kommen, laeuft die Anzeige. Damit
        // schuetzt die Pruefung auch gegen einen Fehler in ihrer eigenen
        // Buchfuehrung -- ein einzelnes falsches Bit reicht nicht mehr aus.
        function confirmedSelection() {
            return entries
                .filter(function (e) {
                    return selected.has(e.match.adId) &&
                        e.cb.checked &&
                        e.gate.checked &&
                        passesFavFilter(e.match) &&
                        isVisible(e.li);
                })
                .map(function (e) { return e.match; });
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
        start.onclick = function () {
            const chosen = confirmedSelection();
            if (chosen.length !== selected.size) {
                // Sollte nie vorkommen. Wenn doch, ist es ein Fehler im Filter --
                // die Differenz wird verworfen, nicht verarbeitet.
                warn('Auswahl und Anzeige liefen auseinander \u2013 verarbeitet werden nur die ' +
                    chosen.length + ' sichtbar angehakten von ' + selected.size + ' im Auswahl-Set.');
            }
            if (!chosen.length) return;
            onStart(chosen);
        };
        actions.appendChild(cancel);
        actions.appendChild(start);
        overlay.appendChild(actions);

        // Haelt Zusammenfassung und Start-Button im Einklang mit der Auswahl.
        function updateSummary() {
            // Bewusst dieselbe Quelle wie der Start-Button: die genannte Zahl
            // ist damit exakt die Zahl der Anzeigen, die verarbeitet werden.
            const count = confirmedSelection().length;
            // Nenner sind die SICHTBAREN Anzeigen -- "3 von 4" waere irritierend,
            // wenn nur drei Zeilen in der Liste stehen.
            const visible = entries.filter(function (e) { return passesFavFilter(e.match); }).length;
            const hidden = entries.length - visible;
            line1.textContent = '';
            const strong = document.createElement('strong');
            strong.textContent = count;
            line1.appendChild(strong);
            line1.appendChild(document.createTextNode(' von ' + visible + ' Anzeige(n) ausgewählt.'));
            line2.textContent = (count > 0
                ? 'Geschätzte Laufzeit: ca. ' + estimateRuntimeMinutes(count) + ' Minuten (3 ± 1 min Pause zwischen zwei Anzeigen).'
                : 'Nichts ausgewählt – Schnellwahl unter der Liste nutzen.') +
                (hidden > 0 ? ' ' + hidden + ' Anzeige(n) ausgeblendet (gemerkt oder ohne Zähler).' : '');
            start.disabled = (count === 0);
            start.style.opacity = count === 0 ? '0.5' : '1';
            start.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
        }
        updateSummary();
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

        // Hinweise sind kein Fehler (die neue Anzeige steht), duerfen aber nicht
        // untergehen: 'delete_failed' heisst, dass das Original noch online ist.
        const warnings = state.warnings || [];
        if (warnings.length > 0) {
            const note = document.createElement('div');
            note.style.cssText = 'background:#fff7e6;border:1px solid #ffd591;padding:8px;border-radius:4px;margin-top:8px;color:#a06200;font-size:12px;';
            const head = document.createElement('div');
            head.style.cssText = 'font-weight:600;margin-bottom:4px;';
            head.textContent = '\u26A0 ' + warnings.length + ' Anzeige(n) mit Hinweis';
            note.appendChild(head);
            const ul = document.createElement('ul');
            ul.style.cssText = 'margin:0 0 0 16px;padding:0;';
            warnings.forEach(function (w) {
                const li = document.createElement('li');
                li.textContent = w.warning === 'delete_failed'
                    ? (w.title || 'ID ' + w.adId) + ': neue Anzeige steht, Original blieb bestehen – bitte manuell löschen (ID ' + w.adId + ')'
                    : (w.title || 'ID ' + w.adId) + ': ' + w.warning;
                ul.appendChild(li);
            });
            note.appendChild(ul);
            body.appendChild(note);
        }

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
        const result = await collectCandidatesResilient();
        log('Kandidaten:', {
            matches: result.matches.length,
            skipped: result.skipped.length,
            quelle: result.source
        });
        await renderConfirm(result.matches, result.skipped, function (matches) {
            stopRequested = false;
            runBatch(matches);
        });
    }

    function jitterDelay() {
        const offset = (Math.random() * 2 - 1) * DELAY_JITTER_MS;
        return Math.max(60 * 1000, Math.round(DELAY_BASE_MS + offset));
    }

    // Pure Klassifikation eines Result-Werts aus localStorage (Vertrag mit dem
    // Worker-Script: dataLoss nur bei save_failed:delete_ok). Gibt null zurueck, wenn der Wert nicht
    // verwertbar ist (leer oder unbekanntes Format), sonst das fertige
    // Ergebnis-Payload fuer finish().
    function classifyResultValue(raw) {
        if (!raw) return null;
        if (raw === 'ok') {
            return { ok: true };
        }
        // 'ok:<hinweis>' = die neue Anzeige steht, aber etwas ist erwaehnenswert.
        // Aktuell nur 'delete_failed': das Original blieb bestehen, es existiert
        // also ein Duplikat. Kein Datenverlust, aber der Nutzer muss es wissen.
        if (raw.indexOf('ok:') === 0) {
            return { ok: true, warning: raw.slice(3) || 'unbekannt' };
        }
        if (raw.indexOf('error:') === 0) {
            const tail = raw.slice(6);
            let code = tail.split(':')[0] || 'unknown';
            let dataLoss = false;
            if (code === 'save_failed') {
                const sub = tail.split(':')[1] || '';
                dataLoss = (sub === 'delete_ok');
            }
            return { ok: false, error: tail, code: code, dataLoss: dataLoss, keepTab: dataLoss };
        }
        return null;
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
                const payload = classifyResultValue(raw);
                if (!payload) return false;
                finish(payload);
                return true;
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
            warnings: [],
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
                state.processed.push({ adId: item.adId, warning: res.warning || null });
                if (res.warning) {
                    state.warnings.push({ adId: item.adId, title: item.title, warning: res.warning });
                    warn('OK mit Hinweis adId ' + item.adId + ': ' + res.warning);
                } else {
                    log('OK adId ' + item.adId);
                }
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

    // Test-Exports: nur in Node (Vitest) aktiv, im Browser wirkungslos.
    // Strenge Umgebungspruefung, damit eine Website mit globalem `module`
    // das Script nicht versehentlich deaktivieren kann.
    if (typeof module !== 'undefined' && module.exports &&
        typeof process !== 'undefined' && process.versions && process.versions.node) {
        module.exports = {
            MIN_DAYS_TO_END,
            AD_RUNTIME_DAYS,
            AGE_BANDS,
            parseEndDate,
            parseFavCount,
            parseJsonDate,
            daysSince,
            formatDate,
            mapJsonAd,
            fetchAdListJson,
            collectCandidatesJson,
            collectCandidatesResilient,
            collectCandidates,
            daysUntil,
            ageFromDaysLeft,
            ageBand,
            estimateRuntimeMinutes,
            renderConfirm,
            jitterDelay,
            sanitize,
            crc32,
            utf8,
            dosTime,
            buildZip,
            classifyResultValue
        };
        return; // im Test-Kontext keine Initialisierung/Timer
    }

    setTimeout(tick, 1500);

    let debounceTimer;
    const observer = new MutationObserver(function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(tick, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();