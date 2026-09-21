import { describe, it, expect, beforeEach } from 'vitest';
import helper from '../helper.user.js';

const {
    buildConfirmHeader,
    buildSourceLine,
    buildAdRow,
    buildAgeLegend,
    buildEstimateHint,
    buildSkippedNote,
    AGE_BANDS,
    AD_RUNTIME_DAYS
} = helper;

// Die Abschnitte des Auswahl-Overlays waren nur ueber das komplette
// renderConfirm erreichbar. Einzeln geprueft laesst sich sagen, welcher
// Abschnitt falsch ist, statt nur dass das Overlay nicht stimmt.

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('buildConfirmHeader', () => {
    it('nennt den Titel und traegt einen Schliessen-Button', () => {
        const header = buildConfirmHeader();
        expect(header.textContent).toContain('Batch Smart Neu-Einstellen');
        expect(header.querySelector('button')).not.toBeNull();
    });
});

describe('buildSourceLine', () => {
    it('entfaellt ohne Reload-Callback', () => {
        expect(buildSourceLine(null)).toBeNull();
        expect(buildSourceLine({ source: 'json' })).toBeNull();
    });

    it('weist einen zwischengespeicherten Stand samt Alter aus', () => {
        const line = buildSourceLine({ fromCache: true, ageSeconds: 42, onReload() {} });
        expect(line.textContent).toContain('zwischengespeichert');
        expect(line.textContent).toContain('42s');
    });

    it('unterscheidet frische JSON-Liste und Seitenansicht', () => {
        expect(buildSourceLine({ source: 'json', onReload() {} }).textContent)
            .toContain('frisch geladen');
        expect(buildSourceLine({ source: 'dom', onReload() {} }).textContent)
            .toContain('Seitenansicht');
    });

    it('ruft den Reload-Callback und sperrt den Knopf gegen Doppelklick', () => {
        let aufrufe = 0;
        const line = buildSourceLine({ source: 'json', onReload() { aufrufe++; } });
        const btn = line.querySelector('button');

        btn.click();
        expect(aufrufe).toBe(1);
        expect(btn.disabled).toBe(true);
    });
});

describe('buildAdRow', () => {
    const basis = { adId: '111', title: 'Fahrrad', daysLeft: 40, ageDays: 20, ageExact: true };

    it('liefert Zeile, sichtbaren Haken und zweiten Haken', () => {
        const row = buildAdRow(basis);
        expect(row.li.tagName).toBe('LI');
        expect(row.cb.type).toBe('checkbox');
        expect(row.cb.checked).toBe(false);
        // Der zweite Haken ist gesetzt und unsichtbar, und er traegt die adId.
        expect(row.gate.checked).toBe(true);
        expect(row.gate.hidden).toBe(true);
        expect(row.gate.dataset.kaGate).toBe('fav');
        expect(row.gate.dataset.adid).toBe('111');
    });

    it('nennt Titel, ID und Alter', () => {
        const row = buildAdRow(basis);
        expect(row.li.textContent).toContain('Fahrrad');
        expect(row.li.textContent).toContain('ID 111');
        expect(row.li.textContent).toContain('20 Tage alt');
    });

    it('markiert ein geschaetztes Alter als solches', () => {
        const exakt = buildAdRow(basis);
        expect(exakt.li.textContent).not.toContain('geschätzt');

        const geschaetzt = buildAdRow(Object.assign({}, basis, { ageExact: false }));
        expect(geschaetzt.li.textContent).toContain('geschätzt');
    });

    it('schreibt den Merk-Status im Klartext', () => {
        expect(buildAdRow(Object.assign({}, basis, { favCount: 0 })).li.textContent)
            .toContain('nicht gemerkt');
        expect(buildAdRow(Object.assign({}, basis, { favCount: 3 })).li.textContent)
            .toContain('3');
    });

    it('setzt den Farbpunkt nach dem Altersband', () => {
        const row = buildAdRow(Object.assign({}, basis, { ageDays: 20 }));
        const dot = row.li.querySelector('.ka-age-dot');
        expect(dot.dataset.band).toBe('sehr-alt');
    });

    it('nennt Enddatum und Aufrufe, wenn sie vorliegen', () => {
        const row = buildAdRow(Object.assign({}, basis, { endText: '15.03.2026', viewCount: 7 }));
        expect(row.li.textContent).toContain('endet 15.03.2026');
        expect(row.li.textContent).toContain('7 Aufrufe');
    });
});

describe('buildAgeLegend', () => {
    it('fuehrt jedes Altersband mit Beschriftung', () => {
        const legend = buildAgeLegend();
        AGE_BANDS.forEach((band) => {
            expect(legend.textContent).toContain(band.label);
        });
    });
});

describe('buildEstimateHint', () => {
    it('entfaellt, wenn jedes Alter exakt ist', () => {
        expect(buildEstimateHint([{ ageExact: true }, { ageExact: true }])).toBeNull();
    });

    it('nennt die Regellaufzeit, sobald ein Alter geschaetzt ist', () => {
        const hint = buildEstimateHint([{ ageExact: true }, { ageExact: false }]);
        expect(hint.textContent).toContain(String(AD_RUNTIME_DAYS));
        expect(hint.textContent).toContain('geschätzt');
    });
});

describe('buildSkippedNote', () => {
    it('entfaellt ohne uebersprungene Karten', () => {
        expect(buildSkippedNote([])).toBeNull();
    });

    it('nennt die Anzahl der uebersprungenen Karten', () => {
        expect(buildSkippedNote([1, 2, 3]).textContent).toContain('3 Karte(n)');
    });
});
