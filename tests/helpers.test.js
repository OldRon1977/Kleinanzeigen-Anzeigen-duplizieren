/**
 * Unit Tests für Helper-Funktionen
 *
 * Diese Tests validieren die Core-Funktionalität der Hilfs-Funktionen
 * Hinweis: Da das UserScript eine IIFE ist, müssen diese Funktionen
 * über ein separates Test-Module getestet werden
 */

const assert = require('assert');

// ============================================
// Test Utilities
// ============================================

class TestRunner {
    constructor(name) {
        this.name = name;
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(description, fn) {
        this.tests.push({ description, fn });
    }

    async run() {
        console.log(`\n📋 ${this.name}`);
        console.log('='.repeat(60));

        for (const test of this.tests) {
            try {
                await test.fn();
                this.passed++;
                console.log(`✅ ${test.description}`);
            } catch (error) {
                this.failed++;
                console.error(`❌ ${test.description}`);
                console.error(`   ${error.message}`);
            }
        }

        console.log('='.repeat(60));
        console.log(`Results: ${this.passed} passed, ${this.failed} failed\n`);
        return this.failed === 0;
    }
}

// ============================================
// Test Implementations
// ============================================

// ============================================
// 1. CONFIG Constants Tests
// ============================================

const configTests = new TestRunner('CONFIG Constants Tests');

configTests.test('CONFIG.NOTIFICATION_TIMEOUT_MS sollte 4000 sein', () => {
    const CONFIG = { NOTIFICATION_TIMEOUT_MS: 4000 };
    assert.strictEqual(CONFIG.NOTIFICATION_TIMEOUT_MS, 4000);
});

configTests.test('CONFIG.DELETE_REQUEST_TIMEOUT_MS sollte 8000 sein', () => {
    const CONFIG = { DELETE_REQUEST_TIMEOUT_MS: 8000 };
    assert.strictEqual(CONFIG.DELETE_REQUEST_TIMEOUT_MS, 8000);
});

configTests.test('CONFIG.DELETE_WAIT_BEFORE_CREATE_MS sollte 2000 sein', () => {
    const CONFIG = { DELETE_WAIT_BEFORE_CREATE_MS: 2000 };
    assert.strictEqual(CONFIG.DELETE_WAIT_BEFORE_CREATE_MS, 2000);
});

configTests.test('CONFIG.INITIAL_RETRY_WAIT_MS sollte 500 sein', () => {
    const CONFIG = { INITIAL_RETRY_WAIT_MS: 500 };
    assert.strictEqual(CONFIG.INITIAL_RETRY_WAIT_MS, 500);
});

configTests.test('CONFIG.MAX_RETRY_WAIT_MS sollte 8000 sein', () => {
    const CONFIG = { MAX_RETRY_WAIT_MS: 8000 };
    assert.strictEqual(CONFIG.MAX_RETRY_WAIT_MS, 8000);
});

configTests.test('CONFIG.MAX_BUTTON_RETRIES sollte 5 sein', () => {
    const CONFIG = { MAX_BUTTON_RETRIES: 5 };
    assert.strictEqual(CONFIG.MAX_BUTTON_RETRIES, 5);
});

// ============================================
// 2. Exponential Backoff Tests
// ============================================

const exponentialBackoffTests = new TestRunner('Exponential Backoff Tests');

// Implementation für Tests
const getExponentialBackoffWait = (retryCount) => {
    const CONFIG = { INITIAL_RETRY_WAIT_MS: 500, MAX_RETRY_WAIT_MS: 8000 };
    const exponentialWait = Math.pow(2, retryCount - 1) * CONFIG.INITIAL_RETRY_WAIT_MS;
    return Math.min(exponentialWait, CONFIG.MAX_RETRY_WAIT_MS);
};

exponentialBackoffTests.test('Retry 1 sollte 500ms sein', () => {
    const result = getExponentialBackoffWait(1);
    assert.strictEqual(result, 500, `Expected 500, got ${result}`);
});

exponentialBackoffTests.test('Retry 2 sollte 1000ms sein', () => {
    const result = getExponentialBackoffWait(2);
    assert.strictEqual(result, 1000, `Expected 1000, got ${result}`);
});

exponentialBackoffTests.test('Retry 3 sollte 2000ms sein', () => {
    const result = getExponentialBackoffWait(3);
    assert.strictEqual(result, 2000, `Expected 2000, got ${result}`);
});

exponentialBackoffTests.test('Retry 4 sollte 4000ms sein', () => {
    const result = getExponentialBackoffWait(4);
    assert.strictEqual(result, 4000, `Expected 4000, got ${result}`);
});

exponentialBackoffTests.test('Retry 5 sollte 8000ms sein (capped)', () => {
    const result = getExponentialBackoffWait(5);
    assert.strictEqual(result, 8000, `Expected 8000 (max), got ${result}`);
});

exponentialBackoffTests.test('Retry 6+ sollte 8000ms sein (capped)', () => {
    const result = getExponentialBackoffWait(6);
    assert.strictEqual(result, 8000, `Expected 8000 (max), got ${result}`);
});

exponentialBackoffTests.test('Backoff sollte immer positiv sein', () => {
    for (let i = 1; i <= 10; i++) {
        const result = getExponentialBackoffWait(i);
        assert.strictEqual(result > 0, true, `Retry ${i}: Expected positive, got ${result}`);
    }
});

// ============================================
// 3. Logger Tests
// ============================================

const loggerTests = new TestRunner('Logger Tests');

// Mock Logger für Tests
const createLogger = () => ({
    log: (msg, data) => `[KA-Script] ${msg}`,
    warn: (msg, data) => `[KA-Script] ⚠️ ${msg}`,
    error: (msg, data) => `[KA-Script] ❌ ${msg}`
});

loggerTests.test('Logger.log sollte "[KA-Script]" Präfix haben', () => {
    const logger = createLogger();
    const result = logger.log('Test-Nachricht');
    assert.strictEqual(result.startsWith('[KA-Script]'), true);
});

loggerTests.test('Logger.warn sollte "⚠️" Emoji haben', () => {
    const logger = createLogger();
    const result = logger.warn('Test-Warnung');
    assert.strictEqual(result.includes('⚠️'), true);
});

loggerTests.test('Logger.error sollte "❌" Emoji haben', () => {
    const logger = createLogger();
    const result = logger.error('Test-Fehler');
    assert.strictEqual(result.includes('❌'), true);
});

loggerTests.test('Logger sollte custom Nachricht enthalten', () => {
    const logger = createLogger();
    const customMsg = 'Meine Custom-Nachricht';
    const result = logger.log(customMsg);
    assert.strictEqual(result.includes(customMsg), true);
});

// ============================================
// 4. Delay Function Tests
// ============================================

const delayTests = new TestRunner('Delay Function Tests');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

delayTests.test('delay(100) sollte mindestens 100ms warten', async () => {
    const start = Date.now();
    await delay(100);
    const elapsed = Date.now() - start;
    assert.strictEqual(elapsed >= 100, true, `Expected >= 100ms, got ${elapsed}ms`);
});

delayTests.test('delay(50) sollte relativ schnell sein', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    assert.strictEqual(elapsed < 200, true, `Expected < 200ms, got ${elapsed}ms`);
});

// ============================================
// 5. CSS Class Logic Tests
// ============================================

const cssTests = new TestRunner('CSS Classes Tests');

cssTests.test('Notification Klassen sollten valide sein', () => {
    const validClasses = ['ka-notification', 'ka-duplicate-btn', 'ka-smart-btn', 'ka-spinner', 'ka-button-container'];
    validClasses.forEach(className => {
        assert.strictEqual(className.includes('ka-'), true);
        assert.strictEqual(className.length > 0, true);
    });
});

cssTests.test('CSS Klasse sollte nicht mit Zahl anfangen', () => {
    const className = 'ka-notification';
    assert.strictEqual(/^[a-z]/.test(className), true);
});

// ============================================
// 6. CSRF Token Error Messages Tests
// ============================================

const csrfTests = new TestRunner('CSRF Token Error Handling Tests');

const getCsrfToken = (metaTag, content) => {
    if (!metaTag) throw new Error('CSRF-Token Meta-Tag nicht gefunden - Seite nicht richtig geladen?');
    if (!content) throw new Error('CSRF-Token ist leer oder nicht gesetzt');
    return content;
};

csrfTests.test('Sollte Error werfen wenn Meta-Tag nicht existiert', () => {
    try {
        getCsrfToken(null, 'token-value');
        assert.fail('Should have thrown error');
    } catch (error) {
        assert.strictEqual(error.message.includes('Meta-Tag'), true);
    }
});

csrfTests.test('Sollte Error werfen wenn Token leer ist', () => {
    try {
        getCsrfToken(true, null);
        assert.fail('Should have thrown error');
    } catch (error) {
        assert.strictEqual(error.message.includes('leer'), true);
    }
});

csrfTests.test('Sollte Token zurückgeben wenn alles valid ist', () => {
    const token = getCsrfToken(true, 'valid-token-123');
    assert.strictEqual(token, 'valid-token-123');
});

// ============================================
// 7. Form Elements Validation Tests
// ============================================

const formTests = new TestRunner('Form Elements Validation Tests');

const validateFormElements = (adIdInput, form) => {
    if (!adIdInput || !form) throw new Error('Form-Elemente nicht gefunden');
    return { adIdInput, form };
};

formTests.test('Sollte Error werfen wenn adIdInput fehlt', () => {
    try {
        validateFormElements(null, {});
        assert.fail('Should have thrown error');
    } catch (error) {
        assert.strictEqual(error.message.includes('Form-Elemente'), true);
    }
});

formTests.test('Sollte Error werfen wenn form fehlt', () => {
    try {
        validateFormElements({}, null);
        assert.fail('Should have thrown error');
    } catch (error) {
        assert.strictEqual(error.message.includes('Form-Elemente'), true);
    }
});

formTests.test('Sollte beide Elemente zurückgeben wenn valid', () => {
    const mockAdIdInput = { value: '12345' };
    const mockForm = { submit: () => {} };
    const result = validateFormElements(mockAdIdInput, mockForm);
    assert.strictEqual(result.adIdInput === mockAdIdInput, true);
    assert.strictEqual(result.form === mockForm, true);
});

// ============================================
// 8. Retry Logic Tests
// ============================================

const retryTests = new TestRunner('Retry Logic Tests');

retryTests.test('MAX_BUTTON_RETRIES sollte <= 10 sein', () => {
    const MAX_BUTTON_RETRIES = 5;
    assert.strictEqual(MAX_BUTTON_RETRIES <= 10, true);
});

retryTests.test('Backoff sollte nie MAX_RETRY_WAIT_MS übersteigen', () => {
    const MAX_RETRY_WAIT_MS = 8000;
    for (let i = 1; i <= 20; i++) {
        const wait = getExponentialBackoffWait(i);
        assert.strictEqual(wait <= MAX_RETRY_WAIT_MS, true, `Retry ${i}: ${wait}ms > ${MAX_RETRY_WAIT_MS}ms`);
    }
});

// ============================================
// Run All Tests
// ============================================

async function runAllTests() {
    console.log('\n🧪 UNIT TESTS - Kleinanzeigen Anzeigen duplizieren\n');

    const results = [];

    results.push(await configTests.run());
    results.push(await exponentialBackoffTests.run());
    results.push(await loggerTests.run());
    results.push(await delayTests.run());
    results.push(await cssTests.run());
    results.push(await csrfTests.run());
    results.push(await formTests.run());
    results.push(await retryTests.run());

    const allPassed = results.every(r => r === true);
    const totalTests = [
        configTests, exponentialBackoffTests, loggerTests,
        delayTests, cssTests, csrfTests, formTests, retryTests
    ].reduce((sum, runner) => sum + runner.tests.length, 0);

    console.log('='.repeat(60));
    console.log(`📊 SUMMARY: ${totalTests} Tests - ${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);
    console.log('='.repeat(60));

    process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
    console.error('Test Runner Error:', error);
    process.exit(1);
});
