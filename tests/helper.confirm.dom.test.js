import { describe, it, expect, beforeEach } from 'vitest';
import helper from '../helper.user.js';

const { renderConfirm, LS_PICK_KEY, DEFAULT_PICK_OLDER_DAYS, DEFAULT_PICK_ENDING_DAYS } = helper;

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
    // ohne die unsichtbaren Gate-Checkboxen des Merk-Filters
    return Array.from(overlay().querySelectorAll('input[type="checkbox"]:not([data-ka-gate])'));
}

function gates() {
    return Array.from(overlay().querySelectorAll('input[data-ka-gate="fav"]'));
}

function buttonByText(text) {
    return Array.from(overlay().querySelectorAll('button'))
        .find((b) => b.textContent === text);
}

function checkedIds() {
    return MATCHES.filter((m, i) => checkboxes()[i].checked).map((m) => m.adId);
}

function pickInput(name) {
    return overlay().querySelector('input[data-ka-pick="' + name + '"]');
}

function pickButton(name) {
    return overlay().querySelector('button[data-ka-pick="' + name + '"]');
}

// Wert eintragen wie per Tastatur (oninput) und auf "auswählen" klicken.
function pick(name, days) {
    pickInput(name).value = String(days);
    pickInput(name).oninput();
    pickButton(name).click();
}

function summaryText() {
    return overlay().textContent;
}

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.removeItem(LS_PICK_KEY);
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

        pick('older', 7);
        expect(checkedIds()).toEqual(['1001', '1002']);
    });

    it('"älter als 14 Tage" nimmt nur die ab 14 Tagen', async () => {
        await renderConfirm(MATCHES, [], () => {});

        pick('older', 14);
        expect(checkedIds()).toEqual(['1001']);
    });

    it('"älter als X" schliesst genau X Tage ein', async () => {
        await renderConfirm(MATCHES, [], () => {});

        pick('older', 10);
        expect(checkedIds()).toEqual(['1001', '1002']);
        pick('older', 11);
        expect(checkedIds()).toEqual(['1001']);
    });

    it('"älter als 21 Tage" nimmt keine der Beispielanzeigen', async () => {
        await renderConfirm(MATCHES, [], () => {});

        pick('older', 21);
        expect(checkedIds()).toEqual([]);
        expect(buttonByText('Start').disabled).toBe(true);
    });

    it('"noch max. Y Tage bis Ablauf" nimmt Restlaufzeit bis einschliesslich Y', async () => {
        await renderConfirm(MATCHES, [], () => {});

        pick('ending', 50);
        expect(checkedIds()).toEqual(['1001', '1002']);
        pick('ending', 49);
        expect(checkedIds()).toEqual(['1001']);
    });

    it('"noch max. Y Tage" nimmt Abgelaufene mit, Anzeigen ohne Enddatum nicht', async () => {
        const list = [
            { adId: '2001', title: 'Abgelaufen', endText: '01.09.2026', daysLeft: -2, ageDays: 62 },
            { adId: '2002', title: 'Heute', endText: '03.09.2026', daysLeft: 0, ageDays: 60 },
            { adId: '2003', title: 'Ohne Ende', endText: '', daysLeft: null, ageDays: 30 },
            { adId: '2004', title: 'Laeuft lang', endText: '30.10.2026', daysLeft: 57, ageDays: 3 }
        ];
        await renderConfirm(list, [], () => {});

        pick('ending', 5);
        const ids = list.filter((m, i) => checkboxes()[i].checked).map((m) => m.adId);
        expect(ids).toEqual(['2001', '2002']);
    });

    it('ersetzt eine bestehende Auswahl, statt sie zu ergaenzen', async () => {
        await renderConfirm(MATCHES, [], () => {});

        buttonByText('Alle').click();
        pick('older', 14);

        expect(checkedIds()).toEqual(['1001']);
        expect(summaryText()).toContain('1 von 4');
    });

    it('sperrt "auswählen" bei ungueltigem Wert und laesst die Auswahl stehen', async () => {
        await renderConfirm(MATCHES, [], () => {});

        pick('older', 14);
        for (const bad of ['', '-1', '2.5', 'abc', '366']) {
            pickInput('older').value = bad;
            pickInput('older').oninput();
            expect(pickButton('older').disabled).toBe(true);
            pickButton('older').click();
            // Der Handler prueft selbst noch einmal, auch ohne Sperre.
            pickButton('older').onclick();
            expect(checkedIds()).toEqual(['1001']);
        }
    });

    it('startet mit den Standardwerten, solange nichts gespeichert ist', async () => {
        await renderConfirm(MATCHES, [], () => {});

        expect(pickInput('older').value).toBe(String(DEFAULT_PICK_OLDER_DAYS));
        expect(pickInput('ending').value).toBe(String(DEFAULT_PICK_ENDING_DAYS));
    });

    it('merkt sich gueltige Werte fuer das naechste Oeffnen, ungueltige nicht', async () => {
        await renderConfirm(MATCHES, [], () => {});
        pick('older', 21);
        pick('ending', 3);
        pickInput('ending').value = 'x';
        pickInput('ending').oninput();

        document.body.innerHTML = '';
        await renderConfirm(MATCHES, [], () => {});

        expect(pickInput('older').value).toBe('21');
        expect(pickInput('ending').value).toBe('3');
    });
});

describe('renderConfirm – Hinweis gegen zu schnelles Neu-Einstellen', () => {
    function pickNote() {
        return overlay().querySelector('[data-ka-pick-note]');
    }

    it('steht grau als Empfehlung da, solange nichts Junges gewaehlt ist', async () => {
        await renderConfirm(MATCHES, [], () => {});

        expect(pickNote().dataset.kaLevel).toBe('info');
        expect(pickNote().textContent).toContain('7 bis 14 Tage');
        pick('older', 7);
        expect(pickNote().dataset.kaLevel).toBe('info');
    });

    it('wird rot und nennt die Zahl, sobald Anzeigen unter 7 Tagen gewaehlt sind', async () => {
        await renderConfirm(MATCHES, [], () => {});

        pick('older', 0);
        expect(pickNote().dataset.kaLevel).toBe('warn');
        expect(pickNote().textContent).toContain('2 ausgewählte Anzeige(n)');
        expect(pickNote().textContent).toContain('Sperrung');
    });

    it('reagiert auch auf einzelnes Anhaken und auf "Keine"', async () => {
        await renderConfirm(MATCHES, [], () => {});

        checkboxes()[3].checked = true;           // 1004, 2 Tage alt
        checkboxes()[3].onchange();
        expect(pickNote().dataset.kaLevel).toBe('warn');
        expect(pickNote().textContent).toContain('1 ausgewählte Anzeige(n)');

        buttonByText('Keine').click();
        expect(pickNote().dataset.kaLevel).toBe('info');
    });

    it('zaehlt genau 7 Tage nicht als zu jung', async () => {
        await renderConfirm([{ adId: '7', title: 'Sieben', endText: '', daysLeft: 53, ageDays: 7 }], [], () => {});

        buttonByText('Alle').click();
        expect(pickNote().dataset.kaLevel).toBe('info');
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

// Wie MATCHES, zusaetzlich mit Merklisten-Zaehler:
//   1001 (20 Tage) nicht gemerkt   1002 (10 Tage) 2x gemerkt
//   1003 ( 5 Tage) nicht gemerkt   1004 ( 2 Tage) nicht gemerkt
const MATCHES_FAV = MATCHES.map((m, i) => ({ ...m, favCount: [0, 2, 0, 0][i] }));

function visibleIds() {
    return MATCHES.filter((m, i) => !checkboxes()[i].closest('li').hidden).map((m) => m.adId);
}

function favToggle() {
    return Array.from(overlay().querySelectorAll('label'))
        .filter((l) => l.textContent.includes('nur nicht gemerkte'))
        .map((l) => l.querySelector('input[type="checkbox"]'))[0];
}

describe('renderConfirm – Zusatzfilter "nur nicht gemerkte"', () => {
    it('bietet den Filter nur an, wenn ein Zaehler gelesen werden konnte', async () => {
        await renderConfirm(MATCHES, [], () => {});
        expect(favToggle()).toBeUndefined();

        document.body.innerHTML = '';
        await renderConfirm(MATCHES_FAV, [], () => {});
        expect(favToggle()).toBeDefined();
    });

    // Der kritische Fall: erst "Alle", dann filtern. Was der Start-Button
    // uebergibt, MUSS der sichtbaren Liste entsprechen -- eine ausgeblendete
    // Anzeige darf unter keinen Umstaenden neu eingestellt werden.
    it('startet nach "Alle" + Filter nur die sichtbaren Anzeigen', async () => {
        let started = null;
        await renderConfirm(MATCHES_FAV, [], (chosen) => { started = chosen; });

        buttonByText('Alle').click();
        favToggle().checked = true;
        favToggle().onchange();

        buttonByText('Start').click();
        expect(started.map((m) => m.adId)).toEqual(['1001', '1003', '1004']);
        expect(started.map((m) => m.adId)).not.toContain('1002');
        expect(started.map((m) => m.adId)).toEqual(visibleIds());
    });

    it('startet auch bei unlesbarem Zaehler nur die sichtbaren Anzeigen', async () => {
        let started = null;
        const mixed = MATCHES.map((m, i) => ({ ...m, favCount: [0, 2, null, 0][i] }));
        await renderConfirm(mixed, [], (chosen) => { started = chosen; });

        buttonByText('Alle').click();
        favToggle().checked = true;
        favToggle().onchange();

        buttonByText('Start').click();
        expect(started.map((m) => m.adId)).toEqual(['1001', '1004']);
        expect(started.map((m) => m.adId)).toEqual(visibleIds());
    });

    it('blendet gemerkte Anzeigen aus und wieder ein', async () => {
        await renderConfirm(MATCHES_FAV, [], () => {});
        expect(visibleIds()).toEqual(['1001', '1002', '1003', '1004']);

        favToggle().checked = true;
        favToggle().onchange();
        expect(visibleIds()).toEqual(['1001', '1003', '1004']);   // 1002 ist gemerkt

        favToggle().checked = false;
        favToggle().onchange();
        expect(visibleIds()).toEqual(['1001', '1002', '1003', '1004']);
    });

    it('stellt beim Einblenden die vorherige Auswahl wieder her', async () => {
        await renderConfirm(MATCHES_FAV, [], () => {});

        buttonByText('Alle').click();
        expect(checkedIds()).toEqual(['1001', '1002', '1003', '1004']);

        // Ausblenden nimmt das gemerkte 1002 aus der Auswahl ...
        favToggle().checked = true;
        favToggle().onchange();
        expect(checkedIds()).toEqual(['1001', '1003', '1004']);

        // ... Einblenden bringt genau diesen Stand zurueck.
        favToggle().checked = false;
        favToggle().onchange();
        expect(checkedIds()).toEqual(['1001', '1002', '1003', '1004']);
    });

    it('zaehlt nur die sichtbaren Anzeigen und nennt die ausgeblendeten', async () => {
        await renderConfirm(MATCHES_FAV, [], () => {});

        favToggle().checked = true;
        favToggle().onchange();
        buttonByText('Alle').click();

        expect(summaryText()).toContain('3 von 3');
        expect(summaryText()).toContain('1 Anzeige(n) ausgeblendet');
    });

    it('kombiniert sich mit der Schnellwahl statt sie zu ersetzen', async () => {
        await renderConfirm(MATCHES_FAV, [], () => {});

        favToggle().checked = true;
        favToggle().onchange();
        pick('older', 7);

        // 1001 und 1002 sind alt genug, 1002 ist aber gemerkt.
        expect(checkedIds()).toEqual(['1001']);
    });

    it('waehlt ohne Filter weiterhin auch gemerkte Anzeigen', async () => {
        await renderConfirm(MATCHES_FAV, [], () => {});

        pick('older', 7);
        expect(checkedIds()).toEqual(['1001', '1002']);
    });

    it('nimmt ausgeblendete Anzeigen aus der Auswahl', async () => {
        await renderConfirm(MATCHES_FAV, [], () => {});

        buttonByText('Alle').click();
        expect(checkedIds()).toEqual(['1001', '1002', '1003', '1004']);

        favToggle().checked = true;
        favToggle().onchange();
        expect(checkedIds()).toEqual(['1001', '1003', '1004']);
        expect(summaryText()).toContain('3 von 3');
    });

    it('haelt beim Einblenden nur zurueck, was vorher schon abgewaehlt war', async () => {
        await renderConfirm(MATCHES_FAV, [], () => {});

        // 1002 war beim Ausblenden NICHT angehakt (Auswahl war leer), ...
        favToggle().checked = true;
        favToggle().onchange();
        buttonByText('Alle').click();
        expect(checkedIds()).toEqual(['1001', '1003', '1004']);

        // ... also kommt es beim Einblenden auch nicht angehakt zurueck.
        favToggle().checked = false;
        favToggle().onchange();
        expect(visibleIds()).toContain('1002');
        expect(checkedIds()).toEqual(['1001', '1003', '1004']);
    });

    it('laesst Anzeigen ohne lesbaren Zaehler bei aktivem Filter aussen vor', async () => {
        const mixed = [
            { ...MATCHES[0], favCount: 0 },
            { ...MATCHES[1], favCount: null }
        ];
        await renderConfirm(mixed, [], () => {});

        favToggle().checked = true;
        favToggle().onchange();
        buttonByText('Alle').click();

        expect(checkboxes()[0].checked).toBe(true);
        expect(checkboxes()[1].checked).toBe(false);
        expect(checkboxes()[1].closest('li').hidden).toBe(true);
    });

    it('nennt den Merk-Status im Text der Anzeige', async () => {
        await renderConfirm(MATCHES_FAV, [], () => {});
        expect(summaryText()).toContain('nicht gemerkt');
        expect(summaryText()).toContain('2\u00D7 gemerkt');
    });

    it('schreibt keinen Merk-Status, wenn der Zaehler fehlt', async () => {
        await renderConfirm(MATCHES, [], () => {});
        expect(summaryText()).not.toContain('gemerkt');
    });
});

// Diese Tests erzeugen absichtlich einen Zustand, den der Filter selbst nie
// herstellt: Zeile unsichtbar, Checkbox trotzdem angehakt. Sie pruefen also
// nicht den Filter, sondern das Netz darunter -- den Fall "im Modell steht
// etwas anderes als auf dem Bildschirm".
describe('renderConfirm – Sicherheitsnetz sichtbar UND angehakt', () => {
    it('startet keine Anzeige, deren Zeile per hidden-Attribut verschwunden ist', async () => {
        let started = null;
        await renderConfirm(MATCHES_FAV, [], (chosen) => { started = chosen; });

        buttonByText('Alle').click();
        expect(checkedIds()).toEqual(['1001', '1002', '1003', '1004']);

        // Am Filter vorbei manipuliert: sichtbar weg, Haken bleibt.
        checkboxes()[1].closest('li').hidden = true;

        buttonByText('Start').click();
        expect(started.map((m) => m.adId)).toEqual(['1001', '1003', '1004']);
    });

    it('startet keine Anzeige, deren Zeile per display:none verschwunden ist', async () => {
        let started = null;
        await renderConfirm(MATCHES_FAV, [], (chosen) => { started = chosen; });

        buttonByText('Alle').click();
        checkboxes()[3].closest('li').style.display = 'none';

        buttonByText('Start').click();
        expect(started.map((m) => m.adId)).toEqual(['1001', '1002', '1003']);
    });

    it('startet keine Anzeige, deren Haken weg ist, obwohl das Modell sie fuehrt', async () => {
        let started = null;
        await renderConfirm(MATCHES_FAV, [], (chosen) => { started = chosen; });

        buttonByText('Alle').click();
        checkboxes()[0].checked = false;   // ohne onchange, Modell bleibt stehen

        buttonByText('Start').click();
        expect(started.map((m) => m.adId)).toEqual(['1002', '1003', '1004']);
    });

    it('nennt in der Zusammenfassung dieselbe Zahl, die auch gestartet wird', async () => {
        let started = null;
        await renderConfirm(MATCHES_FAV, [], (chosen) => { started = chosen; });

        buttonByText('Alle').click();
        expect(summaryText()).toContain('4 von 4');

        // Ausblenden ueber den Filter: Zahl und Start muessen zusammenpassen.
        favToggle().checked = true;
        favToggle().onchange();
        expect(summaryText()).toContain('3 von 3');

        buttonByText('Start').click();
        expect(started).toHaveLength(3);
    });

    it('startet gar nicht, wenn alles Angehakte unsichtbar ist', async () => {
        let started = null;
        await renderConfirm(MATCHES_FAV, [], (chosen) => { started = chosen; });

        buttonByText('Alle').click();
        // nur die Anzeigen-Checkboxen, nicht die Filter-Checkbox darunter
        checkboxes().slice(0, MATCHES_FAV.length)
            .forEach((cb) => { cb.closest('li').hidden = true; });

        buttonByText('Start').click();
        expect(started).toBeNull();
    });
});

// Der zweite Haken ist nur dann ein Sicherheitsnetz, wenn er NICHT dasselbe Bit
// wie der sichtbare Haken ist. Diese Tests trennen die beiden gezielt.
describe('renderConfirm – zweiter, unsichtbarer Haken', () => {
    it('existiert je Anzeige, unsichtbar und ausserhalb der Tastaturreihenfolge', async () => {
        await renderConfirm(MATCHES_FAV, [], () => {});

        expect(gates()).toHaveLength(MATCHES_FAV.length);
        gates().forEach((g) => {
            expect(g.hidden).toBe(true);
            expect(g.tabIndex).toBe(-1);
            expect(g.getAttribute('aria-hidden')).toBe('true');
        });
    });

    it('haengt am Merk-Filter, nicht an der Auswahl des Nutzers', async () => {
        await renderConfirm(MATCHES_FAV, [], () => {});

        // Ohne Filter erlaubt der zweite Haken alles ...
        expect(gates().map((g) => g.checked)).toEqual([true, true, true, true]);

        // ... auch dann, wenn der Nutzer gar nichts angehakt hat.
        buttonByText('Keine').click();
        expect(gates().map((g) => g.checked)).toEqual([true, true, true, true]);

        // Erst der Filter schliesst das gemerkte 1002.
        favToggle().checked = true;
        favToggle().onchange();
        expect(gates().map((g) => g.checked)).toEqual([true, false, true, true]);

        favToggle().checked = false;
        favToggle().onchange();
        expect(gates().map((g) => g.checked)).toEqual([true, true, true, true]);
    });

    it('verarbeitet keine Anzeige, deren zweiter Haken fehlt', async () => {
        let started = null;
        await renderConfirm(MATCHES_FAV, [], (chosen) => { started = chosen; });

        buttonByText('Alle').click();
        // Sichtbar angehakt, sichtbar in der Liste, im Auswahl-Set --
        // nur der zweite Haken fehlt.
        gates()[2].checked = false;

        buttonByText('Start').click();
        expect(started.map((m) => m.adId)).toEqual(['1001', '1002', '1004']);
    });

    it('verarbeitet auch dann nichts Gemerktes, wenn der zweite Haken faelschlich gesetzt ist', async () => {
        let started = null;
        await renderConfirm(MATCHES_FAV, [], (chosen) => { started = chosen; });

        buttonByText('Alle').click();
        favToggle().checked = true;
        favToggle().onchange();

        // Buchfuehrungsfehler simulieren: gemerkte Anzeige wieder sichtbar,
        // beide Haken gesetzt, im Auswahl-Set. Nur die Ableitung aus favCount
        // widerspricht noch.
        const li = checkboxes()[1].closest('li');
        li.hidden = false;
        li.style.display = '';
        checkboxes()[1].checked = true;
        checkboxes()[1].onchange();
        gates()[1].checked = true;

        buttonByText('Start').click();
        expect(started.map((m) => m.adId)).not.toContain('1002');
        expect(started.map((m) => m.adId)).toEqual(['1001', '1003', '1004']);
    });
});
