import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const { findAdIdInput, describeAdIdLookup, describeAdIdResolution, getUrlAdId } = worker;

const AD_ID = '3485590892';

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('getUrlAdId', () => {
    it('liest die adId aus der Query', () => {
        expect(getUrlAdId({ search: '?adId=3485590892' })).toBe(AD_ID);
    });

    it('liefert null ohne adId', () => {
        expect(getUrlAdId({ search: '?foo=1' })).toBeNull();
        expect(getUrlAdId({ search: '' })).toBeNull();
    });

    it('trifft nicht auf Parameter, die nur auf adId enden', () => {
        // Die frueher genutzte Regex /adId=(\d+)/ kannte keine Parametergrenze
        // und lieferte hier faelschlich "123".
        expect(getUrlAdId({ search: '?myadId=123' })).toBeNull();
        expect(getUrlAdId({ search: '?foo=1&otheradId=999' })).toBeNull();
    });

    it('findet die adId unabhaengig von der Parameter-Reihenfolge', () => {
        expect(getUrlAdId({ search: '?foo=1&adId=3485590892&bar=2' })).toBe(AD_ID);
    });

    it('weist nicht-numerische Werte ab', () => {
        expect(getUrlAdId({ search: '?adId=abc' })).toBeNull();
        expect(getUrlAdId({ search: '?adId=' })).toBeNull();
        expect(getUrlAdId({ search: '?adId=12345678901234567890123' })).toBeNull();
    });
});

describe('findAdIdInput - bekannte Selektoren', () => {
    it('findet input[name="adId"] (aktuelles Markup)', () => {
        document.body.innerHTML = `
            <form>
                <input type="hidden" name="categoryId" value="225">
                <input type="hidden" name="adId" value="${AD_ID}">
            </form>
        `;
        const el = findAdIdInput(document, AD_ID);
        expect(el).not.toBeNull();
        expect(el.name).toBe('adId');
    });

    it('findet die historischen Varianten #postad-id / name="id"', () => {
        document.body.innerHTML = `<form><input type="hidden" id="postad-id" value="${AD_ID}"></form>`;
        expect(findAdIdInput(document, AD_ID).id).toBe('postad-id');

        document.body.innerHTML = `<form><input type="hidden" name="id" value="${AD_ID}"></form>`;
        expect(findAdIdInput(document, AD_ID).name).toBe('id');
    });

    it('greift auch ohne adId in der URL, solange der Selektor trifft', () => {
        document.body.innerHTML = `<form><input type="hidden" name="adId" value="${AD_ID}"></form>`;
        expect(findAdIdInput(document, null)).not.toBeNull();
    });
});

describe('findAdIdInput - Fallback ueber den Feldwert (Issue #49)', () => {
    it('findet ein umbenanntes Hidden-Feld anhand der adId aus der URL', () => {
        document.body.innerHTML = `
            <form>
                <input type="hidden" name="categoryId" value="225">
                <input type="hidden" name="voellig-neuer-name" value="${AD_ID}">
                <input type="hidden" name="_csrf" value="token">
            </form>
        `;
        const el = findAdIdInput(document, AD_ID);
        expect(el).not.toBeNull();
        expect(el.name).toBe('voellig-neuer-name');
    });

    it('bricht bei Mehrdeutigkeit ab statt zu raten', () => {
        document.body.innerHTML = `
            <form>
                <input type="hidden" name="a" value="${AD_ID}">
                <input type="hidden" name="b" value="${AD_ID}">
            </form>
        `;
        expect(findAdIdInput(document, AD_ID)).toBeNull();
    });

    it('fasst sichtbare Felder mit gleichem Wert nicht an', () => {
        document.body.innerHTML = `<form><input type="text" name="title" value="${AD_ID}"></form>`;
        expect(findAdIdInput(document, AD_ID)).toBeNull();
    });

    it('liefert null, wenn weder Selektor noch Wert treffen', () => {
        document.body.innerHTML = `<form><input type="hidden" name="categoryId" value="225"></form>`;
        expect(findAdIdInput(document, AD_ID)).toBeNull();
    });

    it('liefert null ohne adId in der URL', () => {
        document.body.innerHTML = `<form><input type="hidden" name="unbekannt" value="${AD_ID}"></form>`;
        expect(findAdIdInput(document, null)).toBeNull();
    });
});

describe('describeAdIdResolution', () => {
    it('meldet den bekannten Selektor als Weg', () => {
        document.body.innerHTML = `<form><input type="hidden" name="adId" value="${AD_ID}"></form>`;
        const info = describeAdIdResolution(findAdIdInput(document, AD_ID));

        expect(info.weg).toBe('bekannter Selektor');
        expect(info.feldName).toBe('adId');
        expect(info.selektorVeraltet).toBe(false);
    });

    it('meldet den Fallback samt neuem Feldnamen - das Signal fuer eine Umbenennung', () => {
        document.body.innerHTML = `<form><input type="hidden" name="neuer-name" value="${AD_ID}"></form>`;
        const info = describeAdIdResolution(findAdIdInput(document, AD_ID));

        expect(info.weg).toBe('Fallback ueber Feldwert');
        expect(info.feldName).toBe('neuer-name');
        expect(info.selektorVeraltet).toBe(true);
    });
});

describe('describeAdIdLookup', () => {
    it('meldet Feldnamen und Wertlaengen, aber keine Feldinhalte', () => {
        document.body.innerHTML = `
            <form>
                <input type="hidden" name="_csrf" value="geheimes-token">
                <input type="text" name="title" value="Mein Titel">
                <button>Anzeige speichern</button>
            </form>
        `;
        const info = describeAdIdLookup(document, AD_ID);

        expect(info.speichernButton).toBe(true);
        expect(info.urlAdId).toBe('vorhanden');
        expect(info.inputs).toBe(2);
        expect(info.hiddenFelder).toEqual(['_csrf:14']);

        // Keine Werte in der Ausgabe - sie ist zum Kopieren in Issues gedacht.
        expect(JSON.stringify(info)).not.toContain('geheimes-token');
        expect(JSON.stringify(info)).not.toContain('Mein Titel');
    });

    it('meldet einen fehlenden Speichern-Button', () => {
        document.body.innerHTML = `<form><input type="hidden" name="adId" value="${AD_ID}"></form>`;
        const info = describeAdIdLookup(document, null);
        expect(info.speichernButton).toBe(false);
        expect(info.urlAdId).toBe('fehlt');
    });
});
