import { describe, it, expect, beforeEach } from 'vitest';
import helper from '../helper.user.js';

const { renderConfirm } = helper;

const MATCHES = [
    { adId: '1001', title: 'Fahrrad', endText: '12.09.2026', daysLeft: 48 },
    { adId: '1002', title: 'Buerostuhl', endText: '10.09.2026', daysLeft: 46 },
    { adId: '1003', title: 'Hecke schneiden', endText: '05.09.2026', daysLeft: 41 }
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

function summaryText() {
    return overlay().textContent;
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('renderConfirm – Auswahl', () => {
    it('hakt alle Treffer standardmaessig an', async () => {
        await renderConfirm(MATCHES, [], () => {});
        const cbs = checkboxes();
        expect(cbs).toHaveLength(3);
        expect(cbs.every((c) => c.checked)).toBe(true);
        expect(summaryText()).toContain('3 von 3');
    });

    it('startet nur mit den angehakten Anzeigen', async () => {
        let started = null;
        await renderConfirm(MATCHES, [], (chosen) => { started = chosen; });

        checkboxes()[2].checked = false;
        checkboxes()[2].onchange();

        expect(summaryText()).toContain('2 von 3');
        buttonByText('Start').click();

        expect(started.map((m) => m.adId)).toEqual(['1001', '1002']);
    });

    it('sperrt Start, wenn nichts ausgewaehlt ist', async () => {
        let started = null;
        await renderConfirm(MATCHES, [], (chosen) => { started = chosen; });

        buttonByText('Keine').click();

        expect(checkboxes().every((c) => !c.checked)).toBe(true);
        expect(buttonByText('Start').disabled).toBe(true);

        buttonByText('Start').click();
        expect(started).toBeNull();
    });

    it('stellt mit "Alle" die vollstaendige Auswahl wieder her', async () => {
        let started = null;
        await renderConfirm(MATCHES, [], (chosen) => { started = chosen; });

        buttonByText('Keine').click();
        buttonByText('Alle').click();

        expect(checkboxes().every((c) => c.checked)).toBe(true);
        expect(summaryText()).toContain('3 von 3');

        buttonByText('Start').click();
        expect(started).toHaveLength(3);
    });

    it('zeigt Treffer mit Titel, ID und Enddatum an', async () => {
        await renderConfirm(MATCHES, [], () => {});
        const text = summaryText();
        expect(text).toContain('Hecke schneiden');
        expect(text).toContain('ID 1003');
        expect(text).toContain('05.09.2026');
    });
});
