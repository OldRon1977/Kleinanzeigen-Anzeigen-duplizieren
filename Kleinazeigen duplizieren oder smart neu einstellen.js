// ==UserScript==
// @name          eBay Kleinanzeigen - Anzeige duplizieren / neu einstellen (Debug + Robust)
// @namespace     https://github.com/J05HI
// @description   Bietet intelligente "Anzeige duplizieren / neu einstellen" Funktionen mit Bilder-Schutz beim Bearbeiten einer vorhandenen Anzeige in eBay Kleinanzeigen.
// @icon          http://www.google.com/s2/favicons?domain=www.kleinanzeigen.de
// @copyright     2024, J05HI (https://github.com/J05HI)
// @license       MIT
// @version       2.2.0
// @match         https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://*.kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://www.ebay-kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://ebay-kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @run-at        document-idle
// @grant         none
// @updateURL     https://gist.githubusercontent.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5/raw/eBay_Kleinanzeigen_Anzeige_duplizieren.js
// @downloadURL   https://gist.githubusercontent.com/J05HI/9f3fc7a496e8baeff5a56e0c1a710bb5/raw/eBay_Kleinanzeigen_Anzeige_duplizieren.js
// ==/UserScript==

(function () {
    'use strict';

    // Debug-Logging
    const DEBUG = true;
    const log = DEBUG ? console.log.bind(console, '[Kleinanzeigen-Script]') : () => {};

    log('Script geladen, URL:', window.location.href);
    log('UserAgent:', navigator.userAgent);

    // Konfiguration
    const CONFIG = {
        DELETION_DELAY_MS: 3000,
        MAX_RETRY_ATTEMPTS: 3,
        RETRY_DELAY_MS: 1000,
        MAX_INIT_ATTEMPTS: 10,
        INIT_RETRY_DELAY: 500,
        IMAGE_SELECTORS: [
            '#ad-images img',
            '.gallery-image img',
            '.image-gallery img',
            '[data-testid="ad-image"] img',
            '.ad-image-item img',
            '.imagegallery img',
            '.gallery img'
        ],
        SUBMIT_BUTTON_SELECTORS: [
            '#pstad-submit',
            'button[type="submit"]',
            'input[type="submit"]',
            '.button-primary',
            '.btn-primary'
        ],
        FORM_SELECTORS: [
            '#adForm',
            'form[name="adform"]',
            'form.adform',
            'form'
        ],
        AD_ID_SELECTORS: [
            '#postad-id',
            'input[name="postad-id"]',
            'input[name="id"]'
        ]
    };

    // Utility-Funktionen
    const Utils = {
        /**
         * Robuste Element-Suche mit mehreren Selektoren
         */
        findElement(selectors, required = true, context = document) {
            if (typeof selectors === 'string') {
                selectors = [selectors];
            }

            for (let selector of selectors) {
                try {
                    const element = context.querySelector(selector);
                    if (element) {
                        log(`Element gefunden mit Selector: ${selector}`);
                        return element;
                    }
                } catch (e) {
                    log(`Selector-Fehler: ${selector}`, e);
                }
            }

            if (required) {
                log('Keine Elemente gefunden für Selectors:', selectors);
                throw new Error(`Erforderliches Element nicht gefunden: ${selectors.join(', ')}`);
            }
            return null;
        },

        /**
         * Wartefunktion für asynchrone Delays
         */
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        /**
         * Zeigt Debug-Informationen über die Seite
         */
        debugPageInfo() {
            log('=== PAGE DEBUG INFO ===');
            log('URL:', window.location.href);
            log('Document Ready State:', document.readyState);
            log('All forms:', document.querySelectorAll('form'));
            log('All buttons:', document.querySelectorAll('button, input[type="submit"]'));
            log('All inputs with id containing "id":', document.querySelectorAll('input[id*="id"], input[name*="id"]'));
            log('CSRF Meta tags:', document.querySelectorAll('meta[name*="csrf"], meta[name*="_csrf"]'));
            log('========================');
        },

        /**
         * Zeigt Benutzer-Benachrichtigungen an
         */
        showNotification(message, type = 'info') {
            log(`Notification [${type}]:`, message);

            // Entferne vorherige Notifications
            const existing = document.querySelectorAll('.userscript-notification');
            existing.forEach(n => n.remove());

            const notification = document.createElement('div');
            notification.className = 'userscript-notification';
            Object.assign(notification.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                padding: '12px 20px',
                backgroundColor: type === 'error' ? '#e74c3c' : type === 'warning' ? '#f39c12' : '#27ae60',
                color: 'white',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                zIndex: '10000',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                maxWidth: '300px',
                wordWrap: 'break-word',
            });
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 5000);
        }
    };

    // Loading-Manager
    const LoadingManager = {
        spinnerContainer: null,

        show() {
            this.hide(); // Cleanup existing spinner

            this.spinnerContainer = document.createElement("div");
            this.spinnerContainer.className = 'userscript-spinner';
            Object.assign(this.spinnerContainer.style, {
                height: '100%',
                width: '100%',
                position: 'fixed',
                top: '0',
                left: '0',
                backdropFilter: 'blur(3px)',
                backgroundColor: 'rgba(0,0,0,0.2)',
                zIndex: '9999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            });

            const spinnerElement = document.createElement("div");
            Object.assign(spinnerElement.style, {
                width: '40px',
                height: '40px',
                border: '4px solid #f3f3f3',
                borderTop: '4px solid #3498db',
                borderRadius: '50%',
                animation: 'userscript-spin 1s linear infinite',
            });

            // CSS Animation hinzufügen
            if (!document.querySelector('#userscript-styles')) {
                const style = document.createElement('style');
                style.id = 'userscript-styles';
                style.textContent = `
                    @keyframes userscript-spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }

            this.spinnerContainer.appendChild(spinnerElement);
            document.body.appendChild(this.spinnerContainer);
        },

        hide() {
            if (this.spinnerContainer && this.spinnerContainer.parentNode) {
                this.spinnerContainer.remove();
                this.spinnerContainer = null;
            }
        }
    };

    // API-Manager für Kleinanzeigen-Interaktionen
    const ApiManager = {
        /**
         * Ruft CSRF-Token ab
         */
        getCsrfToken() {
            const possibleSelectors = [
                'meta[name="_csrf"]',
                'meta[name="csrf-token"]',
                'meta[name="_token"]',
                'meta[name="csrf"]'
            ];

            for (let selector of possibleSelectors) {
                const tokenElement = document.querySelector(selector);
                if (tokenElement) {
                    const token = tokenElement.getAttribute("content");
                    if (token) {
                        log('CSRF Token gefunden mit Selector:', selector);
                        return token;
                    }
                }
            }

            throw new Error('CSRF-Token nicht gefunden');
        },

        /**
         * Löscht eine Anzeige mit Retry-Mechanismus
         */
        async deleteAd(adId, retryAttempts = CONFIG.MAX_RETRY_ATTEMPTS) {
            try {
                const csrfToken = this.getCsrfToken();

                const response = await fetch(`https://www.kleinanzeigen.de/m-anzeigen-loeschen.json?ids=${adId}`, {
                    method: "POST",
                    headers: {
                        accept: "application/json, text/plain, */*",
                        "x-csrf-token": csrfToken,
                        "content-type": "application/json",
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            } catch (error) {
                log(`Fehler beim Löschen der Anzeige (Versuch ${CONFIG.MAX_RETRY_ATTEMPTS - retryAttempts + 1}):`, error);

                if (retryAttempts > 0) {
                    await Utils.delay(CONFIG.RETRY_DELAY_MS);
                    return this.deleteAd(adId, retryAttempts - 1);
                }
                throw error;
            }
        },

        /**
         * Prüft ob Anzeige erfolgreich gelöscht wurde
         */
        async verifyAdDeletion(adId) {
            try {
                const response = await fetch(`https://www.kleinanzeigen.de/s-anzeige/${adId}`, {
                    method: 'HEAD'
                });
                return response.status === 404;
            } catch {
                return true; // Bei Netzwerkfehlern annehmen, dass gelöscht
            }
        }
    };

    // Button-Factory
    const ButtonFactory = {
        create(id, text, className, clickHandler) {
            const button = document.createElement('button');

            button.setAttribute('id', id);
            button.setAttribute('type', 'button');
            button.classList.add('userscript-button');

            // Versuche Standard-Klassen hinzuzufügen
            try {
                const existingButton = Utils.findElement(CONFIG.SUBMIT_BUTTON_SELECTORS, false);
                if (existingButton) {
                    // Kopiere Klassen vom existierenden Button
                    existingButton.classList.forEach(cls => {
                        if (!cls.includes('primary')) {
                            button.classList.add(cls);
                        }
                    });
                }
            } catch (e) {
                log('Konnte existierenden Button-Stil nicht kopieren:', e);
            }

            // Fallback-Styling
            Object.assign(button.style, {
                padding: '10px 20px',
                marginLeft: '10px',
                marginTop: '10px',
                cursor: 'pointer',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: className === 'primary' ? '#007bff' : '#6c757d',
                color: 'white',
                fontSize: '14px',
                fontWeight: '500',
            });

            button.textContent = text;
            button.addEventListener('click', clickHandler);

            log(`Button erstellt: ${id} - ${text}`);
            return button;
        }
    };

    // Dialog-Manager für Benutzerinteraktionen
    const DialogManager = {
        /**
         * Erstellt einen modalen Dialog
         */
        createModal(content) {
            const overlay = document.createElement('div');
            overlay.className = 'userscript-modal-overlay';
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0,0,0,0.6)',
                zIndex: '10000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            });

            const dialog = document.createElement('div');
            Object.assign(dialog.style, {
                backgroundColor: 'white',
                padding: '30px',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                maxWidth: '550px',
                minWidth: '400px',
                textAlign: 'center',
                fontFamily: 'Arial, sans-serif',
            });

            dialog.innerHTML = content;
            overlay.appendChild(dialog);

            return {
                overlay,
                dialog,
                show: () => document.body.appendChild(overlay),
                hide: () => overlay.parentNode && overlay.parentNode.removeChild(overlay)
            };
        },

        /**
         * Zeigt Warndialog mit Optionen für Bilder-Problem
         */
        async showImageWarningDialog(analysis) {
            return new Promise((resolve) => {
                const modal = this.createModal(`
                    <div style="color: #e74c3c; font-size: 24px; margin-bottom: 10px;">⚠️</div>
                    <h3 style="color: #2c3e50; margin-bottom: 20px; font-size: 20px;">
                        Bilder-Warnung
                    </h3>
                    <div style="margin-bottom: 20px; line-height: 1.6; color: #34495e;">
                        Diese Anzeige enthält <strong style="color: #e74c3c;">${analysis.internalImages.length} Bild(er)</strong>,
                        die beim Löschen der Originalanzeige <strong>unwiderruflich verloren</strong> gehen.
                    </div>
                    <div style="margin-bottom: 25px; text-align: left; background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #3498db;">
                        <strong style="color: #2c3e50; display: block; margin-bottom: 12px;">Ihre Optionen:</strong>
                        <div style="margin-bottom: 8px;">
                            <strong style="color: #27ae60;">🛡️ Sicher duplizieren:</strong> Original bleibt erhalten, nur Kopie erstellen
                        </div>
                        <div style="margin-bottom: 8px;">
                            <strong style="color: #e74c3c;">🗑️ Trotzdem löschen:</strong> Original und Bilder werden gelöscht
                        </div>
                        <div>
                            <strong style="color: #95a5a6;">❌ Abbrechen:</strong> Keine Aktion durchführen
                        </div>
                    </div>
                    <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
                        <button id="safe-duplicate" style="background: #27ae60; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: 500;">
                            🛡️ Sicher duplizieren
                        </button>
                        <button id="proceed-loss" style="background: #e74c3c; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: 500;">
                            🗑️ Trotzdem löschen
                        </button>
                        <button id="cancel-action" style="background: #95a5a6; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: 500;">
                            ❌ Abbrechen
                        </button>
                    </div>
                `);

                // Event listeners
                const safeBtn = modal.dialog.querySelector('#safe-duplicate');
                const proceedBtn = modal.dialog.querySelector('#proceed-loss');
                const cancelBtn = modal.dialog.querySelector('#cancel-action');

                safeBtn.addEventListener('click', () => {
                    modal.hide();
                    resolve('safe-duplicate');
                });

                proceedBtn.addEventListener('click', () => {
                    modal.hide();
                    resolve('proceed-with-loss');
                });

                cancelBtn.addEventListener('click', () => {
                    modal.hide();
                    resolve('cancel');
                });

                // ESC-Taste zum Abbrechen
                const handleEsc = (e) => {
                    if (e.key === 'Escape') {
                        modal.hide();
                        document.removeEventListener('keydown', handleEsc);
                        resolve('cancel');
                    }
                };
                document.addEventListener('keydown', handleEsc);

                modal.show();
            });
        }
    };

    // Haupt-Funktionalität
    const AdDuplicator = {
        elements: {},

        /**
         * Initialisiert das Script mit Retry-Mechanismus
         */
        async init(attempt = 1) {
            try {
                log(`Initialisierungsversuch ${attempt}/${CONFIG.MAX_INIT_ATTEMPTS}`);

                if (DEBUG) {
                    Utils.debugPageInfo();
                }

                this.findElements();
                this.createButtons();

                Utils.showNotification('✅ Duplikations-Buttons geladen!', 'info');
                log('Initialisierung erfolgreich');

            } catch (error) {
                log(`Initialisierungsfehler (Versuch ${attempt}):`, error);

                if (attempt < CONFIG.MAX_INIT_ATTEMPTS) {
                    log(`Wiederhole Initialisierung in ${CONFIG.INIT_RETRY_DELAY}ms...`);
                    await Utils.delay(CONFIG.INIT_RETRY_DELAY);
                    return this.init(attempt + 1);
                } else {
                    Utils.showNotification(`❌ Script konnte nicht geladen werden: ${error.message}`, 'error');
                    throw error;
                }
            }
        },

        /**
         * Findet alle benötigten Elemente
         */
        findElements() {
            this.elements.form = Utils.findElement(CONFIG.FORM_SELECTORS, true);
            this.elements.submitButton = Utils.findElement(CONFIG.SUBMIT_BUTTON_SELECTORS, true);
            this.elements.adIdInput = Utils.findElement(CONFIG.AD_ID_SELECTORS, true);

            log('Gefundene Elemente:', {
                form: this.elements.form.tagName + (this.elements.form.id ? '#' + this.elements.form.id : ''),
                submitButton: this.elements.submitButton.tagName + (this.elements.submitButton.id ? '#' + this.elements.submitButton.id : ''),
                adIdInput: this.elements.adIdInput.tagName + (this.elements.adIdInput.id ? '#' + this.elements.adIdInput.id : '')
            });
        },

        /**
         * Erstellt die Duplikations-Buttons
         */
        createButtons() {
            const duplicateButton = ButtonFactory.create(
                'userscript-duplicate-btn',
                '📋 Duplizieren',
                'secondary',
                this.handleDuplicate.bind(this)
            );

            const republishButton = ButtonFactory.create(
                'userscript-republish-btn',
                '🔄 Smart neu einstellen',
                'primary',
                this.handleSmartRepublish.bind(this)
            );

            // Füge Buttons nach dem Submit-Button hinzu
            const container = document.createElement('div');
            container.style.marginTop = '10px';
            container.appendChild(duplicateButton);
            container.appendChild(republishButton);

            this.elements.submitButton.parentNode.insertBefore(container, this.elements.submitButton.nextSibling);

            log('Buttons erfolgreich eingefügt');
        },

        /**
         * Handler für "Duplizieren"
         */
        async handleDuplicate(event) {
            event.preventDefault();
            log('Duplizierung gestartet');

            try {
                LoadingManager.show();
                Utils.showNotification('📋 Anzeige wird dupliziert...');

                this.elements.adIdInput.value = '';
                log('Ad-ID geleert, Form wird submitted');

                this.elements.form.submit();
            } catch (error) {
                log('Fehler beim Duplizieren:', error);
                Utils.showNotification(`❌ Fehler beim Duplizieren: ${error.message}`, 'error');
                LoadingManager.hide();
            }
        },

        /**
         * Handler für "Smart Neu einstellen"
         */
        async handleSmartRepublish(event) {
            event.preventDefault();
            log('Smart Republishing gestartet');

            try {
                LoadingManager.show();

                const originalAdId = this.elements.adIdInput.value;
                log('Original Ad-ID:', originalAdId);

                if (!originalAdId) {
                    throw new Error('Anzeigen-ID nicht gefunden');
                }

                // Bilder analysieren
                Utils.showNotification('🔍 Analysiere Bilder...');
                const imageAnalysis = await this.analyzeImages();
                log('Bildanalyse Ergebnis:', imageAnalysis);

                LoadingManager.hide();

                if (imageAnalysis.hasInternalImages) {
                    const choice = await DialogManager.showImageWarningDialog(imageAnalysis);
                    log('User-Auswahl:', choice);

                    switch (choice) {
                        case 'safe-duplicate':
                            return this.handleSafeDuplicate();
                        case 'proceed-with-loss':
                            return this.handleRepublishWithLoss(originalAdId);
                        case 'cancel':
                            Utils.showNotification('❌ Aktion abgebrochen');
                            return;
                    }
                } else {
                    return this.handleStandardRepublish(originalAdId);
                }

            } catch (error) {
                log('Fehler beim Smart Republishing:', error);
                Utils.showNotification(`❌ Fehler: ${error.message}`, 'error');
                LoadingManager.hide();
            }
        },

        /**
         * Analysiert die Bilder der aktuellen Anzeige
         */
        async analyzeImages() {
            const allImages = [];

            CONFIG.IMAGE_SELECTORS.forEach(selector => {
                try {
                    const images = document.querySelectorAll(selector);
                    log(`Gefunden mit "${selector}":`, images.length);
                    images.forEach(img => allImages.push(img));
                } catch (e) {
                    log(`Selector-Fehler "${selector}":`, e);
                }
            });

            // Duplikate entfernen
            const uniqueImages = allImages.filter((img, index, self) => {
                const src = img.src || img.dataset.src || img.getAttribute('data-src');
                return src && self.findIndex(i => {
                    const iSrc = i.src || i.dataset.src || i.getAttribute('data-src');
                    return iSrc === src;
                }) === index;
            });

            const analysis = {
                totalImages: uniqueImages.length,
                internalImages: [],
                externalImages: [],
                hasInternalImages: false
            };

            uniqueImages.forEach((img, index) => {
                const src = img.src || img.dataset.src || img.getAttribute('data-src');

                if (src && (src.includes('kleinanzeigen.de') || src.includes('ebay-kleinanzeigen.de'))) {
                    analysis.internalImages.push({index, src, element: img});
                    analysis.hasInternalImages = true;
                } else if (src) {
                    analysis.externalImages.push({index, src, element: img});
                }
            });

            return analysis;
        },

        /**
         * Sichere Duplizierung ohne Löschen
         */
        async handleSafeDuplicate() {
            try {
                LoadingManager.show();
                Utils.showNotification('🛡️ Sichere Duplizierung (Original bleibt)...');

                this.elements.adIdInput.value = '';
                this.elements.form.submit();
            } catch (error) {
                log('Fehler beim sicheren Duplizieren:', error);
                Utils.showNotification(`❌ Fehler: ${error.message}`, 'error');
                LoadingManager.hide();
            }
        },

        /**
         * Republishing mit Bildverlust
         */
        async handleRepublishWithLoss(originalAdId) {
            try {
                LoadingManager.show();
                Utils.showNotification('🗑️ Original wird gelöscht...');

                await ApiManager.deleteAd(originalAdId);
                await Utils.delay(CONFIG.DELETION_DELAY_MS);

                Utils.showNotification('✨ Neue Anzeige wird erstellt...');
                this.elements.adIdInput.value = '';
                this.elements.form.submit();

            } catch (error) {
                log('Fehler beim Republishing mit Verlust:', error);
                Utils.showNotification(`❌ Fehler: ${error.message}`, 'error');
                LoadingManager.hide();
            }
        },

        /**
         * Standard-Republishing
         */
        async handleStandardRepublish(originalAdId) {
            try {
                LoadingManager.show();
                Utils.showNotification('✅ Sichere Neuerstellung (keine problematischen Bilder)...');

                await ApiManager.deleteAd(originalAdId);
                await Utils.delay(CONFIG.DELETION_DELAY_MS);

                this.elements.adIdInput.value = '';
                this.elements.form.submit();

            } catch (error) {
                log('Fehler beim Standard-Republishing:', error);
                Utils.showNotification(`❌ Fehler: ${error.message}`, 'error');
                LoadingManager.hide();
            }
        }
    };

    // Script-Start mit verschiedenen Strategies
    function startScript() {
        log('Script-Start ausgelöst');

        // Sofort versuchen falls DOM bereits bereit
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            log('DOM bereits bereit, starte sofort');
            AdDuplicator.init();
        } else {
            log('DOM noch nicht bereit, warte auf DOMContentLoaded');
            document.addEventListener('DOMContentLoaded', () => {
                log('DOMContentLoaded Event empfangen');
                AdDuplicator.init();
            });
        }

        // Fallback: Nach 3 Sekunden nochmals versuchen
        setTimeout(() => {
            if (!document.querySelector('.userscript-button')) {
                log('Fallback: Kein Button gefunden, versuche erneut');
                AdDuplicator.init();
            }
        }, 3000);
    }

    // Error-Handler für unbehandelte Fehler
    window.addEventListener('error', (event) => {
        if (event.filename && event.filename.includes('kleinanzeigen')) {
            log('Unbehandelter Fehler:', event.error);
            LoadingManager.hide();
        }
    });

    // Los geht's!
    log('Starte Script...');
    startScript();

})();