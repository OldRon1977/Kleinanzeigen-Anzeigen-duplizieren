import { describe, it, expect, beforeEach } from 'vitest';
import helper from '../helper.user.js';

const { collectCandidates, renderConfirm } = helper;

// Integrationstest ueber die gesamte Kette: Karten-Markup -> collectCandidates
// -> renderConfirm -> Start. Bewusst OHNE handgereichte favCount-Werte: die
// uebrigen Overlay-Tests fuettern Objekte, hier kommt alles aus dem Markup.
//
// Das Markup ist der Statistikzeile von "Meine Anzeigen" nachgebaut, der
// Merk-Eintrag stammt 1:1 aus dem Seitenquelltext (Icon mit
// data-title="favoriteOutline", Zaehler als Text daneben).
function favLi(text) {
    return '<li><span class="inline-block-icon">' +
        '<svg viewBox="0 0 24 24" fill="none" data-title="favoriteOutline" stroke="none" ' +
        'role="img" focusable="false" class="shrink-0 fill-current  block align-middle ' +
        'w-medium h-medium text-onSurfaceNonessential"><title>Merkliste</title>' +
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M11.9989 5.06214C11.9648 5.03028Z" ' +
        'fill="currentColor"></path></svg></span>' + text + '</li>';
}

function adCard(adId, title, endDate, favText) {
    return '<li data-testid="ad-card" data-adid="' + adId + '">' +
        '<h3><a href="/s-anzeige/' + adId + '">' + title + '</a></h3>' +
        '<span class="managead-listitem-enddate">' + endDate + '</span>' +
        '<ul class="text-body-small">' +
        '<li><span class="inline-block-icon"></span>142 Aufrufe</li>' +
        (favText === null ? '' : favLi(favText)) +
        '</ul></li>';
}

function overlay() {
    return document.getElementById('ka-batch-overlay');
}

function buttonByText(text) {
    return Array.from(overlay().querySelectorAll('button'))
        .find((b) => b.textContent === text);
}

function gates() {
    return Array.from(overlay().querySelectorAll('input[data-ka-gate="fav"]'));
}

function favToggle() {
    return Array.from(overlay().querySelectorAll('label'))
        .filter((l) => l.textContent.includes('nur nicht gemerkte'))
        .map((l) => l.querySelector('input[type="checkbox"]'))[0];
}

// Enddatum so waehlen, dass das abgeleitete Alter stabil ist, egal wann der
// Test laeuft: Alter = 60 - Restlaufzeit.
function endDateInDays(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return String(d.getDate()).padStart(2, '0') + '.' +
        String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('Kette Markup -> Auswahl -> Start', () => {
    // 2001: 20 Tage alt, nicht gemerkt | 2002: 20 Tage alt, 3x gemerkt
    // 2003:  2 Tage alt, nicht gemerkt | 2004: 20 Tage alt, kein Merk-Eintrag
    function buildPage() {
        document.body.innerHTML =
            '<ul>' +
            adCard('2001', 'Fahrrad', endDateInDays(40), '0 mal gemerkt') +
            adCard('2002', 'Buerostuhl', endDateInDays(40), '3 mal gemerkt') +
            adCard('2003', 'Kaffeemaschine', endDateInDays(58), '0 mal gemerkt') +
            adCard('2004', 'Regal', endDateInDays(40), null) +
            '</ul>';
    }

    it('liest den Merk-Zaehler aus dem Karten-Markup', () => {
        buildPage();
        const { matches } = collectCandidates();

        expect(matches.map((m) => [m.adId, m.favCount])).toEqual([
            ['2001', 0], ['2002', 3], ['2003', 0], ['2004', null]
        ]);
    });

    it('stellt aus echtem Markup heraus nur die alten, nicht gemerkten neu ein', async () => {
        buildPage();
        const { matches, skipped } = collectCandidates();

        let started = null;
        await renderConfirm(matches, skipped, (chosen) => { started = chosen; });

        favToggle().checked = true;
        favToggle().onchange();
        buttonByText('älter als 7 Tage').click();
        buttonByText('Start').click();

        // 2002 ist gemerkt, 2003 zu frisch, 2004 hat keinen lesbaren Zaehler.
        expect(started.map((m) => m.adId)).toEqual(['2001']);
    });

    it('blendet ohne Filter nichts aus und startet alle Alten', async () => {
        buildPage();
        const { matches, skipped } = collectCandidates();

        let started = null;
        await renderConfirm(matches, skipped, (chosen) => { started = chosen; });

        buttonByText('älter als 7 Tage').click();
        buttonByText('Start').click();

        expect(started.map((m) => m.adId)).toEqual(['2001', '2002', '2004']);
    });

    it('zeigt die Checkbox nicht, wenn keine Karte einen Zaehler hat', async () => {
        document.body.innerHTML =
            '<ul>' + adCard('3001', 'Ohne Statistik', endDateInDays(40), null) + '</ul>';
        const { matches, skipped } = collectCandidates();

        await renderConfirm(matches, skipped, () => {});
        expect(favToggle()).toBeUndefined();
    });
});
