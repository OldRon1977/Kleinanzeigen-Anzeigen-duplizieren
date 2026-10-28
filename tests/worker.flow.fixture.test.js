import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fixture } from './fixtures.js';
import worker from '../kleinanzeigen-duplizieren.user.js';

// Abläufe auf der echten Bearbeiten-Seite: tests/fixtures/edit-page-form.html
// ist das Formular von "Anzeige bearbeiten", live gespeichert und anonymisiert
// (Anzeige 1000000001, Herrenbekleidung, drei Bilder). Gemockt sind nur das
// Netz (Bilder, Löschen) und die Navigation nach dem Speichern-Klick.

const {
    CONFIG,
    smartRepublish,
    duplicateAd,
    findSaveButton,
    readFormFields,
    handleConfirmationPage,
    batchGetSnapshot,
    init
} = worker;

const EDIT_FORM = fixture('edit-page-form.html');
const AD = '1000000001';

function setPage(path) {
    window.history.replaceState({}, '', path);
}

function loadEditPage(hash) {
    setPage('/p-anzeige-bearbeiten.html?adId=' + AD + (hash || ''));
    document.head.innerHTML = '';
    document.body.innerHTML = EDIT_FORM;
}

// Hält fest, was beim Speichern-Klick gilt: Formular und Marker in genau
// diesem Moment. Danach würde die Seite navigieren.
function watchSaveClick() {
    const seen = { clicks: 0 };
    const btn = findSaveButton();
    btn.addEventListener('click', () => {
        seen.clicks++;
        const adIdField = document.querySelector('input[name="adId"]');
        seen.adIdFieldStillNamed = !!adIdField;
        seen.markers = {
            original: sessionStorage.getItem('ka-batch-original-adid'),
            deleteAfter: sessionStorage.getItem('ka-delete-after-create'),
            manual: sessionStorage.getItem('ka-manual-mode'),
            duplicate: sessionStorage.getItem('ka-duplicate-adid')
        };
    });
    return seen;
}

function imageFetchMock() {
    return vi.fn(async (url) => {
        if (String(url).includes('img.kleinanzeigen.de')) {
            return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) };
        }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    });
}

let deleteCalls;

beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    CONFIG.DUPLICATE_READY_SETTLE_MS = 0;
    CONFIG.DELETE_WAIT_AFTER_CREATE_MS = 0;
    CONFIG.SAVE_WATCHDOG_TIMEOUT_MS = 60 * 60 * 1000;
    global.fetch = imageFetchMock();
    deleteCalls = () => global.fetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('m-anzeigen-loeschen.json'));
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete global.fetch;
    setPage('/');
});

describe('echte Bearbeiten-Seite: Grundlagen', () => {
    it('findet den Speichern-Knopf und das Ad-ID-Feld', () => {
        loadEditPage();
        const btn = findSaveButton();
        expect(btn).toBeTruthy();
        expect(btn.textContent.trim()).toBe('Anzeige speichern');
        expect(btn.type).toBe('button');
        expect(document.querySelector('input[name="adId"]').value).toBe(AD);
    });

    it('liest Felder, Kategorie und Attribute, aber kein Token und keine Bildadressen', () => {
        loadEditPage();
        const ff = readFormFields(document, AD);
        expect(ff.fields.title).toBe('Testanzeige 1');
        expect(ff.fields.price).toBe('10');
        expect(ff.fields.description).toContain('Beschreibung der Testanzeige');
        expect(ff.hiddenFields.categoryId).toBe('160');
        expect(ff.hiddenFields['attributeMap[kleidung_herren.art]']).toBe('sportbekleidung');
        expect(ff.hiddenFields['attributeMap[kleidung_herren.condition]']).toBe('like_new');
        expect(ff.rawFields['attributeMap[kleidung_herren.versand]']).toBe('ja');
        const allNames = Object.keys(ff.rawFields).concat(Object.keys(ff.hiddenFields));
        expect(allNames.some((n) => /csrf|token|session/i.test(n))).toBe(false);
        expect(allNames.some((n) => n.indexOf('adImages[') === 0)).toBe(false);
    });
});

describe('smartRepublish auf der echten Bearbeiten-Seite', () => {
    it('Batch: Snapshot, Marker und neutralisiertes Ad-ID-Feld vor dem Klick; nichts gelöscht', async () => {
        loadEditPage('#smartRepublish');
        const seen = watchSaveClick();

        await smartRepublish();

        expect(seen.clicks).toBe(1);
        expect(seen.adIdFieldStillNamed).toBe(false);
        expect(JSON.parse(seen.markers.original).v).toBe(AD);
        expect(JSON.parse(seen.markers.deleteAfter).v).toBe(AD);
        expect(seen.markers.manual).toBeNull();
        expect(deleteCalls()).toEqual([]);
        expect(localStorage.getItem('ka-batch-result-' + AD)).toBeNull();

        const snap = await batchGetSnapshot(AD);
        expect(snap.title).toBe('Testanzeige 1');
        expect(snap.hiddenFields.categoryId).toBe('160');
        expect(snap.images).toHaveLength(3);
        // fake-indexeddb klont jsdom-Blobs nicht (es bleibt ein leeres Objekt);
        // geprüft wird deshalb, was vor dem Speichern feststeht: geladen wurde
        // jedes Bild in voller Auflösung, und jedes trägt seinen Typ.
        expect(snap.images.every((i) => i.mime === 'image/jpeg')).toBe(true);
        const imageFetches = global.fetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('img.kleinanzeigen.de'));
        expect(imageFetches).toEqual(snap.images.map((i) => i.url));
        // Bilder in voller Auflösung, ohne Signatur, in der Reihenfolge der Anzeige
        expect(snap.images.map((i) => i.url)).toEqual([
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/1c/00000000-0000-4000-8000-000000000001?rule=$_57.JPG',
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/af/00000000-0000-4000-8000-000000000002?rule=$_57.JPG',
            'https://img.kleinanzeigen.de/api/v1/prod-ads/images/72/00000000-0000-4000-8000-000000000003?rule=$_57.JPG'
        ]);
    });

    it('manuell: setzt zusätzlich ka-manual-mode', async () => {
        loadEditPage();
        const seen = watchSaveClick();
        await smartRepublish();
        expect(seen.clicks).toBe(1);
        expect(seen.markers.manual).toBe('1');
    });

    it('ganzer Weg: Klick, dann Bestätigungsseite löscht genau das Original und meldet ok', async () => {
        loadEditPage('#smartRepublish');
        await smartRepublish();

        // Navigation nach dem Speichern: derselbe Tab, neue Seite
        setPage('/p-anzeige-aufgeben-bestaetigung.html?adId=2000000001');
        document.body.innerHTML = '<div>Anzeige aufgegeben</div>';
        document.head.innerHTML = '<meta name="_csrf" content="TEST-csrf">';
        await handleConfirmationPage();

        expect(deleteCalls()).toEqual([expect.stringContaining('ids=' + AD)]);
        expect(localStorage.getItem('ka-batch-result-' + AD)).toBe('ok');
        expect(sessionStorage.getItem('ka-delete-after-create')).toBeNull();
        // Im Batch löscht der Helper den Snapshot, nicht die Bestätigungsseite
        expect(await batchGetSnapshot(AD)).not.toBeNull();
    });

    it('Watchdog: bleibt der Tab auf der Bearbeiten-Seite, wird nichts gelöscht und save_failed:not_deleted gemeldet', async () => {
        CONFIG.SAVE_WATCHDOG_TIMEOUT_MS = 30;
        loadEditPage('#smartRepublish');
        await smartRepublish();
        await new Promise((r) => setTimeout(r, 80));

        expect(localStorage.getItem('ka-batch-result-' + AD)).toBe('error:save_failed:not_deleted');
        expect(sessionStorage.getItem('ka-delete-after-create')).toBeNull();
        expect(deleteCalls()).toEqual([]);
    });

    it('Preflight: ohne Speichern-Knopf kein Snapshot, kein Klick, precondition_failed', async () => {
        vi.useFakeTimers();
        loadEditPage('#smartRepublish');
        findSaveButton().remove();

        const run = smartRepublish();
        await vi.advanceTimersByTimeAsync(21000);
        await run;

        expect(localStorage.getItem('ka-batch-result-' + AD)).toBe('error:precondition_failed:save_button_missing');
        expect(sessionStorage.getItem('ka-delete-after-create')).toBeNull();
        vi.useRealTimers();
        expect(await batchGetSnapshot(AD)).toBeNull();
    });

    it('Preflight: ohne Ad-ID-Feld kein Klick, precondition_failed', async () => {
        vi.useFakeTimers();
        loadEditPage('#smartRepublish');
        const seen = watchSaveClick();
        document.querySelector('input[name="adId"]').remove();

        const run = smartRepublish();
        await vi.advanceTimersByTimeAsync(21000);
        await run;

        expect(seen.clicks).toBe(0);
        expect(localStorage.getItem('ka-batch-result-' + AD)).toBe('error:precondition_failed:adid_input_missing');
    });

    it('Snapshot scheitert: kein Klick, keine Marker, snapshot_failed', async () => {
        loadEditPage('#smartRepublish');
        const seen = watchSaveClick();
        vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new Error('IDB gesperrt'); });

        await smartRepublish();

        expect(seen.clicks).toBe(0);
        expect(sessionStorage.getItem('ka-delete-after-create')).toBeNull();
        expect(localStorage.getItem('ka-batch-result-' + AD)).toMatch(/^error:snapshot_failed:/);
    });
});

describe('duplicateAd auf der echten Bearbeiten-Seite', () => {
    it('über den Helper (#duplicate): Ad-ID-Feld neutralisiert, Signal-Marker, kein Snapshot, kein Löschauftrag', async () => {
        loadEditPage('#duplicate');
        const seen = watchSaveClick();

        await duplicateAd();

        expect(seen.clicks).toBe(1);
        expect(seen.adIdFieldStillNamed).toBe(false);
        expect(seen.markers.duplicate).toBe(AD);
        expect(seen.markers.deleteAfter).toBeNull();
        expect(await batchGetSnapshot(AD)).toBeNull();
    });

    it('auf der Seite selbst (ohne Hash): kein Signal-Marker', async () => {
        loadEditPage();
        const seen = watchSaveClick();
        await duplicateAd();
        expect(seen.clicks).toBe(1);
        expect(seen.markers.duplicate).toBeNull();
    });

    it('Bestätigungsseite nach dem Duplizieren: meldet ok an den Helper, löscht nichts', async () => {
        loadEditPage('#duplicate');
        await duplicateAd();
        setPage('/p-anzeige-aufgeben-bestaetigung.html');
        document.body.innerHTML = '';
        await handleConfirmationPage();
        expect(localStorage.getItem('ka-duplicate-result-' + AD)).toBe('ok');
        expect(deleteCalls()).toEqual([]);
    });
});

describe('init: welche Seite welchen Ablauf startet', () => {
    it('auf einer beliebigen Seite nur der Werbeblocker, kein Formularzugriff', () => {
        setPage('/s-anzeigen/jacke/k0');
        document.head.innerHTML = '';
        document.body.innerHTML = EDIT_FORM;
        init();
        expect(document.head.querySelectorAll('style').length).toBeGreaterThan(0);
        expect(document.getElementById('ka-floating-toolbar')).toBeNull();
        expect(document.querySelector('input[name="adId"]')).not.toBeNull();
    });

    it('auf der Bearbeiten-Seite ohne Hash erscheint die Leiste mit beiden Knöpfen, nichts wird geklickt', () => {
        loadEditPage();
        const seen = watchSaveClick();
        init();
        const bar = document.getElementById('ka-floating-toolbar');
        expect(bar).not.toBeNull();
        expect(bar.textContent).toContain('Duplizieren');
        expect(bar.textContent).toContain('Smart neu einstellen');
        expect(seen.clicks).toBe(0);
    });

    it('auf der Bestätigungsseite wird der Löschauftrag ausgeführt', async () => {
        setPage('/p-anzeige-aufgeben-bestaetigung.html');
        document.head.innerHTML = '<meta name="_csrf" content="TEST-csrf">';
        document.body.innerHTML = '';
        sessionStorage.setItem('ka-delete-after-create', JSON.stringify({ v: AD, ts: Date.now() }));
        sessionStorage.setItem('ka-batch-original-adid', JSON.stringify({ v: AD, ts: Date.now() }));
        init();
        await vi.waitFor(() => expect(localStorage.getItem('ka-batch-result-' + AD)).toBe('ok'));
        expect(deleteCalls()).toHaveLength(1);
    });

    it('auf "Anzeige aufgeben" ohne Auftrag passiert nichts außer dem Werbeblocker', () => {
        setPage('/p-anzeige-aufgeben-schritt2.html?categoryId=160');
        document.body.innerHTML = '<form><input name="title" value=""></form>';
        init();
        expect(document.querySelector('input[name="title"]').value).toBe('');
        expect(sessionStorage.getItem('ka-restore-adid')).toBeNull();
    });
});
