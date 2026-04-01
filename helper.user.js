// ==UserScript==
// @name          eBay Kleinanzeigen - neu einstellen helper
// @namespace     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @description   Hilfsskript fuer Smart Neu-Einstellen direkt aus "Meine Anzeigen"
// @icon          https://www.google.com/s2/favicons?domain=www.kleinanzeigen.de
// @copyright     2026
// @license       MIT
// @version       3.3.1
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

    function addControlButtons() {
        const elements = document.querySelectorAll('a[href*="/p-anzeige-bearbeiten.html?adId="]');
        elements.forEach(function (element) {
            // Robuste Duplikat-Erkennung per data-Attribut statt nextSibling
            if (element.hasAttribute(MARKER)) return;
            element.setAttribute(MARKER, 'true');

            const match = element.getAttribute('href').match(/adId=([^&]*)/);
            if (!match || !match[1]) return;
            const adId = match[1];

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '\uD83D\uDD04 Smart neu einstellen';
            btn.title = 'Loescht Original und erstellt neue Anzeige';
            btn.style.cssText = 'margin-left:8px;padding:4px 10px;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;font-size:12px;vertical-align:middle;display:inline-flex;align-items:center;';

            btn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                openSmartRepublish(adId, btn);
            };

            // Button direkt nach dem Bearbeiten-Link einfuegen
            element.after(btn);
        });
    }

    function openSmartRepublish(adId, button) {
        window.open(
            'https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=' + adId + '#smartRepublish',
            '_blank'
        );
        button.style.color = 'red';
        button.textContent = '\u2705 Geoeffnet';
    }

    // Initiale Ausfuehrung mit Verzoegerung fuer SPA-Rendering
    setTimeout(addControlButtons, 1500);

    // MutationObserver mit Debounce gegen Performance-Probleme
    let debounceTimer;
    const observer = new MutationObserver(function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(addControlButtons, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
