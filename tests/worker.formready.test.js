import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';
import fs from 'node:fs';
import path from 'node:path';

const { CONFIG, awaitFormReady } = worker;

describe('awaitFormReady', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('wartet die Settle-Zeit ab, auch wenn die Seite laengst geladen ist', async () => {
        vi.useFakeTimers();
        CONFIG.DUPLICATE_READY_SETTLE_MS = 1500;

        let fertig = false;
        const p = awaitFormReady().then(() => { fertig = true; });

        await vi.advanceTimersByTimeAsync(1400);
        expect(fertig).toBe(false);          // noch nicht -- sonst klickt es zu frueh

        await vi.advanceTimersByTimeAsync(200);
        await p;
        expect(fertig).toBe(true);
    });

    it('ist konfigurierbar und wartet bei 0 nicht ewig', async () => {
        CONFIG.DUPLICATE_READY_SETTLE_MS = 0;
        await expect(awaitFormReady()).resolves.toBeUndefined();
    });
});

// Regressionsschutz gegen genau den Fehler aus dem Batch-Test vom 18.08.2026:
// smartRepublish klickte Speichern, bevor die React-Form bedienbar war, weil
// die Wartezeit vorher nur ein Nebeneffekt der Loeschung war. Ein Verhaltens-
// test dafuer muesste den halben Ablauf mocken; diese Struktur-Pruefung ist
// bewusst schlicht und haelt genau die eine Eigenschaft fest, die verloren ging.
describe('Bereitschafts-Gate ist in beiden Abläufen verdrahtet', () => {
    const src = fs.readFileSync(
        path.resolve(process.cwd(), 'kleinanzeigen-duplizieren.user.js'), 'utf8');

    function body(fnName) {
        const start = src.indexOf('async function ' + fnName + '(');
        expect(start).toBeGreaterThan(-1);
        return src.slice(start, src.indexOf('\n    }', start));
    }

    it('smartRepublish wartet vor dem Speichern-Klick', () => {
        const fn = body('smartRepublish');
        expect(fn).toContain('await awaitFormReady()');
        expect(fn.indexOf('await awaitFormReady()')).toBeLessThan(fn.indexOf('saveBtn.click()'));
    });

    it('duplicateAd wartet vor dem Speichern-Klick', () => {
        const fn = body('duplicateAd');
        expect(fn).toContain('await awaitFormReady()');
        expect(fn.indexOf('await awaitFormReady()')).toBeLessThan(fn.indexOf('saveBtn.click()'));
    });

    it('neutralisiert die adId erst nach dem Warten', () => {
        // Umgekehrte Reihenfolge waere gefaehrlich: ein Re-Render koennte das
        // name-Attribut wiederherstellen und der Submit wuerde die BESTEHENDE
        // Anzeige bearbeiten statt eine neue anzulegen.
        const fn = body('smartRepublish');
        // Erst Vorhandensein pruefen: sonst wuerde indexOf === -1 die
        // Reihenfolge-Zusicherung stillschweigend erfuellen.
        expect(fn).toContain('await awaitFormReady()');
        expect(fn.indexOf('await awaitFormReady()'))
            .toBeLessThan(fn.indexOf("adIdInput.removeAttribute('name')"));
    });
});
