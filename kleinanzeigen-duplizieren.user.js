// ==UserScript==
// @name          eBay Kleinanzeigen - Anzeige duplizieren / neu einstellen
// @namespace     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @description   Einfaches Duplizieren und Smart Neu-Einstellen von Anzeigen mit automatischer Bilderhaltung
// @icon          https://www.kleinanzeigen.de/favicon.ico
// @copyright     2026
// @license       MIT
// @version       3.5.2
// @author        OldRon1977 (Improvements), J05HI (Original)
// @credits       Basierend auf dem Original-Script von J05HI (https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5)
// @match         https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://www.kleinanzeigen.de/p-anzeige-aufgeben-bestaetigung.html*
// @match         https://kleinanzeigen.de/p-anzeige-aufgeben-bestaetigung.html*
// @homepage      https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @updateURL     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js
// @downloadURL   https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/kleinanzeigen-duplizieren.user.js
// @grant         none
// @run-at        document-idle
// ==/UserScript==

/*
 * Basierend auf dem Original-Script von J05HI
 * https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5
 *
 * Änderungen in v3.4.0:
 * - Banner/Popup-Dismisser: Blendet störende Upsell-Banner und Popups automatisch aus
 * - "Ohne Hochschieben weiter"-Popup wird automatisch weggeklickt
 * - Kostenpflichtige Feature-Optionen werden ausgeblendet
 *
 * Änderungen in v3.5.2:
 * - Fix Issue #39: Popup-Dismisser klickt mit Cooldown erneut, solange das
 *   "Effektiver verkaufen"-Popup steht (vorher One-Shot, Klick konnte
 *   verpuffen bevor die Handler des Modals aktiv waren); Timeout 10s -> 30s
 */

(function () {
    'use strict';

    // === KONSTANTEN ===
    const CONFIG = {
        NOTIFICATION_TIMEOUT_MS: 4000,
        DELETE_REQUEST_TIMEOUT_MS: 8000,
        DELETE_WAIT_BEFORE_CREATE_MS: 2000,
        INITIAL_RETRY_WAIT_MS: 500,
        MAX_RETRY_WAIT_MS: 8000,
        MAX_BUTTON_RETRIES: 5,
        POPUP_POLL_INTERVAL_MS: 200,
        POPUP_POLL_TIMEOUT_MS: 30000,
        POPUP_RECLICK_COOLDOWN_MS: 1000
    };

    // === LOGGING ===
    const logger = {
        log: (msg, data) => console.log(`[KA-Script] ${msg}`, data || ''),
        warn: (msg, data) => console.warn(`[KA-Script] ${msg}`, data || ''),
        error: (msg, data) => console.error(`[KA-Script] ${msg}`, data || '')
    };

    // === BANNER & POPUP DISMISSER ===

    /**
     * Injiziert CSS um störende Elemente sofort auszublenden:
     * - Kostenpflichtige Feature-Optionen (Highlight, Galerie, Bumpup)
     * - Info-Banner ("Das Bearbeiten deiner Anzeige schiebt sie nicht wieder hoch")
     */
    function injectBannerBlockerStyles() {
        if (document.querySelector('#ka-banner-blocker')) return;

        const style = document.createElement('style');
        style.id = 'ka-banner-blocker';
        style.textContent = `
            /* Kostenpflichtige Features ausblenden */
            fieldset:has(#ad-feature-group),
            fieldset:has(input[id^="ad-feature-"]) {
                display: none !important;
            }

            /* Info-Banner "Bearbeiten schiebt nicht hoch" ausblenden */
            span:has(> div.bg-accentContainer.border-accentContainer) {
                display: none !important;
            }
        `;

        const target = document.head || document.documentElement;
        target.appendChild(style);
        logger.log('Banner-Blocker CSS injiziert');
    }

    /**
     * Startet einen Polling-Mechanismus, der nach Upsell-Popups sucht und sie
     * automatisch schließt (z.B. "Ohne Hochschieben weiter").
     *
     * Härte gegen UI-Drift bei Kleinanzeigen:
     * - Suche ist auf Modal-Container eingeschränkt
     *   (`[role="dialog"], [aria-modal="true"]`). Buttons außerhalb von
     *   Modals werden nie geklickt -- ein generischer "Nein, danke"-Button
     *   in einem Permission-Dialog oder Form-Bereich fällt damit aus dem
     *   Suchraum.
     * - Match ist exakt auf den getrimmten textContent. Kein `includes`,
     *   damit zusammengesetzte Labels wie "Nein, danke aktivieren" nicht
     *   versehentlich getroffen werden.
     * - Kein One-Shot: Das "Effektiver verkaufen"-Modal rendert seine Buttons,
     *   bevor die Click-Handler aktiv sind (Spinner im Modal). Ein einzelner
     *   früher Klick verpufft dann. Deshalb wird mit Cooldown erneut
     *   geklickt, solange der Button noch im DOM steht (Issue #39).
     *
     * Lieber kein Auto-Click als ein falscher Click während der save-clicked-
     * Phase, in der das Original schon gelöscht ist.
     */
    function startPopupDismisser() {
        logger.log('Popup-Dismisser gestartet');

        const dismissTexts = new Set([
            'Ohne Hochschieben weiter',
            'Ohne Highlight weiter',
            'Nein, danke',
            'Überspringen'
        ]);

        let lastClickAt = 0;

        const interval = setInterval(() => {
            const modals = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
            for (const modal of modals) {
                const buttons = modal.querySelectorAll('button');
                for (const btn of buttons) {
                    const text = (btn.textContent || '').trim();
                    if (dismissTexts.has(text)) {
                        const now = Date.now();
                        if (now - lastClickAt < CONFIG.POPUP_RECLICK_COOLDOWN_MS) return;
                        lastClickAt = now;
                        logger.log(`Popup erkannt, klicke: "${text}"`);
                        btn.click();
                        return;
                    }
                }
            }
        }, CONFIG.POPUP_POLL_INTERVAL_MS);

        setTimeout(() => {
            clearInterval(interval);
        }, CONFIG.POPUP_POLL_TIMEOUT_MS);

        return interval;
    }

    // === HILFSFUNKTIONEN ===
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    function getExponentialBackoffWait(retryCount) {
        const exponentialWait = Math.pow(2, retryCount - 1) * CONFIG.INITIAL_RETRY_WAIT_MS;
        return Math.min(exponentialWait, CONFIG.MAX_RETRY_WAIT_MS);
    }

    function showNotification(message, type = 'info') {
        ensureStyles();
        document.querySelectorAll('.ka-notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `ka-notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), CONFIG.NOTIFICATION_TIMEOUT_MS);
    }

    function ensureStyles() {
        if (document.querySelector('#ka-styles')) return;

        const style = document.createElement('style');
        style.id = 'ka-styles';
        style.textContent = `
            @keyframes ka-spin { to { transform: rotate(360deg); } }

            .ka-spinner {
                position: fixed;
                inset: 0;
                background-color: rgba(0, 0, 0, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            }

            .ka-spinner > div {
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top-color: #3498db;
                border-radius: 50%;
                animation: ka-spin 1s linear infinite;
            }

            .ka-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 500;
                color: white;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }

            .ka-notification.error { background-color: #e74c3c; }
            .ka-notification.success { background-color: #27ae60; }
            .ka-notification.info { background-color: #3498db; }

            .ka-button-container {
                margin-top: 10px;
            }

            .ka-duplicate-btn, .ka-smart-btn {
                padding: 10px 20px;
                margin-left: 10px;
                margin-top: 10px;
                cursor: pointer;
                border: 1px solid #ccc;
                border-radius: 4px;
                background-color: #6c757d;
                color: white;
                font-size: 14px;
                font-weight: 500;
                transition: background-color 0.2s ease;
            }

            .ka-duplicate-btn:hover { background-color: #5a6268; }

            .ka-smart-btn {
                background-color: #007bff;
            }

            .ka-smart-btn:hover { background-color: #0056b3; }

            .ka-duplicate-btn:disabled, .ka-smart-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);
    }

    function showLoadingSpinner(show = true) {
        const existing = document.querySelector('.ka-spinner');
        if (existing) existing.remove();

        if (!show) return;

        ensureStyles();
        const spinner = document.createElement('div');
        spinner.className = 'ka-spinner';
        const spinnerInner = document.createElement('div');
        spinner.appendChild(spinnerInner);
        document.body.appendChild(spinner);
    }

    // === API FUNKTIONEN ===
    function getCsrfToken() {
        const metaTag = document.querySelector('meta[name="_csrf"], meta[name="csrf-token"]');
        if (metaTag) {
            const token = metaTag.getAttribute('content');
            if (token) return token;
        }
        const inputTag = document.querySelector('input[name="_csrf"]');
        if (inputTag && inputTag.value) return inputTag.value;

        throw new Error('CSRF-Token nicht gefunden (weder meta noch input)');
    }

    async function deleteAd(adId) {
        if (!adId || !/^\d{1,20}$/.test(adId)) {
            throw new Error('Ungültige Anzeigen-ID');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.DELETE_REQUEST_TIMEOUT_MS);

        try {
            logger.log(`Lösche Anzeige mit ID: ${adId}`);

            const response = await fetch(`https://www.kleinanzeigen.de/m-anzeigen-loeschen.json?ids=${adId}`, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'x-csrf-token': getCsrfToken(),
                    'content-type': 'application/json'
                },
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    logger.warn('Session abgelaufen', { status: response.status });
                    throw new Error('Sitzung abgelaufen - bitte neu einloggen und Seite neu laden.');
                }
                logger.error(`Anzeige-Löschung fehlgeschlagen`, { status: response.status });
                throw new Error(`HTTP ${response.status}`);
            }

            logger.log('Anzeige erfolgreich gelöscht');
            return await response.json();

        } catch (error) {
            clearTimeout(timeout);
            if (error.name === 'AbortError') {
                logger.error('Timeout beim Löschen');
                throw new Error('Timeout beim Löschen');
            }
            logger.error('Fehler beim Löschen', error);
            throw error;
        }
    }

    // === HAUPTFUNKTIONEN ===
    function findSaveButton() {
        return Array.from(document.querySelectorAll('button')).find(
            b => b.textContent.trim().startsWith('Anzeige speichern')
        );
    }

    function waitForElement(finderFn, timeoutMs) {
        return new Promise(function (resolve) {
            const el = finderFn();
            if (el) return resolve(el);
            const interval = setInterval(function () {
                const el = finderFn();
                if (el) { clearInterval(interval); resolve(el); }
            }, 300);
            setTimeout(function () { clearInterval(interval); resolve(null); }, timeoutMs);
        });
    }

    async function duplicateAd() {
        try {
            logger.log('Starte Duplikat-Prozess');
            showLoadingSpinner();

            const saveBtn = await waitForElement(findSaveButton, 10000);
            if (!saveBtn) throw new Error('Speichern-Button nicht gefunden (Timeout)');

            const adIdInput = await waitForElement(
                () => document.querySelector('input[name="adId"], #postad-id, input[name="postad-id"]'),
                10000
            );
            if (adIdInput) {
                adIdInput.removeAttribute('name');
                adIdInput.value = '';
                logger.log('adId Input: name-Attribut entfernt und Wert geleert');
            }

            logger.log('Anzeige-ID geleert, klicke Speichern-Button');
            showNotification('Anzeige wird dupliziert...');

            // Popup-Dismisser starten bevor wir klicken
            startPopupDismisser();
            saveBtn.click();

        } catch (error) {
            logger.error('Fehler beim Duplizieren', error);
            showNotification('Fehler: ' + error.message, 'error');
            showLoadingSpinner(false);
            document.querySelectorAll('.ka-duplicate-btn, .ka-smart-btn').forEach(btn => btn.disabled = false);
        }
    }

    // === BATCH-WORKER: Snapshot/Recovery via IndexedDB ===
    const BATCH_IDB_NAME = 'ka-batch';
    const BATCH_IDB_VERSION = 1;
    const BATCH_IDB_STORE = 'snapshots';

    function batchOpenIDB() {
        return new Promise(function (resolve, reject) {
            const req = indexedDB.open(BATCH_IDB_NAME, BATCH_IDB_VERSION);
            req.onupgradeneeded = function () {
                const db = req.result;
                if (!db.objectStoreNames.contains(BATCH_IDB_STORE)) {
                    db.createObjectStore(BATCH_IDB_STORE, { keyPath: 'adId' });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }
    function batchPutSnapshot(snap) {
        return batchOpenIDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                const tx = db.transaction(BATCH_IDB_STORE, 'readwrite');
                const req = tx.objectStore(BATCH_IDB_STORE).put(snap);
                req.onsuccess = function () { resolve(); };
                req.onerror = function () { reject(req.error); };
            });
        });
    }

    function batchSetResult(adId, value) {
        try { localStorage.setItem('ka-batch-result-' + adId, value); }
        catch (e) { logger.warn('localStorage write fehlgeschlagen', e); }
    }

    function isBatchMode() { return window.location.hash === '#smartRepublish'; }

    function readFormFields() {
        const fields = {};
        const rawFields = {};
        document.querySelectorAll('input, textarea, select').forEach(function (el) {
            const name = el.getAttribute('name');
            if (!name) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
                if (!el.checked) return;
            }
            if (el.type === 'password' || el.type === 'file') return;
            const v = el.value;
            if (v === undefined || v === null || v === '') return;
            rawFields[name] = String(v).slice(0, 5000);
        });
        const titleInput = document.querySelector('input[name="title"], input#title');
        if (titleInput) fields.title = titleInput.value;
        const descTa = document.querySelector('textarea[name="description"], textarea#description');
        if (descTa) fields.description = descTa.value;
        const priceInput = document.querySelector('input[name="price"], input#price');
        if (priceInput) fields.price = priceInput.value;
        const priceTypeSel = document.querySelector('select[name="priceType"], select#priceType');
        if (priceTypeSel) fields.priceType = priceTypeSel.value;
        const locInput = document.querySelector('input[name="locationStr"], input#locationStr, input[name="zipCode"]');
        if (locInput) fields.location = locInput.value;
        return { fields: fields, rawFields: rawFields };
    }

    function collectImageUrls() {
        const urls = new Set();
        document.querySelectorAll('img').forEach(function (img) {
            const src = img.src || img.getAttribute('data-src') || '';
            if (src && src.indexOf('img.kleinanzeigen.de') >= 0 && src.indexOf('/prod-ads/images/') >= 0) {
                // Auf groesste Variante normalisieren (rule=$_57.JPG = full size)
                const url = src.replace(/[?&]rule=\$_\d+\.[A-Z]+/i, '?rule=$_57.JPG');
                urls.add(url);
            }
        });
        return Array.from(urls);
    }

    async function fetchAsBlob(url) {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.blob();
    }

    async function buildSnapshot(adId) {
        const ff = readFormFields();
        const urls = collectImageUrls();
        const images = [];
        for (const u of urls) {
            try {
                const blob = await fetchAsBlob(u);
                images.push({ url: u, blob: blob, mime: blob.type || 'image/jpeg' });
            } catch (e) {
                logger.warn('Bild-Fetch fehlgeschlagen, speichere nur URL', { url: u, error: String(e) });
                images.push({ url: u, blob: null, mime: null });
            }
        }
        return {
            adId: String(adId),
            capturedAt: Date.now(),
            title: ff.fields.title || '',
            fields: ff.fields,
            rawFields: ff.rawFields,
            images: images
        };
    }

    async function smartRepublish() {
        const urlMatch = window.location.search.match(/adId=(\d+)/);
        const originalId = urlMatch ? urlMatch[1] : null;
        const batchMode = isBatchMode();
        // Lifecycle-Marker fuer differenzierte Fehlerklassifikation:
        // wenn nach erfolgreichem Delete etwas schief geht, ist das Datenverlust.
        let phase = 'init';

        try {
            logger.log('Starte Smart-Republish-Prozess', { batchMode: batchMode, originalId: originalId });
            showLoadingSpinner();

            if (!originalId) throw new Error('Keine Anzeigen-ID in URL gefunden');

            // Defensive: alten Result-Key abraeumen, falls ein vorheriger Run
            // crashte und einen Stale-Wert hinterlassen hat.
            if (batchMode) {
                try { localStorage.removeItem('ka-batch-result-' + originalId); } catch (e) {}
            }

            // Snapshot VOR Loeschung speichern (atomar, erst dann weiter)
            if (batchMode) {
                try {
                    showNotification('Snapshot wird erstellt...');
                    const snap = await buildSnapshot(originalId);
                    await batchPutSnapshot(snap);
                    phase = 'snapshot_done';
                    logger.log('Snapshot gespeichert', { adId: originalId, images: snap.images.length });
                } catch (e) {
                    logger.error('Snapshot fehlgeschlagen, Abbruch vor Loeschung', e);
                    showNotification('Snapshot fehlgeschlagen - Abbruch', 'error');
                    showLoadingSpinner(false);
                    document.querySelectorAll('.ka-duplicate-btn, .ka-smart-btn').forEach(btn => btn.disabled = false);
                    batchSetResult(originalId, 'error:snapshot_failed:' + (e.message || 'unbekannt'));
                    return;
                }
            }

            logger.log('Versuche Original-Anzeige ' + originalId + ' zu loeschen');
            showNotification('Original wird gelöscht...');

            let deleteFailed = false;
            try {
                await deleteAd(originalId);
                await delay(CONFIG.DELETE_WAIT_BEFORE_CREATE_MS);
                phase = 'delete_ok';
                logger.log('Original-Anzeige erfolgreich gelöscht');
            } catch (error) {
                deleteFailed = true;
                phase = 'delete_failed';
                logger.warn('Loeschung fehlgeschlagen', error);
                showNotification('Original konnte nicht gelöscht werden - erstelle trotzdem neue.', 'error');
            }

            const saveBtn = await waitForElement(findSaveButton, 10000);
            if (!saveBtn) throw new Error('Speichern-Button nicht gefunden (Timeout)');

            const adIdInput = document.querySelector('input[name="adId"], #postad-id, input[name="postad-id"]');
            if (adIdInput) {
                adIdInput.removeAttribute('name');
                adIdInput.value = '';
                logger.log('adId Input: name-Attribut entfernt und Wert geleert');
            }

            const statusMsg = deleteFailed
                ? 'Neue Anzeige wird erstellt (Original bleibt noch kurz sichtbar)...'
                : 'Neue Anzeige wird erstellt (mit allen Bildern)...';
            logger.log('Erstelle neue Anzeige', { deleteFailed });
            showNotification(statusMsg);

            startPopupDismisser();
            if (batchMode) {
                // Marker fuer die Bestaetigungs-Seite: dort wird 'ok' an den Helper
                // gemeldet. Der Helper schliesst den Tab via GM_openInTab.close().
                try { sessionStorage.setItem('ka-batch-original-adid', originalId); } catch (e) {}
            }
            phase = 'save_clicked';
            saveBtn.click();

            // B) Self-Watchdog: wenn der Tab nach 45s noch auf der Bearbeiten-Seite
            // ist, hat das Save serverseitig nicht durchgegriffen. Ohne diesen
            // Hinweis wuerde der Helper nur ein generisches Timeout sehen.
            if (batchMode) {
                setTimeout(function () {
                    try {
                        if (window.location.pathname.indexOf('/p-anzeige-bearbeiten.html') === 0) {
                            const sub = (deleteFailed) ? 'delete_failed' : 'delete_ok';
                            logger.error('Watchdog: Save scheint nicht navigiert zu haben', { sub: sub });
                            batchSetResult(originalId, 'error:save_failed:' + sub);
                        }
                    } catch (e) {}
                }, 45 * 1000);
            }

        } catch (error) {
            logger.error('Fehler beim Smart-Republish', error);
            showNotification('Fehler: ' + error.message, 'error');
            showLoadingSpinner(false);
            document.querySelectorAll('.ka-duplicate-btn, .ka-smart-btn').forEach(btn => btn.disabled = false);
            if (batchMode && originalId) {
                // Wenn Original bereits geloescht wurde, ist das Datenverlust.
                // Helper soll Snapshot behalten und Batch stoppen.
                if (phase === 'delete_ok' || phase === 'save_clicked') {
                    batchSetResult(originalId, 'error:save_failed:delete_ok');
                } else if (phase === 'delete_failed') {
                    batchSetResult(originalId, 'error:save_failed:delete_failed');
                } else {
                    batchSetResult(originalId, 'error:exception:' + (error.message || 'unbekannt'));
                }
            }
        }
    }

    // === BUTTONS ERSTELLEN (Floating Toolbar, außerhalb React-DOM) ===
    let buttonCreateRetries = 0;
    const TOOLBAR_ID = 'ka-floating-toolbar';

    function createButtons() {
        if (document.getElementById(TOOLBAR_ID)) return;

        const form = document.querySelector('form');
        if (!form) {
            if (buttonCreateRetries < CONFIG.MAX_BUTTON_RETRIES) {
                buttonCreateRetries++;
                const waitTime = getExponentialBackoffWait(buttonCreateRetries);
                logger.log(`Submit-Button nicht gefunden, Versuch ${buttonCreateRetries}/${CONFIG.MAX_BUTTON_RETRIES}`);
                setTimeout(createButtons, waitTime);
            } else {
                logger.error('Button-Erstellung fehlgeschlagen');
            }
            return;
        }

        logger.log('Erstelle Floating-Toolbar');
        ensureStyles();

        const toolbar = document.createElement('div');
        toolbar.id = TOOLBAR_ID;
        toolbar.style.cssText = [
            'position:fixed',
            'bottom:20px',
            'right:20px',
            'z-index:99999',
            'display:flex',
            'gap:8px',
            'padding:12px',
            'background:white',
            'border-radius:8px',
            'box-shadow:0 4px 20px rgba(0,0,0,0.25)'
        ].join(';');

        const dupButton = document.createElement('button');
        dupButton.type = 'button';
        dupButton.className = 'ka-duplicate-btn';
        dupButton.textContent = 'Duplizieren';
        dupButton.title = 'Erstellt eine Kopie, Original bleibt erhalten';

        const smartButton = document.createElement('button');
        smartButton.type = 'button';
        smartButton.className = 'ka-smart-btn';
        smartButton.textContent = 'Smart neu einstellen';
        smartButton.title = 'Löscht Original und erstellt neue Anzeige';

        dupButton.onclick = (e) => {
            e.preventDefault();
            dupButton.disabled = true;
            smartButton.disabled = true;
            duplicateAd();
        };

        smartButton.onclick = (e) => {
            e.preventDefault();
            if (confirm('Original-Anzeige wird gelöscht und als neue Anzeige eingestellt.\n\nAlle Bilder bleiben erhalten.\n\nFortfahren?')) {
                dupButton.disabled = true;
                smartButton.disabled = true;
                smartRepublish();
            }
        };

        toolbar.appendChild(dupButton);
        toolbar.appendChild(smartButton);
        document.body.appendChild(toolbar);

        logger.log('Floating-Toolbar erstellt');
        showNotification('Duplikations-Buttons bereit!', 'success');
    }

    // === INITIALISIERUNG ===
    function init() {
        logger.log('UserScript initialisiert (v3.5.2)');

        // Wenn wir auf der Bestaetigungs-Seite gelandet sind und der Batch-Marker
        // im sessionStorage liegt: Erfolg an den Helper signalisieren. Den Tab
        // schliesst der Helper-Tab per GM_openInTab.close().
        if (window.location.pathname.indexOf('/p-anzeige-aufgeben-bestaetigung.html') === 0) {
            try {
                const origAdId = sessionStorage.getItem('ka-batch-original-adid');
                if (origAdId) {
                    sessionStorage.removeItem('ka-batch-original-adid');
                    logger.log('Bestaetigungs-Seite erreicht, signalisiere ok an Helper', { origAdId: origAdId });
                    try { localStorage.setItem('ka-batch-result-' + origAdId, 'ok'); } catch (e) {}
                }
            } catch (e) {
                logger.warn('Bestaetigungs-Seite Hook fehlgeschlagen', e);
            }
            return;
        }

        // Banner-Blocker sofort injizieren
        injectBannerBlockerStyles();

        function startOrRepublish() {
            const hash = window.location.hash;
            if (hash === '#smartRepublish') {
                logger.log('Smart Republish via Helper erkannt');
                smartRepublish();
            } else if (hash === '#duplicate') {
                logger.log('Duplizieren via Helper erkannt');
                duplicateAd();
            } else {
                createButtons();
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startOrRepublish);
        } else {
            startOrRepublish();
        }
    }

    // Start
    init();

})();
