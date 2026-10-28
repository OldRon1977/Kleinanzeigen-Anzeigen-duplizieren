import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import helper from '../helper.user.js';
import { fixture } from './fixtures.js';

// Abläufe auf der echten Seite "Meine Anzeigen": tests/fixtures/meine-anzeigen-list.html
// ist der Bereich mit der Anzeigenliste, meine-anzeigen-verwalten.json die
// Antwort der Listen-Schnittstelle, beide live gespeichert und anonymisiert
// (Anzeigen 1000000001-1000000003). Gemockt sind das Netz und die Worker-Tabs:
// Ein geöffneter Tab "antwortet" über den Result-Key, wie es das Hauptscript
// auf der Bestätigungsseite tut.

const {
    addControlButtons,
    addBatchTriggerButton,
    addAdQuotaCounter,
    collectCandidates,
    collectCandidatesResilient,
    invalidateAdListCache,
    startBatchFlow,
    runBatch,
    resetBatchStop,
    putSnapshot,
    getSnapshotsAll,
    clearAllSnapshots
} = helper;

const LIST_HTML = fixture('meine-anzeigen-list.html');
const LIST_JSON = JSON.parse(fixture('meine-anzeigen-verwalten.json'));
const QUOTA_JSON = JSON.parse(fixture('einstellungen-bearbeiten.json'));
const IDS = ['1000000001', '1000000002', '1000000003'];

function loadListPage() {
    window.history.replaceState({}, '', '/m-meine-anzeigen.html');
    document.body.innerHTML = '<main>' + LIST_HTML + '</main>';
}

function jsonResponse(body) {
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
}

function serverMock() {
    return vi.fn(async (url) => {
        const u = String(url);
        if (u.includes('m-meine-anzeigen-verwalten.json')) return jsonResponse(LIST_JSON);
        if (u.includes('m-einstellungen-bearbeiten.json')) return jsonResponse(QUOTA_JSON);
        return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    });
}

// Simuliert die Worker-Tabs: Für jede geöffnete URL liefert `answer(adId)`
// den Wert, den das Hauptscript auf der Bestätigungsseite schreiben würde.
function workerTabs(answer) {
    const opened = [];
    vi.spyOn(window, 'open').mockImplementation((url) => {
        const adId = /adId=(\d+)/.exec(url)[1];
        const tab = { url, closed: false, close() { this.closed = true; } };
        opened.push(tab);
        const value = answer(adId);
        if (value !== null) setTimeout(() => localStorage.setItem('ka-batch-result-' + adId, value), 20);
        return tab;
    });
    return opened;
}

function snapshot(adId) {
    return { adId, capturedAt: Date.now(), title: 'Testanzeige', fields: {}, rawFields: {}, hiddenFields: {}, images: [] };
}

function items(ids) {
    return ids.map((adId, i) => ({ adId, title: 'Testanzeige ' + (i + 1) }));
}

beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    invalidateAdListCache();
    resetBatchStop();
    await clearAllSnapshots();
    global.fetch = serverMock();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete global.fetch;
});

describe('echte Seite "Meine Anzeigen": Bedienelemente', () => {
    it('setzt neben jeden Bearbeiten-Link genau ein Paar Buttons, auch bei wiederholtem Aufruf', () => {
        loadListPage();
        addControlButtons();
        addControlButtons();
        const labels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent);
        expect(labels.filter((t) => t.includes('Smart neu einstellen'))).toHaveLength(3);
        expect(labels.filter((t) => t.includes('Duplizieren'))).toHaveLength(3);
    });

    it('"Smart neu einstellen" öffnet die Bearbeiten-Seite der richtigen Anzeige mit #smartRepublish', async () => {
        loadListPage();
        const opened = workerTabs(() => 'ok');
        addControlButtons();
        const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Smart neu einstellen'));
        btn.click();
        expect(opened.map((t) => t.url)).toEqual(['https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=' + IDS[0] + '#smartRepublish']);
        // Ablauf zu Ende warten: Ein offener Warteprozess würde später das
        // Ergebnis eines anderen Tests für dieselbe Anzeige weglesen.
        await vi.waitFor(() => expect(btn.textContent).toContain('Fertig'), { timeout: 3000 });
        expect(opened[0].closed).toBe(true);
    });

    it('setzt den Batch-Button und das Kontingent direkt vor die Anzeigenliste', async () => {
        loadListPage();
        addBatchTriggerButton();
        addAdQuotaCounter();
        const list = document.getElementById('my-manageitems-adlist');
        const trigger = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('Anzeigen auswählen & neu einstellen'));
        const quota = document.getElementById('ka-ad-quota');
        // Beide stehen im selben Container direkt über der Liste
        for (const el of [trigger, quota]) {
            expect(el.parentElement).toBe(list.parentElement);
            expect(el.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
        await vi.waitFor(() => expect(document.getElementById('ka-ad-quota').textContent)
            .toContain(QUOTA_JSON.newAdCount + ' von 100 verbraucht'));
    });
});

describe('echte Seite "Meine Anzeigen": Anzeigen einlesen', () => {
    it('Seitenansicht: findet alle Karten mit ID, Titel, Enddatum und Merk-Zähler', () => {
        loadListPage();
        const res = collectCandidates();
        expect(res.matches.map((m) => m.adId)).toEqual(IDS);
        expect(res.matches.map((m) => m.title)).toEqual(['Testanzeige 1', 'Testanzeige 2', 'Testanzeige 3']);
        expect(res.matches.every((m) => m.favCount === 0)).toBe(true);
        expect(res.skipped).toEqual([]);
    });

    it('Schnittstelle: liest die echte JSON-Antwort, exaktes Alter aus adLifeTimeInSeconds', async () => {
        loadListPage();
        const res = await collectCandidatesResilient({ force: true });
        expect(res.source).toBe('json');
        expect(res.matches.map((m) => m.adId)).toEqual(IDS);
        const expectedDays = LIST_JSON.ads.map((a) => Math.floor(a.adLifeTimeInSeconds / 86400));
        expect(res.matches.map((m) => m.ageDays)).toEqual(expectedDays);
        expect(res.matches.every((m) => m.ageExact === true)).toBe(true);
        expect(res.matches.map((m) => m.favCount)).toEqual(LIST_JSON.ads.map((a) => a.watchCount));
    });

    it('Auswahl-Fenster aus der echten Liste: alle Anzeigen, nichts angehakt, Start gesperrt', async () => {
        loadListPage();
        await startBatchFlow({ force: true });
        const overlay = document.getElementById('ka-batch-overlay');
        const gates = Array.from(overlay.querySelectorAll('input[data-ka-gate="fav"]'));
        const visible = Array.from(overlay.querySelectorAll('li label input[type="checkbox"]:not([data-ka-gate])'));
        // Je Anzeige ein sichtbarer Haken (leer) und ein Merk-Haken (gesetzt, weil 0 mal gemerkt)
        expect(gates.map((g) => g.dataset.adid).sort()).toEqual(IDS);
        expect(gates.every((g) => g.checked)).toBe(true);
        expect(visible).toHaveLength(3);
        expect(visible.some((b) => b.checked)).toBe(false);
        const start = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim().startsWith('Start'));
        expect(start.disabled).toBe(true);
    });
});

describe('runBatch: kompletter Lauf über Worker-Tabs', () => {
    it('alle ok: jede Anzeige genau einmal geöffnet, Snapshots gelöscht, Abschluss zählt richtig', async () => {
        for (const id of IDS) await putSnapshot(snapshot(id));
        const opened = workerTabs(() => 'ok');

        await runBatch(items(IDS), { min: 0, max: 0 });

        expect(opened.map((t) => /adId=(\d+)/.exec(t.url)[1])).toEqual(IDS);
        expect(opened.every((t) => t.closed)).toBe(true);
        expect(await getSnapshotsAll()).toEqual([]);
        expect(document.body.textContent).toContain('Batch abgeschlossen');
    }, 15000);

    it('Datenverlust (save_failed:delete_ok): Auto-Stop, Snapshot bleibt, Tab bleibt offen, Rest unberührt', async () => {
        for (const id of IDS) await putSnapshot(snapshot(id));
        const opened = workerTabs((adId) => (adId === IDS[0] ? 'error:save_failed:delete_ok' : 'ok'));

        await runBatch(items(IDS), { min: 0, max: 0 });

        expect(opened).toHaveLength(1);
        expect(opened[0].closed).toBe(false);
        expect((await getSnapshotsAll()).map((s) => s.adId).sort()).toEqual(IDS);
        expect(document.body.textContent).toContain('Batch automatisch gestoppt');
    }, 15000);

    it('Fehler ohne Datenverlust (save_failed:not_deleted): Lauf geht weiter, Snapshot wird verworfen', async () => {
        for (const id of IDS.slice(0, 2)) await putSnapshot(snapshot(id));
        const opened = workerTabs((adId) => (adId === IDS[0] ? 'error:save_failed:not_deleted' : 'ok'));

        await runBatch(items(IDS.slice(0, 2)), { min: 0, max: 0 });

        expect(opened).toHaveLength(2);
        expect(await getSnapshotsAll()).toEqual([]);
        expect(document.body.textContent).toContain(IDS[0]);
    }, 15000);

    it('ok:delete_failed: zählt als Erfolg und nennt die Anzeige als Hinweis', async () => {
        workerTabs(() => 'ok:delete_failed');
        await runBatch(items([IDS[0]]), { min: 0, max: 0 });
        expect(document.body.textContent).toContain('mit Hinweis');
    }, 15000);

    it('Stop während der Pause: keine weitere Anzeige wird geöffnet', async () => {
        const opened = workerTabs((adId) => {
            // Nach dem ersten Ergebnis klickt der Nutzer im Fortschrittsfenster
            // auf Stop, die Pause läuft da schon.
            setTimeout(() => {
                const stop = Array.from(document.querySelectorAll('#ka-batch-overlay button')).find((x) => x.textContent.trim() === 'Stop');
                stop.click();
            }, 1300);
            return 'ok';
        });

        await runBatch(items(IDS.slice(0, 2)), { min: 1, max: 1 });

        expect(opened).toHaveLength(1);
        expect(document.body.textContent).toContain('Batch abgebrochen');
    }, 20000);
});
