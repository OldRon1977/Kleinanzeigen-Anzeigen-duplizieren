import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const { CONFIG, deleteAd, resolveCsrfToken } = worker;

const ORIG = '3485614406';

// Regressionsschutz gegen ein geteiltes Timeout-Budget:
// deleteAd startete seinen Abbruch-Timer vor der Aufloesung des CSRF-Tokens.
// Ein langsames Nachladen verbrauchte damit das Budget des Loesch-Requests --
// der wurde sofort mit AbortError abgewiesen und als "Timeout beim Loeschen"
// gemeldet, obwohl er nie gesendet wurde. Und resolveCsrfToken selbst hatte
// gar kein Budget, konnte also unbegrenzt haengen.

// Ein fetch-Mock, der eine Antwort verzoegert und dabei auf das AbortSignal
// hoert -- ohne das laesst sich der Unterschied zwischen "eigenes Budget" und
// "geteiltes Budget" nicht messen.
function delayedFetch(plan) {
    return vi.fn((url, options) => {
        const key = String(url).includes('m-meine-anzeigen') ? 'csrf' : 'delete';
        const entry = plan[key];
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve(entry.response()), entry.delayMs);
            const signal = options && options.signal;
            if (signal) {
                signal.addEventListener('abort', () => {
                    clearTimeout(timer);
                    const err = new Error('The operation was aborted');
                    err.name = 'AbortError';
                    reject(err);
                });
            }
        });
    });
}

const okCsrfPage = () => ({
    ok: true,
    status: 200,
    text: async () => '<meta name="_csrf" content="tok-from-page">'
});

const okDelete = () => ({ ok: true, status: 200, json: async () => ({}) });

beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    delete global.fetch;
});

describe('deleteAd: getrennte Budgets fuer Token und Loeschung', () => {
    it('sendet den Loesch-Request auch dann, wenn das Nachladen des Tokens lange gebraucht hat', async () => {
        // Zusammen 12s, also mehr als DELETE_REQUEST_TIMEOUT_MS. Mit einem
        // gemeinsamen Timer waere der Loesch-Request abgebrochen worden.
        global.fetch = delayedFetch({
            csrf: { delayMs: 7000, response: okCsrfPage },
            delete: { delayMs: 5000, response: okDelete }
        });

        const p = deleteAd(ORIG);
        await vi.advanceTimersByTimeAsync(12000);
        await expect(p).resolves.toEqual({});

        const urls = global.fetch.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes('m-meine-anzeigen'))).toBe(true);
        expect(urls.some((u) => u.includes('m-anzeigen-loeschen.json?ids=' + ORIG))).toBe(true);
    });

    it('meldet einen Token-Timeout als solchen, nicht als Timeout beim Loeschen', async () => {
        global.fetch = delayedFetch({
            csrf: { delayMs: CONFIG.CSRF_FETCH_TIMEOUT_MS + 1000, response: okCsrfPage },
            delete: { delayMs: 0, response: okDelete }
        });

        const p = deleteAd(ORIG);
        const assertion = expect(p).rejects.toThrow('CSRF-Token nicht ermittelbar (Timeout)');
        await vi.advanceTimersByTimeAsync(CONFIG.CSRF_FETCH_TIMEOUT_MS + 1000);
        await assertion;

        // Der Loesch-Request darf in diesem Fall gar nicht gesendet werden.
        const urls = global.fetch.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes('m-anzeigen-loeschen.json'))).toBe(false);
    });

    it('haelt am eigenen Timeout des Loesch-Requests fest', async () => {
        document.head.innerHTML = '<meta name="_csrf" content="tok-123">';
        global.fetch = delayedFetch({
            csrf: { delayMs: 0, response: okCsrfPage },
            delete: { delayMs: CONFIG.DELETE_REQUEST_TIMEOUT_MS + 1000, response: okDelete }
        });

        const p = deleteAd(ORIG);
        const assertion = expect(p).rejects.toThrow('Timeout beim Löschen');
        await vi.advanceTimersByTimeAsync(CONFIG.DELETE_REQUEST_TIMEOUT_MS + 1000);
        await assertion;
    });
});

describe('resolveCsrfToken', () => {
    it('nimmt das Token aus dem Dokument, ohne zu laden', async () => {
        document.head.innerHTML = '<meta name="_csrf" content="tok-im-dom">';
        global.fetch = vi.fn();

        await expect(resolveCsrfToken()).resolves.toBe('tok-im-dom');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('bricht das Nachladen nach CSRF_FETCH_TIMEOUT_MS ab', async () => {
        global.fetch = delayedFetch({
            csrf: { delayMs: CONFIG.CSRF_FETCH_TIMEOUT_MS + 500, response: okCsrfPage },
            delete: { delayMs: 0, response: okDelete }
        });

        const p = resolveCsrfToken();
        const assertion = expect(p).rejects.toThrow('CSRF-Token nicht ermittelbar (Timeout)');
        await vi.advanceTimersByTimeAsync(CONFIG.CSRF_FETCH_TIMEOUT_MS + 500);
        await assertion;
    });
});
