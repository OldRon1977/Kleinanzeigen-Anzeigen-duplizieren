// Test-Umgebung, kein Produktivcode.
//
// jsdom bringt kein indexedDB mit. Ohne Ersatz war der komplette
// Recovery-Pfad beider Scripts nicht testbar: Snapshots schreiben, listen,
// als ZIP exportieren und loeschen. Ein Test konnte bisher nur belegen, dass
// der Aufruf in seinem try/catch landet -- also das Gegenteil dessen, was
// interessiert.
//
// Die Version von fake-indexeddb ist in package.json exakt gepinnt, weil das
// Verhalten dieser Bibliothek die Testaussage bestimmt.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach } from 'vitest';

// Vor jedem Test eine frische Factory. Der naheliegende Weg ueber
// indexedDB.deleteDatabase() funktioniert hier nicht: openIDB() im Helper
// schliesst seine Verbindung nie, und deleteDatabase wartet auf genau das --
// der Hook laeuft in einen Timeout. Eine neue Factory bringt eine leere
// Datenbankliste mit, unabhaengig von noch offenen Verbindungen der alten.
function freshFactory() {
    const factory = new IDBFactory();
    globalThis.indexedDB = factory;
    globalThis.IDBKeyRange = IDBKeyRange;
    if (typeof window !== 'undefined' && window !== globalThis) {
        window.indexedDB = factory;
        window.IDBKeyRange = IDBKeyRange;
    }
}

freshFactory();
beforeEach(freshFactory);
