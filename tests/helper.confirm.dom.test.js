import { describe, it, expect, beforeEach } from 'vitest';
import helper from '../helper.user.js';

const { renderConfirm } = helper;

// daysLeft -> abgeleitetes Alter (60 - daysLeft):
//   40 -> 20 Tage (dunkelgruen), 50 -> 10 Tage (gruen),
//   55 ->  5 Tage (gelb),        58 ->  2 Tage (rot)
const MATCHES = [
    { adId: '1001', title: 'Fahrrad', endText: '12.09.2026', daysLeft: 40, ageDays: 20 },
    { adId: '1002', title: 'Buerostuhl', endText: '22.09.2026', daysLeft: 50, ageDays: 10 },
    { adId: '1003', title: 'Hecke schneiden', endText: '27.09.2026', daysLeft: 55, ageDays: 5 },
    { adId: '1004', title: 'Kaffeemaschine', endText: '30.09.2026', daysLeft: 58, ageDays: 2 }
];

// renderConfirm ruft listSnapshotMeta() -> indexedDB auf. In jsdom existiert
// kein indexedDB; der Aufruf ist im Produktivcode in try/catch gekapselt und
// die Recovery-Section entfaellt dann einfach.
function overlay() {
    return document.getElementById('ka-batch-overlay');
}

function checkboxes() {
    return Array.from(overlay().querySelectorAll('input[type="checkbox"]'));
}

function buttonByText(text) {
    return Array.from(overlay().querySelectorAll('button'))
        .find((b) => b.textContent === text);
}

function checkedIds() {
    return MATCHES.filter((m, i) => checkboxes()[i].checked).map((m) => m.adId);
}

function summaryText() {
    return overlay().textContent;
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('renderConfirm – Auswahl startet leer', () => {
    it('hakt nichts vor und sperrt Start', async () => {
        await renderConfirm(MATCHES, [], () => {});

        expect(checkboxes()).toHaveLength(4);
        expect(checkboxes().every((c) => !c.checked)).toBe(true);
        expect(summaryText()).toContain('0 von 4');
        expect(buttonByText('Start').disabled).toBe(true);
    });

    it('startet nicht, solange nichts ausgewaehlt ist', async () => {
        let started = null;
        await renderConfirm(MATCHES, [], (chosen) => { started = chosen; });

        buttonByText('Start').click();
        expect(started).toBeNull();
    });

    it('startet mit genau den angehakten Anzeigen', async () => {
        let started = null;
        await renderConfirm(MATCHES, [], (chosen) => { started = chosen; });

        checkboxes()[1].checked = true;
        checkboxes()[1].onchange();

        expect(summaryText()).toContain('1 von 4');
        expect(buttonByText('Start').disabled).toBe(false);

        buttonByText('Start').click();
        expect(started.map((m) => m.adId)).toEqual(['1002']);
    });
});

describe('renderConfirm – Schnellwahl', () => {
    it('"Alle" waehlt alles, "Keine" raeumt wieder ab', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('Alle').click();
        expect(checkedIds()).toEqual(['1001', '1002', '1003', '1004']);
        expect(summaryText()).toContain('4 von 4');

        buttonByText('Keine').click();
        expect(checkedIds()).toEqual([]);
        expect(buttonByText('Start').disabled).toBe(true);
    });

    it('"älter als 7 Tage" nimmt nur die ab 7 Tagen', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('älter als 7 Tage').click();
        expect(checkedIds()).toEqual(['1001', '1002']);
    });

    it('"älter als 14 Tage" nimmt nur die ab 14 Tagen', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('älter als 14 Tage').click();
        expect(checkedIds()).toEqual(['1001']);
    });

    it('ersetzt eine bestehende Auswahl, statt sie zu ergaenzen', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('Alle').click();
        buttonByText('älter als 14 Tage').click();

        expect(checkedIds()).toEqual(['1001']);
        expect(summaryText()).toContain('1 von 4');
    });
});

describe('renderConfirm – Farbcodierung', () => {
    it('vergibt das Farbband nach Alter', async () => {
        await renderConfirm(MATCHES, [], () => {});

        const bands = Array.from(overlay().querySelectorAll('li .ka-age-dot'))
            .map((d) => d.dataset.band);
        expect(bands).toEqual(['sehr-alt', 'alt', 'mittel', 'frisch']);
    });

    it('leitet das Alter aus daysLeft ab, wenn ageDays fehlt', async () => {
        await renderConfirm([{ adId: '9', title: 'Ohne Alter', endText: '01.10.2026', daysLeft: 46 }], [], () => {});

        const dot = overlay().querySelector('li .ka-age-dot');
        expect(dot.dataset.band).toBe('sehr-alt');   // 60 - 46 = 14 Tage
    });

    it('nennt das Alter auch im Text, nicht nur als Farbe', async () => {
        await renderConfirm(MATCHES, [], () => {});
        expect(summaryText()).toContain('20 Tage alt');
        expect(summaryText()).toContain('2 Tage alt');
    });
});

describe('renderConfirm – Bestandsanzeige', () => {
    it('listet alle Anzeigen, nicht nur die alten', async () => {
        await renderConfirm(MATCHES, [], () => {});
        const text = summaryText();
        expect(text).toContain('Kaffeemaschine');   // 2 Tage alt
        expect(text).toContain('Fahrrad');          // 20 Tage alt
        expect(text).toContain('ID 1003');
    });

    it('meldet Karten ohne Datum getrennt', async () => {
        await renderConfirm(MATCHES, [{ adId: 'x', title: 'Kaputt', reason: 'kein Datum' }], () => {});
        expect(summaryText()).toContain('1 Karte(n) ohne Datum übersprungen.');
    });
});
