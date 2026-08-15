// ==UserScript==
// @name          eBay Kleinanzeigen - Anzeige duplizieren / neu einstellen
// @namespace     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @description   Einfaches Duplizieren und Smart Neu-Einstellen von Anzeigen mit automatischer Bilderhaltung
// @icon          https://www.kleinanzeigen.de/favicon.ico
// @copyright     2026
// @license       MIT
// @version       3.8.0
// @author        OldRon1977 (Improvements), J05HI (Original)
// @credits       Basierend auf dem Original-Script von J05HI (https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5)
// @match         https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://www.kleinanzeigen.de/p-anzeige-aufgeben-bestaetigung.html*
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

    const SCRIPT_VERSION = '3.8.0'; // wird von scripts/build.js synchron zu package.json gehalten

    // === KONSTANTEN ===
    const CONFIG = {
        NOTIFICATION_TIMEOUT_MS: 4000,
        DELETE_REQUEST_TIMEOUT_MS: 8000,
        DELETE_WAIT_BEFORE_CREATE_MS: 2000,
        INITIAL_RETRY_WAIT_MS: 500,
        MAX_RETRY_WAIT_MS: 8000,
        DUPLICATE_READY_SETTLE_MS: 1500,
        MAX_BUTTON_RETRIES: 5,
        POPUP_POLL_INTERVAL_MS: 200,
        POPUP_POLL_TIMEOUT_MS: 30000,
        POPUP_RECLICK_COOLDOWN_MS: 1000,
        SAVE_WATCHDOG_TIMEOUT_MS: 45000
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

    // Bekannte Namen/IDs des versteckten Ad-ID-Felds. Kleinanzeigen hat den
    // Feldnamen historisch schon zweimal geaendert (#postad-id -> name="id"
    // -> name="adId"), deshalb ist die Liste kumulativ.
    const AD_ID_SELECTOR = 'input[name="adId"], #postad-id, input[name="postad-id"], input[name="id"]';

    function getUrlAdId(loc) {
        const search = (loc || window.location).search || '';
        const m = search.match(/adId=(\d+)/);
        return m ? m[1] : null;
    }

    /**
     * Loest das versteckte Ad-ID-Feld auf.
     *
     * Primaer ueber die bekannten Selektoren. Greift keiner, wird
     * namensunabhaengig das Input gesucht, dessen Wert exakt der adId aus der
     * URL entspricht -- auf der Bearbeiten-Seite ist dieser Treffer eindeutig,
     * weil der Wert die ID der gerade bearbeiteten Anzeige ist. Damit ueberlebt
     * die Aufloesung eine weitere Umbenennung des Feldnamens (Issue #49).
     *
     * Bleibt der Treffer mehrdeutig, wird bewusst null geliefert: lieber
     * abbrechen als das falsche Feld neutralisieren.
     */
    function findAdIdInput(doc, urlAdId) {
        const direct = doc.querySelector(AD_ID_SELECTOR);
        if (direct) return direct;
        if (!urlAdId) return null;

        // Bewusst nur Hidden-Felder: das Ad-ID-Feld war in jeder bisherigen
        // Variante versteckt. Ein sichtbares Feld mit zufaellig gleichem Wert
        // (etwa ein Titel, der nur aus der ID besteht) wuerde durch die
        // Neutralisierung geleert -- die Kopie waere beschaedigt.
        const candidates = Array.from(doc.querySelectorAll('input[type="hidden"]'))
            .filter(function (i) { return i.value === urlAdId; });
        return candidates.length === 1 ? candidates[0] : null;
    }

    /**
     * Beschreibt, ueber welchen Weg ein Feld aufgeloest wurde. Muss VOR der
     * Neutralisierung aufgerufen werden -- das Entfernen des name-Attributs
     * veraendert das Selektor-Matching.
     *
     * Ein Treffer per Fallback bedeutet: Kleinanzeigen hat den Feldnamen
     * geaendert. Das soll im Log stehen, bevor der naechste Selektor-Bruch
     * kommt -- sonst ist aus einem erfolgreichen Lauf nicht ablesbar, dass die
     * bekannten Selektoren nicht mehr greifen (Issue #49).
     */
    function describeAdIdResolution(el) {
        const perSelektor = el.matches(AD_ID_SELECTOR);
        return {
            weg: perSelektor ? 'bekannter Selektor' : 'Fallback ueber Feldwert',
            feldName: el.name || el.id || '(ohne name)',
            selektorVeraltet: !perSelektor
        };
    }

    function logAdIdResolution(el) {
        const info = describeAdIdResolution(el);
        logger.log('adId-Feld aufgeloest', info);
        if (info.selektorVeraltet) {
            logger.warn('Bekannte adId-Selektoren greifen nicht mehr, Feld heisst jetzt "' +
                info.feldName + '" - bitte im Repository melden');
        }
        return info;
    }

    /**
     * Bestandsaufnahme fuer den Abbruch-Fall. Ohne die Feldnamen aus der
     * betroffenen Umgebung ist nicht entscheidbar, ob das Feld nur umbenannt
     * wurde oder ganz fehlt (Issue #49) -- die Ausgabe ist bewusst so knapp,
     * dass sie gefahrlos in ein Issue kopiert werden kann: nur Feldnamen und
     * Wertlaengen, keine Feldinhalte.
     */
    function describeAdIdLookup(doc, urlAdId) {
        return {
            urlAdId: urlAdId ? 'vorhanden' : 'fehlt',
            speichernButton: !!Array.from(doc.querySelectorAll('button')).find(
                function (b) { return b.textContent.trim().indexOf('Anzeige speichern') === 0; }
            ),
            inputs: doc.querySelectorAll('input').length,
            hiddenFelder: Array.from(doc.querySelectorAll('input[type="hidden"]'))
                .map(function (i) { return (i.name || i.id || '(ohne name)') + ':' + (i.value || '').length; })
        };
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

    // Wartet auf vollstaendiges Laden der Seite (window 'load'). Wichtig beim
    // Auto-Trigger via #duplicate-Hash: ein Klick auf "Anzeige speichern" bevor
    // die React-Form hydratisiert ist verpufft (Spinner dreht endlos). Blockiert
    // nie unbegrenzt -- ein Fallback-Timeout loest das Promise auf jeden Fall.
    function waitUntilPageLoaded(fallbackMs) {
        return new Promise(function (resolve) {
            if (document.readyState === 'complete') { resolve(); return; }
            let done = false;
            const finish = function () { if (done) return; done = true; resolve(); };
            window.addEventListener('load', finish, { once: true });
            setTimeout(finish, fallbackMs || 10000);
        });
    }

    // Verhindert einen dauerhaft blockierten Vollbild-Spinner: falls nach dem
    // Klick auf "Anzeige speichern" die erwartete Seiten-Navigation ausbleibt
    // (z.B. Serverfehler ohne Redirect), raeumt dieser Watchdog UI-Overlay
    // und Buttons auf, statt die Seite dauerhaft klick-blockiert zu lassen.
    function startSaveWatchdog() {
        setTimeout(function () {
            try {
                if (window.location.pathname.indexOf('/p-anzeige-bearbeiten.html') === 0) {
                    logger.error('Save-Watchdog: Keine Navigation nach Speichern-Klick erkannt, gebe UI frei');
                    showLoadingSpinner(false);
                    document.querySelectorAll('.ka-duplicate-btn, .ka-smart-btn').forEach(btn => btn.disabled = false);
                    showNotification('Speichern scheint fehlgeschlagen - bitte Seite prüfen und ggf. manuell speichern.', 'error');
                }
            } catch (e) {}
        }, CONFIG.SAVE_WATCHDOG_TIMEOUT_MS);
    }

    async function duplicateAd() {
        try {
            logger.log('Starte Duplikat-Prozess');
            showLoadingSpinner();

            const urlAdId = getUrlAdId();
            let saveBtn = await waitForElement(findSaveButton, 10000);
            if (!saveBtn) throw new Error('Speichern-Button nicht gefunden (Timeout)');

            let adIdInput = await waitForElement(
                () => findAdIdInput(document, urlAdId),
                10000
            );
            // Harter Abbruch, wenn das adId-Feld nicht auffindbar ist: ohne
            // Neutralisierung haette der Submit Bearbeiten- statt Neuanlage-
            // Semantik. Der catch-Block raeumt UI und Buttons auf.
            if (!adIdInput) {
                logger.error('adId-Feld nicht auffindbar - Bestandsaufnahme fuer Issue-Meldung',
                    describeAdIdLookup(document, urlAdId));
                throw new Error('adId-Feld nicht gefunden - Abbruch, um versehentliches Bearbeiten zu verhindern');
            }

            // Beim Auto-Trigger via #duplicate-Hash startet das Script direkt beim
            // Laden. Ein zu frueher Speichern-Klick verpufft, weil die React-Form
            // noch nicht hydratisiert ist -> der Vollbild-Spinner dreht endlos.
            // Deshalb erst auf vollstaendiges Laden + kurze Settle-Zeit warten.
            // Im manuellen Modus (Klick nach Laden) ist die Seite laengst bereit,
            // der Wait ist dann faktisch ein No-Op.
            await waitUntilPageLoaded();
            await delay(CONFIG.DUPLICATE_READY_SETTLE_MS);

            // Referenzen koennen durch React-Re-Render veraltet sein -> neu aufloesen.
            if (!saveBtn.isConnected) {
                saveBtn = await waitForElement(findSaveButton, 5000);
            }
            if (!adIdInput.isConnected) {
                adIdInput = await waitForElement(() => findAdIdInput(document, urlAdId), 5000);
            }
            if (!saveBtn || !adIdInput) {
                throw new Error('Formular nach Laden nicht auffindbar - Abbruch, um versehentliches Bearbeiten zu verhindern');
            }

            // Neutralisierung erst unmittelbar vor dem Klick, damit ein spaeter
            // React-Re-Render das name-Attribut nicht wiederherstellt.
            logAdIdResolution(adIdInput);
            adIdInput.removeAttribute('name');
            adIdInput.value = '';
            logger.log('adId Input: name-Attribut entfernt und Wert geleert');

            logger.log('Anzeige-ID geleert, klicke Speichern-Button');
            showNotification('Anzeige wird dupliziert...');

            // Nur im Helper-Modus (aus "Meine Anzeigen" via #duplicate-Hash):
            // Marker setzen, damit die Bestaetigungs-Seite dem Helper 'ok'
            // signalisiert und dieser den Worker-Tab schliesst. Im manuellen
            // On-Page-Modus (Button direkt auf der Bearbeiten-Seite) bleibt der
            // Tab bewusst offen -- es gibt keinen Helper, der ihn schliessen soll,
            // und es waere der Haupt-Tab des Users.
            if (window.location.hash === '#duplicate' && urlAdId) {
                try { sessionStorage.setItem('ka-duplicate-adid', urlAdId); } catch (e) {}
            }

            // Popup-Dismisser starten bevor wir klicken
            startPopupDismisser();
            saveBtn.click();
            startSaveWatchdog();

        } catch (error) {
            logger.error('Fehler beim Duplizieren', error);
            showNotification('Fehler: ' + error.message, 'error');
            showLoadingSpinner(false);
            document.querySelectorAll('.ka-duplicate-btn, .ka-smart-btn').forEach(btn => btn.disabled = false);
        }
    }

    // === BATCH-WORKER: Snapshot/Recovery via IndexedDB ===
    // Geteiltes Tab-Protokoll: Werte muessen in beiden Scripts synchron bleiben
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

    function batchDeleteSnapshot(adId) {
        return batchOpenIDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                const tx = db.transaction(BATCH_IDB_STORE, 'readwrite');
                const req = tx.objectStore(BATCH_IDB_STORE).delete(String(adId));
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
            // Sicherheits-Artefakte gehoeren nicht in den Snapshot: Der Snapshot/ZIP
            // ist fuer die manuelle Wiederherstellung durch Menschen gedacht, nicht
            // fuer Tokens. Hidden-Felder (u.a. das CSRF-Token in input[name="_csrf"],
            // siehe getCsrfToken()) sowie Passwort-/Datei-Felder werden ausgeschlossen.
            // "_csrf" zusaetzlich per Namens-Denylist, falls das Token je in einem
            // nicht-hidden Feld auftauchen sollte.
            if (el.type === 'password' || el.type === 'file' || el.type === 'hidden' || name === '_csrf') return;
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
        const originalId = getUrlAdId();
        const batchMode = isBatchMode();
        // Lifecycle-Marker fuer differenzierte Fehlerklassifikation:
        // wenn nach erfolgreichem Delete etwas schief geht, ist das Datenverlust.
        let phase = 'init';

        try {
            logger.log('Starte Smart-Republish-Prozess', { batchMode: batchMode, originalId: originalId });
            showLoadingSpinner();

            if (!originalId) throw new Error('Keine Anzeigen-ID in URL gefunden');

            // PREFLIGHT: Bevor irgendetwas Destruktives (Loeschung) passiert,
            // muessen Speichern-Button UND adId-Input vorhanden sein. Fehlt eines,
            // wird OHNE Loeschung abgebrochen - so kann das Original nicht verloren
            // gehen, wenn die Seite den Neuanlage-Submit gar nicht durchfuehren
            // koennte.
            let saveBtn = await waitForElement(findSaveButton, 10000);
            let adIdInput = await waitForElement(
                () => findAdIdInput(document, originalId),
                10000
            );
            if (!saveBtn || !adIdInput) {
                const missing = !saveBtn ? 'save_button_missing' : 'adid_input_missing';
                logger.error('Preflight fehlgeschlagen, Abbruch vor Loeschung', { missing: missing });
                if (!adIdInput) {
                    logger.error('adId-Feld nicht auffindbar - Bestandsaufnahme fuer Issue-Meldung',
                        describeAdIdLookup(document, originalId));
                }
                showNotification('Voraussetzung fehlt (' + missing + ') - Abbruch, Original bleibt erhalten.', 'error');
                showLoadingSpinner(false);
                document.querySelectorAll('.ka-duplicate-btn, .ka-smart-btn').forEach(btn => btn.disabled = false);
                if (batchMode) {
                    batchSetResult(originalId, 'error:precondition_failed:' + missing);
                }
                return;
            }

            // Defensive: alten Result-Key abraeumen, falls ein vorheriger Run
            // crashte und einen Stale-Wert hinterlassen hat.
            if (batchMode) {
                try { localStorage.removeItem('ka-batch-result-' + originalId); } catch (e) {}
            }

            // Snapshot VOR Loeschung speichern (atomar, erst dann weiter). Laeuft
            // in BEIDEN Modi: im manuellen Modus dient er als Sicherung, wird aber
            // nach erfolgreicher Neuanlage auf der Bestaetigungs-Seite wieder
            // geloescht (siehe init()).
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
                if (batchMode) {
                    batchSetResult(originalId, 'error:snapshot_failed:' + (e.message || 'unbekannt'));
                }
                return;
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

            // Nach Loeschung koennen die im Preflight aufgeloesten Referenzen durch
            // ein React-Re-Render veraltet sein. Bei getrennten Knoten einmal neu
            // aufloesen. Schlaegt das JETZT fehl, ist das Original ggf. schon
            // geloescht -> Datenverlust-korrekter Fehlercode.
            if (!saveBtn.isConnected) {
                saveBtn = await waitForElement(findSaveButton, 5000);
            }
            if (!adIdInput.isConnected) {
                adIdInput = await waitForElement(() => findAdIdInput(document, originalId), 5000);
            }
            if (!saveBtn || !adIdInput) {
                logger.error('Referenzen nach Loeschung nicht mehr aufloesbar', { deleteFailed: deleteFailed });
                showNotification('Formular nach Loeschung nicht auffindbar - bitte Seite pruefen.', 'error');
                showLoadingSpinner(false);
                document.querySelectorAll('.ka-duplicate-btn, .ka-smart-btn').forEach(btn => btn.disabled = false);
                if (batchMode) {
                    batchSetResult(originalId, 'error:save_failed:' + (deleteFailed ? 'delete_failed' : 'delete_ok'));
                }
                return;
            }

            // Neutralisierung ist Pflicht: nur mit erfolgreich aufgeloestem Input
            // wird der Submit als Neuanlage (statt Bearbeiten) interpretiert.
            logAdIdResolution(adIdInput);
            adIdInput.removeAttribute('name');
            adIdInput.value = '';
            logger.log('adId Input: name-Attribut entfernt und Wert geleert');

            const statusMsg = deleteFailed
                ? 'Neue Anzeige wird erstellt (Original bleibt noch kurz sichtbar)...'
                : 'Neue Anzeige wird erstellt (mit allen Bildern)...';
            logger.log('Erstelle neue Anzeige', { deleteFailed });
            showNotification(statusMsg);

            startPopupDismisser();
            // Marker fuer die Bestaetigungs-Seite in BEIDEN Modi setzen:
            // - Batch: dort wird 'ok' an den Helper gemeldet; der Helper schliesst
            //   den Tab via GM_openInTab.close() und loescht den Snapshot.
            // - Manuell: dort wird der eigene Snapshot wieder aus IndexedDB
            //   geloescht (ka-manual-mode markiert diesen Fall), damit keine
            //   Orphan-Snapshots das Recovery-UI des Helpers als Warnung anzeigen.
            try { sessionStorage.setItem('ka-batch-original-adid', originalId); } catch (e) {}
            if (!batchMode) {
                try { sessionStorage.setItem('ka-manual-mode', '1'); } catch (e) {}
            }
            phase = 'save_clicked';
            saveBtn.click();
            startSaveWatchdog();

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
        logger.log('UserScript initialisiert (v' + SCRIPT_VERSION + ')');

        // Wenn wir auf der Bestaetigungs-Seite gelandet sind und der Batch-Marker
        // im sessionStorage liegt: Erfolg an den Helper signalisieren. Den Tab
        // schliesst der Helper-Tab per GM_openInTab.close().
        if (window.location.pathname.indexOf('/p-anzeige-aufgeben-bestaetigung.html') === 0) {
            try {
                // Duplikat via Helper: 'ok' signalisieren, damit der Helper den
                // Worker-Tab schliesst (analog Smart-Republish, aber ohne Snapshot).
                const dupAdId = sessionStorage.getItem('ka-duplicate-adid');
                if (dupAdId) {
                    sessionStorage.removeItem('ka-duplicate-adid');
                    logger.log('Bestaetigungs-Seite (Duplikat) erreicht, signalisiere ok an Helper', { dupAdId: dupAdId });
                    try { localStorage.setItem('ka-duplicate-result-' + dupAdId, 'ok'); } catch (e) {}
                }

                const origAdId = sessionStorage.getItem('ka-batch-original-adid');
                const manualMode = sessionStorage.getItem('ka-manual-mode') === '1';
                if (origAdId) {
                    sessionStorage.removeItem('ka-batch-original-adid');
                    sessionStorage.removeItem('ka-manual-mode');
                    if (manualMode) {
                        // Manueller Modus: kein Helper beteiligt. Den eigenen
                        // Snapshot wieder abraeumen, damit keine Orphan-Snapshots
                        // das Recovery-UI des Helpers spaeter als Warnung anzeigen.
                        logger.log('Bestaetigungs-Seite (manuell) erreicht, loesche eigenen Snapshot', { origAdId: origAdId });
                        batchDeleteSnapshot(origAdId).catch(function (e) {
                            logger.warn('Snapshot-Loeschung (manuell) fehlgeschlagen', e);
                        });
                    } else {
                        logger.log('Bestaetigungs-Seite erreicht, signalisiere ok an Helper', { origAdId: origAdId });
                        try { localStorage.setItem('ka-batch-result-' + origAdId, 'ok'); } catch (e) {}
                    }
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

    // Test-Exports: nur in Node (Vitest) aktiv, im Browser wirkungslos.
    // Strenge Umgebungspruefung, damit eine Website mit globalem `module`
    // das Script nicht versehentlich deaktivieren kann.
    if (typeof module !== 'undefined' && module.exports &&
        typeof process !== 'undefined' && process.versions && process.versions.node) {
        module.exports = {
            CONFIG, getExponentialBackoffWait, readFormFields, collectImageUrls,
            findAdIdInput, describeAdIdLookup, describeAdIdResolution, getUrlAdId
        };
        return; // im Test-Kontext keine Initialisierung/Timer
    }

    // Start
    init();

})();
