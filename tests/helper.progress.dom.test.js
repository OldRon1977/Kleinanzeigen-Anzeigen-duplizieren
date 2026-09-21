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

describe('renderProgress: Stop-Button ueberlebt die Aktualisierung', () => {
    it('behaelt dasselbe Button-Element ueber viele Aktualisierungen', () => {
        const state = makeState({ total: 5, queue: new Array(4).fill({ adId: 'x', title: 't' }) });

        renderProgress(state, function () {});
        const ersterButton = document.querySelector('button');

        // So oft, wie der Ticker in einer kurzen Pause feuert.
        for (let i = 0; i < 30; i++) {
            state.nextEtaText = (30 - i) + 's';
            renderProgress(state, function () {});
        }

        expect(document.querySelector('button')).toBe(ersterButton);
    });

    it('verliert den Klick nicht, wenn zwischendurch aktualisiert wurde', () => {
        const state = makeState({ total: 3, queue: [{ adId: 'x', title: 't' }] });
        let geklickt = 0;
        const onStop = () => { geklickt++; };

        renderProgress(state, onStop);
        const btn = document.querySelector('button');

        state.nextEtaText = '12s';
        renderProgress(state, onStop);
        state.nextEtaText = '11s';
        renderProgress(state, onStop);

        // Der Button aus dem ersten Rendern haengt noch im Dokument und traegt
        // den aktuellen Handler.
        expect(document.body.contains(btn)).toBe(true);
        btn.click();
        expect(geklickt).toBe(1);
    });

    it('zeigt die ETA und blendet sie beim Stop wieder aus', () => {
        const state = makeState({ total: 3, queue: [{ adId: 'x', title: 't' }], nextEtaText: '42s' });

        renderProgress(state, function () {});
        expect(document.body.textContent).toContain('Nächste in: 42s');

        state.stopping = true;
        renderProgress(state, function () {});
        const text = document.body.textContent;
        expect(text).not.toContain('Nächste in');
        expect(text).toContain('Stop angefordert');
    });

    it('sperrt den Stop-Button nach der Anforderung', () => {
        const state = makeState({ total: 2, queue: [{ adId: 'x', title: 't' }] });
        renderProgress(state, function () {});
        expect(document.querySelector('button').disabled).toBe(false);

        state.stopping = true;
        renderProgress(state, function () {});
        const btn = document.querySelector('button');
        expect(btn.disabled).toBe(true);
        expect(btn.textContent).toContain('Wird beendet');
    });

    it('baut neu auf, wenn ein anderes Overlay den Container geleert hat', () => {
        const state = makeState({ total: 2, queue: [{ adId: 'x', title: 't' }] });
        renderProgress(state, function () {});
        const alterButton = document.querySelector('button');

        // Das macht renderConfirm bzw. renderDone mit dem Overlay.
        alterButton.closest('div[id]').innerHTML = '';

        renderProgress(state, function () {});
        const neuerButton = document.querySelector('button');
        expect(neuerButton).not.toBe(alterButton);
        expect(document.body.textContent).toContain('0 / 2');
    });
});
