import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import helper from '../helper.user.js';

const {
    ageFromJsonAd,
    parseJsonDate,
    daysSince,
    formatDate,
    mapJsonAd,
    fetchAdListJson,
    collectCandidatesJson,
    collectCandidatesResilient
} = helper;

// Datum relativ zu heute, damit die Tests nicht mit dem Kalender veralten.
function daysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return formatDate(d);
}

function inDays(n) {
    return daysAgo(-n);
}

// Wichtig: Erstelldatum und Restlaufzeit sind bewusst NICHT konsistent
// (20 Tage alt, aber noch 55 Tage Restlaufzeit -> Schaetzung waere 5 Tage).
// Sonst liefern echtes und geschaetztes Alter dieselbe Zahl und der Test
// koennte nicht zwischen beiden unterscheiden.
function jsonAd(over) {
    return Object.assign({
        id: 4711,
        title: 'Fahrrad',
        creationDate: daysAgo(20),
        endDate: inDays(55),
        watchCount: 0,
        viewCount: 142
    }, over);
}

// fetch-Attrappe: liefert je Seite eine vorbereitete Antwort.
function mockFetch(pages) {
    return vi.fn(async (url) => {
        const m = String(url).match(/pageNum=(\d+)/);
        const page = m ? parseInt(m[1], 10) : 1;
        const payload = pages[page];
        if (payload === undefined) return { ok: true, json: async () => ({ ads: [] }) };
        if (payload instanceof Error) throw payload;
        if (payload.httpStatus) return { ok: false, status: payload.httpStatus };
        return { ok: true, json: async () => payload };
    });
}

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    delete global.fetch;
});

describe('parseJsonDate', () => {
    it('liest das deutsche Format, auch eingebettet in Text', () => {
        expect(formatDate(parseJsonDate('15.03.2026'))).toBe('15.03.2026');
        expect(formatDate(parseJsonDate('endet am 5.7.2026'))).toBe('05.07.2026');
    });

    it('faellt auf ISO zurueck', () => {
        const d = parseJsonDate('2026-03-15T10:00:00Z');
        expect(d).toBeInstanceOf(Date);
        expect(d.getFullYear()).toBe(2026);
    });

    it('liefert null fuer Unbrauchbares', () => {
        expect(parseJsonDate(null)).toBeNull();
        expect(parseJsonDate('')).toBeNull();
        expect(parseJsonDate('irgendwas')).toBeNull();
    });
});

// Reihenfolge der Altersquellen. Die drei Wege muessen sich unterscheiden
// lassen, sonst beweist der Test nichts -- deshalb bewusst widerspruechliche
// Werte: 30 Tage laut Server, 20 laut Erstelldatum, 5 laut Restlaufzeit.
describe('ageFromJsonAd', () => {
    const created = new Date();
    created.setHours(0, 0, 0, 0);
    created.setDate(created.getDate() - 20);

    it('nimmt zuerst die Server-Angabe adLifeTimeInSeconds', () => {
        const r = ageFromJsonAd({ adLifeTimeInSeconds: 30 * 86400 }, created, 55);
        expect(r).toEqual({ ageDays: 30, exact: true });
    });

    it('rundet ab: heute erstellt heisst 0 Tage alt', () => {
        expect(ageFromJsonAd({ adLifeTimeInSeconds: 3600 }, null, 60).ageDays).toBe(0);
        expect(ageFromJsonAd({ adLifeTimeInSeconds: 86399 }, null, 60).ageDays).toBe(0);
        expect(ageFromJsonAd({ adLifeTimeInSeconds: 86400 }, null, 60).ageDays).toBe(1);
    });

    it('faellt ohne Server-Angabe auf das Erstelldatum zurueck', () => {
        const r = ageFromJsonAd({}, created, 55);
        expect(r).toEqual({ ageDays: 20, exact: true });
    });

    it('faellt ohne beides auf die Restlaufzeit-Schaetzung zurueck und sagt das', () => {
        const r = ageFromJsonAd({}, null, 55);
        expect(r).toEqual({ ageDays: 5, exact: false });   // 60 - 55
    });

    it('ignoriert unbrauchbare Server-Angaben', () => {
        expect(ageFromJsonAd({ adLifeTimeInSeconds: null }, created, 55).ageDays).toBe(20);
        expect(ageFromJsonAd({ adLifeTimeInSeconds: 'viele' }, created, 55).ageDays).toBe(20);
        expect(ageFromJsonAd({ adLifeTimeInSeconds: -5 }, created, 55).ageDays).toBe(20);
    });
});

describe('mapJsonAd', () => {
    it('rechnet das Alter aus dem echten Erstelldatum, nicht aus der Restlaufzeit', () => {
        const m = mapJsonAd(jsonAd({ creationDate: daysAgo(20), endDate: inDays(55) }));
        expect(m.ageDays).toBe(20);        // echt
        expect(m.ageDays).not.toBe(5);     // waere die Schaetzung aus 60 - 55
        expect(m.ageExact).toBe(true);
    });

    it('nimmt den Merk-Zaehler als Zahl mit, inklusive 0', () => {
        expect(mapJsonAd(jsonAd({ watchCount: 0 })).favCount).toBe(0);
        expect(mapJsonAd(jsonAd({ watchCount: 7 })).favCount).toBe(7);
    });

    it('macht aus einem fehlenden Zaehler null, nicht 0', () => {
        expect(mapJsonAd(jsonAd({ watchCount: undefined })).favCount).toBeNull();
    });

    it('faellt ohne Erstelldatum auf die Schaetzung zurueck und sagt das', () => {
        const m = mapJsonAd(jsonAd({ creationDate: null, endDate: inDays(50) }));
        expect(m.ageExact).toBe(false);
        expect(m.ageDays).toBe(10);          // 60 - 50
    });

    it('verwirft Eintraege ohne brauchbare ID oder ganz ohne Datum', () => {
        expect(mapJsonAd(null)).toBeNull();
        expect(mapJsonAd(jsonAd({ id: undefined }))).toBeNull();
        expect(mapJsonAd(jsonAd({ id: 'abc' }))).toBeNull();
        expect(mapJsonAd(jsonAd({ creationDate: null, endDate: null }))).toBeNull();
    });
});

describe('fetchAdListJson', () => {
    it('holt ALLE Seiten, nicht nur die sichtbare', async () => {
        global.fetch = mockFetch({
            1: { ads: [jsonAd({ id: 1 }), jsonAd({ id: 2 })], paging: { last: 3 } },
            2: { ads: [jsonAd({ id: 3 })] },
            3: { ads: [jsonAd({ id: 4 })] }
        });

        const ads = await fetchAdListJson();
        expect(ads.map((a) => a.id)).toEqual([1, 2, 3, 4]);
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('hoert auf, sobald eine Seite leer ist', async () => {
        global.fetch = mockFetch({ 1: { ads: [jsonAd({ id: 1 })] }, 2: { ads: [] } });

        const ads = await fetchAdListJson();
        expect(ads).toHaveLength(1);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('laeuft bei fehlendem paging nicht endlos', async () => {
        // Jede Seite liefert etwas -- ohne Obergrenze waere das eine Endlosschleife.
        global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ads: [jsonAd()] }) }));

        const ads = await fetchAdListJson();
        expect(global.fetch.mock.calls.length).toBeLessThanOrEqual(20);
        expect(ads.length).toBeLessThanOrEqual(20);
    });

    it('wirft bei HTTP-Fehler', async () => {
        global.fetch = mockFetch({ 1: { httpStatus: 403 } });
        await expect(fetchAdListJson()).rejects.toThrow('HTTP 403');
    });
});

describe('collectCandidatesResilient', () => {
    function domPage() {
        document.body.innerHTML =
            '<ul><li data-testid="ad-card" data-adid="99">' +
            '<h3><a>Aus dem DOM</a></h3>' +
            '<span class="managead-listitem-enddate">' + inDays(40) + '</span>' +
            '</li></ul>';
    }

    it('nimmt die JSON-Quelle, wenn sie liefert', async () => {
        global.fetch = mockFetch({ 1: { ads: [jsonAd({ id: 1, title: 'Aus JSON' })] } });
        domPage();

        const res = await collectCandidatesResilient();
        expect(res.source).toBe('json');
        expect(res.matches[0].title).toBe('Aus JSON');
        expect(res.matches[0].ageExact).toBe(true);
    });

    it('faellt bei Netzfehler auf die Seitenansicht zurueck', async () => {
        global.fetch = mockFetch({ 1: new Error('offline') });
        domPage();

        const res = await collectCandidatesResilient();
        expect(res.source).toBe('dom');
        expect(res.matches[0].adId).toBe('99');
        expect(res.matches[0].ageExact).toBe(false);
    });

    it('faellt auch bei leerer JSON-Antwort zurueck', async () => {
        global.fetch = mockFetch({ 1: { ads: [] } });
        domPage();

        const res = await collectCandidatesResilient();
        expect(res.source).toBe('dom');
    });

    it('gibt eine leere Liste zurueck, wenn beide Quellen nichts haben', async () => {
        global.fetch = mockFetch({ 1: new Error('offline') });

        const res = await collectCandidatesResilient();
        expect(res.matches).toEqual([]);
    });
});

describe('collectCandidatesJson', () => {
    it('trennt brauchbare von unbrauchbaren Eintraegen', async () => {
        global.fetch = mockFetch({
            1: { ads: [jsonAd({ id: 1 }), jsonAd({ id: 2, creationDate: null, endDate: null })] }
        });

        const res = await collectCandidatesJson();
        expect(res.matches.map((m) => m.adId)).toEqual(['1']);
        expect(res.skipped).toHaveLength(1);
    });
});
