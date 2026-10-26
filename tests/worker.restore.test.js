import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const {
    CONFIG,
    restoreAdIdFromHash,
    isPostAdStep1Page,
    isPostAdStep2Page,
    findPostAdForm,
    applySnapshotToForm,
    optionMatchesValue,
    applyAttributeWidgets,
    applyImagesToForm,
    completeSnapshotImages,
    restoreFromSnapshot,
    handleRestorePages,
    handleConfirmationPage,
    batchPutSnapshot,
    batchGetSnapshot,
    RESTORE_MARKER_KEY,
    RESTORE_PENDING_KEY,
    LS_RESTORE_RESULT_PREFIX,
    RESTORE_PANEL_ID
} = worker;

// Formular "Anzeige aufgeben" (Schritt 2), Feldnamen wie live 10/2026:
// Radios fuer Angebot/Gesuch, Versand und Direkt-kaufen, Hidden-Felder fuer
// Kategorie, Attribute und Preistyp, ein Datei-Feld ohne Namen.
function postAdForm() {
    document.body.innerHTML = `
        <form>
            <input type="radio" name="adType" value="OFFER" checked>
            <input type="radio" name="adType" value="WANTED">
            <input type="file" multiple>
            <input name="title" value="">
            <input type="hidden" name="categoryId" value="20">
            <input type="hidden" name="attributeMap[kinderzimmermoebel.art]" value="">
            <input type="hidden" name="attributeMap[kinderzimmermoebel.color]" value="">
            <textarea name="description"></textarea>
            <input type="radio" name="attributeMap[kinderzimmermoebel.versand]" value="ja" checked>
            <input type="radio" name="attributeMap[kinderzimmermoebel.versand]" value="nein">
            <input name="priceAmount" value="">
            <input type="hidden" name="priceType" value="FIXED">
            <input type="radio" name="buyNow" value="true" checked>
            <input type="radio" name="buyNow" value="false">
            <input type="hidden" name="buyNowEligible" value="true">
            <input name="zipCode" value="">
            <input type="checkbox" name="addressVisibility" value="on">
            <input name="streetName" value="">
            <input type="hidden" name="locationId" value="1">
            <input name="contactName" value="">
            <input type="checkbox" name="articles" value="0:866">
            <input type="hidden" name="adId" value="">
            <input type="hidden" name="_csrf" value="token">
        </form>`;
    return document.querySelector('form');
}

function snapshot(overrides) {
    return Object.assign({
        adId: '3505764979',
        capturedAt: 1761412689092,
        title: 'Kinderbett Bauernbett',
        fields: { title: 'Kinderbett Bauernbett', description: 'Zum Verkauf steht ein Bett.', price: '50', location: '21521' },
        rawFields: {
            adType: 'OFFER',
            title: 'Kinderbett Bauernbett',
            description: 'Zum Verkauf steht ein Bett.',
            'attributeMap[kinderzimmermoebel.versand]': 'nein',
            priceAmount: '50',
            buyNow: 'false',
            zipCode: '21521',
            addressVisibility: 'on',
            contactName: 'Karl'
        },
        hiddenFields: {
            categoryId: '20',
            'attributeMap[kinderzimmermoebel.art]': 'betten_wiegen',
            priceType: 'NEGOTIABLE',
            buyNowEligible: 'true',
            locationId: '20984'
        },
        images: []
    }, overrides || {});
}

function value(name) {
    return document.querySelector('[name="' + name + '"]').value;
}

function checkedValue(name) {
    const el = Array.from(document.querySelectorAll('[name="' + name + '"]')).find((e) => e.checked);
    return el ? el.value : null;
}

function setPage(path) {
    window.history.replaceState({}, '', path);
}

beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    CONFIG.DUPLICATE_READY_SETTLE_MS = 0;
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setPage('/');
});

describe('restoreAdIdFromHash', () => {
    it('liest die adId aus #kaRestore=<adId>', () => {
        expect(restoreAdIdFromHash('#kaRestore=3505764979')).toBe('3505764979');
    });

    it('akzeptiert nur Ziffern', () => {
        expect(restoreAdIdFromHash('#kaRestore=abc')).toBeNull();
        expect(restoreAdIdFromHash('#kaRestore=')).toBeNull();
        expect(restoreAdIdFromHash('#kaRestore=12 34')).toBeNull();
    });

    it('ignoriert andere Hashes', () => {
        expect(restoreAdIdFromHash('#smartRepublish')).toBeNull();
        expect(restoreAdIdFromHash('#duplicate')).toBeNull();
        expect(restoreAdIdFromHash('')).toBeNull();
        expect(restoreAdIdFromHash(undefined)).toBeNull();
    });
});

describe('Seiten-Erkennung "Anzeige aufgeben"', () => {
    it('unterscheidet Schritt 1 und Schritt 2', () => {
        expect(isPostAdStep1Page({ pathname: '/p-anzeige-aufgeben.html' })).toBe(true);
        expect(isPostAdStep1Page({ pathname: '/p-anzeige-aufgeben-schritt2.html' })).toBe(false);
        expect(isPostAdStep2Page({ pathname: '/p-anzeige-aufgeben-schritt2.html' })).toBe(true);
        expect(isPostAdStep2Page({ pathname: '/p-anzeige-aufgeben.html' })).toBe(false);
        expect(isPostAdStep1Page({ pathname: '/p-anzeige-bearbeiten.html' })).toBe(false);
    });

    it('findet das Formular ueber das Titelfeld', () => {
        expect(findPostAdForm()).toBeNull();
        const form = postAdForm();
        expect(findPostAdForm()).toBe(form);
    });
});

describe('applySnapshotToForm', () => {
    it('traegt Texte, Preis, Ort und Kontakt ein', () => {
        const form = postAdForm();
        const report = applySnapshotToForm(form, snapshot());

        expect(value('title')).toBe('Kinderbett Bauernbett');
        expect(value('description')).toBe('Zum Verkauf steht ein Bett.');
        expect(value('priceAmount')).toBe('50');
        expect(value('zipCode')).toBe('21521');
        expect(value('contactName')).toBe('Karl');
        expect(report.set).toEqual(expect.arrayContaining(['title', 'description', 'priceAmount', 'zipCode', 'contactName']));
    });

    it('schaltet Radios und Kaestchen wie per Klick um', () => {
        const form = postAdForm();
        applySnapshotToForm(form, snapshot());

        expect(checkedValue('attributeMap[kinderzimmermoebel.versand]')).toBe('nein');
        expect(checkedValue('buyNow')).toBe('false');
        expect(document.querySelector('[name="addressVisibility"]').checked).toBe(true);
    });

    it('laesst stehen, was schon stimmt, und meldet es als kept', () => {
        const form = postAdForm();
        const report = applySnapshotToForm(form, snapshot());
        // adType=OFFER war vorausgewaehlt
        expect(report.kept).toContain('adType');
        expect(checkedValue('adType')).toBe('OFFER');
    });

    it('setzt versteckte Attribute und den Preistyp aus hiddenFields', () => {
        const form = postAdForm();
        const report = applySnapshotToForm(form, snapshot());

        expect(value('attributeMap[kinderzimmermoebel.art]')).toBe('betten_wiegen');
        expect(value('priceType')).toBe('NEGOTIABLE');
        expect(report.attributes).toEqual(['attributeMap[kinderzimmermoebel.art]']);
    });

    it('fasst Kategorie, Sitzungswerte und kostenpflichtige Extras nicht an', () => {
        const form = postAdForm();
        const snap = snapshot({
            hiddenFields: Object.assign({}, snapshot().hiddenFields, { categoryId: '99', adId: '3505764979' }),
            rawFields: Object.assign({}, snapshot().rawFields, { articles: '0:866' })
        });
        const report = applySnapshotToForm(form, snap);

        expect(value('categoryId')).toBe('20');
        expect(value('locationId')).toBe('1');
        expect(value('adId')).toBe('');
        expect(document.querySelector('[name="articles"]').checked).toBe(false);
        expect(report.skipped).toEqual(expect.arrayContaining(['categoryId', 'locationId', 'buyNowEligible', 'articles', 'adId']));
    });

    it('meldet Felder, die das Formular nicht hat, statt zu scheitern', () => {
        const form = postAdForm();
        const snap = snapshot({
            rawFields: Object.assign({}, snapshot().rawFields, { 'attributeMap[fahrrad.typ]': 'kinder', buyNow: 'vielleicht' })
        });
        const report = applySnapshotToForm(form, snap);

        expect(report.missing).toContain('attributeMap[fahrrad.typ]');
        // Radio ohne passende Option: nicht gesetzt, als fehlend gemeldet
        expect(report.missing).toContain('buyNow');
        expect(checkedValue('buyNow')).toBe('true');
    });

    it('ueberschreibt kein sichtbares Feld aus einem versteckten Wert', () => {
        const form = postAdForm();
        const snap = snapshot({ rawFields: { priceAmount: '50' }, hiddenFields: { title: 'Versteckter Titel' } });
        const report = applySnapshotToForm(form, snap);

        expect(value('title')).toBe('');
        expect(report.missing).toContain('title');
    });

    it('kommt mit Snapshots ohne hiddenFields aus (Hauptscript < 3.11.0)', () => {
        const form = postAdForm();
        const snap = snapshot();
        delete snap.hiddenFields;
        const report = applySnapshotToForm(form, snap);

        expect(value('title')).toBe('Kinderbett Bauernbett');
        expect(value('priceType')).toBe('FIXED');
        expect(report.attributes).toEqual([]);
    });

    it('loest input- und change-Events aus, damit React die Werte uebernimmt', () => {
        const form = postAdForm();
        const seen = [];
        form.querySelector('[name="title"]').addEventListener('input', () => seen.push('input'));
        form.querySelector('[name="title"]').addEventListener('change', () => seen.push('change'));
        applySnapshotToForm(form, snapshot());
        expect(seen).toEqual(['input', 'change']);
    });
});

describe('optionMatchesValue', () => {
    it('ordnet Listeneintraege ihren Werten zu (live gesehen 10/2026)', () => {
        expect(optionMatchesValue('Betten & Wiegen', 'betten_wiegen')).toBe(true);
        expect(optionMatchesValue('Hochstühle & Laufställe', 'hochstuehle_laufstaelle')).toBe(true);
        expect(optionMatchesValue('Schränke & Kommoden', 'schraenke_kommoden')).toBe(true);
        expect(optionMatchesValue('Grün', 'grün')).toBe(true);
        expect(optionMatchesValue('Burgunderrot', 'burgunderrot')).toBe(true);
        expect(optionMatchesValue('Weitere Kinderzimmermöbel', 'sonstige')).toBe(true);
    });

    it('greift nicht daneben', () => {
        expect(optionMatchesValue('Blau', 'braun')).toBe(false);
        expect(optionMatchesValue('Bitte wählen', '')).toBe(false);
        expect(optionMatchesValue('Betten & Wiegen', 'wiegen')).toBe(false);
        expect(optionMatchesValue('Weitere Kinderzimmermöbel', 'betten_wiegen')).toBe(false);
    });
});

describe('applyAttributeWidgets', () => {
    // Nachbau der Kleinanzeigen-Widgets: Listbox mit Eintraegen ohne Wert,
    // deren Klick (wie React) das versteckte Feld setzt; Dialog mit Radios.
    function listbox(key, labels) {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <input type="hidden" name="attributeMap[${key}]" value="">
            <button type="button" id="${key}" role="combobox" aria-expanded="false">Bitte wählen</button>
            <ul id="${key}-menu" role="listbox" hidden></ul>`;
        const hidden = wrap.querySelector('input');
        const btn = wrap.querySelector('button');
        const menu = wrap.querySelector('ul');
        btn.addEventListener('click', () => {
            const open = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', open ? 'false' : 'true');
            menu.hidden = open;
        });
        labels.forEach((label, i) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            li.id = `${key}-menu-option-${i}`;
            li.textContent = label;
            li.addEventListener('click', () => {
                hidden.value = label.value;
                btn.textContent = label;
                btn.setAttribute('aria-expanded', 'false');
                menu.hidden = true;
            });
            menu.appendChild(li);
        });
        return wrap;
    }
    function opt(label, value) { const s = new String(label); s.value = value; return s; }

    function dialogWidget(key, radios) {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <input type="hidden" name="attributeMap[${key}]" value="">
            <button type="button" aria-haspopup="dialog">Zustand auswählen</button>`;
        const hidden = wrap.querySelector('input');
        wrap.querySelector('button').addEventListener('click', () => {
            const dlg = document.createElement('div');
            dlg.setAttribute('role', 'dialog');
            dlg.innerHTML = radios.map((r) => `<label><input type="radio" name="zustand" value="${r}">${r}</label>`).join('') +
                '<button type="button" aria-label="Schließen">x</button><button type="button">Abbrechen</button><button type="button">Bestätigen</button>';
            const buttons = dlg.querySelectorAll('button');
            buttons[0].addEventListener('click', () => dlg.remove());
            buttons[1].addEventListener('click', () => dlg.remove());
            buttons[2].addEventListener('click', () => {
                const chosen = dlg.querySelector('input:checked');
                if (chosen) hidden.value = chosen.value;
                dlg.remove();
            });
            document.body.appendChild(dlg);
        });
        return wrap;
    }

    function formWith(...widgets) {
        document.body.innerHTML = '<form><input name="title"></form>';
        const form = document.querySelector('form');
        widgets.forEach((w) => form.appendChild(w));
        return form;
    }

    it('waehlt den passenden Listeneintrag und prueft den Wert', async () => {
        const form = formWith(listbox('kinderzimmermoebel.art', [opt('Bitte wählen', ''), opt('Betten & Wiegen', 'betten_wiegen'), opt('Schränke & Kommoden', 'schraenke_kommoden')]));
        const report = { set: [], kept: [], missing: [], skipped: [], attributes: [] };
        await applyAttributeWidgets(form, { rawFields: {}, hiddenFields: { 'attributeMap[kinderzimmermoebel.art]': 'betten_wiegen' } }, report);

        expect(value('attributeMap[kinderzimmermoebel.art]')).toBe('betten_wiegen');
        expect(document.getElementById('kinderzimmermoebel.art').textContent).toBe('Betten & Wiegen');
        expect(report.attributes).toEqual(['attributeMap[kinderzimmermoebel.art]']);
        expect(report.unmatched).toEqual([]);
    });

    it('meldet einen Wert ohne passenden Eintrag und schliesst die Liste wieder', async () => {
        const form = formWith(listbox('kinderzimmermoebel.color', [opt('Bitte wählen', ''), opt('Blau', 'blau')]));
        const report = { set: [], kept: [], missing: [], skipped: [], attributes: ['attributeMap[kinderzimmermoebel.color]'] };
        await applyAttributeWidgets(form, { rawFields: {}, hiddenFields: { 'attributeMap[kinderzimmermoebel.color]': 'lila' } }, report);

        expect(value('attributeMap[kinderzimmermoebel.color]')).toBe('');
        expect(report.attributes).toEqual([]);
        expect(report.unmatched).toEqual([{ name: 'attributeMap[kinderzimmermoebel.color]', value: 'lila', reason: 'no_match' }]);
        expect(document.getElementById('kinderzimmermoebel.color').getAttribute('aria-expanded')).toBe('false');
    });

    it('nimmt einen Fehlgriff zurueck, wenn das Feld danach einen anderen Wert traegt', async () => {
        // Eintrag "Weitere …" liefert hier nicht "sonstige", sondern etwas anderes
        const form = formWith(listbox('kinderzimmermoebel.art', [opt('Bitte wählen', ''), opt('Weitere Kinderzimmermöbel', 'rest')]));
        const report = { set: [], kept: [], missing: [], skipped: [], attributes: [] };
        await applyAttributeWidgets(form, { rawFields: {}, hiddenFields: { 'attributeMap[kinderzimmermoebel.art]': 'sonstige' } }, report);

        expect(value('attributeMap[kinderzimmermoebel.art]')).toBe('');
        expect(report.unmatched[0].reason).toBe('mismatch');
    });

    it('bedient den Zustand-Dialog: Radio waehlen, bestaetigen', async () => {
        const form = formWith(dialogWidget('kinderzimmermoebel.condition', ['new', 'like_new', 'ok', 'alright', 'defect']));
        const report = { set: [], kept: [], missing: [], skipped: [], attributes: [] };
        await applyAttributeWidgets(form, { rawFields: {}, hiddenFields: { 'attributeMap[kinderzimmermoebel.condition]': 'ok' } }, report);

        expect(value('attributeMap[kinderzimmermoebel.condition]')).toBe('ok');
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(report.attributes).toEqual(['attributeMap[kinderzimmermoebel.condition]']);
    });

    it('bricht den Dialog ab, wenn der Wert dort nicht vorkommt', async () => {
        const form = formWith(dialogWidget('kinderzimmermoebel.condition', ['new', 'ok']));
        const report = { set: [], kept: [], missing: [], skipped: [], attributes: [] };
        await applyAttributeWidgets(form, { rawFields: {}, hiddenFields: { 'attributeMap[kinderzimmermoebel.condition]': 'defect' } }, report);

        expect(value('attributeMap[kinderzimmermoebel.condition]')).toBe('');
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(report.unmatched[0].reason).toBe('no_match');
    });

    it('laesst Felder ohne Knopf und Attribute aus rawFields in Ruhe', async () => {
        document.body.innerHTML = '<form><input type="hidden" name="attributeMap[x.art]" value="direkt"><input type="radio" name="attributeMap[x.versand]" value="ja"></form>';
        const form = document.querySelector('form');
        const report = { set: [], kept: [], missing: [], skipped: [], attributes: ['attributeMap[x.art]'] };
        await applyAttributeWidgets(form, {
            rawFields: { 'attributeMap[x.versand]': 'ja' },
            hiddenFields: { 'attributeMap[x.art]': 'direkt', 'attributeMap[x.versand]': 'ja' }
        }, report);

        expect(value('attributeMap[x.art]')).toBe('direkt');
        expect(report.attributes).toEqual(['attributeMap[x.art]']);
        expect(report.unmatched).toEqual([]);
    });
});

describe('applyImagesToForm', () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

    it('meldet leere Bildlisten ohne Grund und Listen ohne Daten mit Grund', () => {
        const form = postAdForm();
        expect(applyImagesToForm(form, [])).toEqual({ uploaded: 0, total: 0, reason: null });
        expect(applyImagesToForm(form, [{ url: 'u', blob: null, mime: null }]))
            .toEqual({ uploaded: 0, total: 1, reason: 'no_image_data' });
    });

    it('meldet ein fehlendes Datei-Feld', () => {
        document.body.innerHTML = '<form><input name="title"></form>';
        const form = document.querySelector('form');
        expect(applyImagesToForm(form, [{ url: 'u', blob: blob, mime: 'image/jpeg' }]).reason).toBe('file_input_missing');
    });

    it('bleibt ohne DataTransfer still statt zu werfen', () => {
        vi.stubGlobal('DataTransfer', undefined);
        const form = postAdForm();
        expect(applyImagesToForm(form, [{ url: 'u', blob: blob, mime: 'image/jpeg' }]).reason).toBe('datatransfer_unsupported');
    });

    it('haengt die Bilder in Reihenfolge an das Datei-Feld und loest change aus', () => {
        // jsdom kennt kein DataTransfer; dieser Ersatz liefert die Liste, die
        // ein Browser in input.files legt.
        class FakeDataTransfer {
            constructor() { this.files = []; this.items = { add: (f) => { this.files.push(f); } }; }
        }
        vi.stubGlobal('DataTransfer', FakeDataTransfer);
        const form = postAdForm();
        const input = form.querySelector('input[type="file"]');
        let changed = 0;
        input.addEventListener('change', () => { changed++; });

        const png = new Blob([new Uint8Array([4])], { type: 'image/png' });
        const res = applyImagesToForm(form, [
            { url: 'a', blob: blob, mime: 'image/jpeg' },
            { url: 'b', blob: null, mime: null },
            { url: 'c', blob: png, mime: 'image/png' }
        ]);

        expect(res).toEqual({ uploaded: 2, total: 3, reason: null });
        expect(changed).toBe(1);
        expect(Array.from(input.files).map((f) => f.name)).toEqual(['image_01.jpg', 'image_02.png']);
    });
});

describe('completeSnapshotImages', () => {
    it('laedt fehlende Bilder in voller Aufloesung nach und behaelt vorhandene', async () => {
        const have = { url: 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/1?rule=$_57.JPG', blob: new Blob([1]), mime: 'image/jpeg' };
        const calls = [];
        global.fetch = vi.fn(async (url) => {
            calls.push(url);
            return { ok: true, blob: async () => new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' }) };
        });

        const out = await completeSnapshotImages([
            have,
            { url: 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/bb/2?AccessKeyId=k&jwt=signed96px', blob: null, mime: null }
        ]);

        expect(out[0]).toBe(have);
        expect(out[1].blob).toBeInstanceOf(Blob);
        expect(out[1].mime).toBe('image/jpeg');
        // signierte Vorschau -> volle Groesse, ohne jwt
        expect(calls).toEqual(['https://img.kleinanzeigen.de/api/v1/prod-ads/images/bb/2?rule=$_57.JPG']);
    });

    it('laesst ein nicht ladbares Bild als Platzhalter stehen', async () => {
        global.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
        const out = await completeSnapshotImages([{ url: 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/cc/3', blob: null, mime: null }]);
        expect(out[0].blob).toBeNull();
    });
});

describe('restoreFromSnapshot (Schritt 2)', () => {
    it('befuellt das Formular, setzt den Pending-Marker und schickt nichts ab', async () => {
        setPage('/p-anzeige-aufgeben-schritt2.html?categoryId=20#kaRestore=3505764979');
        postAdForm();
        await batchPutSnapshot(snapshot());
        sessionStorage.setItem(RESTORE_MARKER_KEY, JSON.stringify({ v: '3505764979', ts: Date.now() }));

        const res = await restoreFromSnapshot('3505764979');

        expect(res.report.set).toContain('title');
        expect(value('title')).toBe('Kinderbett Bauernbett');
        expect(sessionStorage.getItem(RESTORE_MARKER_KEY)).toBeNull();
        expect(JSON.parse(sessionStorage.getItem(RESTORE_PENDING_KEY)).v).toBe('3505764979');
        const panel = document.getElementById(RESTORE_PANEL_ID);
        expect(panel.textContent).toContain('Nichts wurde abgeschickt');
        // Der Snapshot bleibt bis zur Bestaetigungs-Seite erhalten
        expect(await batchGetSnapshot('3505764979')).not.toBeNull();
    });

    it('meldet einen fehlenden Snapshot und raeumt den Auftrag ab', async () => {
        setPage('/p-anzeige-aufgeben-schritt2.html');
        postAdForm();
        sessionStorage.setItem(RESTORE_MARKER_KEY, JSON.stringify({ v: '1', ts: Date.now() }));

        const res = await restoreFromSnapshot('1');

        expect(res).toBeNull();
        expect(sessionStorage.getItem(RESTORE_MARKER_KEY)).toBeNull();
        expect(sessionStorage.getItem(RESTORE_PENDING_KEY)).toBeNull();
        expect(document.querySelector('.ka-notification.error')).not.toBeNull();
        expect(value('title')).toBe('');
    });
});

describe('handleRestorePages', () => {
    it('tut ohne Hash und Marker nichts', () => {
        setPage('/p-anzeige-aufgeben-schritt2.html');
        postAdForm();
        expect(handleRestorePages()).toBe(false);
        expect(sessionStorage.getItem(RESTORE_MARKER_KEY)).toBeNull();
    });

    it('merkt sich den Auftrag auf Schritt 1 und befuellt dort nichts', () => {
        setPage('/p-anzeige-aufgeben.html#kaRestore=3505764979');
        document.body.innerHTML = '<form id="postad-step1-frm"><input type="hidden" name="_csrf"></form>';

        expect(handleRestorePages()).toBe(true);
        expect(JSON.parse(sessionStorage.getItem(RESTORE_MARKER_KEY)).v).toBe('3505764979');
        expect(document.querySelector('.ka-notification')).not.toBeNull();
    });

    it('verwirft einen abgelaufenen Marker', () => {
        setPage('/p-anzeige-aufgeben-schritt2.html');
        postAdForm();
        sessionStorage.setItem(RESTORE_MARKER_KEY, JSON.stringify({ v: '3505764979', ts: Date.now() - CONFIG.MARKER_MAX_AGE_MS - 1 }));
        expect(handleRestorePages()).toBe(false);
    });
});

describe('Bestaetigungs-Seite nach einer Wiederherstellung', () => {
    it('loescht den Snapshot und meldet ok an den Helper', async () => {
        setPage('/p-anzeige-aufgeben-bestaetigung.html');
        await batchPutSnapshot(snapshot());
        sessionStorage.setItem(RESTORE_PENDING_KEY, JSON.stringify({ v: '3505764979', ts: Date.now() }));

        await handleConfirmationPage();

        expect(await batchGetSnapshot('3505764979')).toBeNull();
        expect(localStorage.getItem(LS_RESTORE_RESULT_PREFIX + '3505764979')).toBe('ok');
        expect(sessionStorage.getItem(RESTORE_PENDING_KEY)).toBeNull();
    });

    it('laesst fremde Snapshots in Ruhe, wenn kein Pending-Marker steht', async () => {
        setPage('/p-anzeige-aufgeben-bestaetigung.html');
        await batchPutSnapshot(snapshot());

        await handleConfirmationPage();

        expect(await batchGetSnapshot('3505764979')).not.toBeNull();
        expect(localStorage.getItem(LS_RESTORE_RESULT_PREFIX + '3505764979')).toBeNull();
    });
});
