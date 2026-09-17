import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../kleinanzeigen-duplizieren.user.js';

const { CONFIG, startSaveWatchdog } = worker;

// Regressionsschutz gegen einen stehengebliebenen Loeschauftrag:
// smartRepublish setzt ka-delete-after-create in BEIDEN Modi. Vor dieser
// Aenderung raeumte nur der Batch-Zweig ihn wieder ab. Blieb er im manuellen
// Modus liegen, arbeitete ihn ein spaeterer Vorgang im selben Tab ab und
// loeschte eine Anzeige, die niemand neu eingestellt hatte -- und mit
// ka-manual-mode zusaetzlich den Recovery-Snapshot.
function setEditPage() {
    window.history.replaceState({}, '', '/p-anzeige-bearbeiten.html?adId=123');
}

function setConfirmationPage() {
    window.history.replaceState({}, '', '/p-anzeige-aufgeben-bestaetigung.html');
}

beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
});

afterEach(() => {
    vi.useRealTimers();
});

describe('Save-Watchdog raeumt die Vorgangs-Marker ab', () => {
    it('entfernt alle drei Marker, wenn der Tab auf der Bearbeiten-Seite stehen bleibt', async () => {
        vi.useFakeTimers();
        setEditPage();
        sessionStorage.setItem('ka-batch-original-adid', '123');
        sessionStorage.setItem('ka-manual-mode', '1');
        sessionStorage.setItem('ka-delete-after-create', '123');

        startSaveWatchdog();
        await vi.advanceTimersByTimeAsync(CONFIG.SAVE_WATCHDOG_TIMEOUT_MS);

        expect(sessionStorage.getItem('ka-delete-after-create')).toBeNull();
        expect(sessionStorage.getItem('ka-batch-original-adid')).toBeNull();
        expect(sessionStorage.getItem('ka-manual-mode')).toBeNull();
    });

    it('laesst die Marker unberuehrt, wenn der Tab die Seite verlassen hat', async () => {
        vi.useFakeTimers();
        setConfirmationPage();
        sessionStorage.setItem('ka-delete-after-create', '123');

        startSaveWatchdog();
        await vi.advanceTimersByTimeAsync(CONFIG.SAVE_WATCHDOG_TIMEOUT_MS);

        // Navigation erfolgt: die Bestaetigungs-Seite ist zustaendig und braucht
        // den Auftrag noch. Der Watchdog darf ihn hier nicht wegnehmen.
        expect(sessionStorage.getItem('ka-delete-after-create')).toBe('123');
    });

    it('greift erst nach der vollen Watchdog-Frist', async () => {
        vi.useFakeTimers();
        setEditPage();
        sessionStorage.setItem('ka-delete-after-create', '123');

        startSaveWatchdog();
        await vi.advanceTimersByTimeAsync(CONFIG.SAVE_WATCHDOG_TIMEOUT_MS - 1);
        expect(sessionStorage.getItem('ka-delete-after-create')).toBe('123');

        await vi.advanceTimersByTimeAsync(1);
        expect(sessionStorage.getItem('ka-delete-after-create')).toBeNull();
    });
});
