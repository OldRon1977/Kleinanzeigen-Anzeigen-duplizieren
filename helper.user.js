// ==UserScript==
// @name          Kleinanzeigen - Meine Anzeigen Helper
// @namespace     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @description   Duplizieren und Smart Neu-Einstellen direkt aus "Meine Anzeigen"
// @icon          https://www.google.com/s2/favicons?domain=www.kleinanzeigen.de
// @copyright     2026
// @license       MIT
// @version       1.2.0
// @author        panzli (Original), OldRon1977 (Anpassungen)
// @match         https://www.kleinanzeigen.de/m-meine-anzeigen.html*
// @match         https://kleinanzeigen.de/m-meine-anzeigen.html*
// @match         https://*.kleinanzeigen.de/m-meine-anzeigen.html*
// @homepage      https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @updateURL     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js
// @downloadURL   https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js
// @run-at        document-idle
// @grant         none
// ==/UserScript==

(function () {
    'use strict';

    const MARKER = 'data-ka-smart-helper';
    const BTN_STYLE = 'margin-left:6px;padding:3px 8px;cursor:pointer;border:1px solid #ccc;border-radius:4px;font-size:11px;vertical-align:middle;display:inline-flex;align-items:center;';

    function addControlButtons() {
        const elements = document.querySelectorAll('a[href*="/p-anzeige-bearbeiten.html?adId="]');
        elements.forEach(function (element) {
            if (element.hasAttribute(MARKER)) return;
            element.setAttribute(MARKER, 'true');

            const match = element.getAttribute('href').match(/adId=([^&]*)/);
            if (!match || !match[1]) return;
            const adId = match[1];

            // Duplizieren-Button
            const dupBtn = document.createElement('button');
            dupBtn.type = 'button';
            dupBtn.textContent = '\uD83D\uDCCB Duplizieren';
            dupBtn.title = 'Erstellt eine Kopie, Original bleibt erhalten';
            dupBtn.style.cssText = BTN_STYLE + 'background:#f0f0f0;';

            dupBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.open('https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=' + adId + '#duplicate', '_blank');
                dupBtn.textContent = '\u2705 Geoeffnet';
            };

            // Smart Neu Einstellen-Button
            const smartBtn = document.createElement('button');
            smartBtn.type = 'button';
            smartBtn.textContent = '\uD83D\uDD04 Neu einstellen';
            smartBtn.title = 'Loescht Original und erstellt neue Anzeige';
            smartBtn.style.cssText = BTN_STYLE + 'background:#e8f4fd;';

            smartBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.open('https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=' + adId + '#smartRepublish', '_blank');
                smartBtn.textContent = '\u2705 Geoeffnet';
            };

            element.after(smartBtn);
            element.after(dupBtn);
        });
    }

    setTimeout(addControlButtons, 1500);

    let debounceTimer;
    const observer = new MutationObserver(function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(addControlButtons, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
