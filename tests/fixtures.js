import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Live gespeicherte, anonymisierte Seitenteile von kleinanzeigen.de.
// Neu erzeugen: siehe .claude/capture-fixtures.js (lokal, nicht im Repo).
export function fixture(name) {
    return readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf8');
}
