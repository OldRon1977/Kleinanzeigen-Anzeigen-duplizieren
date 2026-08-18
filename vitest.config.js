import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        // jsdom liefert hier kein localStorage. Der Shim ergaenzt es fuer die
        // Tests -- Begruendung in tests/setup.storage.js.
        setupFiles: ['./tests/setup.storage.js'],
        include: ['tests/**/*.test.js']
    }
});
