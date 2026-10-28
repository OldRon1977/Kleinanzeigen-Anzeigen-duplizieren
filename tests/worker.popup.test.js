import { describe, it, expect, afterEach, vi } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';
import { fixture } from './fixtures.js';

// Eigene Datei: smartRepublish/duplicateAd starten jeweils einen Wegklicker,
// der 30 s läuft. In einer gemeinsamen Datei klicken die mit.
const { CONFIG, startPopupDismisser } = worker;

function loadEditPage() {
    window.history.replaceState({}, '', '/p-anzeige-bearbeiten.html?adId=1000000001');
    document.body.innerHTML = fixture('edit-page-form.html');
}

afterEach(() => {
    vi.useRealTimers();
});

describe('Popup-Wegklicker nach dem Speichern', () => {
    // Nachgebaut: Das Upsell-Popup erscheint erst nach einem echten Speichern,
    // davon gibt es keine Vorlage. Geprüft wird die Auswahlregel des Codes.
    it('klickt nur den passenden Knopf innerhalb eines Dialogs, nie einen gleichnamigen außerhalb', async () => {
        vi.useFakeTimers();
        loadEditPage();
        const outside = document.createElement('button');
        outside.textContent = 'Ohne Hochschieben weiter';
        const outsideClick = vi.fn();
        outside.addEventListener('click', outsideClick);
        document.body.appendChild(outside);

        startPopupDismisser();
        await vi.advanceTimersByTimeAsync(CONFIG.POPUP_POLL_INTERVAL_MS * 2);
        expect(outsideClick).not.toHaveBeenCalled();

        const dlg = document.createElement('div');
        dlg.setAttribute('role', 'dialog');
        dlg.innerHTML = '<button>Mit Hochschieben</button><button>Ohne Hochschieben weiter</button>';
        const [paid, skip] = dlg.querySelectorAll('button');
        const paidClick = vi.fn();
        const skipClick = vi.fn();
        paid.addEventListener('click', paidClick);
        skip.addEventListener('click', skipClick);
        document.body.appendChild(dlg);

        await vi.advanceTimersByTimeAsync(CONFIG.POPUP_POLL_INTERVAL_MS * 2);
        expect(skipClick).toHaveBeenCalledTimes(1);
        expect(paidClick).not.toHaveBeenCalled();
        expect(outsideClick).not.toHaveBeenCalled();
    });
});
