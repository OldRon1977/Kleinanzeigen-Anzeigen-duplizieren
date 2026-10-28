import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';
import { fixture } from './fixtures.js';

// Wiederherstellen gegen das echte Formular "Anzeige aufgeben" Schritt 2
// (Herrenbekleidung, Kategorie 160), live gespeichert und anonymisiert.
// Der Snapshot entsteht aus der echten Bearbeiten-Seite derselben Anzeige.
//
// Was jsdom nicht kann, ist das Verhalten von React hinter den Auswahlknöpfen.
// Das wird hier nachgebildet, aber nur das: Knopf öffnet die echte Liste bzw.
// den echten Dialog, ein Eintrag setzt das versteckte Feld. Welcher Knopf,
// welcher Eintrag und welcher Bestätigen-Knopf gefunden wird, entscheidet der
// Code anhand des echten Markups.

const {
    CONFIG,
    readFormFields,
    findPostAdForm,
    findAttributeButton,
    applySnapshotToForm,
    applyAttributeWidgets,
    optionMatchesValue,
    compareShippingOptions
} = worker;

const EDIT_FORM = fixture('edit-page-form.html');
const STEP2_FORM = fixture('post-ad-step2-form.html');
const LISTBOX_ART = fixture('post-ad-step2-listbox-art.html');
const DIALOG_ZUSTAND = fixture('post-ad-step2-dialog-zustand.html');

// Die Werte, die Kleinanzeigen hinter den Einträgen führt (live gesehen 10/2026).
const KA_VALUES = { Sportbekleidung: 'sportbekleidung' };

function snapshotFromEditPage() {
    window.history.replaceState({}, '', '/p-anzeige-bearbeiten.html?adId=1000000001');
    document.body.innerHTML = EDIT_FORM;
    const ff = readFormFields(document, '1000000001');
    return { adId: '1000000001', title: ff.fields.title, fields: ff.fields, rawFields: ff.rawFields, hiddenFields: ff.hiddenFields, images: [] };
}

function loadStep2() {
    window.history.replaceState({}, '', '/p-anzeige-aufgeben-schritt2.html?categoryId=160');
    document.body.innerHTML = STEP2_FORM;
    return findPostAdForm();
}

function value(name) {
    return document.querySelector('[name="' + name + '"]').value;
}

// React-Verhalten der Liste "Art": Klick öffnet die echte Liste, ein Eintrag
// setzt das versteckte Feld und schließt sie.
function emulateArtListbox() {
    const btn = document.getElementById('kleidung_herren.art');
    const hidden = document.querySelector('[name="attributeMap[kleidung_herren.art]"]');
    const realMenu = new DOMParser().parseFromString(LISTBOX_ART, 'text/html').getElementById('kleidung_herren.art-menu');
    btn.addEventListener('click', () => {
        if (document.getElementById('kleidung_herren.art-menu')) return;
        const menu = document.importNode(realMenu, true);
        menu.querySelectorAll('[role="option"]').forEach((o) => o.addEventListener('click', () => {
            const label = o.textContent.trim();
            hidden.value = KA_VALUES[label] || label.toLowerCase();
            menu.remove();
        }));
        btn.parentElement.appendChild(menu);
    });
}

// React-Verhalten "Zustand": Knopf öffnet den echten Dialog, "Bestätigen"
// übernimmt das gewählte Radio, "Abbrechen"/"Schließen" schließen ohne Wert.
function emulateZustandDialog() {
    const hidden = document.querySelector('[name="attributeMap[kleidung_herren.condition]"]');
    const btn = hidden.parentElement.querySelector('button');
    btn.addEventListener('click', () => {
        const dlg = new DOMParser().parseFromString(DIALOG_ZUSTAND, 'text/html').body.firstElementChild;
        document.body.appendChild(dlg);
        dlg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
            if (b.textContent.trim() === 'Bestätigen') {
                const chosen = dlg.querySelector('input[type="radio"]:checked');
                if (chosen) hidden.value = chosen.value;
            }
            dlg.remove();
        }));
    });
}

beforeEach(() => {
    document.body.innerHTML = '';
    CONFIG.DUPLICATE_READY_SETTLE_MS = 0;
});

afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
});

describe('echtes Formular Schritt 2: Bedienelemente finden', () => {
    it('findet das Formular und für jedes Attribut den richtigen Auswahlknopf', () => {
        const form = loadStep2();
        expect(form).toBeTruthy();
        const btn = (key) => findAttributeButton(document.querySelector('[name="attributeMap[' + key + ']"]'), key);
        expect(btn('kleidung_herren.art').id).toBe('kleidung_herren.art');
        expect(btn('kleidung_herren.groesse').id).toBe('kleidung_herren.groesse');
        expect(btn('kleidung_herren.color').id).toBe('kleidung_herren.color');
        const zustand = btn('kleidung_herren.condition');
        expect(zustand.getAttribute('aria-haspopup')).toBe('dialog');
        expect(zustand.textContent).toContain('Zustand auswählen');
        // Marke ist ein Eingabefeld, kein Auswahlknopf
        expect(btn('kleidung_herren.brand')).toBeNull();
        expect(document.getElementById('kleidung_herren.brand').tagName).toBe('INPUT');
    });

    it('das Formular hat keinen Absende-Knopf vom Typ submit, den ein Ersatzknopf treffen könnte', () => {
        loadStep2();
        expect(document.querySelectorAll('form button[type="submit"]')).toHaveLength(0);
        const send = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Anzeige aufgeben');
        expect(send).toBeTruthy();
        // Kein Attribut-Rahmen enthält den Absende-Knopf
        document.querySelectorAll('input[type="hidden"][name^="attributeMap["]').forEach((h) => {
            expect(h.parentElement.contains(send)).toBe(false);
        });
    });

    it('ordnet den gesicherten Wert genau einem echten Listeneintrag zu', () => {
        const labels = Array.from(new DOMParser().parseFromString(LISTBOX_ART, 'text/html').querySelectorAll('[role="option"]'))
            .map((o) => o.textContent.trim());
        expect(labels.length).toBeGreaterThan(10);
        expect(labels.filter((l) => optionMatchesValue(l, 'sportbekleidung'))).toEqual(['Sportbekleidung']);
        expect(labels.filter((l) => optionMatchesValue(l, 'gibt_es_nicht'))).toEqual([]);
    });
});

describe('Snapshot der echten Bearbeiten-Seite ins echte Formular Schritt 2', () => {
    it('überträgt Texte und Preis, lässt Kategorie, Sitzungswerte und Versandmethoden unberührt', () => {
        const snap = snapshotFromEditPage();
        const form = loadStep2();
        const categoryBefore = value('categoryId');
        const shippingBefore = Array.from(document.querySelectorAll('[name^="shippingOptions["]')).map((e) => e.value);

        const report = applySnapshotToForm(form, snap);

        expect(value('title')).toBe('Testanzeige 1');
        expect(value('description')).toContain('Beschreibung der Testanzeige');
        expect(value('priceAmount')).toBe('10');
        expect(value('zipCode')).toBe('12345');
        expect(value('categoryId')).toBe(categoryBefore);
        expect(Array.from(document.querySelectorAll('[name^="shippingOptions["]')).map((e) => e.value)).toEqual(shippingBefore);
        expect(report.skipped).toEqual(expect.arrayContaining(['adId', 'categoryId']));
        // Attribute setzt nicht applySnapshotToForm, sondern der Weg über die Knöpfe
        expect(value('attributeMap[kleidung_herren.art]')).toBe('');
        expect(report.set.concat(report.kept).some((n) => /csrf|token/i.test(n))).toBe(false);
    });

    it('wählt Art und Zustand über die echten Bedienelemente, nennt die Marke zum Eintragen', async () => {
        const snap = snapshotFromEditPage();
        snap.hiddenFields = {
            'attributeMap[kleidung_herren.art]': 'sportbekleidung',
            'attributeMap[kleidung_herren.condition]': 'like_new',
            'attributeMap[kleidung_herren.brand]': 'sonstige'
        };
        const form = loadStep2();
        emulateArtListbox();
        emulateZustandDialog();
        const report = applySnapshotToForm(form, snap);

        await applyAttributeWidgets(form, snap, report);

        expect(value('attributeMap[kleidung_herren.art]')).toBe('sportbekleidung');
        expect(value('attributeMap[kleidung_herren.condition]')).toBe('like_new');
        expect(document.querySelector('dialog[open]')).toBeNull();
        expect(report.attributes.sort()).toEqual(['attributeMap[kleidung_herren.art]', 'attributeMap[kleidung_herren.condition]']);
        expect(report.unmatched).toEqual([{ name: 'attributeMap[kleidung_herren.brand]', value: 'sonstige', reason: 'widget_unsupported' }]);
    });

    it('Zustand-Wert, den der echte Dialog nicht kennt: Dialog wird geschlossen, nichts gesetzt', async () => {
        const form = loadStep2();
        emulateZustandDialog();
        const snap = { rawFields: {}, hiddenFields: { 'attributeMap[kleidung_herren.condition]': 'kaputt' } };
        const report = applySnapshotToForm(form, snap);
        await applyAttributeWidgets(form, snap, report);
        expect(value('attributeMap[kleidung_herren.condition]')).toBe('');
        expect(document.querySelector('dialog[open]')).toBeNull();
        expect(report.unmatched[0].reason).toBe('no_match');
    });

    it('meldet abweichende Versandmethoden gegen die Vorauswahl des echten Formulars', () => {
        const snap = snapshotFromEditPage();
        const form = loadStep2();
        // Live: die Anzeige hatte nur DHL, das neue Formular wählt drei Methoden vor
        expect(compareShippingOptions(form, snap)).toEqual({
            saved: ['DHL_001'],
            form: ['DHL_001', 'HERMES_001', 'HERMES_002']
        });
    });
});
