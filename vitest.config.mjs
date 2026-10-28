import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        // jsdom liefert weder localStorage noch indexedDB. Die beiden Setups
        // ergaenzen genau das -- Begruendung jeweils in der Datei.
        setupFiles: ['./tests/setup.storage.js', './tests/setup.indexeddb.js'],
        include: ['tests/**/*.test.js']
    }
});
