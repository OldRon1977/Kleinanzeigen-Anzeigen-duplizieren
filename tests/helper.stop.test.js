import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import helper from '../helper.user.js';

const { waitMs, formatRemaining } = helper;

// Regressionsschutz fuer den Stop-Button waehrend der Pause zwischen zwei
// Anzeigen. Vorher pruefte runBatch `stopRequested` erst NACH dem Warten --
// bei der Standardpause von 3-6 Minuten lief der Ticker nach dem Klick also
// noch minutenlang weiter, ohne dass sich sichtbar etwas tat.
describe('waitMs', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('wartet die volle Zeit aus und meldet true', async () => {
        vi.useFakeTimers();
        let fertig = null;
        const p = waitMs(3000).then(v => { fertig = v; });

        await vi.advanceTimersByTimeAsync(2000);
        expect(fertig).toBeNull();

        await vi.advanceTimersByTimeAsync(1000);
        await p;
        expect(fertig).toBe(true);
    });

    it('bricht beim naechsten Tick ab, wenn shouldAbort true wird, und meldet false', async () => {
        vi.useFakeTimers();
        let abbrechen = false;
        let fertig = null;
        // 10 Minuten -- laenger als jede realistische Pause, damit der Test
        // wirklich den Abbruch misst und nicht das regulaere Ende.
        const p = waitMs(600000, null, () => abbrechen).then(v => { fertig = v; });

        await vi.advanceTimersByTimeAsync(5000);
        expect(fertig).toBeNull();

        abbrechen = true;
        await vi.advanceTimersByTimeAsync(1000);
        await p;
        expect(fertig).toBe(false);
    });

    it('meldet die Restzeit sofort, nicht erst nach einer Sekunde', async () => {
        vi.useFakeTimers();
        const ticks = [];
        const p = waitMs(5000, ms => ticks.push(ms));

        // Ohne den Sofort-Tick bliebe die Restzeit die erste Sekunde leer.
        expect(ticks.length).toBe(1);
        expect(ticks[0]).toBe(5000);

        await vi.advanceTimersByTimeAsync(5000);
        await p;
    });

    it('schreibt nach dem Abbruch keine neue Restzeit mehr', async () => {
        vi.useFakeTimers();
        let abbrechen = false;
        const ticks = [];
        const p = waitMs(600000, ms => ticks.push(ms), () => abbrechen);

        await vi.advanceTimersByTimeAsync(2000);
        const vorAbbruch = ticks.length;

        abbrechen = true;
        await vi.advanceTimersByTimeAsync(5000);
        await p;

        // Der Abbruch-Tick darf onTick nicht mehr aufrufen, und danach laeuft
        // kein Intervall weiter -- sonst stuende eine tote ETA in der UI.
        expect(ticks.length).toBe(vorAbbruch);
    });

    it('laeuft ohne shouldAbort wie bisher', async () => {
        vi.useFakeTimers();
        let fertig = null;
        const p = waitMs(1000, null).then(v => { fertig = v; });
        await vi.advanceTimersByTimeAsync(1000);
        await p;
        expect(fertig).toBe(true);
    });
});

describe('formatRemaining', () => {
    it('formatiert Minuten und Sekunden zweistellig', () => {
        expect(formatRemaining(0)).toBe('0:00');
        expect(formatRemaining(9000)).toBe('0:09');
        expect(formatRemaining(65000)).toBe('1:05');
        expect(formatRemaining(600000)).toBe('10:00');
    });
});

// Der Verhaltenstest oben deckt waitMs ab. Dass runBatch das Praedikat auch
// tatsaechlich mitgibt, laesst sich ohne Mock des halben Batch-Ablaufs nicht
// beobachten -- diese Struktur-Pruefung haelt genau die eine Verdrahtung fest,
// die verloren gehen koennte.
describe('runBatch reicht den Stop-Zustand an die Pause durch', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'helper.user.js'), 'utf8');
    const start = src.indexOf('async function runBatch(');
    const fn = src.slice(start, src.indexOf('\n    }', start));

    it('uebergibt stopRequested als Abbruch-Praedikat an waitMs', () => {
        expect(start).toBeGreaterThan(-1);
        expect(fn).toContain('function () { return stopRequested; }');
    });

    it('wertet den Rueckgabewert von waitMs aus', () => {
        expect(fn).toContain('await waitMs(');
        expect(fn).toMatch(/const \w+ = await waitMs\(/);
    });
});
