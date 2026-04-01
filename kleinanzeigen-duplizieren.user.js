// ==UserScript==
// @name          eBay Kleinanzeigen - Anzeige duplizieren / neu einstellen
// @namespace     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @description   Einfaches Duplizieren und Smart Neu-Einstellen von Anzeigen mit automatischer Bilderhaltung
// @icon          https://www.google.com/s2/favicons?domain=www.kleinanzeigen.de
// @copyright     2026
// @license       MIT
// @version       3.3.5
// @author        OldRon1977 (Improvements), J05HI (Original)
// @credits       Basierend auf dem Original-Script von J05HI (https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5)
// @match         https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://*.kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://www.ebay-kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://ebay-kleinanzeigen.de/p-anzeige-bearbeiten.html*
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
 * Ã„nderungen in v3.0:
 * - Smart Neu-Einstellen Funktion hinzugefÃ¼gt
 * - Bilder bleiben automatisch erhalten (keine Warnung nÃ¶tig)
 * - Code vereinfacht und modernisiert
 * - Besseres Error-Handling mit Timeout
 */

(function () {
    'use strict';

    // === KONSTANTEN ===
    const CONFIG = {
        NOTIFICATION_TIMEOUT_MS: 4000,     // Wie lange Toast-Nachrichten angezeigt werden
        DELETE_REQUEST_TIMEOUT_MS: 8000,   // Timeout fÃ¼r API-Anfrage zum LÃ¶schen
        DELETE_WAIT_BEFORE_CREATE_MS: 2000, // Warten bis LÃ¶schung verarbeitet ist
        INITIAL_RETRY_WAIT_MS: 500,        // Initiale Wartezeit fÃ¼r Retries
        MAX_RETRY_WAIT_MS: 8000,           // Maximale Wartezeit zwischen Retries
        MAX_BUTTON_RETRIES: 5              // Maximale Versuche zum Erstellen der Buttons
    };

    // === LOGGING ===
    const logger = {
        log: (msg, data) => console.log(`[KA-Script] ${msg}`, data || ''),
        warn: (msg, data) => console.warn(`[KA-Script] âš ï¸ ${msg}`, data || ''),
        error: (msg, data) => console.error(`[KA-Script] âŒ ${msg}`, data || '')
    };

    // === HILFSFUNKTIONEN ===
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Berechnet Wartezeit mit exponential backoff
     * @param {number} retryCount - Aktuelle Versuches-Nummer (ab 1)
     * @returns {number} Wartezeit in ms
     */
    function getExponentialBackoffWait(retryCount) {
        // 2^(retryCount-1) * INITIAL_RETRY_WAIT_MS, max MAX_RETRY_WAIT_MS
        const exponentialWait = Math.pow(2, retryCount - 1) * CONFIG.INITIAL_RETRY_WAIT_MS;
        return Math.min(exponentialWait, CONFIG.MAX_RETRY_WAIT_MS);
    }

    function showNotification(message, type = 'info') {
        // Styles sicherstellen
        ensureStyles();

        // Alte Notifications entfernen
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
        // US-SEC-006: innerHTML durch createElement ersetzen
        const spinnerInner = document.createElement('div');
        spinner.appendChild(spinnerInner);
        document.body.appendChild(spinner);
    }

    // === API FUNKTIONEN ===
    function getCsrfToken() {
        const metaTag = document.querySelector('meta[name="_csrf"], meta[name="csrf-token"]');
        if (!metaTag) throw new Error('CSRF-Token Meta-Tag nicht gefunden - Seite nicht richtig geladen?');

        const token = metaTag.getAttribute('content');
        if (!token) throw new Error('CSRF-Token ist leer oder nicht gesetzt');

        return token;
    }

    async function deleteAd(adId) {
        // US-SEC-001: Input-Validierung fÃ¼r Anzeigen-ID
        if (!adId || !/^\d{1,20}$/.test(adId)) {
            throw new Error('UngÃ¼ltige Anzeigen-ID');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.DELETE_REQUEST_TIMEOUT_MS);

        try {
            logger.log(`LÃ¶sche Anzeige mit ID: ${adId}`);

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

            // US-SEC-002: Session-Timeout-Erkennung
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    logger.warn('Session abgelaufen', { status: response.status });
                    throw new Error('Sitzung abgelaufen â€“ bitte neu einloggen und Seite neu laden.');
                }
                logger.error(`Anzeige-LÃ¶schung fehlgeschlagen`, { status: response.status });
                throw new Error(`HTTP ${response.status}`);
            }

            logger.log('Anzeige erfolgreich gelÃ¶scht');
            return await response.json();

        } catch (error) {
            clearTimeout(timeout);
            if (error.name === 'AbortError') {
                logger.error('Timeout beim LÃ¶schen');
                throw new Error('Timeout beim LÃ¶schen');
            }
            logger.error('Fehler beim LÃ¶schen', error);
            throw error;
        }
    }

    // === HAUPTFUNKTIONEN ===
    function getFormElements() {
        // Neues Kleinanzeigen-Layout: Ad-ID aus URL extrahieren, Input-Feld als Fallback
        let adIdInput = document.querySelector('#postad-id, input[name="id"], input[name="postad-id"]');
        const form = document.querySelector('form');
        if (!form) throw new Error('Formular nicht gefunden');
        // Falls kein Input-Feld: virtuelles Objekt mit ID aus URL
        if (!adIdInput) {
            const urlMatch = window.location.search.match(/adId=(\d+)/);
            if (!urlMatch) throw new Error('Anzeigen-ID nicht gefunden (weder Input noch URL)');
            adIdInput = { value: urlMatch[1], _virtual: true };
            logger.log('Ad-ID aus URL extrahiert: ' + urlMatch[1]);
        }
        return { adIdInput, form };
    }


    function findSaveButton() {
        return Array.from(document.querySelectorAll('button')).find(
            b => b.textContent.trim().startsWith('Anzeige speichern')
        );
    }

    async function duplicateAd() {
        try {
            logger.log('Starte Duplikat-Prozess');
            showLoadingSpinner();

            // Neuer Ansatz: Seite ohne adId neu laden = neue Anzeige mit gleichen Daten
            // Der alte form.submit() Ansatz funktioniert nicht mit React
            const saveBtn = findSaveButton();
            if (!saveBtn) throw new Error('Speichern-Button nicht gefunden');

            // Ad-ID aus URL entfernen und Input leeren falls vorhanden
            const adIdInput = document.querySelector('#postad-id, input[name="id"], input[name="postad-id"]');
            if (adIdInput) {
                // React-kompatibel: nativeInputValueSetter nutzen
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(adIdInput, '');
                adIdInput.dispatchEvent(new Event('input', { bubbles: true }));
                adIdInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            logger.log('Anzeige-ID geleert, klicke Speichern-Button');
            showNotification('\uD83D\uDCCB Anzeige wird dupliziert...');
            saveBtn.click();

        } catch (error) {
            logger.error('Fehler beim Duplizieren', error);
            showNotification('\u274C Fehler: ' + error.message, 'error');
            showLoadingSpinner(false);
            document.querySelectorAll('.ka-duplicate-btn, .ka-smart-btn').forEach(btn => btn.disabled = false);
        }
    }

    async function smartRepublish() {
        try {
            logger.log('Starte Smart-Republish-Prozess');
            showLoadingSpinner();

            // Ad-ID aus URL holen
            const urlMatch = window.location.search.match(/adId=(\d+)/);
            if (!urlMatch) throw new Error('Keine Anzeigen-ID in URL gefunden');
            const originalId = urlMatch[1];

            logger.log(`Versuche Original-Anzeige ${originalId} zu loeschen`);
            showNotification('\uD83D\uDDD1 Original wird geloescht...');

            let deleteFailed = false;
            try {
                await deleteAd(originalId);
                await delay(CONFIG.DELETE_WAIT_BEFORE_CREATE_MS);
                logger.log('Original-Anzeige erfolgreich geloescht');
            } catch (error) {
                deleteFailed = true;
                logger.warn('Loeschung fehlgeschlagen', error);
                showNotification('Original konnte nicht geloescht werden - erstelle trotzdem neue.', 'error');
            }

            // Speichern-Button finden und klicken
            const saveBtn = findSaveButton();
            if (!saveBtn) throw new Error('Speichern-Button nicht gefunden');

            const adIdInput = document.querySelector('#postad-id, input[name="id"], input[name="postad-id"]');
            if (adIdInput) {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(adIdInput, '');
                adIdInput.dispatchEvent(new Event('input', { bubbles: true }));
                adIdInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const statusMsg = deleteFailed
                ? 'Neue Anzeige wird erstellt (Original bleibt noch kurz sichtbar)...'
                : 'Neue Anzeige wird erstellt (mit allen Bildern)...';
            logger.log('Erstelle neue Anzeige', { deleteFailed });
            showNotification(statusMsg);
            saveBtn.click();

        } catch (error) {
            logger.error('Fehler beim Smart-Republish', error);
            showNotification('\u274C Fehler: ' + error.message, 'error');
            showLoadingSpinner(false);
            document.querySelectorAll('.ka-duplicate-btn, .ka-smart-btn').forEach(btn => btn.disabled = false);
        }
    }
    // === BUTTONS ERSTELLEN ===
    // === BUTTONS ERSTELLEN (Floating Toolbar, ausserhalb React-DOM) ===
    let buttonCreateRetries = 0;
    const TOOLBAR_ID = 'ka-floating-toolbar';

    function createButtons() {
        // Bereits vorhanden? Nichts tun.
        if (document.getElementById(TOOLBAR_ID)) return;

        // Warte auf das Formular als Zeichen dass die Seite geladen ist
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

        // Floating Toolbar direkt am body - React kann sie nicht entfernen
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
        dupButton.textContent = '\uD83D\uDCCB Duplizieren';
        dupButton.title = 'Erstellt eine Kopie, Original bleibt erhalten';

        const smartButton = document.createElement('button');
        smartButton.type = 'button';
        smartButton.className = 'ka-smart-btn';
        smartButton.textContent = '\uD83D\uDD04 Smart neu einstellen';
        smartButton.title = 'Loescht Original und erstellt neue Anzeige';

        dupButton.onclick = (e) => {
            e.preventDefault();
            dupButton.disabled = true;
            smartButton.disabled = true;
            duplicateAd();
        };

        smartButton.onclick = (e) => {
            e.preventDefault();
            if (confirm('Original-Anzeige wird geloescht und als neue Anzeige eingestellt.\n\nAlle Bilder bleiben erhalten.\n\nFortfahren?')) {
                dupButton.disabled = true;
                smartButton.disabled = true;
                smartRepublish();
            }
        };

        toolbar.appendChild(dupButton);
        toolbar.appendChild(smartButton);
        document.body.appendChild(toolbar);

        logger.log('Floating-Toolbar erstellt');
        showNotification('\u2705 Duplikations-Buttons bereit!', 'success');
    }

    // === INITIALISIERUNG ===
    function init() {
        logger.log('UserScript initialisiert (v3.3.4)');

        function startOrRepublish() {
            if (window.location.hash === '#smartRepublish') {
                logger.log('Smart Republish via Helper erkannt');
                smartRepublish();
            } else {
                createButtons();
            }
        }

        // Warten bis DOM bereit
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startOrRepublish);
        } else {
            startOrRepublish();
        }
    }


    // Start
    init();

})();

