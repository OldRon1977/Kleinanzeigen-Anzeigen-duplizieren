// ==UserScript==
// @name          eBay Kleinanzeigen - Anzeige duplizieren / neu einstellen
// @namespace     https://github.com/OldRon1977/Kleinanzeigen---Duplizieren-Smart-neu-einstellen
// @description   Einfaches Duplizieren und Neu-Einstellen von Anzeigen
// @version       3.0.0
// @match         https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://*.kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @match         https://www.ebay-kleinanzeigen.de/p-anzeige-bearbeiten.html*
// @run-at        document-idle
// @grant         none
// ==/UserScript==

(function () {
    'use strict';

    // === HILFSFUNKTIONEN ===
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    function showNotification(message, type = 'info') {
        // Alte Notifications entfernen
        document.querySelectorAll('.ka-notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = 'ka-notification';
        notification.textContent = message;
        
        const colors = {
            error: '#e74c3c',
            success: '#27ae60',
            info: '#3498db'
        };
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            backgroundColor: colors[type] || colors.info,
            color: 'white',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            zIndex: '10000',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        });
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 4000);
    }

    function showLoadingSpinner(show = true) {
        const existing = document.querySelector('.ka-spinner');
        if (existing) existing.remove();
        
        if (!show) return;

        const spinner = document.createElement('div');
        spinner.className = 'ka-spinner';
        spinner.innerHTML = '<div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top-color:#3498db;border-radius:50%;animation:ka-spin 1s linear infinite"></div>';
        
        Object.assign(spinner.style, {
            position: 'fixed',
            inset: '0',
            backgroundColor: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '9999'
        });

        // Animation einmalig hinzufügen
        if (!document.querySelector('#ka-styles')) {
            const style = document.createElement('style');
            style.id = 'ka-styles';
            style.textContent = '@keyframes ka-spin { to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }

        document.body.appendChild(spinner);
    }

    // === API FUNKTIONEN ===
    function getCsrfToken() {
        const token = document.querySelector('meta[name="_csrf"], meta[name="csrf-token"]')?.getAttribute('content');
        if (!token) throw new Error('CSRF-Token nicht gefunden');
        return token;
    }

    async function deleteAd(adId) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        try {
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
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
            
        } catch (error) {
            clearTimeout(timeout);
            if (error.name === 'AbortError') {
                throw new Error('Timeout beim Löschen');
            }
            throw error;
        }
    }

    // === HAUPTFUNKTIONEN ===
    async function duplicateAd() {
        try {
            showLoadingSpinner();
            
            const adIdInput = document.querySelector('#postad-id, input[name="id"], input[name="postad-id"]');
            const form = document.querySelector('form');
            
            if (!adIdInput || !form) throw new Error('Form-Elemente nicht gefunden');
            
            // ID löschen = Neue Anzeige, Bilder bleiben im Form erhalten
            adIdInput.value = '';
            
            showNotification('📋 Anzeige wird dupliziert (mit allen Bildern)...');
            form.submit();
            
        } catch (error) {
            showNotification('❌ Fehler: ' + error.message, 'error');
            showLoadingSpinner(false);
        }
    }

    async function smartRepublish() {
        try {
            showLoadingSpinner();
            
            const adIdInput = document.querySelector('#postad-id, input[name="id"], input[name="postad-id"]');
            const form = document.querySelector('form');
            
            if (!adIdInput || !form) throw new Error('Form-Elemente nicht gefunden');
            
            const originalId = adIdInput.value;
            if (!originalId) throw new Error('Keine Anzeigen-ID gefunden');

            showNotification('🗑️ Original wird gelöscht...');
            
            try {
                await deleteAd(originalId);
                await delay(2000); // Kurz warten bis Löschung verarbeitet
            } catch (error) {
                // Bei Löschfehler trotzdem fortfahren - alte Anzeige bleibt dann halt
                console.warn('Löschung fehlgeschlagen, erstelle trotzdem neue Anzeige:', error);
            }
            
            // Neue Anzeige erstellen - Bilder sind noch im Form!
            adIdInput.value = '';
            showNotification('✨ Neue Anzeige wird erstellt (mit allen Bildern)...');
            form.submit();
            
        } catch (error) {
            showNotification('❌ Fehler: ' + error.message, 'error');
            showLoadingSpinner(false);
        }
    }

    // === BUTTONS ERSTELLEN ===
    function createButtons() {
        // Prüfen ob bereits vorhanden
        if (document.querySelector('.ka-duplicate-btn')) return;
        
        const submitButton = document.querySelector('#pstad-submit, button[type="submit"], .button-primary');
        if (!submitButton) {
            console.log('[KA-Script] Submit-Button nicht gefunden, versuche später erneut');
            setTimeout(createButtons, 1000);
            return;
        }

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
            if (confirm('Original-Anzeige wird gelöscht und als neue Anzeige eingestellt.\n\nFortfahren?')) {
                smartRepublish();
            }
        };
        
        // Styling
        [dupButton, smartButton].forEach(btn => {
            Object.assign(btn.style, {
                padding: '10px 20px',
                marginLeft: '10px',
                marginTop: '10px',
                cursor: 'pointer',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#6c757d',
                color: 'white',
                fontSize: '14px',
                fontWeight: '500'
            });
        });
        
        smartButton.style.backgroundColor = '#007bff';

        // Container für Buttons
        const container = document.createElement('div');
        container.style.marginTop = '10px';
        container.appendChild(dupButton);
        container.appendChild(smartButton);
        
        submitButton.parentNode.insertBefore(container, submitButton.nextSibling);
        
        showNotification('✅ Duplikations-Buttons bereit!', 'success');
    }

    // === INITIALISIERUNG ===
    function init() {
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