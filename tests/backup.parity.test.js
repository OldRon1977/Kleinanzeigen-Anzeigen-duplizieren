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

// Feldnamen wie in der Sicherung vom 21.09.2026 (data.json aus dem Test des
// Nutzers). Preistyp als Radio und categoryId sind angenommen, nicht belegt.
const LIVE_2026_09 = `
    <form>
        <input type="hidden" name="adId" value="3519053727">
        <input type="hidden" name="_csrf" value="geheim">
        <input type="hidden" name="categoryId" value="225">
        <input type="radio" name="adType" value="OFFER" checked>
        <input name="title" value="AMD A6-7400">
        <textarea name="description">Verkaufe meinen Prozessor.</textarea>
        <input type="checkbox" name="attributeMap[pc_zubehoer_software.versand]" value="ja" checked>
        <input name="priceAmount" value="10">
        <input type="radio" name="priceType" value="FIXED">
        <input type="radio" name="priceType" value="NEGOTIABLE" checked>
        <input type="radio" name="buyNow" value="false" checked>
        <input name="zipCode" value="41372">
        <input name="contactName" value="Name">
    </form>`;

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

    it.each([
        ['Live-Form 09/2026', LIVE_2026_09, '3519053727']
    ])('readFormFields und collectImageUrls: %s', (_, html, adId) => {
        expect(helper.readFormFields(parse(html), adId))
            .toEqual(worker.readFormFields(parse(html), adId));
        expect(helper.collectImageUrls(parse(html), adId))
            .toEqual(worker.collectImageUrls(parse(html), adId));
    });

    it('Live-Form 09/2026: Preis aus priceAmount, Preistyp als Radio, Kategorie versteckt', () => {
        const { fields, rawFields, hiddenFields } = worker.readFormFields(parse(LIVE_2026_09), '3519053727');
        expect(fields.price).toBe('10');
        expect(fields.priceType).toBe('NEGOTIABLE');
        expect(hiddenFields).toEqual({ adId: '3519053727', categoryId: '225' });
        expect(rawFields.priceAmount).toBe('10');
        expect(rawFields.categoryId).toBeUndefined();
    });

    // Hidden-Felder in anderer Reihenfolge als die Vorschaubilder: der Index
    // in adImages[n] entscheidet, nicht die Position im Markup.
    const ORDERED = `<form>
        <input type="hidden" name="adId" value="5">
        <input type="hidden" name="adImages[2].url" value="${'https://img.kleinanzeigen.de/api/v1/prod-ads/images/cc/drei?AccessKeyId=k&jwt=eyJ.x.y'}">
        <input type="hidden" name="adImages[0].url" value="${'https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/eins?AccessKeyId=k&jwt=eyJ.x.y'}">
        <input type="hidden" name="adImages[10].url" value="${'https://img.kleinanzeigen.de/api/v1/prod-ads/images/dd/elf?AccessKeyId=k&jwt=eyJ.x.y'}">
        <input type="hidden" name="adImages[1].url" value="${'https://img.kleinanzeigen.de/api/v1/prod-ads/images/bb/zwei?AccessKeyId=k&jwt=eyJ.x.y'}">
        <input type="hidden" name="adImages[3].url" value="https://static.kleinanzeigen.de/fremd.png">
        <input type="hidden" name="categoryId" value="160">
        <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/dd/elf?jwt=a">
        <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/bb/zwei?jwt=a">
        <img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/eins?jwt=a">
    </form>`;
    const IMG = 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/';

    it('Bildreihenfolge kommt aus dem Index von adImages[n] (beide Scripts)', () => {
        [worker, helper].forEach((impl) => {
            expect(impl.collectImageUrls(parse(ORDERED), '5')).toEqual([
                IMG + 'aa/eins?rule=$_57.JPG',
                IMG + 'bb/zwei?rule=$_57.JPG',
                IMG + 'cc/drei?rule=$_57.JPG',
                IMG + 'dd/elf?rule=$_57.JPG'
            ]);
        });
    });

    it('adImages-Adressen samt jwt landen nicht in hiddenFields (beide Scripts)', () => {
        [worker, helper].forEach((impl) => {
            const { hiddenFields } = impl.readFormFields(parse(ORDERED), '5');
            expect(hiddenFields).toEqual({ adId: '5', categoryId: '160' });
            expect(JSON.stringify(impl.readFormFields(parse(ORDERED), '5'))).not.toContain('jwt');
        });
    });

    it('ohne adImages-Felder gilt weiter die Reihenfolge der Vorschaubilder', () => {
        const html = ORDERED.replace(/<input type="hidden" name="adImages[^>]*>/g, '');
        [worker, helper].forEach((impl) => {
            expect(impl.collectImageUrls(parse(html), '5')).toEqual([
                IMG + 'dd/elf?rule=$_57.JPG',
                IMG + 'bb/zwei?rule=$_57.JPG',
                IMG + 'aa/eins?rule=$_57.JPG'
            ]);
        });
    });

    it('laesst Token-artige Felder in jeder Feldart draussen', () => {
        const html = `<form>
            <input type="hidden" name="adId" value="1">
            <input type="hidden" name="_csrf" value="a">
            <input type="hidden" name="csrf-token" value="b">
            <input type="hidden" name="xsrfToken" value="c">
            <input type="hidden" name="sessionId" value="d">
            <input name="captchaAnswer" value="e">
            <input type="hidden" name="jwt" value="f">
            <input type="hidden" name="categoryId" value="225">
        </form>`;
        [worker, helper].forEach((impl) => {
            const { rawFields, hiddenFields } = impl.readFormFields(parse(html), '1');
            expect(rawFields).toEqual({});
            expect(hiddenFields).toEqual({ adId: '1', categoryId: '225' });
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
