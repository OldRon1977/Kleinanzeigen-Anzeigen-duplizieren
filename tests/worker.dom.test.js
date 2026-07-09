import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const {
    CONFIG,
    getExponentialBackoffWait,
    readFormFields,
    collectImageUrls
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
});
