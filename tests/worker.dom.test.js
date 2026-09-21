import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const {
    CONFIG,
    getExponentialBackoffWait,
    readFormFields,
    getAdFormRoot,
    collectImageUrls,
    injectSiteAdBlockerStyles
} = worker;

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('getExponentialBackoffWait', () => {
    it('startet bei INITIAL_RETRY_WAIT_MS (500 ms)', () => {
        expect(CONFIG.INITIAL_RETRY_WAIT_MS).toBe(500);
        expect(getExponentialBackoffWait(1)).toBe(500);
    });

    it('verdoppelt pro Versuch', () => {
        expect(getExponentialBackoffWait(2)).toBe(1000);
        expect(getExponentialBackoffWait(3)).toBe(2000);
        expect(getExponentialBackoffWait(4)).toBe(4000);
    });

    it('kappt bei MAX_RETRY_WAIT_MS (8000 ms)', () => {
        expect(CONFIG.MAX_RETRY_WAIT_MS).toBe(8000);
        expect(getExponentialBackoffWait(5)).toBe(8000);
        expect(getExponentialBackoffWait(6)).toBe(8000);
        expect(getExponentialBackoffWait(10)).toBe(8000);
    });
});

describe('readFormFields', () => {
    it('erfasst sichtbare Felder, schliesst _csrf/Passwort/Hidden aus', () => {
        document.body.innerHTML = `
            <form>
                <input name="title" value="Mein Titel">
                <textarea name="description">Meine Beschreibung</textarea>
                <input name="price" value="42">
                <input type="hidden" name="_csrf" value="geheimes-token">
                <input type="password" name="pw" value="geheim123">
            </form>
        `;

        const { fields, rawFields } = readFormFields();

        // rawFields: nur die unbedenklichen, benannten Felder
        expect(rawFields.title).toBe('Mein Titel');
        expect(rawFields.description).toBe('Meine Beschreibung');
        expect(rawFields.price).toBe('42');
        expect(rawFields).not.toHaveProperty('_csrf');
        expect(rawFields).not.toHaveProperty('pw');

        // fields: benannte Auswahl
        expect(fields.title).toBe('Mein Titel');
        expect(fields.description).toBe('Meine Beschreibung');
        expect(fields.price).toBe('42');
    });

    it('schliesst auch ein nicht-hidden _csrf-Feld per Namens-Denylist aus', () => {
        document.body.innerHTML = `
            <form>
                <input type="text" name="_csrf" value="token-im-textfeld">
                <input name="title" value="T">
            </form>
        `;
        const { rawFields } = readFormFields();
        expect(rawFields).not.toHaveProperty('_csrf');
        expect(rawFields.title).toBe('T');
    });

    it('kappt Werte auf 5000 Zeichen', () => {
        const long = 'y'.repeat(6000);
        document.body.innerHTML = `<textarea name="description">${long}</textarea>`;
        const { rawFields } = readFormFields();
        expect(rawFields.description).toHaveLength(5000);
    });
});

describe('collectImageUrls', () => {
    it('normalisiert prod-ads-Bilder auf die groesste Variante ($_57.JPG)', () => {
        document.body.innerHTML = `
            <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/xx?rule=$_2.JPG">
        `;
        expect(collectImageUrls()).toEqual([
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/xx?rule=$_57.JPG'
        ]);
    });

    it('ersetzt signierte Vorschau-URLs (AccessKeyId/jwt) durch die volle Aufloesung', () => {
        // So liefert die Bearbeiten-Seite die Bilder: kein rule=, die Groesse
        // (96x96) steckt im signierten jwt.
        document.body.innerHTML = `
            <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/3c/3cdecb54-1676?AccessKeyId=9773b07374e7bdc3&jwt=eyJ0eXAi.abc.def">
        `;
        expect(collectImageUrls()).toEqual([
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/3c/3cdecb54-1676?rule=$_57.JPG'
        ]);
    });

    it('dedupliziert Vorschau und Normalbild desselben Bildes', () => {
        document.body.innerHTML = `
            <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/3c/abc?AccessKeyId=k&jwt=t1">
            <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/3c/abc?rule=$_59.AUTO">
        `;
        expect(collectImageUrls()).toEqual([
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/3c/abc?rule=$_57.JPG'
        ]);
    });

    it('ignoriert Bilder von fremden Hosts', () => {
        document.body.innerHTML = `
            <img src="https://example.com/api/v1/prod-ads/images/yy?rule=$_2.JPG">
            <img src="https://img.kleinanzeigen.de/sonstiges/logo.png">
        `;
        expect(collectImageUrls()).toEqual([]);
    });

    it('dedupliziert Varianten desselben Bildes nach Normalisierung', () => {
        document.body.innerHTML = `
            <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/xx?rule=$_2.JPG">
            <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/xx?rule=$_35.JPG">
        `;
        expect(collectImageUrls()).toEqual([
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/xx?rule=$_57.JPG'
        ]);
    });

    // Der Host-Filter schliesst fremde ANZEIGENbilder nicht aus: eine
    // Empfehlungsliste liefert dieselben /prod-ads/images/-URLs wie die eigene
    // Anzeige. Deshalb gilt fuer Bilder derselbe Formular-Scope wie fuer Felder.
    it('nimmt nur Bilder aus dem Anzeigen-Formular, wenn dort welche stehen', () => {
        document.body.innerHTML = `
            <form id="anzeige">
                <input name="adId" value="123">
                <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/eigen?rule=$_2.JPG">
            </form>
            <ul id="empfehlungen">
                <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/fremd?rule=$_2.JPG">
            </ul>
        `;
        expect(collectImageUrls()).toEqual([
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/eigen?rule=$_57.JPG'
        ]);
    });

    // Liegt die Galerie ausserhalb des Formulars, waere ein strikter Scope
    // schlimmer als das Problem: der Snapshot haette gar keine Bilder mehr.
    it('faellt auf das ganze Dokument zurueck, wenn im Formular kein Bild steckt', () => {
        document.body.innerHTML = `
            <form id="anzeige">
                <input name="adId" value="123">
            </form>
            <div id="galerie">
                <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/galerie?rule=$_2.JPG">
            </div>
        `;
        expect(collectImageUrls()).toEqual([
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/galerie?rule=$_57.JPG'
        ]);
    });
});

describe('getAdFormRoot / readFormFields - Formular-Scoping', () => {
    it('waehlt das Formular, in dem das adId-Feld haengt', () => {
        document.body.innerHTML = `
            <form id="suche"><input name="query" value="fahrrad"></form>
            <form id="anzeige">
                <input type="hidden" name="adId" value="3485590892">
                <input name="title" value="Mein Titel">
            </form>
        `;
        expect(getAdFormRoot(document, '3485590892').id).toBe('anzeige');
    });

    it('erfasst keine Felder ausserhalb des Anzeigen-Formulars', () => {
        document.body.innerHTML = `
            <input name="globales-feld" value="nicht erfassen">
            <form id="suche"><input name="query" value="fahrrad"></form>
            <form id="anzeige">
                <input type="hidden" name="adId" value="3485590892">
                <input name="title" value="Mein Titel">
                <textarea name="description">Beschreibung</textarea>
            </form>
        `;
        const { fields, rawFields } = readFormFields(document, '3485590892');

        expect(rawFields.title).toBe('Mein Titel');
        expect(fields.description).toBe('Beschreibung');
        expect(rawFields.query).toBeUndefined();
        expect(rawFields['globales-feld']).toBeUndefined();
    });

    it('faellt auf das erste Formular zurueck, wenn kein adId-Feld da ist', () => {
        document.body.innerHTML = `<form id="erstes"><input name="title" value="T"></form>`;
        expect(getAdFormRoot(document, null).id).toBe('erstes');
        expect(readFormFields(document, null).rawFields.title).toBe('T');
    });

    it('faellt auf das Dokument zurueck, wenn es gar kein Formular gibt', () => {
        document.body.innerHTML = `<input name="title" value="Ohne Formular">`;
        expect(readFormFields(document, null).rawFields.title).toBe('Ohne Formular');
    });
});

// Der Werbeblocker ist reines CSS. jsdom wendet :has()-Selektoren nicht
// zuverlaessig an, deshalb pruefen diese Tests die Beschaffenheit der Regel --
// nicht, ob im Browser am Ende wirklich etwas verschwindet. Das zeigt nur der
// Blick auf die echte Seite.
describe('injectSiteAdBlockerStyles', () => {
    it('haengt genau ein <style> an und wiederholt sich nicht', () => {
        injectSiteAdBlockerStyles();
        injectSiteAdBlockerStyles();
        injectSiteAdBlockerStyles();

        expect(document.querySelectorAll('#ka-site-adblocker')).toHaveLength(1);
    });

    it('blendet die bekannten Werbecontainer aus', () => {
        injectSiteAdBlockerStyles();
        const css = document.querySelector('#ka-site-adblocker').textContent;

        ['.site-base--left-banner--full', '#home-billboard', '#srchrslt-adtop',
         '.liberty-filled', '#my-watchlist-atf', '[id^="vip-similar-ads-"]']
            .forEach((sel) => expect(css).toContain(sel));
    });

    it('nimmt den Cookie-Banner ausdruecklich aus', () => {
        injectSiteAdBlockerStyles();
        const css = document.querySelector('#ka-site-adblocker').textContent;

        // Ohne diese Ausnahme wuerde der generische banner-Selektor den
        // GDPR-Dialog treffen -- die Seite laedt dann gar nicht erst weiter.
        expect(css).toContain('div[data-testid*="banner"]:not([data-testid*="gdpr"])');
        expect(css).toMatch(/#gdpr-banner-container[^}]*display: block !important/s);
    });

    it('fasst das DOM nicht an ausser dem eigenen <style>', () => {
        document.body.innerHTML = '<div id="home-billboard">Werbung</div>';
        injectSiteAdBlockerStyles();

        // Kein Entfernen, kein Umschreiben: das Element steht noch da,
        // sichtbar ist es nur wegen der CSS-Regel nicht mehr.
        expect(document.getElementById('home-billboard')).not.toBeNull();
        expect(document.getElementById('home-billboard').getAttribute('style')).toBeNull();
    });
});
