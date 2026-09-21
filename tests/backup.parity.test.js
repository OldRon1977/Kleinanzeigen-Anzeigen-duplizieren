import { describe, it, expect } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';
import helper from '../helper.user.js';

// Die Sicherung der Auswahl liest die Bearbeiten-Seite mit Kopien der
// Auslese-Funktionen des Hauptscripts. Dieser Test haelt die Kopien gleich:
// dasselbe Markup muss in beiden Scripts dasselbe Ergebnis liefern.

function parse(html) {
    return new DOMParser().parseFromString(html, 'text/html');
}

const FORM = `
    <html><body>
    <div class="teaser">
        <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/zz/fremd?rule=$_2.JPG">
    </div>
    <form id="adForm">
        <input type="hidden" name="adId" value="3511276012">
        <input type="hidden" name="_csrf" value="geheim">
        <input name="title" value="Fahrrad 28 Zoll">
        <textarea name="description">Gut erhalten.
Zweite Zeile.</textarea>
        <input name="price" value="120">
        <select name="priceType"><option value="FIXED">Fest</option><option value="NEGOTIABLE" selected>VB</option></select>
        <input name="zipCode" value="50667">
        <input type="checkbox" name="shipping" value="ja" checked>
        <input type="checkbox" name="pickup" value="ja">
        <input type="radio" name="condition" value="neu">
        <input type="radio" name="condition" value="gebraucht" checked>
        <input type="password" name="pw" value="x">
        <input name="leer" value="">
        <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/bild1?AccessKeyId=k&jwt=j">
        <img data-src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/bb/bild2?rule=$_2.JPG">
        <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/bild1?rule=$_35.JPG">
        <img src="https://static.kleinanzeigen.de/logo.png">
    </form>
    </body></html>`;

const NO_FORM_ID = `
    <html><body>
    <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/cc/bild3?rule=$_2.JPG">
    <form><input name="title" value="Nur Titel"></form>
    </body></html>`;

describe('Sicherung: Auslese-Kopien stimmen mit dem Hauptscript ueberein', () => {
    it.each([
        ['Formular mit adId-Feld', FORM, '3511276012'],
        ['Seite ohne adId-Feld', NO_FORM_ID, '42']
    ])('readFormFields: %s', (_, html, adId) => {
        expect(helper.readFormFields(parse(html), adId))
            .toEqual(worker.readFormFields(parse(html), adId));
    });

    it.each([
        ['Formular mit adId-Feld', FORM, '3511276012'],
        ['Seite ohne adId-Feld', NO_FORM_ID, '42']
    ])('collectImageUrls: %s', (_, html, adId) => {
        expect(helper.collectImageUrls(parse(html), adId))
            .toEqual(worker.collectImageUrls(parse(html), adId));
    });

    it('findAdIdInput: gleicher Treffer, auch ueber den Hidden-Fallback', () => {
        const fallback = '<form><input type="hidden" name="x" value="777"></form>';
        [[FORM, '3511276012'], [fallback, '777'], [NO_FORM_ID, '42']].forEach(([html, adId]) => {
            const a = helper.findAdIdInput(parse(html), adId);
            const b = worker.findAdIdInput(parse(html), adId);
            expect(a && a.outerHTML).toBe(b && b.outerHTML);
        });
    });

    it('liest das Beispiel-Formular inhaltlich richtig aus', () => {
        const { fields, rawFields } = helper.readFormFields(parse(FORM), '3511276012');
        expect(fields).toEqual({
            title: 'Fahrrad 28 Zoll',
            description: 'Gut erhalten.\nZweite Zeile.',
            price: '120',
            priceType: 'NEGOTIABLE',
            location: '50667'
        });
        expect(rawFields).toEqual({
            title: 'Fahrrad 28 Zoll',
            description: 'Gut erhalten.\nZweite Zeile.',
            price: '120',
            priceType: 'NEGOTIABLE',
            zipCode: '50667',
            shipping: 'ja',
            condition: 'gebraucht'
        });
        // Bilder nur aus dem Formular, Reihenfolge der Seite, volle Aufloesung,
        // Doppeltes zusammengefasst, Fremdbild und Logo ausgelassen.
        expect(helper.collectImageUrls(parse(FORM), '3511276012')).toEqual([
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/bild1?rule=$_57.JPG',
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/bb/bild2?rule=$_57.JPG'
        ]);
    });
});
