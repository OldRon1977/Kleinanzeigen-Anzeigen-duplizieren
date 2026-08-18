// Test-Umgebung, kein Produktivcode.
//
// jsdom 29 stellt in dieser Konfiguration sessionStorage bereit, localStorage
// aber nicht: 'localStorage' in window ist true, der Wert ist undefined
// (empirisch geprueft, unabhaengig von environmentOptions.jsdom.url). Beide
// Userscripts nutzen localStorage -- der Helper fuer das Tab-Protokoll und die
// Pausen-Einstellung, das Hauptskript fuer die Result-Signale.
//
// Dieser Shim ergaenzt ausschliesslich, was fehlt. Ist localStorage vorhanden,
// bleibt es unberuehrt.
function createMemoryStorage() {
    const data = new Map();
    return {
        get length() { return data.size; },
        key(i) {
            const keys = Array.from(data.keys());
            return i >= 0 && i < keys.length ? keys[i] : null;
        },
        getItem(k) {
            const key = String(k);
            return data.has(key) ? data.get(key) : null;
        },
        setItem(k, v) { data.set(String(k), String(v)); },
        removeItem(k) { data.delete(String(k)); },
        clear() { data.clear(); }
    };
}

if (typeof globalThis.localStorage === 'undefined') {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
        value: storage,
        configurable: true,
        writable: true
    });
    if (typeof window !== 'undefined' && window !== globalThis) {
        Object.defineProperty(window, 'localStorage', {
            value: storage,
            configurable: true,
            writable: true
        });
    }
}
