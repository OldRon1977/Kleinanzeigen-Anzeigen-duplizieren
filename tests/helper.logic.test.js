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
    estimateRuntimeMinutes,
    jitterDelay,
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

describe('estimateRuntimeMinutes', () => {
    it('liefert 0 fuer leere Auswahl', () => {
        expect(estimateRuntimeMinutes(0)).toBe(0);
    });

    it('liefert 0 fuer eine einzelne Anzeige (keine Pause danach)', () => {
        expect(estimateRuntimeMinutes(1)).toBe(0);
    });

    it('rechnet die Pausen ZWISCHEN den Anzeigen', () => {
        expect(estimateRuntimeMinutes(2)).toBe(3);   // 1 Pause
        expect(estimateRuntimeMinutes(8)).toBe(21);  // 7 Pausen
    });

    it('liefert 0 fuer negative Werte', () => {
        expect(estimateRuntimeMinutes(-3)).toBe(0);
    });
});

describe('jitterDelay', () => {
    it('liegt immer zwischen 60000 ms und BASE+JITTER (240000 ms)', () => {
        const BASE = 3 * 60 * 1000;
        const JITTER = 1 * 60 * 1000;
        for (let i = 0; i < 200; i++) {
            const v = jitterDelay();
            expect(v).toBeGreaterThanOrEqual(60000);
            expect(v).toBeLessThanOrEqual(BASE + JITTER);
        }
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
