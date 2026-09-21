import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import helper from '../helper.user.js';

const { openDuplicate, processOne, RESULT_WAIT_TIMEOUT_MS, LS_RESULT_PREFIX } = helper;

// openDuplicate und processOne warten beide auf ein Signal des Worker-Tabs und
// sahen deshalb wie Kandidaten fuer eine gemeinsame Funktion aus. Sie
// unterscheiden sich aber in vier Punkten: Timeout-Verhalten, Tab-Schliessen,
// Wertklassifikation und Cache-Invalidierung. Diese Tests halten genau diese
// Unterschiede fest -- ohne sie ist nicht entscheidbar, ob eine
// Zusammenfuehrung das Verhalten erhaelt.

const ADID = '3485614406';

function makeButton() {
    const b = document.createElement('button');
    b.textContent = 'Duplizieren';
    document.body.appendChild(b);
    return b;
}

// Ein Tab-Handle, das protokolliert, ob es geschlossen wurde.
function fakeTab() {
    const state = { closed: false };
    return {
        state: state,
        handle: { close() { state.closed = true; }, get closed() { return state.closed; } }
    };
}

function fireStorage(key, newValue) {
    const ev = new window.Event('storage');
    ev.key = key;
    ev.newValue = newValue;
    window.dispatchEvent(ev);
}

let tab;

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.useFakeTimers();
    tab = fakeTab();
    globalThis.GM_openInTab = vi.fn(() => tab.handle);
});

afterEach(() => {
    vi.useRealTimers();
    delete globalThis.GM_openInTab;
});

describe('openDuplicate', () => {
    it('oeffnet den Tab mit dem Duplikat-Hash', () => {
        openDuplicate(ADID, makeButton());

        expect(globalThis.GM_openInTab).toHaveBeenCalledTimes(1);
        const url = String(globalThis.GM_openInTab.mock.calls[0][0]);
        expect(url).toContain('p-anzeige-bearbeiten.html?adId=' + ADID);
        expect(url).toContain('#duplicate');
    });

    it('meldet ein blockiertes Popup am Button und wartet nicht', () => {
        delete globalThis.GM_openInTab;
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
        const btn = makeButton();

        openDuplicate(ADID, btn);

        expect(btn.textContent).toContain('Popup blockiert');
        // Kein Warten: der Button ist nicht deaktiviert worden.
        expect(btn.disabled).toBe(false);
        openSpy.mockRestore();
    });

    it('quittiert das ok-Signal, schliesst den Tab und raeumt den Key ab', () => {
        const btn = makeButton();
        const lsKey = 'ka-duplicate-result-' + ADID;
        openDuplicate(ADID, btn);
        expect(btn.disabled).toBe(true);

        localStorage.setItem(lsKey, 'ok');
        fireStorage(lsKey, 'ok');

        expect(btn.textContent).toContain('Dupliziert');
        expect(tab.state.closed).toBe(true);
        expect(localStorage.getItem(lsKey)).toBeNull();
    });

    it('erkennt das Signal auch ohne storage-Event ueber das Polling', () => {
        const btn = makeButton();
        const lsKey = 'ka-duplicate-result-' + ADID;
        openDuplicate(ADID, btn);

        localStorage.setItem(lsKey, 'ok');
        vi.advanceTimersByTime(1000);

        expect(btn.textContent).toContain('Dupliziert');
        expect(tab.state.closed).toBe(true);
    });

    it('laesst den Tab beim Timeout offen und gibt den Button frei', () => {
        const btn = makeButton();
        const original = btn.textContent;
        openDuplicate(ADID, btn);

        vi.advanceTimersByTime(RESULT_WAIT_TIMEOUT_MS);

        expect(btn.disabled).toBe(false);
        expect(btn.textContent).toBe(original);
        // Anders als processOne: der Tab bleibt stehen, damit der Nutzer den
        // Fehler sehen kann.
        expect(tab.state.closed).toBe(false);
    });
});

describe('processOne', () => {
    const item = { adId: ADID, title: 'Testanzeige' };

    it('oeffnet den Tab mit dem Smart-Republish-Hash', () => {
        processOne(item);

        const url = String(globalThis.GM_openInTab.mock.calls[0][0]);
        expect(url).toContain('#smartRepublish');
    });

    it('loest bei ok auf und schliesst den Tab', async () => {
        const p = processOne(item);
        const lsKey = LS_RESULT_PREFIX + ADID;

        fireStorage(lsKey, 'ok');
        const res = await p;

        expect(res.ok).toBe(true);
        expect(tab.state.closed).toBe(true);
    });

    it('traegt den Hinweis aus ok:delete_failed weiter', async () => {
        const p = processOne(item);
        fireStorage(LS_RESULT_PREFIX + ADID, 'ok:delete_failed');
        const res = await p;

        expect(res.ok).toBe(true);
        expect(res.warning).toBeTruthy();
    });

    it('haelt den Tab bei Datenverlust offen', async () => {
        const p = processOne(item);
        fireStorage(LS_RESULT_PREFIX + ADID, 'error:save_failed:delete_ok');
        const res = await p;

        expect(res.ok).toBe(false);
        expect(res.dataLoss).toBe(true);
        // keepTab folgt dataLoss: der Tab bleibt zur manuellen Pruefung stehen.
        expect(tab.state.closed).toBe(false);
    });

    it('schliesst den Tab bei einem Fehler ohne Datenverlust', async () => {
        const p = processOne(item);
        fireStorage(LS_RESULT_PREFIX + ADID, 'error:save_failed:not_deleted');
        const res = await p;

        expect(res.ok).toBe(false);
        expect(res.dataLoss).toBe(false);
        expect(tab.state.closed).toBe(true);
    });

    it('meldet beim Timeout einen unbekannten Ausgang', async () => {
        const p = processOne(item);
        vi.advanceTimersByTime(RESULT_WAIT_TIMEOUT_MS);
        const res = await p;

        expect(res.code).toBe('timeout');
        expect(res.outcomeUnknown).toBe(true);
        expect(tab.state.closed).toBe(true);
    });

    it('meldet ein blockiertes Popup als Ergebnis, nicht am Button', async () => {
        delete globalThis.GM_openInTab;
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

        const res = await processOne(item);

        expect(res.ok).toBe(false);
        expect(res.code).toBe('popup_blocked');
        openSpy.mockRestore();
    });

    it('ignoriert Signale zu einer anderen Anzeige', async () => {
        const p = processOne(item);
        fireStorage(LS_RESULT_PREFIX + '999', 'ok');

        let settled = false;
        p.then(() => { settled = true; });
        await Promise.resolve();
        expect(settled).toBe(false);

        fireStorage(LS_RESULT_PREFIX + ADID, 'ok');
        await expect(p).resolves.toMatchObject({ ok: true });
    });
});
