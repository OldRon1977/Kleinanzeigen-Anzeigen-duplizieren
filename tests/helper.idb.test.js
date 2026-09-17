import { describe, it, expect, beforeEach } from 'vitest';
import helper from '../helper.user.js';

const {
    openIDB,
    listSnapshotMeta,
    getSnapshotsAll,
    deleteSnapshot,
    clearAllSnapshots,
    appendRecoverySection,
    IDB_NAME,
    IDB_VERSION,
    IDB_STORE
} = helper;

// Erst mit einer IndexedDB-Umgebung im Test (tests/setup.indexeddb.js) ist der
// Recovery-Pfad ueberhaupt pruefbar. Vorher konnte ein Test nur belegen, dass
// der Aufruf in seinem try/catch landet -- nicht, dass er das Richtige tut.

async function putSnapshot(snap) {
    const db = await openIDB();
    return new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(snap);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function makeSnapshot(adId, overrides) {
    return Object.assign({
        adId: String(adId),
        capturedAt: 1770000000000,
        title: 'Anzeige ' + adId,
        fields: { title: 'Anzeige ' + adId },
        rawFields: { title: 'Anzeige ' + adId },
        images: []
    }, overrides);
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('IndexedDB-Struktur', () => {
    it('legt Datenbank, Store und keyPath nach dem Protokoll an', async () => {
        const db = await openIDB();
        expect(db.name).toBe(IDB_NAME);
        expect(db.version).toBe(IDB_VERSION);
        expect(Array.from(db.objectStoreNames)).toContain(IDB_STORE);

        const tx = db.transaction(IDB_STORE, 'readonly');
        expect(tx.objectStore(IDB_STORE).keyPath).toBe('adId');
    });

    it('ist auf einer leeren Datenbank still statt fehlerhaft', async () => {
        await expect(listSnapshotMeta()).resolves.toEqual([]);
        await expect(getSnapshotsAll()).resolves.toEqual([]);
    });
});

describe('listSnapshotMeta', () => {
    it('liefert die Uebersichtsfelder je Snapshot', async () => {
        await putSnapshot(makeSnapshot('111', {
            images: [{ url: 'a', blob: null, mime: null }, { url: 'b', blob: null, mime: null }]
        }));

        const meta = await listSnapshotMeta();
        expect(meta).toHaveLength(1);
        expect(meta[0]).toEqual({
            adId: '111',
            title: 'Anzeige 111',
            capturedAt: 1770000000000,
            imageCount: 2
        });
    });

    it('setzt einen Platzhalter, wenn der Titel fehlt', async () => {
        await putSnapshot(makeSnapshot('222', { title: '' }));

        const meta = await listSnapshotMeta();
        expect(meta[0].title).toBe('(ohne Titel)');
    });

    it('zaehlt Bilder auch ohne images-Feld als 0', async () => {
        const snap = makeSnapshot('333');
        delete snap.images;
        await putSnapshot(snap);

        const meta = await listSnapshotMeta();
        expect(meta[0].imageCount).toBe(0);
    });
});

describe('deleteSnapshot und clearAllSnapshots', () => {
    it('entfernt genau den genannten Snapshot', async () => {
        await putSnapshot(makeSnapshot('111'));
        await putSnapshot(makeSnapshot('222'));

        await deleteSnapshot('111');

        const rest = await listSnapshotMeta();
        expect(rest.map((m) => m.adId)).toEqual(['222']);
    });

    it('laeuft auch dann durch, wenn der Snapshot nicht existiert', async () => {
        await expect(deleteSnapshot('nicht-da')).resolves.toBeUndefined();
    });

    it('raeumt mit clearAllSnapshots alles ab', async () => {
        await putSnapshot(makeSnapshot('111'));
        await putSnapshot(makeSnapshot('222'));

        await clearAllSnapshots();

        expect(await listSnapshotMeta()).toEqual([]);
    });
});

describe('getSnapshotsAll', () => {
    it('gibt die vollen Objekte zurueck, nicht nur die Uebersicht', async () => {
        await putSnapshot(makeSnapshot('444', {
            rawFields: { title: 'T', description: 'Langer Text' }
        }));

        const all = await getSnapshotsAll();
        expect(all).toHaveLength(1);
        expect(all[0].rawFields.description).toBe('Langer Text');
        expect(all[0].fields.title).toBe('Anzeige 444');
    });
});

describe('appendRecoverySection', () => {
    it('haengt nichts an, wenn es keine Snapshots gibt', async () => {
        const parent = document.createElement('div');
        await appendRecoverySection(parent, []);
        expect(parent.children).toHaveLength(0);
    });

    it('nennt die Anzahl der Snapshots', async () => {
        const parent = document.createElement('div');
        await appendRecoverySection(parent, await (async () => {
            await putSnapshot(makeSnapshot('111'));
            await putSnapshot(makeSnapshot('222'));
            return listSnapshotMeta();
        })());

        expect(parent.textContent).toContain('2 Recovery-Snapshot');
    });
});
