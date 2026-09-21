import { describe, it, expect, afterEach, vi } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const { fetchAsBlob, CONFIG } = worker;

// Regressionsschutz: img.kleinanzeigen.de sendet `Access-Control-Allow-Origin: *`
// ohne `Access-Control-Allow-Credentials`. Mit Cookies verwirft der Browser
// die Antwort, und der Snapshot enthielte kein einziges Bild. jsdom setzt CORS
// nicht durch -- deshalb wird hier festgehalten, WIE angefragt wird.
describe('fetchAsBlob', () => {
    afterEach(() => { delete globalThis.fetch; });

    it('fragt Bilder ohne Cookies an', async () => {
        const aufrufe = [];
        globalThis.fetch = async (url, opts) => {
            aufrufe.push({ url, opts });
            return { ok: true, blob: async () => ({ type: 'image/jpeg' }) };
        };

        await fetchAsBlob('https://img.kleinanzeigen.de/api/v1/prod-ads/images/de/abc?rule=$_57.JPG');

        expect(aufrufe.length).toBe(1);
        expect(aufrufe[0].opts.credentials).toBe('omit');
    });

    it('liefert den Blob bei Erfolg', async () => {
        const blob = { type: 'image/jpeg' };
        globalThis.fetch = async () => ({ ok: true, blob: async () => blob });
        expect(await fetchAsBlob('https://img.kleinanzeigen.de/x')).toBe(blob);
    });

    it('wirft bei HTTP-Fehler, damit der Aufrufer einen Platzhalter setzt', async () => {
        globalThis.fetch = async () => ({ ok: false, status: 404 });
        await expect(fetchAsBlob('https://img.kleinanzeigen.de/x')).rejects.toThrow('HTTP 404');
    });

    // Solange ein Bild-Download laeuft, wird die neue Anzeige nicht gespeichert.
    // Ohne Abbruchkante haelt ein nicht antwortender Bildserver den ganzen
    // Vorgang auf.
    it('bricht nach CONFIG.IMAGE_FETCH_TIMEOUT_MS ab', async () => {
        vi.useFakeTimers();
        globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
            opts.signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
            });
        });

        const p = fetchAsBlob('https://img.kleinanzeigen.de/x');
        const assertion = expect(p).rejects.toThrow('Timeout nach ' + CONFIG.IMAGE_FETCH_TIMEOUT_MS + ' ms');
        await vi.advanceTimersByTimeAsync(CONFIG.IMAGE_FETCH_TIMEOUT_MS);
        await assertion;
        vi.useRealTimers();
    });

    it('nennt im Timeout-Fehler keine URL, weil Bild-URLs Tokens tragen', async () => {
        vi.useFakeTimers();
        const geheim = 'https://img.kleinanzeigen.de/x?AccessKeyId=AKIA-GEHEIM&jwt=tok';
        globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
            opts.signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
            });
        });

        const p = fetchAsBlob(geheim);
        const assertion = p.then(
            () => { throw new Error('haette abbrechen muessen'); },
            (e) => {
                expect(e.message).not.toContain('AccessKeyId');
                expect(e.message).not.toContain('jwt');
            }
        );
        await vi.advanceTimersByTimeAsync(CONFIG.IMAGE_FETCH_TIMEOUT_MS);
        await assertion;
        vi.useRealTimers();
    });
});
