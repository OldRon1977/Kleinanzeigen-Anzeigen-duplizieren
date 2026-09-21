import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import helper from '../helper.user.js';

const {
    AD_EDIT_PATH,
    fetchAdEditDocument,
    backupOneAd,
    buildBackupReport,
    buildBackupZip,
    runBackup,
    requestBackupStop,
    renderConfirm,
    renderBackupDone
} = helper;

const IMG = 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/';

function editPage(adId, opts) {
    const o = opts || {};
    const imgs = (o.images || []).map((n) => `<img src="${IMG}${n}?AccessKeyId=k&jwt=j">`).join('');
    const desc = o.description === undefined ? 'Beschreibung' : o.description;
    return `<html><body><form>
        <input type="hidden" name="adId" value="${adId}">
        <input type="hidden" name="_csrf" value="token">
        <input name="title" value="${o.title === undefined ? 'Titel ' + adId : o.title}">
        <textarea name="description">${desc}</textarea>
        ${imgs}
    </form></body></html>`;
}

function htmlResponse(html, extra) {
    return Object.assign({
        ok: true, status: 200, redirected: false, url: '',
        text: async () => html
    }, extra || {});
}

function imageResponse(bytes, type) {
    return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array(bytes)], { type: type || 'image/jpeg' }) };
}

// Einfacher Router fuer fetch: Bearbeiten-Seiten nach adId, Bilder nach Name.
function installFetch(pages, images) {
    global.fetch = vi.fn(async (url, options) => {
        if (url.indexOf(AD_EDIT_PATH) === 0) {
            const adId = decodeURIComponent(url.slice(AD_EDIT_PATH.length));
            const page = pages[adId];
            if (page instanceof Error) throw page;
            if (!page) return { ok: false, status: 404 };
            return typeof page === 'string' ? htmlResponse(page) : page;
        }
        const name = url.slice(IMG.length).split('?')[0];
        const img = images[name];
        if (!img) return { ok: false, status: 404, blob: async () => new Blob() };
        return imageResponse(img);
    });
}

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    delete global.fetch;
    vi.restoreAllMocks();
});

describe('fetchAdEditDocument', () => {
    it('holt die Bearbeiten-Seite mit Cookies und liefert das Dokument', async () => {
        installFetch({ '111': editPage('111') }, {});
        const doc = await fetchAdEditDocument('111');
        expect(doc.querySelector('input[name="title"]').value).toBe('Titel 111');
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toBe('/p-anzeige-bearbeiten.html?adId=111');
        expect(options.credentials).toBe('same-origin');
        expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('lehnt eine Umleitung auf eine andere Seite ab (Login abgelaufen)', async () => {
        installFetch({
            '111': htmlResponse('<form><input name="adId" value="111"></form>', {
                redirected: true, url: 'https://www.kleinanzeigen.de/m-einloggen.html'
            })
        }, {});
        await expect(fetchAdEditDocument('111')).rejects.toThrow('umgeleitet');
    });

    it('lehnt eine Seite ohne das Formular dieser Anzeige ab', async () => {
        installFetch({ '111': '<html><body><form><input name="email"></form></body></html>' }, {});
        await expect(fetchAdEditDocument('111')).rejects.toThrow('Formular der Anzeige nicht gefunden');
    });

    it('lehnt das Formular einer anderen Anzeige ab', async () => {
        installFetch({ '111': editPage('222') }, {});
        await expect(fetchAdEditDocument('111')).rejects.toThrow('Formular der Anzeige nicht gefunden');
    });

    it('meldet HTTP-Fehler', async () => {
        installFetch({}, {});
        await expect(fetchAdEditDocument('111')).rejects.toThrow('HTTP 404');
    });
});

describe('backupOneAd', () => {
    it('sichert Felder und Bilder in Seitenreihenfolge, ohne CSRF-Token', async () => {
        installFetch({ '111': editPage('111', { images: ['a/1', 'b/2', 'c/3'] }) },
            { 'a/1': [1], 'b/2': [2, 2], 'c/3': [3, 3, 3] });
        const snap = await backupOneAd('111', 'Listentitel');
        expect(snap.adId).toBe('111');
        expect(snap.title).toBe('Titel 111');
        expect(snap.fields.description).toBe('Beschreibung');
        expect(snap.rawFields._csrf).toBeUndefined();
        expect(snap.images.map((i) => i.url)).toEqual([
            IMG + 'a/1?rule=$_57.JPG', IMG + 'b/2?rule=$_57.JPG', IMG + 'c/3?rule=$_57.JPG'
        ]);
        expect(snap.images.map((i) => i.blob.size)).toEqual([1, 2, 3]);
        expect(snap.problems).toEqual([]);
        // Bilder ohne Cookies (CORS des Bild-Servers)
        const imgCall = global.fetch.mock.calls.find(([u]) => u.indexOf(IMG) === 0);
        expect(imgCall[1].credentials).toBe('omit');
    });

    it('behaelt ein fehlgeschlagenes Bild als Platzhalter an seiner Position', async () => {
        installFetch({ '111': editPage('111', { images: ['a/1', 'weg/2', 'c/3'] }) },
            { 'a/1': [1], 'c/3': [3] });
        const snap = await backupOneAd('111', '');
        expect(snap.images.map((i) => i.blob ? 'ok' : 'fehlt')).toEqual(['ok', 'fehlt', 'ok']);
        expect(snap.images[1].url).toBe(IMG + 'weg/2?rule=$_57.JPG');
        expect(snap.problems).toEqual(['1 von 3 Bild(ern) nicht geladen']);
    });

    it('meldet fehlende Beschreibung und fehlende Bilder als Hinweis', async () => {
        installFetch({ '111': editPage('111', { description: '', images: [] }) }, {});
        const snap = await backupOneAd('111', '');
        expect(snap.problems).toEqual(['keine Beschreibung im Formular', 'keine Bilder gefunden']);
    });

    it('nimmt den Listentitel, wenn das Formular keinen Titel hat', async () => {
        installFetch({ '111': editPage('111', { title: '', images: [] }) }, {});
        const snap = await backupOneAd('111', 'Aus der Liste');
        expect(snap.title).toBe('Aus der Liste');
        expect(snap.problems).toContain('kein Titel im Formular');
    });
});

describe('runBackup', () => {
    const noGap = { gapMs: () => 0 };

    it('arbeitet nacheinander ab und laesst sich von einem Fehler nicht stoppen', async () => {
        installFetch({
            '1': editPage('1'),
            '2': new Error('Netz weg'),
            '3': editPage('3')
        }, {});
        const matches = [{ adId: '1', title: 'A' }, { adId: '2', title: 'B' }, { adId: '3', title: 'C' }];
        const state = await runBackup(matches, null, noGap);
        expect(state.done.map((s) => s.adId)).toEqual(['1', '3']);
        expect(state.failed).toEqual([{ adId: '2', title: 'B', error: 'Netz weg' }]);
        expect(state.aborted).toBe(false);
        const pageOrder = global.fetch.mock.calls.map(([u]) => u).filter((u) => u.indexOf(AD_EDIT_PATH) === 0);
        expect(pageOrder).toEqual([AD_EDIT_PATH + '1', AD_EDIT_PATH + '2', AD_EDIT_PATH + '3']);
    });

    it('Stop beendet nach der laufenden Anzeige und behaelt das Gesicherte', async () => {
        installFetch({ '1': editPage('1'), '2': editPage('2'), '3': editPage('3') }, {});
        const matches = [{ adId: '1' }, { adId: '2' }, { adId: '3' }];
        const state = await runBackup(matches, (s) => {
            if (s.current && s.current.adId === '2') requestBackupStop();
        }, noGap);
        expect(state.done.map((s) => s.adId)).toEqual(['1', '2']);
        expect(state.aborted).toBe(true);
    });

    it('wartet zwischen zwei Anzeigen, nicht nach der letzten', async () => {
        vi.useFakeTimers();
        try {
            installFetch({ '1': editPage('1'), '2': editPage('2') }, {});
            const gap = vi.fn(() => 1500);
            const done = runBackup([{ adId: '1' }, { adId: '2' }], null, { gapMs: gap });
            await vi.runAllTimersAsync();
            const state = await done;
            expect(state.done.length).toBe(2);
            expect(gap).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });
});

// Minimaler Leser fuer die STORE-only-ZIP: Namen und Inhalt je Eintrag.
async function readZip(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(buf.buffer);
    const entries = {};
    let p = 0;
    while (dv.getUint32(p, true) === 0x04034b50) {
        const size = dv.getUint32(p + 18, true);
        const nameLen = dv.getUint16(p + 26, true);
        const extraLen = dv.getUint16(p + 28, true);
        const name = new TextDecoder().decode(buf.slice(p + 30, p + 30 + nameLen));
        const start = p + 30 + nameLen + extraLen;
        entries[name] = buf.slice(start, start + size);
        p = start + size;
    }
    return entries;
}

describe('buildBackupZip', () => {
    it('enthaelt Protokoll, data.json und Bilder je Anzeige', async () => {
        installFetch({
            '1': editPage('1', { images: ['a/1', 'weg/2'] }),
            '2': new Error('Timeout nach 20000 ms')
        }, { 'a/1': [9, 9] });
        const state = await runBackup([{ adId: '1', title: 'Fahrrad' }, { adId: '2', title: 'Stuhl' }], null, { gapMs: () => 0 });
        const entries = await readZip(await buildBackupZip(state));
        expect(Object.keys(entries).sort()).toEqual([
            '1-Titel_1/data.json',
            '1-Titel_1/image_01.jpg',
            'protokoll.txt'
        ]);
        const data = JSON.parse(new TextDecoder().decode(entries['1-Titel_1/data.json']));
        expect(data.adId).toBe('1');
        expect(data.fields.description).toBe('Beschreibung');
        expect(data.imageUrls.length).toBe(2);
        expect(data.hiddenFields).toEqual({ adId: '1' });
        expect(Array.from(entries['1-Titel_1/image_01.jpg'])).toEqual([9, 9]);

        const report = new TextDecoder().decode(entries['protokoll.txt']);
        expect(report).toContain('Gesichert: 1 von 2');
        expect(report).toContain('OK     1  Titel 1  | Felder: 2 (+1 versteckt), Bilder: 1/2');
        expect(report).toContain('Hinweis: 1 von 2 Bild(ern) nicht geladen');
        expect(report).toContain('FEHLER 2  Stuhl  | Timeout nach 20000 ms');
    });

    it('vermerkt einen Abbruch im Protokoll', () => {
        const report = buildBackupReport({ startedAt: Date.now(), total: 5, done: [], failed: [], aborted: true });
        expect(report).toContain('Gesichert: 0 von 5 (abgebrochen)');
    });
});

describe('Auswahl-Fenster: Button "Auswahl sichern (ZIP)"', () => {
    const MATCHES = [
        { adId: '1001', title: 'Fahrrad', endText: '', daysLeft: 40, ageDays: 20, ageExact: true, favCount: 0 },
        { adId: '1002', title: 'Stuhl', endText: '', daysLeft: 50, ageDays: 10, ageExact: true, favCount: 3 }
    ];
    const overlay = () => document.getElementById('ka-batch-overlay');
    const button = (text) => Array.from(overlay().querySelectorAll('button')).find((b) => b.textContent === text);

    it('fehlt ohne onBackup (bestehende Aufrufer unveraendert)', async () => {
        await renderConfirm(MATCHES, [], () => {}, {});
        expect(button('Auswahl sichern (ZIP)')).toBeUndefined();
    });

    it('ist bei leerer Auswahl gesperrt und uebergibt sonst genau die Auswahl', async () => {
        const onBackup = vi.fn();
        const onStart = vi.fn();
        await renderConfirm(MATCHES, [], onStart, { onBackup });
        const b = button('Auswahl sichern (ZIP)');
        expect(b.disabled).toBe(true);

        button('Alle').click();
        expect(b.disabled).toBe(false);
        b.click();
        expect(onBackup).toHaveBeenCalledTimes(1);
        expect(onBackup.mock.calls[0][0].map((m) => m.adId)).toEqual(['1001', '1002']);
        expect(onStart).not.toHaveBeenCalled();
    });

    it('sichert nur die einzeln angehakten Anzeigen', async () => {
        const onBackup = vi.fn();
        await renderConfirm(MATCHES, [], () => {}, { onBackup });
        const rowBoxes = Array.from(overlay().querySelectorAll('li input[type="checkbox"]:not([data-ka-gate])'));
        expect(rowBoxes.length).toBe(2);
        rowBoxes[1].click();
        button('Auswahl sichern (ZIP)').click();
        expect(onBackup.mock.calls[0][0].map((m) => m.adId)).toEqual(['1002']);
    });

    it('respektiert den Merk-Filter wie der Start-Button', async () => {
        const onBackup = vi.fn();
        await renderConfirm(MATCHES, [], () => {}, { onBackup });
        button('Alle').click();
        const fav = Array.from(overlay().querySelectorAll('input[type="checkbox"]'))
            .find((cb) => cb.closest('label') && cb.closest('label').textContent.indexOf('nur nicht gemerkte') >= 0);
        fav.checked = true;
        fav.dispatchEvent(new Event('change'));
        button('Auswahl sichern (ZIP)').click();
        expect(onBackup.mock.calls[0][0].map((m) => m.adId)).toEqual(['1001']);
    });

    it('bleibt bei ungueltiger Pause benutzbar', async () => {
        const onBackup = vi.fn();
        await renderConfirm(MATCHES, [], () => {}, { onBackup });
        button('Alle').click();
        const min = overlay().querySelector('input[name="delay-min"]') ||
            overlay().querySelectorAll('input[type="number"]')[0];
        min.value = 'abc';
        min.dispatchEvent(new Event('input'));
        expect(button('Start').disabled).toBe(true);
        expect(button('Auswahl sichern (ZIP)').disabled).toBe(false);
    });
});

describe('startBackupFlow', () => {
    it('sichert, zeigt den Abschluss und laedt erst auf Knopfdruck herunter', async () => {
        vi.useFakeTimers();
        try {
            const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
            URL.createObjectURL = vi.fn(() => 'blob:x');
            URL.revokeObjectURL = vi.fn();
            installFetch({ '1': editPage('1'), '2': editPage('2') }, {});
            const flow = helper.startBackupFlow([{ adId: '1', title: 'A' }, { adId: '2', title: 'B' }]);
            await vi.runAllTimersAsync();
            await flow;

            const ov = document.getElementById('ka-batch-overlay');
            expect(ov.textContent).toContain('Sicherung abgeschlossen');
            expect(ov.textContent).toContain('Gesichert: 2 von 2');
            expect(click).not.toHaveBeenCalled();

            Array.from(ov.querySelectorAll('button')).find((b) => b.textContent === 'ZIP herunterladen').click();
            expect(click).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('Abschluss der Sicherung', () => {
    it('laedt die ZIP erst auf Knopfdruck herunter', () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
        const state = { startedAt: Date.now(), total: 1, failed: [], aborted: false,
            done: [{ adId: '1', title: 'A', problems: ['keine Bilder gefunden'], images: [], rawFields: {} }] };
        renderBackupDone(state, new Blob(['zip']), 'ka-sicherung-test.zip');
        expect(click).not.toHaveBeenCalled();
        expect(document.getElementById('ka-batch-overlay').textContent).toContain('1 Anzeige(n) unvollständig gesichert');

        const dl = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'ZIP herunterladen');
        dl.click();
        expect(click).toHaveBeenCalledTimes(1);
    });

    it('bietet ohne gesicherte Anzeige keinen Download an', () => {
        renderBackupDone({ startedAt: Date.now(), total: 1, done: [], failed: [{ adId: '1', error: 'x' }], aborted: false }, null, null);
        const dl = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'ZIP herunterladen');
        expect(dl).toBeUndefined();
    });
});
