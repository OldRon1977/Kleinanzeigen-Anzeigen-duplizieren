import { describe, it, expect } from 'vitest';
import helper from '../helper.user.js';

const {
    MIN_DAYS_TO_END,
    parseEndDate,
    parseFavCount,
    daysUntil,
    AGE_BANDS,
    ageFromDaysLeft,
    ageBand,
    DEFAULT_DELAY_MIN_MINUTES,
    DEFAULT_DELAY_MAX_MINUTES,
    DELAY_LIMIT_MAX_MINUTES,
    defaultDelayConfig,
    sanitizeDelayConfig,
    validateDelayInput,
    randomDelayMs,
    estimateRuntimeRange,
    formatRuntimeRange,
    sanitize,
    crc32,
    utf8,
    dosTime
} = helper;

describe('parseEndDate', () => {
    it('parst ein gueltiges Datum im Format TT.MM.JJJJ', () => {
        const d = parseEndDate('15.03.2026');
        expect(d).toBeInstanceOf(Date);
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(2); // Maerz
        expect(d.getDate()).toBe(15);
    });

    it('parst einstellige Tage/Monate', () => {
        const d = parseEndDate('5.7.2026');
        expect(d).toBeInstanceOf(Date);
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(6);
        expect(d.getDate()).toBe(5);
    });

    it('liefert null fuer ungueltige Formate', () => {
        expect(parseEndDate('2026-03-15')).toBeNull();   // ISO statt deutsch
        expect(parseEndDate('15/03/2026')).toBeNull();   // falscher Trenner
        expect(parseEndDate('15.03.26')).toBeNull();     // zweistelliges Jahr
        expect(parseEndDate('endet am 15.03.2026 x')).toBeNull(); // kein exakter Match
    });

    it('liefert null fuer Unsinn und leere Werte', () => {
        expect(parseEndDate('Unsinn')).toBeNull();
        expect(parseEndDate('')).toBeNull();
        expect(parseEndDate(null)).toBeNull();
        expect(parseEndDate(undefined)).toBeNull();
    });
});

describe('daysUntil', () => {
    it('liefert 0 fuer heute', () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expect(daysUntil(today)).toBe(0);
    });

    it('liefert 1 fuer morgen', () => {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        expect(daysUntil(tomorrow)).toBe(1);
    });

    it('MIN_DAYS_TO_END ist der dokumentierte Schwellwert 53', () => {
        expect(MIN_DAYS_TO_END).toBe(53);
    });
});

describe('ageFromDaysLeft', () => {
    it('leitet das Alter aus der Restlaufzeit ab (60 Tage Regellaufzeit)', () => {
        expect(ageFromDaysLeft(60)).toBe(0);
        expect(ageFromDaysLeft(53)).toBe(7);
        expect(ageFromDaysLeft(46)).toBe(14);
    });

    it('wird nie negativ, auch bei verlaengerten Anzeigen', () => {
        expect(ageFromDaysLeft(75)).toBe(0);
    });
});

describe('ageBand', () => {
    it('trifft die Grenzen der vier Baender', () => {
        expect(ageBand(0).key).toBe('frisch');     // rot: bis 4 Tage
        expect(ageBand(4).key).toBe('frisch');
        expect(ageBand(5).key).toBe('mittel');     // gelb: 5-6 Tage
        expect(ageBand(6).key).toBe('mittel');
        expect(ageBand(7).key).toBe('alt');        // gruen: 7-13 Tage
        expect(ageBand(13).key).toBe('alt');
        expect(ageBand(14).key).toBe('sehr-alt');  // dunkelgruen: ab 14 Tagen
        expect(ageBand(365).key).toBe('sehr-alt');
    });

    it('liefert zu jedem Band eine Farbe und ein Label', () => {
        AGE_BANDS.forEach((band) => {
            expect(band.color).toMatch(/^#[0-9a-f]{6}$/i);
            expect(band.label.length).toBeGreaterThan(0);
        });
    });
});

describe('defaultDelayConfig', () => {
    it('ist der dokumentierte Standard 3 bis 6 Minuten', () => {
        expect(defaultDelayConfig()).toEqual({ min: 3, max: 6 });
        expect(DEFAULT_DELAY_MIN_MINUTES).toBe(3);
        expect(DEFAULT_DELAY_MAX_MINUTES).toBe(6);
    });
});

describe('sanitizeDelayConfig', () => {
    it('nimmt gueltige Werte unveraendert', () => {
        expect(sanitizeDelayConfig({ min: 5, max: 9 })).toEqual({ min: 5, max: 9 });
    });

    it('laesst 0/0 durch -- das ist eine erlaubte Eingabe', () => {
        expect(sanitizeDelayConfig({ min: 0, max: 0 })).toEqual({ min: 0, max: 0 });
    });

    it('faellt bei fehlenden oder unbrauchbaren Werten auf den Default zurueck', () => {
        expect(sanitizeDelayConfig(undefined)).toEqual({ min: 3, max: 6 });
        expect(sanitizeDelayConfig(null)).toEqual({ min: 3, max: 6 });
        expect(sanitizeDelayConfig({})).toEqual({ min: 3, max: 6 });
        expect(sanitizeDelayConfig({ min: 'abc', max: 'x' })).toEqual({ min: 3, max: 6 });
        expect(sanitizeDelayConfig({ min: '', max: '' })).toEqual({ min: 3, max: 6 });
        expect(sanitizeDelayConfig({ min: NaN, max: Infinity })).toEqual({ min: 3, max: 6 });
    });

    it('repariert nur den kaputten Einzelwert, nicht das ganze Paar', () => {
        expect(sanitizeDelayConfig({ min: 10, max: 'x' })).toEqual({ min: 6, max: 10 });
    });

    it('liest Zahlen auch aus Strings', () => {
        expect(sanitizeDelayConfig({ min: '4', max: ' 12 ' })).toEqual({ min: 4, max: 12 });
    });

    it('rundet auf ganze Minuten', () => {
        expect(sanitizeDelayConfig({ min: 2.4, max: 7.6 })).toEqual({ min: 2, max: 8 });
    });

    it('klemmt auf die erlaubten Grenzen', () => {
        expect(sanitizeDelayConfig({ min: -5, max: 999 })).toEqual({ min: 0, max: DELAY_LIMIT_MAX_MINUTES });
    });

    it('tauscht verdrehte Grenzen beim Lesen', () => {
        expect(sanitizeDelayConfig({ min: 9, max: 4 })).toEqual({ min: 4, max: 9 });
    });
});

describe('validateDelayInput', () => {
    it('akzeptiert gueltige Paare', () => {
        expect(validateDelayInput('3', '6')).toEqual({ ok: true, min: 3, max: 6 });
        expect(validateDelayInput('4', '4')).toEqual({ ok: true, min: 4, max: 4 });
        expect(validateDelayInput('0', '0')).toEqual({ ok: true, min: 0, max: 0 });
    });

    it('lehnt leere Felder ab, statt sie als 0 zu lesen', () => {
        // Ein leeres Feld ist keine Eingabe. Es als 0 zu deuten wuerde die
        // Pause abschalten, ohne dass der Nutzer 0 getippt hat.
        expect(validateDelayInput('', '6').ok).toBe(false);
        expect(validateDelayInput('3', '').ok).toBe(false);
        expect(validateDelayInput('', '').reason).toBe('range');
    });

    it('lehnt alles ab, was keine ganze Minutenzahl ist', () => {
        expect(validateDelayInput('abc', '6').ok).toBe(false);
        expect(validateDelayInput('2.5', '6').ok).toBe(false);
        expect(validateDelayInput('-1', '6').ok).toBe(false);
        expect(validateDelayInput('3', '181').reason).toBe('range');
    });

    it('meldet verdrehte Grenzen als eigenen Fall', () => {
        expect(validateDelayInput('6', '3')).toEqual({ ok: false, reason: 'order', min: 6, max: 3 });
    });
});

describe('randomDelayMs', () => {
    it('liegt immer im eingestellten Bereich', () => {
        for (let i = 0; i < 500; i++) {
            const v = randomDelayMs({ min: 3, max: 6 });
            expect(v).toBeGreaterThanOrEqual(3 * 60 * 1000);
            expect(v).toBeLessThanOrEqual(6 * 60 * 1000);
        }
    });

    it('variiert innerhalb des Bereichs', () => {
        // Der Zweck der Einstellung ist die Streuung -- ein konstanter Wert
        // waere genau das Muster, das vermieden werden soll.
        const seen = new Set();
        for (let i = 0; i < 200; i++) seen.add(randomDelayMs({ min: 3, max: 8 }));
        expect(seen.size).toBeGreaterThan(50);
    });

    it('liefert bei 0/0 exakt 0 -- keine Pause', () => {
        for (let i = 0; i < 50; i++) {
            expect(randomDelayMs({ min: 0, max: 0 })).toBe(0);
        }
    });

    it('liefert bei min = max genau diesen Wert', () => {
        expect(randomDelayMs({ min: 5, max: 5 })).toBe(5 * 60 * 1000);
    });

    it('nutzt den Default, wenn keine Config uebergeben wird', () => {
        const v = randomDelayMs(undefined);
        expect(v).toBeGreaterThanOrEqual(3 * 60 * 1000);
        expect(v).toBeLessThanOrEqual(6 * 60 * 1000);
    });
});

describe('estimateRuntimeRange', () => {
    const CFG = { min: 3, max: 6 };

    it('liefert 0 fuer leere Auswahl und fuer eine einzelne Anzeige', () => {
        expect(estimateRuntimeRange(0, CFG)).toEqual({ minMinutes: 0, maxMinutes: 0 });
        expect(estimateRuntimeRange(1, CFG)).toEqual({ minMinutes: 0, maxMinutes: 0 });
    });

    it('rechnet die Pausen ZWISCHEN den Anzeigen', () => {
        expect(estimateRuntimeRange(2, CFG)).toEqual({ minMinutes: 3, maxMinutes: 6 });
        expect(estimateRuntimeRange(4, CFG)).toEqual({ minMinutes: 9, maxMinutes: 18 });
    });

    it('liefert 0 fuer negative Werte', () => {
        expect(estimateRuntimeRange(-3, CFG)).toEqual({ minMinutes: 0, maxMinutes: 0 });
    });

    it('ist bei 0/0 durchgaengig 0', () => {
        expect(estimateRuntimeRange(8, { min: 0, max: 0 })).toEqual({ minMinutes: 0, maxMinutes: 0 });
    });
});

describe('formatRuntimeRange', () => {
    it('nennt eine Spanne', () => {
        expect(formatRuntimeRange({ minMinutes: 9, maxMinutes: 18 })).toBe('ca. 9-18 Minuten');
    });

    it('nennt bei gleichen Grenzen nur einen Wert', () => {
        expect(formatRuntimeRange({ minMinutes: 12, maxMinutes: 12 })).toBe('ca. 12 Minuten');
    });
});

describe('sanitize', () => {
    it('ersetzt verbotene Dateisystem-Zeichen durch Unterstriche', () => {
        expect(sanitize('a\\b/c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    });

    it('ersetzt Whitespace durch Unterstriche', () => {
        expect(sanitize('foo bar\tbaz')).toBe('foo_bar_baz');
    });

    it('kappt auf 60 Zeichen', () => {
        const long = 'x'.repeat(100);
        expect(sanitize(long)).toHaveLength(60);
    });

    it('behandelt null/undefined als leeren String', () => {
        expect(sanitize(null)).toBe('');
        expect(sanitize(undefined)).toBe('');
    });
});

describe('crc32', () => {
    it('liefert den Referenzwert 0xCBF43926 fuer "123456789"', () => {
        expect(crc32(utf8('123456789'))).toBe(0xCBF43926);
    });

    it('liefert 0 fuer leere Eingabe', () => {
        expect(crc32(new Uint8Array(0))).toBe(0);
    });
});

describe('dosTime', () => {
    it('kodiert ein bekanntes Datum korrekt in DOS-Zeit/Datum', () => {
        // 15.01.2024 10:30:20
        const { t, d } = dosTime(new Date(2024, 0, 15, 10, 30, 20));
        // Zeit: (10 << 11) | (30 << 5) | (20 / 2) = 20480 + 960 + 10
        expect(t).toBe(21450);
        // Datum: ((2024-1980) << 9) | (1 << 5) | 15 = 22528 + 32 + 15
        expect(d).toBe(22575);
    });
});

// Markup wie auf "Meine Anzeigen": ein <li> in der Statistikzeile, das Icon
// traegt data-title="favoriteOutline", der Zaehler steht als Text daneben.
function favLi(text) {
    return '<li><span class="inline-block-icon">' +
        '<svg viewBox="0 0 24 24" data-title="favoriteOutline" role="img" ' +
        'class="shrink-0 fill-current block align-middle w-medium h-medium">' +
        '<title>Merkliste</title><path d="M11.9 5.0"></path></svg></span>' +
        text + '</li>';
}

function cardWith(innerHtml) {
    const card = document.createElement('li');
    card.setAttribute('data-testid', 'ad-card');
    card.setAttribute('data-adid', '4711');
    card.innerHTML = '<h3><a>Titel</a></h3><ul class="text-body-small">' + innerHtml + '</ul>';
    return card;
}

describe('parseFavCount', () => {
    it('liest den Zaehler aus dem Merklisten-Eintrag', () => {
        expect(parseFavCount(cardWith(favLi('1 mal gemerkt')))).toBe(1);
        expect(parseFavCount(cardWith(favLi('7 mal gemerkt')))).toBe(7);
    });

    it('liefert 0 statt null, wenn die Anzeige niemand gemerkt hat', () => {
        // Der Eintrag fehlt bei null Merkungen NICHT, er sagt "0 mal gemerkt".
        expect(parseFavCount(cardWith(favLi('0 mal gemerkt')))).toBe(0);
    });

    it('kommt mit Tausenderpunkt klar', () => {
        expect(parseFavCount(cardWith(favLi('1.234 mal gemerkt')))).toBe(1234);
    });

    it('verwechselt den Zaehler nicht mit anderen Statistikeintraegen', () => {
        const card = cardWith(
            '<li>123 Aufrufe</li>' + favLi('0 mal gemerkt') + '<li>4 Nachrichten</li>'
        );
        expect(parseFavCount(card)).toBe(0);
    });

    it('findet den Eintrag auch ohne Icon ueber den Text', () => {
        expect(parseFavCount(cardWith('<li>3 mal gemerkt</li>'))).toBe(3);
    });

    it('liefert null, wenn kein Zaehler lesbar ist', () => {
        // null heisst "unbekannt", nicht "0" -- sonst wuerde ein Markup-Umbau
        // gemerkte Anzeigen als nicht gemerkt durchwinken.
        expect(parseFavCount(cardWith('<li>123 Aufrufe</li>'))).toBeNull();
        expect(parseFavCount(cardWith(''))).toBeNull();
    });
});
