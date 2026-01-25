// ==UserScript==
// @name         eBay Kleinanzeigen - neu einstellen helper
// @copyright     2026
// @license       MIT
// @version      1.0.0
// @description  Hilfsskript für Smart Neu-Einstellen
// @author       amnesia
// @match        https://www.kleinanzeigen.de/m-meine-anzeigen.html*
// @icon         http://www.google.com/s2/favicons?domain=www.kleinanzeigen.de
// @grant        none
// @updateURL     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.js
// @downloadURL   https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.js
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Function to add smart helper buttons to ads
    function addControlButtons() {
        const elements = document.querySelectorAll('a[href*="/p-anzeige-bearbeiten.html?adId="]');
        elements.forEach(function(element) {
            // Skip if button already exists
            if (element.nextSibling && element.nextSibling.className === 'ka-smart-helper-btn') return;

            const adId = element.getAttribute('href').match(/adId=([^&]*)/)[1];

            const smartHelperButton = document.createElement('button');
            smartHelperButton.type = 'button';
            smartHelperButton.className = 'ka-smart-helper-btn';
            smartHelperButton.textContent = '🔄 Smart neu einstellen';
            smartHelperButton.title = 'Löscht Original und erstellt neue Anzeige';

            smartHelperButton.onclick = function(e) {
                e.preventDefault();
                smartRepublishHelper(adId, smartHelperButton);
            };

            element.parentNode.insertBefore(smartHelperButton, element.nextSibling);
        });
    }

    // Function to open the edit window
    function smartRepublishHelper(adId, button) {
        window.open(
            "https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=" + adId + "#smartRepublish",
            "_blank",
            "toolbar=yes,scrollbars=yes,resizable=yes,top=500,left=500,width=400,height=400"
        );

        button.style.color = 'red';
    }

    // Run initially
    addControlButtons();

    // Watch for new ads dynamically loaded
    const observer = new MutationObserver(() => {
        addControlButtons();
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
