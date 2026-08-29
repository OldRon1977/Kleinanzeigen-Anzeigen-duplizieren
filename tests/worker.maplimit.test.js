import { describe, it, expect, afterEach } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const { mapLimit, CONFIG } = worker;

const tick = ms => new Promise(r => setTimeout(r, ms));

describe('mapLimit', () => {
    it('liefert die Ergebnisse in der Reihenfolge der EINGABE, nicht der Fertigstellung', async () => {
        // Absichtlich umgekehrte Laufzeiten: wer zuerst startet, wird zuletzt
        // fertig. Ein Pool, der Ergebnisse anhaengt, kaeme hier verdreht heraus
        // -- und im Recovery-ZIP waere die Bildreihenfolge der Anzeige dahin.
        const items = ['a', 'b', 'c', 'd'];
        const dauer = { a: 40, b: 30, c: 20, d: 10 };
        const res = await mapLimit(items, 4, async (x) => { await tick(dauer[x]); return x.toUpperCase(); });
        expect(res).toEqual(['A', 'B', 'C', 'D']);
    });

    it('haelt die Obergrenze fuer gleichzeitige Aufrufe ein', async () => {
        let laufend = 0;
        let maximum = 0;
        const items = Array.from({ length: 20 }, (_, i) => i);
        await mapLimit(items, 4, async () => {
            laufend++;
            maximum = Math.max(maximum, laufend);
            await tick(5);
            laufend--;
        });
        expect(maximum).toBe(4);
    });

    it('verarbeitet jedes Element genau einmal', async () => {
        const items = Array.from({ length: 25 }, (_, i) => i);
        const gesehen = [];
        const res = await mapLimit(items, 4, async (x) => { gesehen.push(x); return x * 2; });
        expect(gesehen.sort((a, b) => a - b)).toEqual(items);
        expect(res).toEqual(items.map(x => x * 2));
    });

    it('reicht den Index an den Worker durch', async () => {
        const res = await mapLimit(['x', 'y', 'z'], 2, async (item, i) => item + i);
        expect(res).toEqual(['x0', 'y1', 'z2']);
    });

    it('kommt mit einer leeren Liste klar', async () => {
        expect(await mapLimit([], 4, async () => 1)).toEqual([]);
    });

    it('kommt mit einem Limit groesser als die Liste klar', async () => {
        expect(await mapLimit([1, 2], 10, async (x) => x + 1)).toEqual([2, 3]);
    });

    it('faellt bei Limit 0 auf einen Laeufer zurueck statt haengenzubleiben', async () => {
        // Ohne die Untergrenze wuerde der Pool leer bleiben und Promise.all
        // sofort aufloesen -- results waere ein Array aus lauter undefined.
        expect(await mapLimit([1, 2, 3], 0, async (x) => x * 10)).toEqual([10, 20, 30]);
    });

    it('ist tatsaechlich nebenlaeufig und nicht nur sequenziell verpackt', async () => {
        const items = Array.from({ length: 8 }, (_, i) => i);
        const start = Date.now();
        await mapLimit(items, 4, async () => { await tick(25); });
        const dauer = Date.now() - start;
        // Sequenziell waeren es ~200ms, mit vier Laeufern ~50ms. Die Schranke
        // liegt bewusst weit dazwischen, damit langsame CI-Maschinen den Test
        // nicht kippen.
        expect(dauer).toBeLessThan(150);
    });
});

describe('CONFIG.IMAGE_FETCH_CONCURRENCY', () => {
    it('ist gesetzt und bleibt in einem vertretbaren Rahmen', () => {
        expect(typeof CONFIG.IMAGE_FETCH_CONCURRENCY).toBe('number');
        expect(CONFIG.IMAGE_FETCH_CONCURRENCY).toBeGreaterThanOrEqual(1);
        // Nach oben gedeckelt: ein hoher Wert brauchte eine eigene Begruendung
        // (Bot-Erkennung, Verbindungslimit des Browsers).
        expect(CONFIG.IMAGE_FETCH_CONCURRENCY).toBeLessThanOrEqual(8);
    });
});

// Der eigentliche Pfad: mapLimit isoliert zu pruefen reicht nicht, wenn
// buildSnapshot die Ergebnisse hinterher doch wieder falsch einsammelt.
describe('buildSnapshot sammelt die Bilder parallel und in Reihenfolge ein', () => {
    const { buildSnapshot } = worker;

    function setzeBilder(anzahl) {
        document.body.innerHTML = Array.from({ length: anzahl }, (_, i) =>
            `<img src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/bild${i}?rule=$_59.JPG">`
        ).join('');
    }

    afterEach(() => {
        document.body.innerHTML = '';
        delete globalThis.fetch;
    });

    it('behaelt die Reihenfolge der Bilder, auch wenn spaetere zuerst antworten', async () => {
        setzeBilder(5);
        // Umgekehrte Latenzen: das letzte Bild ist als erstes da.
        globalThis.fetch = async (url) => {
            const nr = Number(url.match(/bild(\d+)/)[1]);
            await tick((5 - nr) * 12);
            return { ok: true, blob: async () => ({ type: 'image/jpeg', _nr: nr }) };
        };

        const snap = await buildSnapshot('12345');
        expect(snap.images.map(i => i.blob._nr)).toEqual([0, 1, 2, 3, 4]);
        expect(snap.images.map(i => i.url.match(/bild(\d+)/)[1])).toEqual(['0', '1', '2', '3', '4']);
    });

    it('ersetzt ein fehlgeschlagenes Bild durch einen Platzhalter, ohne den Rest zu verlieren', async () => {
        setzeBilder(4);
        globalThis.fetch = async (url) => {
            const nr = Number(url.match(/bild(\d+)/)[1]);
            if (nr === 2) return { ok: false, status: 404 };
            return { ok: true, blob: async () => ({ type: 'image/jpeg', _nr: nr }) };
        };

        const snap = await buildSnapshot('12345');
        expect(snap.images.length).toBe(4);
        // Der Platzhalter bleibt an SEINER Position -- sonst verschoeben sich
        // alle nachfolgenden Bilder im Recovery-ZIP um eins.
        expect(snap.images[2].blob).toBeNull();
        expect(snap.images[2].url).toContain('bild2');
        expect(snap.images.filter(i => i.blob !== null).length).toBe(3);
    });

    it('laeuft nebenlaeufig statt nacheinander', async () => {
        setzeBilder(8);
        globalThis.fetch = async () => {
            await tick(25);
            return { ok: true, blob: async () => ({ type: 'image/jpeg' }) };
        };

        const start = Date.now();
        await buildSnapshot('12345');
        const dauer = Date.now() - start;
        // Sequenziell waeren es ~200ms.
        expect(dauer).toBeLessThan(150);
    });
});
