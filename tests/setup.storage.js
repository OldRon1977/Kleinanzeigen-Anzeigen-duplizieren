// Test-Umgebung, kein Produktivcode.
//
// In dieser Umgebung ist localStorage nicht nutzbar, sessionStorage schon:
// 'localStorage' in globalThis ist true, der Wert ist undefined. Die Ursache
// liegt nicht bei jsdom, sondern bei Node selbst -- es bringt inzwischen ein
// eigenes, experimentelles localStorage-Global mit, das ohne
// --localstorage-file undefined bleibt und die jsdom-Variante ueberschattet.
// Gemessen mit Node v26.7.0: node -e "console.log('localStorage' in globalThis,
// typeof globalThis.localStorage)" liefert "true undefined", dazu die
// Node-Warnung "localStorage is not available because --localstorage-file was
// not provided" -- dieselbe Warnung erscheint in jedem Testlauf.
//
// Beide Userscripts nutzen localStorage -- der Helper fuer das Tab-Protokoll
// und die Pausen-Einstellung, das Hauptskript fuer die Result-Signale.
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
