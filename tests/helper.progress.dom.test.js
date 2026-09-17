import { describe, it, expect, beforeEach } from 'vitest';
import helper from '../helper.user.js';

const { renderProgress } = helper;

// Regressionsschutz gegen einen wandernden Nenner:
// renderProgress rechnete total aus queue.length + verarbeiteten Elementen.
// runBatch nimmt das laufende Element per shift() aus der Queue, bevor es
// rendert -- das Element stand also in keiner der drei Listen und fehlte in
// der Summe. Bei zehn Anzeigen zeigte die UI "0 / 9", beim letzten Element
// "9 / 9", also 100 Prozent waehrend noch gearbeitet wurde.

function makeState(overrides) {
    return Object.assign({
        queue: [],
        total: 0,
        processed: [],
        failed: [],
        warnings: [],
        currentLabel: '',
        nextEtaText: '',
        aborted: false,
        autoStopped: false,
        stopping: false
    }, overrides);
}

function progressText() {
    return document.body.textContent.replace(/\s+/g, ' ');
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('renderProgress: Nenner bleibt die Gesamtzahl', () => {
    it('zaehlt gegen die Gesamtzahl, waehrend eine Anzeige laeuft', () => {
        // Zehn ausgewaehlt, zwei fertig, die dritte laeuft gerade: sie ist aus
        // der Queue heraus, also sind dort nur noch sieben.
        const state = makeState({
            queue: new Array(7).fill({ adId: 'x', title: 't' }),
            total: 10,
            processed: [{ adId: '1' }, { adId: '2' }],
            currentLabel: 'Dritte Anzeige (ID 3)'
        });

        renderProgress(state, function () {});

        expect(progressText()).toContain('2 / 10');
    });

    it('zeigt beim letzten Element nicht 100 Prozent', () => {
        const state = makeState({
            queue: [],
            total: 10,
            processed: new Array(9).fill({ adId: 'x' }),
            currentLabel: 'Letzte Anzeige (ID 10)'
        });

        renderProgress(state, function () {});

        const text = progressText();
        expect(text).toContain('9 / 10');
        expect(text).not.toContain('9 / 9');
    });

    it('behaelt die Gesamtzahl nach einem Auto-Stop', () => {
        const state = makeState({
            queue: new Array(6).fill({ adId: 'x', title: 't' }),
            total: 10,
            processed: [{ adId: '1' }, { adId: '2' }],
            failed: [{ adId: '3', error: 'Datenverlust' }],
            autoStopped: true
        });

        renderProgress(state, function () {});

        expect(progressText()).toContain('3 / 10');
    });

    it('rechnet Erfolge und Fehler gemeinsam in den Zaehler', () => {
        const state = makeState({
            queue: new Array(2).fill({ adId: 'x', title: 't' }),
            total: 5,
            processed: [{ adId: '1' }],
            failed: [{ adId: '2', error: 'x' }]
        });

        renderProgress(state, function () {});

        expect(progressText()).toContain('2 / 5');
    });
});
