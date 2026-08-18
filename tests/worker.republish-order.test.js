import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const { CONFIG, handleConfirmationPage } = worker;

const ORIG = '3485614406';

function setCsrfMeta() {
    document.head.innerHTML = '<meta name="_csrf" content="tok-123">';
}

function deleteCalls() {
    return global.fetch.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes('m-anzeigen-loeschen.json'));
}

beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    // Die 2s Wartezeit vor der Loeschung interessieren hier nicht.
    CONFIG.DELETE_WAIT_AFTER_CREATE_MS = 0;
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
});

afterEach(() => {
    delete global.fetch;
});

// Kern der Umstellung: Geloescht wird erst, wenn die Bestaetigungs-Seite
// erreicht ist -- und die wird nur erreicht, wenn die neue Anzeige existiert.
describe('Bestaetigungs-Seite: erst anlegen, dann loeschen', () => {
    it('loescht das Original und meldet ok', async () => {
        setCsrfMeta();
        sessionStorage.setItem('ka-batch-original-adid', ORIG);
        sessionStorage.setItem('ka-delete-after-create', ORIG);

        await handleConfirmationPage();

        expect(deleteCalls()).toHaveLength(1);
        expect(deleteCalls()[0]).toContain('ids=' + ORIG);
        expect(localStorage.getItem('ka-batch-result-' + ORIG)).toBe('ok');
    });

    it('schickt das CSRF-Token mit', async () => {
        setCsrfMeta();
        sessionStorage.setItem('ka-batch-original-adid', ORIG);
        sessionStorage.setItem('ka-delete-after-create', ORIG);

        await handleConfirmationPage();

        const call = global.fetch.mock.calls.find((c) => String(c[0]).includes('loeschen'));
        expect(call[1].method).toBe('POST');
        expect(call[1].headers['x-csrf-token']).toBe('tok-123');
    });

    it('meldet ok:delete_failed, wenn das Original nicht geloescht werden konnte', async () => {
        setCsrfMeta();
        global.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
        sessionStorage.setItem('ka-batch-original-adid', ORIG);
        sessionStorage.setItem('ka-delete-after-create', ORIG);

        await handleConfirmationPage();

        // Kein Fehler: Die neue Anzeige steht. Aber das Duplikat muss gemeldet werden.
        expect(localStorage.getItem('ka-batch-result-' + ORIG)).toBe('ok:delete_failed');
    });

    it('loescht NICHTS ohne Auftrag', async () => {
        setCsrfMeta();
        sessionStorage.setItem('ka-batch-original-adid', ORIG);
        // ka-delete-after-create fehlt absichtlich

        await handleConfirmationPage();

        expect(deleteCalls()).toHaveLength(0);
        expect(localStorage.getItem('ka-batch-result-' + ORIG)).toBe('ok');
    });

    it('loescht bei einem Reload der Seite kein zweites Mal', async () => {
        setCsrfMeta();
        sessionStorage.setItem('ka-batch-original-adid', ORIG);
        sessionStorage.setItem('ka-delete-after-create', ORIG);

        await handleConfirmationPage();
        await handleConfirmationPage();   // Reload

        expect(deleteCalls()).toHaveLength(1);
        expect(sessionStorage.getItem('ka-delete-after-create')).toBeNull();
    });

    it('holt das CSRF-Token nach, wenn die Seite keins im DOM hat', async () => {
        // Kein meta-Tag: das Token muss aus "Meine Anzeigen" nachgeladen werden.
        global.fetch = vi.fn(async (url) => {
            if (String(url).includes('m-meine-anzeigen.html')) {
                return { ok: true, status: 200, text: async () => '<meta name="_csrf" content="tok-nachgeladen">' };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        });
        sessionStorage.setItem('ka-batch-original-adid', ORIG);
        sessionStorage.setItem('ka-delete-after-create', ORIG);

        await handleConfirmationPage();

        const call = global.fetch.mock.calls.find((c) => String(c[0]).includes('loeschen'));
        expect(call[1].headers['x-csrf-token']).toBe('tok-nachgeladen');
        expect(localStorage.getItem('ka-batch-result-' + ORIG)).toBe('ok');
    });

    it('signalisiert das Duplikat separat und loescht dabei nichts', async () => {
        setCsrfMeta();
        sessionStorage.setItem('ka-duplicate-adid', ORIG);

        await handleConfirmationPage();

        expect(deleteCalls()).toHaveLength(0);
        expect(localStorage.getItem('ka-duplicate-result-' + ORIG)).toBe('ok');
    });
});
