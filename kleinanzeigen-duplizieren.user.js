// ==UserScript==
// @name          eBay Kleinanzeigen - Anzeige duplizieren / neu einstellen
// @namespace     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @description   Einfaches Duplizieren und Smart Neu-Einstellen von Anzeigen mit automatischer Bilderhaltung
// @icon          http://www.google.com/s2/favicons?domain=www.kleinanzeigen.de
// @copyright     2025
// @license       MIT
// @version       3.1.0
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
// @run-at        document-idle
// @grant         none
// ==/UserScript==

/*
 * Basierend auf dem Original-Script von J05HI
 * https://gist.github.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5
 * 
 * Änderungen in v3.0:
 * - Smart Neu-Einstellen Funktion hinzugefügt
 * - Bilder bleiben automatisch erhalten (keine Warnung nötig)
 * - Code vereinfacht und modernisiert
 * - Besseres Error-Handling mit Timeout
 */

(function () {
    'use strict';

    // === KONSTANTEN ===
    const CONFIG = {
        NOTIFICATION_TIMEOUT_MS: 4000,     // Wie lange Toast-Nachrichten angezeigt werden
        DELETE_REQUEST_TIMEOUT_MS: 8000,   // Timeout für API-Anfrage zum Löschen
        DELETE_WAIT_BEFORE_CREATE_MS: 2000, // Warten bis Löschung verarbeitet ist
        INITIAL_RETRY_WAIT_MS: 500,        // Initiale Wartezeit für Retries
        MAX_RETRY_WAIT_MS: 8000,           // Maximale Wartezeit zwischen Retries
        MAX_BUTTON_RETRIES: 5              // Maximale Versuche zum Erstellen der Buttons
    };

    // === LOGGING ===
    const logger = {
        log: (msg, data) => console.log(`[KA-Script] ${msg}`, data || ''),
        warn: (msg, data) => console.warn(`[KA-Script] ⚠️ ${msg}`, data || ''),
        error: (msg, data) => console.error(`[KA-Script] ❌ ${msg}`, data || '')
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
        spinner.innerHTML = '<div></div>';
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
    function getFormElements() {
        const adIdInput = document.querySelector('#postad-id, input[name="id"], input[name="postad-id"]');
        const form = document.querySelector('form');
        if (!adIdInput || !form) throw new Error('Form-Elemente nicht gefunden');
        return { adIdInput, form };
    }

    async function duplicateAd() {
        try {
            logger.log('Starte Duplikat-Prozess');
            showLoadingSpinner();

            const { adIdInput, form } = getFormElements();

            // ID löschen = Neue Anzeige, Bilder bleiben im Form erhalten
            adIdInput.value = '';

            logger.log('Anzeige-ID gelöscht, Form wird eingereicht');
            showNotification('📋 Anzeige wird dupliziert (mit allen Bildern)...');
            form.submit();

        } catch (error) {
            logger.error('Fehler beim Duplizieren', error);
            showNotification('❌ Fehler: ' + error.message, 'error');
            showLoadingSpinner(false);
        }
    }

    async function smartRepublish() {
        try {
            logger.log('Starte Smart-Republish-Prozess');
            showLoadingSpinner();

            const { adIdInput, form } = getFormElements();

            const originalId = adIdInput.value;
            if (!originalId) throw new Error('Keine Anzeigen-ID gefunden');

            logger.log(`Versuche Original-Anzeige ${originalId} zu löschen`);
            showNotification('🗑️ Original wird gelöscht...');

            let deleteFailed = false;
            try {
                await deleteAd(originalId);
                await delay(CONFIG.DELETE_WAIT_BEFORE_CREATE_MS);
                logger.log('Original-Anzeige erfolgreich gelöscht');
            } catch (error) {
                deleteFailed = true;
                logger.warn('Löschung fehlgeschlagen, erstelle trotzdem neue Anzeige', error);
                showNotification('⚠️ Original-Anzeige konnte nicht gelöscht werden - erstelle trotzdem neue.', 'error');
            }

            // Neue Anzeige erstellen - Bilder sind noch im Form!
            adIdInput.value = '';
            const statusMsg = deleteFailed
                ? '✨ Neue Anzeige wird erstellt (Original bleibt noch kurz sichtbar)...'
                : '✨ Neue Anzeige wird erstellt (mit allen Bildern)...';
            logger.log('Erstelle neue Anzeige', { deleteFailed });
            showNotification(statusMsg);
            form.submit();

        } catch (error) {
            logger.error('Fehler beim Smart-Republish', error);
            showNotification('❌ Fehler: ' + error.message, 'error');
            showLoadingSpinner(false);
        }
    }

    // === BUTTONS ERSTELLEN ===
    let buttonCreateRetries = 0;

    function createButtons() {
        // Prüfen ob bereits vorhanden
        if (document.querySelector('.ka-duplicate-btn')) {
            logger.log('Buttons bereits vorhanden, überspringe Erstellung');
            return;
        }

        const submitButton = document.querySelector('#pstad-submit, button[type="submit"], .button-primary');
        if (!submitButton) {
            if (buttonCreateRetries < CONFIG.MAX_BUTTON_RETRIES) {
                buttonCreateRetries++;
                const waitTime = getExponentialBackoffWait(buttonCreateRetries);
                logger.log(`Submit-Button nicht gefunden, Versuch ${buttonCreateRetries}/${CONFIG.MAX_BUTTON_RETRIES} (Warte ${waitTime}ms)`);
                setTimeout(createButtons, waitTime);
            } else {
                logger.error(`Button-Erstellung fehlgeschlagen nach ${CONFIG.MAX_BUTTON_RETRIES} Versuchen`);
                showNotification('❌ Buttons konnten nicht erstellt werden - Seite nicht vollständig geladen?', 'error');
            }
            return;
        }

        logger.log('Erstelle Duplikations-Buttons');

        // Styles sicherstellen
        ensureStyles();

        // Duplikat-Button
        const dupButton = document.createElement('button');
        dupButton.type = 'button';
        dupButton.className = 'ka-duplicate-btn';
        dupButton.textContent = '📋 Duplizieren';
        dupButton.title = 'Erstellt eine Kopie, Original bleibt erhalten';
        dupButton.onclick = (e) => {
            e.preventDefault();
            duplicateAd();
        };

        // Smart-Button
        const smartButton = document.createElement('button');
        smartButton.type = 'button';
        smartButton.className = 'ka-smart-btn';
        smartButton.textContent = '🔄 Smart neu einstellen';
        smartButton.title = 'Löscht Original und erstellt neue Anzeige';
        smartButton.onclick = (e) => {
            e.preventDefault();
            if (confirm('Original-Anzeige wird gelöscht und als neue Anzeige eingestellt.\n\nAlle Bilder bleiben erhalten.\n\nFortfahren?')) {
                smartRepublish();
            }
        };

        // Container für Buttons
        const container = document.createElement('div');
        container.className = 'ka-button-container';
        container.appendChild(dupButton);
        container.appendChild(smartButton);
        
        submitButton.parentNode.insertBefore(container, submitButton.nextSibling);

        logger.log('Duplikations-Buttons erfolgreich erstellt');
        showNotification('✅ Duplikations-Buttons bereit!', 'success');
    }

    // === INITIALISIERUNG ===
    function init() {
        logger.log('UserScript initialisiert (v3.1.0)');

        // Warten bis DOM bereit
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createButtons);
        } else {
            createButtons();
        }
    }

    // Start
    init();

})();