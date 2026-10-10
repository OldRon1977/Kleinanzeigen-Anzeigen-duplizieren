import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import helper from '../helper.user.js';

const {
    isFreeExtendable,
    collectCandidatesJson,
    invalidateAdListCache,
    renderConfirm,
    runExtend,
    startExtendFlow,
    requestExtendStop,
    formatDate,
    AD_EXTEND_JSON_PATH
} = helper;

function inDays(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return formatDate(d);
}

// Felder wie in der echten JSON-Liste. `extend`/`extensionFee` stammen aus dem
// Seiten-JS (my-ads-frontend-bundle.js); bei nicht verlaengerbaren Anzeigen
// fehlt `extend` ganz -- so live gesehen bei vier Anzeigen am 11.10.2026.
function jsonAd(id, over) {
    return Object.assign({
        id: id,
        title: 'Anzeige ' + id,
        creationDate: inDays(-55),
        endDate: inDays(5),
        watchCount: 3,
        viewCount: 100,
        state: 'active'
    }, over);
}

const FREE = jsonAd(1001, { title: 'Rasenmaeher', extend: true });
const NOT_YET = jsonAd(1002, { title: 'Fahrrad', endDate: inDays(30) });
const PAID = jsonAd(1003, { title: 'Sofa', extend: true, extensionFee: true });

// fetch-Router: Anzeigenliste, Profil und Verlaengern-Endpunkt.
function installFetch(opts) {
    const o = opts || {};
    global.fetch = vi.fn(async (url) => {
        const u = String(url);
        if (u.indexOf('/m-meine-anzeigen-verwalten.json') === 0) {
            if (o.listError) throw o.listError;
            const page = parseInt((u.match(/pageNum=(\d+)/) || [])[1] || '1', 10);
            const ads = page === 1 ? (o.ads || []) : [];
            return { ok: true, status: 200, json: async () => ({ ads: ads, paging: { last: 1 } }) };
        }
        if (u.indexOf('/m-mein-profil.json') === 0) {
            return { ok: true, status: 200, json: async () => o.profile || {} };
        }
        if (u.indexOf(AD_EXTEND_JSON_PATH) === 0) {
            const id = u.split('ids=')[1];
            const status = (o.extendStatus && o.extendStatus[id]) || 200;
            return { ok: status < 300, status: status, text: async () => '{"ok":true}' };
        }
        throw new Error('unerwartete URL ' + u);
    });
}

function extendCalls() {
    return global.fetch.mock.calls.filter((c) => String(c[0]).indexOf(AD_EXTEND_JSON_PATH) === 0);
}

function setMetaToken(value) {
    const meta = document.createElement('meta');
    meta.name = '_csrf';
    meta.content = value;
    document.head.appendChild(meta);
}

function overlay() {
    return document.getElementById('ka-batch-overlay');
}

function extendLink() {
    return overlay().querySelector('button[data-ka-pick="extendable"]');
}

function extendButton() {
    return overlay().querySelector('button[data-ka-action="extend"]');
}

function buttonByText(text) {
    return Array.from(overlay().querySelectorAll('button')).find((b) => b.textContent === text);
}

const noGap = () => 0;

beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    invalidateAdListCache();
});

afterEach(() => {
    delete global.fetch;
    vi.restoreAllMocks();
});

describe('isFreeExtendable', () => {
    it('nur bei extend === true ohne Gebuehr und ohne unbegrenzte Laufzeit', () => {
        expect(isFreeExtendable(FREE)).toBe(true);
        expect(isFreeExtendable(NOT_YET)).toBe(false);
        expect(isFreeExtendable(PAID)).toBe(false);
        expect(isFreeExtendable(jsonAd(1, { extend: true, unlimitedLifetime: true }))).toBe(false);
        // Kein Raten bei unerwarteten Typen: lieber eine Anzeige zu wenig.
        expect(isFreeExtendable(jsonAd(1, { extend: 'true' }))).toBe(false);
        expect(isFreeExtendable(null)).toBe(false);
    });
});

describe('Auswahl-Fenster: JSON -> Schnellwahl -> Verlaengern-Button', () => {
    async function openWith(ads, onExtend) {
        installFetch({ ads: ads });
        const result = await collectCandidatesJson();
        await renderConfirm(result.matches, result.skipped, () => {}, { source: 'json', onExtend: onExtend });
        return result;
    }

    it('"verlängerbar" waehlt nur die kostenlos verlaengerbare Anzeige', async () => {
        const onExtend = vi.fn();
        await openWith([FREE, NOT_YET, PAID], onExtend);

        expect(extendLink().textContent).toBe('verlängerbar (1)');
        expect(extendButton().disabled).toBe(true);

        extendLink().click();
        expect(extendButton().textContent).toBe('Auswahl verlängern (1)');
        expect(extendButton().disabled).toBe(false);

        vi.spyOn(window, 'confirm').mockReturnValue(true);
        extendButton().click();
        expect(onExtend).toHaveBeenCalledTimes(1);
        expect(onExtend.mock.calls[0][0].map((m) => m.adId)).toEqual(['1001']);
    });

    it('bei "Alle" gehen nur die verlaengerbaren raus, der Rest wird in der Rueckfrage genannt', async () => {
        const onExtend = vi.fn();
        await openWith([FREE, NOT_YET, PAID], onExtend);
        buttonByText('Alle').click();

        expect(extendButton().textContent).toBe('Auswahl verlängern (1)');
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        extendButton().click();
        expect(confirm.mock.calls[0][0]).toContain('2 ausgewählte Anzeige(n) sind nicht verlängerbar');
        expect(onExtend.mock.calls[0][0].map((m) => m.adId)).toEqual(['1001']);
    });

    it('Abbrechen in der Rueckfrage verschickt nichts', async () => {
        const onExtend = vi.fn();
        await openWith([FREE], onExtend);
        extendLink().click();
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        extendButton().click();
        expect(onExtend).not.toHaveBeenCalled();
    });

    it('ohne JSON-Quelle (Kartenansicht) weder Link noch Button', async () => {
        const matches = [{ adId: '1001', title: 'X', endText: '', daysLeft: 5, ageDays: 55, favCount: 0 }];
        await renderConfirm(matches, [], () => {}, { source: 'dom', onExtend: vi.fn() });
        expect(extendLink()).toBeNull();
        expect(extendButton()).toBeNull();
    });
});

describe('runExtend', () => {
    it('schickt pro Anzeige einen POST mit CSRF-Token aus dem Meta-Tag', async () => {
        setMetaToken('tok-meta');
        installFetch({ ads: [FREE] });
        const state = await runExtend([{ adId: '1001', title: 'Rasenmaeher' }], null, { gapMs: noGap });

        expect(state.done.map((d) => d.adId)).toEqual(['1001']);
        const calls = extendCalls();
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe('/m-anzeigen-verlaengern.json?ids=1001');
        expect(calls[0][1].method).toBe('POST');
        expect(calls[0][1].headers['X-CSRF-TOKEN']).toBe('tok-meta');
        expect(calls[0][1].credentials).toBe('same-origin');
    });

    it('prueft gegen die frisch geladene Liste: veraltete Auswahl und Gebuehr werden nicht verschickt', async () => {
        setMetaToken('t');
        // Im Overlay standen alle drei als verlaengerbar (z. B. aus dem Cache),
        // der Server sagt jetzt etwas anderes.
        installFetch({ ads: [FREE, NOT_YET, PAID] });
        const chosen = ['1001', '1002', '1003', '9999'].map((id) => ({ adId: id, title: 'T' + id, extendable: true }));
        const state = await runExtend(chosen, null, { gapMs: noGap });

        expect(extendCalls().map((c) => c[0])).toEqual(['/m-anzeigen-verlaengern.json?ids=1001']);
        expect(state.skipped).toEqual([
            { adId: '1002', title: 'T1002', reason: 'nicht verlängerbar' },
            { adId: '1003', title: 'T1003', reason: 'kostenpflichtig' },
            { adId: '9999', title: 'T9999', reason: 'nicht mehr in der Liste' }
        ]);
    });

    it('ohne Meta-Tag kommt das Token aus dem Profil-JSON', async () => {
        installFetch({ ads: [FREE], profile: { csrfToken: 'tok-profil' } });
        await runExtend([{ adId: '1001', title: 'R' }], null, { gapMs: noGap });
        expect(extendCalls()[0][1].headers['X-CSRF-TOKEN']).toBe('tok-profil');
    });

    it('ohne Token wird nichts verschickt', async () => {
        installFetch({ ads: [FREE], profile: {} });
        await expect(runExtend([{ adId: '1001', title: 'R' }], null, { gapMs: noGap })).rejects.toThrow(/CSRF/);
        expect(extendCalls()).toHaveLength(0);
    });

    it('scheitert die Liste, wird nichts verschickt', async () => {
        setMetaToken('t');
        installFetch({ listError: new Error('offline') });
        await expect(runExtend([{ adId: '1001', title: 'R' }], null, { gapMs: noGap })).rejects.toThrow('offline');
        expect(extendCalls()).toHaveLength(0);
    });

    it('ein HTTP-Fehler stoppt die uebrigen nicht', async () => {
        setMetaToken('t');
        const second = jsonAd(1004, { extend: true });
        installFetch({ ads: [FREE, second], extendStatus: { '1001': 500 } });
        const state = await runExtend([{ adId: '1001', title: 'A' }, { adId: '1004', title: 'B' }], null, { gapMs: noGap });
        expect(state.failed).toEqual([{ adId: '1001', title: 'A', error: 'HTTP 500' }]);
        expect(state.done.map((d) => d.adId)).toEqual(['1004']);
    });

    it('Stop in der Pause verhindert weitere Requests', async () => {
        setMetaToken('t');
        const second = jsonAd(1004, { extend: true });
        installFetch({ ads: [FREE, second] });
        const stopInGap = () => { requestExtendStop(); return 0; };
        const state = await runExtend([{ adId: '1001', title: 'A' }, { adId: '1004', title: 'B' }], null, { gapMs: stopInGap });
        expect(extendCalls()).toHaveLength(1);
        expect(state.aborted).toBe(true);
    });
});

describe('startExtendFlow', () => {
    it('zeigt das Ergebnis und bei Listenfehler, dass nichts verlaengert wurde', async () => {
        setMetaToken('t');
        installFetch({ ads: [FREE, NOT_YET] });
        await startExtendFlow([{ adId: '1001', title: 'A' }, { adId: '1002', title: 'B' }]);
        expect(overlay().querySelector('[data-ka-extend="ok"]').textContent).toBe('Verlängert: 1 von 2');
        expect(overlay().textContent).toContain('B: übersprungen (nicht verlängerbar)');

        installFetch({ listError: new Error('offline') });
        await startExtendFlow([{ adId: '1001', title: 'A' }]);
        expect(overlay().querySelector('[data-ka-extend="fatal"]').textContent)
            .toBe('Es wurde nichts verlängert: offline');
    });
});
