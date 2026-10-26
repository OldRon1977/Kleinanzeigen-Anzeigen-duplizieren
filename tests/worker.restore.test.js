import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const {
    CONFIG,
    restoreAdIdFromHash,
    isPostAdStep1Page,
    isPostAdStep2Page,
    findPostAdForm,
    applySnapshotToForm,
    applyImagesToForm,
    completeSnapshotImages,
    restoreFromSnapshot,
    handleRestorePages,
    handleConfirmationPage,
    batchPutSnapshot,
    batchGetSnapshot,
    RESTORE_MARKER_KEY,
    RESTORE_PENDING_KEY,
    LS_RESTORE_RESULT_PREFIX,
    RESTORE_PANEL_ID
} = worker;

// Formular "Anzeige aufgeben" (Schritt 2), Feldnamen wie live 10/2026:
// Radios fuer Angebot/Gesuch, Versand und Direkt-kaufen, Hidden-Felder fuer
// Kategorie, Attribute und Preistyp, ein Datei-Feld ohne Namen.
function postAdForm() {
    document.body.innerHTML = `
        <form>
            <input type="radio" name="adType" value="OFFER" checked>
            <input type="radio" name="adType" value="WANTED">
            <input type="file" multiple>
            <input name="title" value="">
            <input type="hidden" name="categoryId" value="20">
            <input type="hidden" name="attributeMap[kinderzimmermoebel.art]" value="">
            <input type="hidden" name="attributeMap[kinderzimmermoebel.color]" value="">
            <textarea name="description"></textarea>
            <input type="radio" name="attributeMap[kinderzimmermoebel.versand]" value="ja" checked>
            <input type="radio" name="attributeMap[kinderzimmermoebel.versand]" value="nein">
            <input name="priceAmount" value="">
            <input type="hidden" name="priceType" value="FIXED">
            <input type="radio" name="buyNow" value="true" checked>
            <input type="radio" name="buyNow" value="false">
            <input type="hidden" name="buyNowEligible" value="true">
            <input name="zipCode" value="">
            <input type="checkbox" name="addressVisibility" value="on">
            <input name="streetName" value="">
            <input type="hidden" name="locationId" value="1">
            <input name="contactName" value="">
            <input type="checkbox" name="articles" value="0:866">
            <input type="hidden" name="adId" value="">
            <input type="hidden" name="_csrf" value="token">
        </form>`;
    return document.querySelector('form');
}

function snapshot(overrides) {
    return Object.assign({
        adId: '3505764979',
        capturedAt: 1761412689092,
        title: 'Kinderbett Bauernbett',
        fields: { title: 'Kinderbett Bauernbett', description: 'Zum Verkauf steht ein Bett.', price: '50', location: '21521' },
        rawFields: {
            adType: 'OFFER',
            title: 'Kinderbett Bauernbett',
            description: 'Zum Verkauf steht ein Bett.',
            'attributeMap[kinderzimmermoebel.versand]': 'nein',
            priceAmount: '50',
            buyNow: 'false',
            zipCode: '21521',
            addressVisibility: 'on',
            contactName: 'Karl'
        },
        hiddenFields: {
            categoryId: '20',
            'attributeMap[kinderzimmermoebel.art]': 'betten_wiegen',
            priceType: 'NEGOTIABLE',
            buyNowEligible: 'true',
            locationId: '20984'
        },
        images: []
    }, overrides || {});
}

function value(name) {
    return document.querySelector('[name="' + name + '"]').value;
}

function checkedValue(name) {
    const el = Array.from(document.querySelectorAll('[name="' + name + '"]')).find((e) => e.checked);
    return el ? el.value : null;
}

function setPage(path) {
    window.history.replaceState({}, '', path);
}

beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    CONFIG.DUPLICATE_READY_SETTLE_MS = 0;
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setPage('/');
});

describe('restoreAdIdFromHash', () => {
    it('liest die adId aus #kaRestore=<adId>', () => {
        expect(restoreAdIdFromHash('#kaRestore=3505764979')).toBe('3505764979');
    });

    it('akzeptiert nur Ziffern', () => {
        expect(restoreAdIdFromHash('#kaRestore=abc')).toBeNull();
        expect(restoreAdIdFromHash('#kaRestore=')).toBeNull();
        expect(restoreAdIdFromHash('#kaRestore=12 34')).toBeNull();
    });

    it('ignoriert andere Hashes', () => {
        expect(restoreAdIdFromHash('#smartRepublish')).toBeNull();
        expect(restoreAdIdFromHash('#duplicate')).toBeNull();
        expect(restoreAdIdFromHash('')).toBeNull();
        expect(restoreAdIdFromHash(undefined)).toBeNull();
    });
});

describe('Seiten-Erkennung "Anzeige aufgeben"', () => {
    it('unterscheidet Schritt 1 und Schritt 2', () => {
        expect(isPostAdStep1Page({ pathname: '/p-anzeige-aufgeben.html' })).toBe(true);
        expect(isPostAdStep1Page({ pathname: '/p-anzeige-aufgeben-schritt2.html' })).toBe(false);
        expect(isPostAdStep2Page({ pathname: '/p-anzeige-aufgeben-schritt2.html' })).toBe(true);
        expect(isPostAdStep2Page({ pathname: '/p-anzeige-aufgeben.html' })).toBe(false);
        expect(isPostAdStep1Page({ pathname: '/p-anzeige-bearbeiten.html' })).toBe(false);
    });

    it('findet das Formular ueber das Titelfeld', () => {
        expect(findPostAdForm()).toBeNull();
        const form = postAdForm();
        expect(findPostAdForm()).toBe(form);
    });
});

describe('applySnapshotToForm', () => {
    it('traegt Texte, Preis, Ort und Kontakt ein', () => {
        const form = postAdForm();
        const report = applySnapshotToForm(form, snapshot());

        expect(value('title')).toBe('Kinderbett Bauernbett');
        expect(value('description')).toBe('Zum Verkauf steht ein Bett.');
        expect(value('priceAmount')).toBe('50');
        expect(value('zipCode')).toBe('21521');
        expect(value('contactName')).toBe('Karl');
        expect(report.set).toEqual(expect.arrayContaining(['title', 'description', 'priceAmount', 'zipCode', 'contactName']));
    });

    it('schaltet Radios und Kaestchen wie per Klick um', () => {
        const form = postAdForm();
        applySnapshotToForm(form, snapshot());

        expect(checkedValue('attributeMap[kinderzimmermoebel.versand]')).toBe('nein');
        expect(checkedValue('buyNow')).toBe('false');
        expect(document.querySelector('[name="addressVisibility"]').checked).toBe(true);
    });

    it('laesst stehen, was schon stimmt, und meldet es als kept', () => {
        const form = postAdForm();
        const report = applySnapshotToForm(form, snapshot());
        // adType=OFFER war vorausgewaehlt
        expect(report.kept).toContain('adType');
        expect(checkedValue('adType')).toBe('OFFER');
    });

    it('setzt versteckte Attribute und den Preistyp aus hiddenFields', () => {
        const form = postAdForm();
        const report = applySnapshotToForm(form, snapshot());

        expect(value('attributeMap[kinderzimmermoebel.art]')).toBe('betten_wiegen');
        expect(value('priceType')).toBe('NEGOTIABLE');
        expect(report.attributes).toEqual(['attributeMap[kinderzimmermoebel.art]']);
    });

    it('fasst Kategorie, Sitzungswerte und kostenpflichtige Extras nicht an', () => {
        const form = postAdForm();
        const snap = snapshot({
            hiddenFields: Object.assign({}, snapshot().hiddenFields, { categoryId: '99', adId: '3505764979' }),
            rawFields: Object.assign({}, snapshot().rawFields, { articles: '0:866' })
        });
        const report = applySnapshotToForm(form, snap);

        expect(value('categoryId')).toBe('20');
        expect(value('locationId')).toBe('1');
        expect(value('adId')).toBe('');
        expect(document.querySelector('[name="articles"]').checked).toBe(false);
        expect(report.skipped).toEqual(expect.arrayContaining(['categoryId', 'locationId', 'buyNowEligible', 'articles', 'adId']));
    });

    it('meldet Felder, die das Formular nicht hat, statt zu scheitern', () => {
        const form = postAdForm();
        const snap = snapshot({
            rawFields: Object.assign({}, snapshot().rawFields, { 'attributeMap[fahrrad.typ]': 'kinder', buyNow: 'vielleicht' })
        });
        const report = applySnapshotToForm(form, snap);

        expect(report.missing).toContain('attributeMap[fahrrad.typ]');
        // Radio ohne passende Option: nicht gesetzt, als fehlend gemeldet
        expect(report.missing).toContain('buyNow');
        expect(checkedValue('buyNow')).toBe('true');
    });

    it('ueberschreibt kein sichtbares Feld aus einem versteckten Wert', () => {
        const form = postAdForm();
        const snap = snapshot({ rawFields: { priceAmount: '50' }, hiddenFields: { title: 'Versteckter Titel' } });
        const report = applySnapshotToForm(form, snap);

        expect(value('title')).toBe('');
        expect(report.missing).toContain('title');
    });

    it('kommt mit Snapshots ohne hiddenFields aus (Hauptscript < 3.11.0)', () => {
        const form = postAdForm();
        const snap = snapshot();
        delete snap.hiddenFields;
        const report = applySnapshotToForm(form, snap);

        expect(value('title')).toBe('Kinderbett Bauernbett');
        expect(value('priceType')).toBe('FIXED');
        expect(report.attributes).toEqual([]);
    });

    it('loest input- und change-Events aus, damit React die Werte uebernimmt', () => {
        const form = postAdForm();
        const seen = [];
        form.querySelector('[name="title"]').addEventListener('input', () => seen.push('input'));
        form.querySelector('[name="title"]').addEventListener('change', () => seen.push('change'));
        applySnapshotToForm(form, snapshot());
        expect(seen).toEqual(['input', 'change']);
    });
});

describe('applyImagesToForm', () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

    it('meldet leere Bildlisten ohne Grund und Listen ohne Daten mit Grund', () => {
        const form = postAdForm();
        expect(applyImagesToForm(form, [])).toEqual({ uploaded: 0, total: 0, reason: null });
        expect(applyImagesToForm(form, [{ url: 'u', blob: null, mime: null }]))
            .toEqual({ uploaded: 0, total: 1, reason: 'no_image_data' });
    });

    it('meldet ein fehlendes Datei-Feld', () => {
        document.body.innerHTML = '<form><input name="title"></form>';
        const form = document.querySelector('form');
        expect(applyImagesToForm(form, [{ url: 'u', blob: blob, mime: 'image/jpeg' }]).reason).toBe('file_input_missing');
    });

    it('bleibt ohne DataTransfer still statt zu werfen', () => {
        vi.stubGlobal('DataTransfer', undefined);
        const form = postAdForm();
        expect(applyImagesToForm(form, [{ url: 'u', blob: blob, mime: 'image/jpeg' }]).reason).toBe('datatransfer_unsupported');
    });

    it('haengt die Bilder in Reihenfolge an das Datei-Feld und loest change aus', () => {
        // jsdom kennt kein DataTransfer; dieser Ersatz liefert die Liste, die
        // ein Browser in input.files legt.
        class FakeDataTransfer {
            constructor() { this.files = []; this.items = { add: (f) => { this.files.push(f); } }; }
        }
        vi.stubGlobal('DataTransfer', FakeDataTransfer);
        const form = postAdForm();
        const input = form.querySelector('input[type="file"]');
        let changed = 0;
        input.addEventListener('change', () => { changed++; });

        const png = new Blob([new Uint8Array([4])], { type: 'image/png' });
        const res = applyImagesToForm(form, [
            { url: 'a', blob: blob, mime: 'image/jpeg' },
            { url: 'b', blob: null, mime: null },
            { url: 'c', blob: png, mime: 'image/png' }
        ]);

        expect(res).toEqual({ uploaded: 2, total: 3, reason: null });
        expect(changed).toBe(1);
        expect(Array.from(input.files).map((f) => f.name)).toEqual(['image_01.jpg', 'image_02.png']);
    });
});

describe('completeSnapshotImages', () => {
    it('laedt fehlende Bilder in voller Aufloesung nach und behaelt vorhandene', async () => {
        const have = { url: 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/1?rule=$_57.JPG', blob: new Blob([1]), mime: 'image/jpeg' };
        const calls = [];
        global.fetch = vi.fn(async (url) => {
            calls.push(url);
            return { ok: true, blob: async () => new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' }) };
        });

        const out = await completeSnapshotImages([
            have,
            { url: 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/bb/2?AccessKeyId=k&jwt=signed96px', blob: null, mime: null }
        ]);

        expect(out[0]).toBe(have);
        expect(out[1].blob).toBeInstanceOf(Blob);
        expect(out[1].mime).toBe('image/jpeg');
        // signierte Vorschau -> volle Groesse, ohne jwt
        expect(calls).toEqual(['https://img.kleinanzeigen.de/api/v1/prod-ads/images/bb/2?rule=$_57.JPG']);
    });

    it('laesst ein nicht ladbares Bild als Platzhalter stehen', async () => {
        global.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
        const out = await completeSnapshotImages([{ url: 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/cc/3', blob: null, mime: null }]);
        expect(out[0].blob).toBeNull();
    });
});

describe('restoreFromSnapshot (Schritt 2)', () => {
    it('befuellt das Formular, setzt den Pending-Marker und schickt nichts ab', async () => {
        setPage('/p-anzeige-aufgeben-schritt2.html?categoryId=20#kaRestore=3505764979');
        postAdForm();
        await batchPutSnapshot(snapshot());
        sessionStorage.setItem(RESTORE_MARKER_KEY, JSON.stringify({ v: '3505764979', ts: Date.now() }));

        const res = await restoreFromSnapshot('3505764979');

        expect(res.report.set).toContain('title');
        expect(value('title')).toBe('Kinderbett Bauernbett');
        expect(sessionStorage.getItem(RESTORE_MARKER_KEY)).toBeNull();
        expect(JSON.parse(sessionStorage.getItem(RESTORE_PENDING_KEY)).v).toBe('3505764979');
        const panel = document.getElementById(RESTORE_PANEL_ID);
        expect(panel.textContent).toContain('Nichts wurde abgeschickt');
        // Der Snapshot bleibt bis zur Bestaetigungs-Seite erhalten
        expect(await batchGetSnapshot('3505764979')).not.toBeNull();
    });

    it('meldet einen fehlenden Snapshot und raeumt den Auftrag ab', async () => {
        setPage('/p-anzeige-aufgeben-schritt2.html');
        postAdForm();
        sessionStorage.setItem(RESTORE_MARKER_KEY, JSON.stringify({ v: '1', ts: Date.now() }));

        const res = await restoreFromSnapshot('1');

        expect(res).toBeNull();
        expect(sessionStorage.getItem(RESTORE_MARKER_KEY)).toBeNull();
        expect(sessionStorage.getItem(RESTORE_PENDING_KEY)).toBeNull();
        expect(document.querySelector('.ka-notification.error')).not.toBeNull();
        expect(value('title')).toBe('');
    });
});

describe('handleRestorePages', () => {
    it('tut ohne Hash und Marker nichts', () => {
        setPage('/p-anzeige-aufgeben-schritt2.html');
        postAdForm();
        expect(handleRestorePages()).toBe(false);
        expect(sessionStorage.getItem(RESTORE_MARKER_KEY)).toBeNull();
    });

    it('merkt sich den Auftrag auf Schritt 1 und befuellt dort nichts', () => {
        setPage('/p-anzeige-aufgeben.html#kaRestore=3505764979');
        document.body.innerHTML = '<form id="postad-step1-frm"><input type="hidden" name="_csrf"></form>';

        expect(handleRestorePages()).toBe(true);
        expect(JSON.parse(sessionStorage.getItem(RESTORE_MARKER_KEY)).v).toBe('3505764979');
        expect(document.querySelector('.ka-notification')).not.toBeNull();
    });

    it('verwirft einen abgelaufenen Marker', () => {
        setPage('/p-anzeige-aufgeben-schritt2.html');
        postAdForm();
        sessionStorage.setItem(RESTORE_MARKER_KEY, JSON.stringify({ v: '3505764979', ts: Date.now() - CONFIG.MARKER_MAX_AGE_MS - 1 }));
        expect(handleRestorePages()).toBe(false);
    });
});

describe('Bestaetigungs-Seite nach einer Wiederherstellung', () => {
    it('loescht den Snapshot und meldet ok an den Helper', async () => {
        setPage('/p-anzeige-aufgeben-bestaetigung.html');
        await batchPutSnapshot(snapshot());
        sessionStorage.setItem(RESTORE_PENDING_KEY, JSON.stringify({ v: '3505764979', ts: Date.now() }));

        await handleConfirmationPage();

        expect(await batchGetSnapshot('3505764979')).toBeNull();
        expect(localStorage.getItem(LS_RESTORE_RESULT_PREFIX + '3505764979')).toBe('ok');
        expect(sessionStorage.getItem(RESTORE_PENDING_KEY)).toBeNull();
    });

    it('laesst fremde Snapshots in Ruhe, wenn kein Pending-Marker steht', async () => {
        setPage('/p-anzeige-aufgeben-bestaetigung.html');
        await batchPutSnapshot(snapshot());

        await handleConfirmationPage();

        expect(await batchGetSnapshot('3505764979')).not.toBeNull();
        expect(localStorage.getItem(LS_RESTORE_RESULT_PREFIX + '3505764979')).toBeNull();
    });
});
