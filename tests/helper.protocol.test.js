import { describe, it, expect } from 'vitest';
import helper from '../helper.user.js';

const { classifyResultValue } = helper;

// Vertrag: Wertgrammatik "ok" / "error:<code>[:<detail>]"; dataLoss nur bei save_failed:delete_ok.
describe('classifyResultValue', () => {
    it('"ok" wird als Erfolg klassifiziert', () => {
        expect(classifyResultValue('ok')).toEqual({ ok: true });
    });

    it('"error:save_failed:delete_ok" bedeutet Datenverlust und Tab behalten', () => {
        expect(classifyResultValue('error:save_failed:delete_ok')).toEqual({
            ok: false,
            error: 'save_failed:delete_ok',
            code: 'save_failed',
            dataLoss: true,
            keepTab: true
        });
    });

    it('"error:save_failed:delete_failed" bedeutet keinen Datenverlust', () => {
        expect(classifyResultValue('error:save_failed:delete_failed')).toEqual({
            ok: false,
            error: 'save_failed:delete_failed',
            code: 'save_failed',
            dataLoss: false,
            keepTab: false
        });
    });

    it('unbekannter Code gilt als Nicht-Datenverlust (Fail-Safe-Richtung)', () => {
        expect(classifyResultValue('error:precondition_failed:adid_input_missing')).toEqual({
            ok: false,
            error: 'precondition_failed:adid_input_missing',
            code: 'precondition_failed',
            dataLoss: false,
            keepTab: false
        });
    });

    it('parst nur das erste Segment nach "error:" als Code (Freitext mit Doppelpunkten)', () => {
        const res = classifyResultValue('error:snapshot_failed:foo:bar');
        expect(res.ok).toBe(false);
        expect(res.code).toBe('snapshot_failed');
        expect(res.error).toBe('snapshot_failed:foo:bar');
        expect(res.dataLoss).toBe(false);
        expect(res.keepTab).toBe(false);
    });

    it('leere Werte sind nicht verwertbar (null)', () => {
        expect(classifyResultValue('')).toBeNull();
        expect(classifyResultValue(null)).toBeNull();
        expect(classifyResultValue(undefined)).toBeNull();
    });

    it('nicht-error-Strings ausser "ok" sind nicht verwertbar (null)', () => {
        expect(classifyResultValue('irgendwas')).toBeNull();
        expect(classifyResultValue('OK')).toBeNull();
        expect(classifyResultValue('err:save_failed')).toBeNull();
    });
});

describe('classifyResultValue – Reihenfolge "erst anlegen, dann loeschen"', () => {
    it('erkennt ok mit Hinweis als Erfolg, nicht als Fehler', () => {
        const r = classifyResultValue('ok:delete_failed');
        expect(r.ok).toBe(true);
        expect(r.warning).toBe('delete_failed');
    });

    it('wertet not_deleted NICHT als Datenverlust', () => {
        // Neue Reihenfolge: Beim Scheitern des Speicherns steht das Original noch.
        const r = classifyResultValue('error:save_failed:not_deleted');
        expect(r.ok).toBe(false);
        expect(r.code).toBe('save_failed');
        expect(r.dataLoss).toBe(false);
        expect(r.keepTab).toBe(false);
    });

    it('behandelt den alten Datenverlust-Code weiterhin als Datenverlust', () => {
        // Kommt nur noch von einem Worker aelterer Version vor.
        const r = classifyResultValue('error:save_failed:delete_ok');
        expect(r.dataLoss).toBe(true);
        expect(r.keepTab).toBe(true);
    });

    it('bleibt bei unbekannten Werten still', () => {
        expect(classifyResultValue('')).toBeNull();
        expect(classifyResultValue('irgendwas')).toBeNull();
    });
});
