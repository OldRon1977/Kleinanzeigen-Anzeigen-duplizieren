import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const { CONFIG, writeVorgangMarker, readVorgangMarker, handleConfirmationPage } = worker;

const ORIG = '3485614406';

// Der Watchdog raeumt die Vorgangs-Marker ab, solange der Tab auf der
// Bearbeiten-Seite steht. Verlaesst der Nutzer die Seite vorher, greift er
// nicht -- der Marker ueberlebt im tab-gebundenen sessionStorage und wuerde von
// einem spaeteren Vorgang ausgefuehrt. Der Zeitstempel schliesst diese Luecke.

function deleteCalls() {
    return global.fetch.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes('m-anzeigen-loeschen.json'));
}

beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    document.head.innerHTML = '<meta name="_csrf" content="tok-123">';
    document.body.innerHTML = '';
    CONFIG.DELETE_WAIT_AFTER_CREATE_MS = 0;
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
});

afterEach(() => {
    delete global.fetch;
    vi.useRealTimers();
});

describe('Vorgangs-Marker mit Zeitstempel', () => {
    it('liest zurueck, was geschrieben wurde', () => {
        writeVorgangMarker('ka-delete-after-create', ORIG);
        expect(readVorgangMarker('ka-delete-after-create')).toBe(ORIG);
    });

    it('liefert null fuer einen fehlenden Marker', () => {
        expect(readVorgangMarker('ka-delete-after-create')).toBeNull();
    });

    it('verwirft einen Marker, der aelter als die Verfallszeit ist', () => {
        const jetzt = Date.now();
        vi.useFakeTimers();
        vi.setSystemTime(jetzt);
        writeVorgangMarker('ka-delete-after-create', ORIG);

        vi.setSystemTime(jetzt + CONFIG.MARKER_MAX_AGE_MS + 1);
        expect(readVorgangMarker('ka-delete-after-create')).toBeNull();
    });

    it('akzeptiert einen Marker knapp innerhalb der Verfallszeit', () => {
        const jetzt = Date.now();
        vi.useFakeTimers();
        vi.setSystemTime(jetzt);
        writeVorgangMarker('ka-delete-after-create', ORIG);

        vi.setSystemTime(jetzt + CONFIG.MARKER_MAX_AGE_MS);
        expect(readVorgangMarker('ka-delete-after-create')).toBe(ORIG);
    });

    it('akzeptiert das Alt-Format ohne Zeitstempel weiter', () => {
        // Ein Script-Update kann einen Tab mit einem Marker im alten Format
        // hinterlassen. Der Vorgang darf dadurch nicht verloren gehen.
        sessionStorage.setItem('ka-delete-after-create', ORIG);
        expect(readVorgangMarker('ka-delete-after-create')).toBe(ORIG);
    });

    it('behandelt kaputtes JSON wie das Alt-Format', () => {
        sessionStorage.setItem('ka-delete-after-create', '{kein valides json');
        expect(readVorgangMarker('ka-delete-after-create')).toBe('{kein valides json');
    });
});

describe('Bestaetigungs-Seite mit abgelaufenem Marker', () => {
    it('loescht nichts, wenn der Loeschauftrag abgelaufen ist', async () => {
        const jetzt = Date.now();
        vi.useFakeTimers();
        vi.setSystemTime(jetzt);
        writeVorgangMarker('ka-batch-original-adid', ORIG);
        writeVorgangMarker('ka-delete-after-create', ORIG);

        vi.setSystemTime(jetzt + CONFIG.MARKER_MAX_AGE_MS + 1);
        await handleConfirmationPage();

        expect(deleteCalls()).toHaveLength(0);
        // Auch kein Result-Signal: dieser Vorgang gehoert nicht zum Marker.
        expect(localStorage.getItem('ka-batch-result-' + ORIG)).toBeNull();
    });

    it('loescht wie bisher, wenn der Auftrag frisch ist', async () => {
        writeVorgangMarker('ka-batch-original-adid', ORIG);
        writeVorgangMarker('ka-delete-after-create', ORIG);

        await handleConfirmationPage();

        expect(deleteCalls()).toHaveLength(1);
        expect(deleteCalls()[0]).toContain('ids=' + ORIG);
        expect(localStorage.getItem('ka-batch-result-' + ORIG)).toBe('ok');
    });

    it('raeumt die Marker auch dann ab, wenn sie abgelaufen sind', async () => {
        const jetzt = Date.now();
        vi.useFakeTimers();
        vi.setSystemTime(jetzt);
        writeVorgangMarker('ka-batch-original-adid', ORIG);
        writeVorgangMarker('ka-delete-after-create', ORIG);
        sessionStorage.setItem('ka-manual-mode', '1');

        vi.setSystemTime(jetzt + CONFIG.MARKER_MAX_AGE_MS + 1);
        await handleConfirmationPage();

        expect(sessionStorage.getItem('ka-delete-after-create')).toBeNull();
        expect(sessionStorage.getItem('ka-batch-original-adid')).toBeNull();
        expect(sessionStorage.getItem('ka-manual-mode')).toBeNull();
    });
});
