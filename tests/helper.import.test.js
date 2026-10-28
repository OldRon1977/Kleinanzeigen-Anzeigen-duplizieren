import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import helper from '../helper.user.js';

const {
    buildZip,
    readZip,
    utf8,
    crc32,
    snapshotZipFiles,
    snapshotsFromZipFiles,
    importBackupZip,
    putSnapshot,
    listSnapshotMeta,
    getSnapshotsAll,
    clearAllSnapshots,
    restoreUrl,
    openRestore,
    appendRecoverySection,
    appendImportSection,
    appendRecoveryIfPresent,
    POST_AD_STEP1_URL,
    POST_AD_STEP2_URL,
    LS_RESTORE_RESULT_PREFIX,
    RESTORE_WAIT_TIMEOUT_MS
} = helper;

const IMG = 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/';

// ZIP mit DEFLATE (Methode 8), wie sie ein Packprogramm schreibt. buildZip
// erzeugt nur STORE; der Leser muss beides koennen.
function buildDeflateZip(files) {
    const local = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
        const name = utf8(f.name);
        const comp = new Uint8Array(deflateRawSync(Buffer.from(f.data)));
        const crc = crc32(f.data);
        const lfh = new Uint8Array(30 + name.length);
        const lv = new DataView(lfh.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(8, 8, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, comp.length, true);
        lv.setUint32(22, f.data.length, true);
        lv.setUint16(26, name.length, true);
        lfh.set(name, 30);
        local.push(lfh, comp);
        const cdh = new Uint8Array(46 + name.length);
        const cv = new DataView(cdh.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(10, 8, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, comp.length, true);
        cv.setUint32(24, f.data.length, true);
        cv.setUint16(28, name.length, true);
        cv.setUint32(42, offset, true);
        cdh.set(name, 46);
        central.push(cdh);
        offset += lfh.length + comp.length;
    }
    let cdSize = 0;
    for (const c of central) cdSize += c.length;
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    return new Blob([...local, ...central, eocd], { type: 'application/zip' });
}

function snapshot(adId, overrides) {
    return Object.assign({
        adId: String(adId),
        capturedAt: 1761412689092,
        title: 'Kinderbett Bauernbett',
        fields: { title: 'Kinderbett Bauernbett', price: '50' },
        rawFields: { title: 'Kinderbett Bauernbett', priceAmount: '50', zipCode: '21521' },
        hiddenFields: { categoryId: '20', 'attributeMap[kinderzimmermoebel.art]': 'betten_wiegen' },
        images: [
            { url: IMG + 'aa/1?rule=$_57.JPG', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), mime: 'image/jpeg' },
            { url: IMG + 'bb/2?rule=$_57.JPG', blob: new Blob([new Uint8Array([4, 5])], { type: 'image/png' }), mime: 'image/png' }
        ]
    }, overrides || {});
}

async function bytes(blob) {
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('readZip', () => {
    it('liest zurueck, was buildZip geschrieben hat (STORE)', async () => {
        const files = [
            { name: '123-Titel/data.json', data: utf8('{"adId":"123"}') },
            { name: '123-Titel/image_01.jpg', data: new Uint8Array([1, 2, 3, 4, 5]) },
            { name: 'protokoll.txt', data: utf8('Umlaute: äöü') }
        ];
        const out = await readZip(await (await buildZip(files)).arrayBuffer());
        expect(out.map((f) => f.name)).toEqual(files.map((f) => f.name));
        expect(Array.from(out[1].data)).toEqual([1, 2, 3, 4, 5]);
        expect(new TextDecoder().decode(out[2].data)).toBe('Umlaute: äöü');
    });

    it('liest DEFLATE-Eintraege ueber DecompressionStream', async () => {
        const text = 'x'.repeat(5000) + 'Ende';
        const out = await readZip(await buildDeflateZip([{ name: 'a/data.json', data: utf8(text) }]).arrayBuffer());
        expect(out).toHaveLength(1);
        expect(new TextDecoder().decode(out[0].data)).toBe(text);
    });

    it('ueberspringt Verzeichniseintraege', async () => {
        const out = await readZip(await (await buildZip([
            { name: '123-Titel/', data: new Uint8Array(0) },
            { name: '123-Titel/data.json', data: utf8('{}') }
        ])).arrayBuffer());
        expect(out.map((f) => f.name)).toEqual(['123-Titel/data.json']);
    });

    it('weist verschluesselte Eintraege ab', async () => {
        const buf = new Uint8Array(await (await buildZip([{ name: '1-a/data.json', data: utf8('{}') }])).arrayBuffer());
        const dv = new DataView(buf.buffer);
        for (let i = 0; i < buf.length - 4; i++) {
            if (dv.getUint32(i, true) === 0x02014b50) dv.setUint16(i + 8, dv.getUint16(i + 8, true) | 0x1, true);
        }
        await expect(readZip(buf)).rejects.toThrow(/Verschlüsselte ZIP/);
    });

    it('weist Nicht-ZIPs mit klarer Meldung ab', async () => {
        await expect(readZip(new Uint8Array(40))).rejects.toThrow(/Keine ZIP-Datei/);
        await expect(readZip(utf8('{"adId":"123"}'))).rejects.toThrow(/Keine ZIP-Datei/);
    });
});

describe('snapshotsFromZipFiles', () => {
    it('stellt einen Snapshot aus dem eigenen ZIP-Format wieder her', async () => {
        const original = snapshot('3505764979');
        const files = await snapshotZipFiles(original);
        const { snapshots, problems } = snapshotsFromZipFiles(files);

        expect(problems).toEqual([]);
        expect(snapshots).toHaveLength(1);
        const s = snapshots[0];
        expect(s.adId).toBe('3505764979');
        expect(s.capturedAt).toBe(original.capturedAt);
        expect(s.title).toBe(original.title);
        expect(s.fields).toEqual(original.fields);
        expect(s.rawFields).toEqual(original.rawFields);
        expect(s.hiddenFields).toEqual(original.hiddenFields);
        expect(s.images).toHaveLength(2);
        expect(s.images[0].url).toBe(original.images[0].url);
        expect(s.images[0].mime).toBe('image/jpeg');
        expect(await bytes(s.images[0].blob)).toEqual([1, 2, 3]);
        expect(s.images[1].mime).toBe('image/png');
        expect(await bytes(s.images[1].blob)).toEqual([4, 5]);
    });

    it('liest eine Recovery-ZIP alter Version (nur data.json, Bilder nur als URL)', () => {
        const data = {
            adId: '3505764979',
            capturedAt: '2026-10-25T17:18:09.092Z',
            title: 'Kinderbett',
            fields: { title: 'Kinderbett' },
            rawFields: { title: 'Kinderbett', priceAmount: '50' },
            imageUrls: [IMG + 'aa/1?AccessKeyId=k&jwt=j', IMG + 'bb/2?AccessKeyId=k&jwt=j']
        };
        const { snapshots } = snapshotsFromZipFiles([{ name: '3505764979-Kinderbett/data.json', data: utf8(JSON.stringify(data)) }]);

        expect(snapshots).toHaveLength(1);
        const s = snapshots[0];
        expect(s.capturedAt).toBe(Date.parse(data.capturedAt));
        expect(s.hiddenFields).toEqual({});
        expect(s.images).toEqual([
            { url: data.imageUrls[0], blob: null, mime: null },
            { url: data.imageUrls[1], blob: null, mime: null }
        ]);
    });

    it('nimmt die adId notfalls aus dem Ordnernamen und ignoriert Fremddateien', () => {
        const { snapshots, problems } = snapshotsFromZipFiles([
            { name: 'protokoll.txt', data: utf8('Sicherung') },
            { name: '777-Stuhl/data.json', data: utf8('{"title":"Stuhl","rawFields":{"title":"Stuhl"}}') },
            { name: '777-Stuhl/image_01.jpg', data: new Uint8Array([7]) },
            { name: '777-Stuhl/notizen.txt', data: utf8('egal') }
        ]);
        expect(problems).toEqual([]);
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].adId).toBe('777');
        expect(snapshots[0].images).toHaveLength(1);
    });

    it('ordnet Bilder nach ihrer Nummer, nicht nach der Reihenfolge in der ZIP', () => {
        const out = snapshotsFromZipFiles([
            { name: '5-a/image_03.jpg', data: new Uint8Array([3]) },
            { name: '5-a/image_01.jpg', data: new Uint8Array([1]) },
            { name: '5-a/data.json', data: utf8('{"adId":"5"}') },
            { name: '5-a/image_02.png', data: new Uint8Array([2]) }
        ]);
        const imgs = out.snapshots[0].images;
        expect(imgs).toHaveLength(3);
        expect(imgs.map((i) => i.mime)).toEqual(['image/jpeg', 'image/png', 'image/jpeg']);
        expect(imgs.map((i) => i.blob.size)).toEqual([1, 1, 1]);
    });

    it('verwirft eine adId, die nicht nur aus Ziffern besteht', () => {
        const out = snapshotsFromZipFiles([{ name: 'x/data.json', data: utf8('{"adId":"12#kaRestore=3"}') }]);
        expect(out.snapshots).toEqual([]);
        expect(out.problems).toEqual([{ name: 'x/data.json', error: 'keine Anzeigen-ID' }]);
    });

    it('meldet unlesbare oder ID-lose Eintraege, statt den Import zu kippen', () => {
        const { snapshots, problems } = snapshotsFromZipFiles([
            { name: 'kaputt/data.json', data: utf8('{nicht json') },
            { name: 'ohne-id/data.json', data: utf8('{"title":"x"}') },
            { name: '5-ok/data.json', data: utf8('{"adId":"5"}') }
        ]);
        expect(snapshots.map((s) => s.adId)).toEqual(['5']);
        expect(problems.map((p) => p.error)).toEqual(['data.json nicht lesbar', 'keine Anzeigen-ID']);
    });
});

describe('importBackupZip', () => {
    it('legt die Anzeigen der ZIP als Snapshots ab, mit Kategorie in der Uebersicht', async () => {
        const files = (await snapshotZipFiles(snapshot('111')))
            .concat(await snapshotZipFiles(snapshot('222', { title: 'Zweite', hiddenFields: {} })));
        const zip = await buildZip(files);

        const res = await importBackupZip(zip);

        expect(res.snapshots.map((s) => s.adId)).toEqual(['111', '222']);
        const all = await getSnapshotsAll();
        expect(all.map((s) => s.adId).sort()).toEqual(['111', '222']);
        const meta = await listSnapshotMeta();
        expect(meta.find((m) => m.adId === '111').categoryId).toBe('20');
        expect(meta.find((m) => m.adId === '222').categoryId).toBeNull();
        expect(meta.find((m) => m.adId === '111').imageCount).toBe(2);
    });

    it('behaelt einen vorhandenen Snapshot derselben adId und meldet ihn', async () => {
        // Der vorhandene traegt die Bilder als Daten; eine alte Recovery-ZIP
        // (nur data.json) haette sie durch Adressen ersetzt.
        await clearAllSnapshots();
        await putSnapshot(snapshot('111', { title: 'Vorhanden' }));
        const oldZip = await buildZip(await snapshotZipFiles(snapshot('111', {
            title: 'Aus ZIP',
            images: [{ url: IMG + 'aa/1?rule=$_57.JPG', blob: null, mime: null }]
        })));
        const res = await importBackupZip(oldZip);

        expect(res.snapshots).toEqual([]);
        expect(res.kept).toEqual(['111']);
        const all = await getSnapshotsAll();
        expect(all).toHaveLength(1);
        expect(all[0].title).toBe('Vorhanden');
        // fake-indexeddb legt jsdom-Blobs als leeres Objekt ab; not.toBeNull()
        // unterscheidet trotzdem "Bild vorhanden" vom Platzhalter (blob: null) der ZIP.
        expect(all[0].images[0].blob).not.toBeNull();
    });

    it('nennt vorhandene Snapshots im Status statt "keine data.json"', async () => {
        await clearAllSnapshots();
        await putSnapshot(snapshot('111'));
        const parent = document.createElement('div');
        const ui = appendImportSection(parent, null);
        Object.defineProperty(ui.input, 'files', { value: [await buildZip(await snapshotZipFiles(snapshot('111')))], configurable: true });
        await ui.input.onchange();
        expect(ui.status.textContent).toBe('0 Anzeige(n) importiert, 1 schon als Snapshot vorhanden (nicht ersetzt)');
    });
});

describe('restoreUrl', () => {
    it('springt mit bekannter Kategorie direkt zu Schritt 2', () => {
        expect(restoreUrl({ adId: '42', categoryId: '20' })).toBe(POST_AD_STEP2_URL + '?categoryId=20#kaRestore=42');
    });

    it('geht ohne oder mit unbrauchbarer Kategorie zu Schritt 1', () => {
        expect(restoreUrl({ adId: '42', categoryId: null })).toBe(POST_AD_STEP1_URL + '#kaRestore=42');
        expect(restoreUrl({ adId: '42' })).toBe(POST_AD_STEP1_URL + '#kaRestore=42');
        expect(restoreUrl({ adId: '42', categoryId: '20; drop' })).toBe(POST_AD_STEP1_URL + '#kaRestore=42');
    });
});

describe('openRestore', () => {
    it('oeffnet das Formular, wartet auf ok und meldet den Abschluss', async () => {
        vi.useFakeTimers();
        const open = vi.spyOn(window, 'open').mockReturnValue({});
        const btn = document.createElement('button');
        btn.textContent = 'Wiederherstellen';
        const done = vi.fn();

        openRestore({ adId: '42', categoryId: '20' }, btn, done);

        expect(open).toHaveBeenCalledWith(POST_AD_STEP2_URL + '?categoryId=20#kaRestore=42', '_blank');
        expect(btn.disabled).toBe(true);
        expect(done).not.toHaveBeenCalled();

        localStorage.setItem(LS_RESTORE_RESULT_PREFIX + '42', 'ok');
        await vi.advanceTimersByTimeAsync(1000);

        expect(done).toHaveBeenCalledWith({ adId: '42', categoryId: '20' });
        expect(btn.textContent).toContain('Wiederhergestellt');
        expect(localStorage.getItem(LS_RESTORE_RESULT_PREFIX + '42')).toBeNull();
    });

    it('reagiert auf das storage-Event, ohne auf das Polling zu warten', async () => {
        vi.useFakeTimers();
        vi.spyOn(window, 'open').mockReturnValue({});
        const btn = document.createElement('button');
        const done = vi.fn();
        openRestore({ adId: '45' }, btn, done);

        window.dispatchEvent(new StorageEvent('storage', { key: LS_RESTORE_RESULT_PREFIX + '45', newValue: 'ok' }));
        expect(done).toHaveBeenCalledTimes(1);
    });

    it('gibt den Knopf nach Ablauf wieder frei, ohne etwas zu schliessen', async () => {
        vi.useFakeTimers();
        vi.spyOn(window, 'open').mockReturnValue({});
        const btn = document.createElement('button');
        btn.textContent = 'Wiederherstellen';
        const done = vi.fn();

        openRestore({ adId: '43' }, btn, done);
        await vi.advanceTimersByTimeAsync(RESTORE_WAIT_TIMEOUT_MS);

        expect(done).not.toHaveBeenCalled();
        expect(btn.disabled).toBe(false);
        expect(btn.textContent).toBe('Wiederherstellen');
    });

    it('meldet einen blockierten Popup', () => {
        vi.spyOn(window, 'open').mockReturnValue(null);
        const btn = document.createElement('button');
        openRestore({ adId: '44' }, btn);
        expect(btn.textContent).toContain('Popup blockiert');
    });
});

describe('Recovery-Section mit Wiederherstellen und Import', () => {
    it('zeigt je Snapshot einen Wiederherstellen-Knopf', async () => {
        await putSnapshot(snapshot('111'));
        await putSnapshot(snapshot('222', { hiddenFields: {} }));
        const parent = document.createElement('div');
        await appendRecoverySection(parent, await listSnapshotMeta());

        expect(parent.textContent).toContain('2 Recovery-Snapshot');
        const buttons = Array.from(parent.querySelectorAll('button[data-ka-restore]'));
        expect(buttons.map((b) => b.getAttribute('data-ka-restore')).sort()).toEqual(['111', '222']);
        expect(buttons.every((b) => b.textContent === 'Wiederherstellen')).toBe(true);
    });

    it('bietet den Import auch ohne Snapshots an', async () => {
        const parent = document.createElement('div');
        await appendRecoveryIfPresent(parent);

        expect(parent.textContent).not.toContain('Recovery-Snapshot');
        const btn = Array.from(parent.querySelectorAll('button')).find((b) => b.textContent === 'Sicherung importieren (ZIP)');
        expect(btn).toBeDefined();
        const input = parent.querySelector('input[type="file"][data-ka-import]');
        expect(input.accept).toContain('.zip');
    });

    it('importiert eine ZIP und baut die Liste danach neu auf', async () => {
        const parent = document.createElement('div');
        await appendRecoveryIfPresent(parent);
        const input = parent.querySelector('input[data-ka-import]');
        const zip = await buildZip(await snapshotZipFiles(snapshot('333')));
        Object.defineProperty(input, 'files', { value: [zip], configurable: true });

        await input.onchange();
        // Neuaufbau laeuft asynchron hinter onchange her
        await new Promise((r) => setTimeout(r, 0));

        expect(parent.textContent).toContain('1 Recovery-Snapshot');
        expect(parent.querySelector('button[data-ka-restore="333"]')).not.toBeNull();
        expect(parent.querySelector('[data-ka-import-status]').textContent).toContain('1 Anzeige(n) importiert');
    });
});
