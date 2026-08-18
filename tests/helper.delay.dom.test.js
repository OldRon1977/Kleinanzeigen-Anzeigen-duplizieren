import { describe, it, expect, beforeEach } from 'vitest';
import helper from '../helper.user.js';

const { renderConfirm, LS_DELAY_KEY, loadDelayConfig, saveDelayConfig } = helper;

const MATCHES = [
    { adId: '1001', title: 'Fahrrad', endText: '12.09.2026', daysLeft: 40, ageDays: 20 },
    { adId: '1002', title: 'Buerostuhl', endText: '22.09.2026', daysLeft: 50, ageDays: 10 },
    { adId: '1003', title: 'Hecke schneiden', endText: '27.09.2026', daysLeft: 55, ageDays: 5 },
    { adId: '1004', title: 'Kaffeemaschine', endText: '30.09.2026', daysLeft: 58, ageDays: 2 }
];

function overlay() {
    return document.getElementById('ka-batch-overlay');
}

function field(name) {
    return overlay().querySelector('input[data-ka-delay=\"' + name + '\"]');
}

function note() {
    return overlay().querySelector('[data-ka-delay-note]');
}

function buttonByText(text) {
    return Array.from(overlay().querySelectorAll('button'))
        .find((b) => b.textContent === text);
}

function checkboxes() {
    return Array.from(overlay().querySelectorAll('input[type=\"checkbox\"]:not([data-ka-gate])'));
}

// Eingabe wie im Browser: Wert setzen, dann das oninput-Handler feuern.
function type(name, value) {
    const input = field(name);
    input.value = value;
    input.oninput();
}

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
});

describe('Pausen-Felder im Overlay', () => {
    it('startet mit den Standardwerten 3 und 6', async () => {
        await renderConfirm(MATCHES, [], () => {});

        expect(field('min').value).toBe('3');
        expect(field('max').value).toBe('6');
    });

    it('uebernimmt gespeicherte Werte statt der Standardwerte', async () => {
        saveDelayConfig({ min: 7, max: 15 });
        await renderConfirm(MATCHES, [], () => {});

        expect(field('min').value).toBe('7');
        expect(field('max').value).toBe('15');
    });

    it('faellt bei kaputtem Speicherinhalt auf die Standardwerte zurueck', async () => {
        localStorage.setItem(LS_DELAY_KEY, '{kein json');
        await renderConfirm(MATCHES, [], () => {});

        expect(field('min').value).toBe('3');
        expect(field('max').value).toBe('6');
    });

    it('speichert eine Aenderung lokal', async () => {
        await renderConfirm(MATCHES, [], () => {});

        type('min', '4');
        type('max', '9');

        expect(loadDelayConfig()).toEqual({ min: 4, max: 9 });
        expect(JSON.parse(localStorage.getItem(LS_DELAY_KEY))).toEqual({ min: 4, max: 9 });
    });

    it('speichert keinen ungueltigen Zwischenstand', async () => {
        saveDelayConfig({ min: 3, max: 6 });
        await renderConfirm(MATCHES, [], () => {});

        type('min', '');

        // Der letzte gueltige Stand bleibt stehen.
        expect(loadDelayConfig()).toEqual({ min: 3, max: 6 });
    });

    it('gibt die eingestellten Grenzen an den Batch weiter', async () => {
        let startedCfg = null;
        await renderConfirm(MATCHES, [], (chosen, cfg) => { startedCfg = cfg; });

        type('min', '2');
        type('max', '5');
        buttonByText('Alle').click();
        buttonByText('Start').click();

        expect(startedCfg).toEqual({ min: 2, max: 5 });
    });
});

describe('Pausen-Felder – Laufzeitschaetzung', () => {
    it('nennt die Spanne aus den eingestellten Grenzen', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('Alle').click();
        // 4 Anzeigen = 3 Pausen, bei 3-6 min also 9-18 Minuten.
        expect(overlay().textContent).toContain('ca. 9-18 Minuten');
    });

    it('rechnet nach einer Aenderung neu', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('Alle').click();
        type('max', '10');
        expect(overlay().textContent).toContain('ca. 9-30 Minuten');
    });
});

describe('Pausen-Felder – Warnung bei 0 und 0', () => {
    it('zeigt im Normalfall nur den grauen Hinweis', async () => {
        await renderConfirm(MATCHES, [], () => {});

        expect(note().dataset.kaLevel).toBe('info');
        expect(note().style.color).toBe('rgb(102, 102, 102)');
        expect(note().textContent).not.toContain('Sperrung');
    });

    it('warnt rot vor der Sperre, sobald beide Werte 0 sind', async () => {
        await renderConfirm(MATCHES, [], () => {});

        type('min', '0');
        type('max', '0');

        expect(note().dataset.kaLevel).toBe('warn');
        expect(note().style.color).toBe('rgb(231, 76, 60)');
        expect(note().textContent).toContain('Sperrung');
        expect(note().textContent).toContain('Kleinanzeigen');
    });

    it('blockiert den Start bei 0 und 0 nicht', async () => {
        let startedCfg = null;
        await renderConfirm(MATCHES, [], (chosen, cfg) => { startedCfg = cfg; });

        type('min', '0');
        type('max', '0');
        buttonByText('Alle').click();

        expect(buttonByText('Start').disabled).toBe(false);
        buttonByText('Start').click();
        expect(startedCfg).toEqual({ min: 0, max: 0 });
    });

    it('nennt in der Zusammenfassung, dass ohne Pause gearbeitet wird', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('Alle').click();
        type('min', '0');
        type('max', '0');

        expect(overlay().textContent).toContain('Ohne Pause');
    });

    it('nimmt die Warnung nach einer Korrektur zurueck', async () => {
        await renderConfirm(MATCHES, [], () => {});

        type('min', '0');
        type('max', '0');
        expect(note().dataset.kaLevel).toBe('warn');

        type('max', '6');
        expect(note().dataset.kaLevel).toBe('info');
        expect(note().textContent).not.toContain('Sperrung');
    });

    it('warnt nicht, wenn nur min 0 ist', async () => {
        await renderConfirm(MATCHES, [], () => {});

        type('min', '0');
        expect(note().dataset.kaLevel).toBe('info');
    });
});

describe('Pausen-Felder – ungueltige Eingabe', () => {
    it('sperrt den Start bei leerem Feld', async () => {
        let started = null;
        await renderConfirm(MATCHES, [], (chosen) => { started = chosen; });

        buttonByText('Alle').click();
        expect(buttonByText('Start').disabled).toBe(false);

        type('max', '');
        expect(note().dataset.kaLevel).toBe('error');
        expect(buttonByText('Start').disabled).toBe(true);

        buttonByText('Start').click();
        expect(started).toBeNull();
    });

    it('meldet verdrehte Grenzen und sperrt den Start', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('Alle').click();
        type('min', '9');

        expect(note().dataset.kaLevel).toBe('error');
        expect(note().textContent).toContain('kleiner oder gleich');
        expect(buttonByText('Start').disabled).toBe(true);
    });

    it('sperrt den Start ueber der Obergrenze', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('Alle').click();
        type('max', '181');

        expect(note().dataset.kaLevel).toBe('error');
        expect(buttonByText('Start').disabled).toBe(true);
    });

    it('gibt den Start nach der Korrektur wieder frei', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('Alle').click();
        type('min', '99');
        expect(buttonByText('Start').disabled).toBe(true);

        type('min', '5');
        expect(buttonByText('Start').disabled).toBe(false);
    });

    it('laesst die Auswahl von der Pausen-Eingabe unberuehrt', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('Alle').click();
        type('min', '');
        type('min', '3');

        expect(checkboxes().every((c) => c.checked)).toBe(true);
        expect(overlay().textContent).toContain('4 von 4');
    });
});
