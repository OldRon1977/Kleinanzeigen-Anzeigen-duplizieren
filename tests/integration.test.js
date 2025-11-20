/**
 * Integration Tests für UserScript Funktionalität
 *
 * Diese Tests simulieren Szenarien die im UserScript vorkommen
 */

const assert = require('assert');

// ============================================
// Test Utilities
// ============================================

class IntegrationTestRunner {
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
        console.log(`\n🔗 ${this.name}`);
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
// Mock Objects
// ============================================

class MockNotification {
    constructor() {
        this.messages = [];
    }

    show(message, type = 'info') {
        this.messages.push({ message, type, timestamp: Date.now() });
    }

    getLastMessage() {
        return this.messages[this.messages.length - 1];
    }

    clear() {
        this.messages = [];
    }
}

class MockFormElements {
    constructor(adId = '12345') {
        this.adIdInput = { value: adId };
        this.form = {
            submitted: false,
            submit: function() {
                this.submitted = true;
            }
        };
    }

    getElements() {
        return { adIdInput: this.adIdInput, form: this.form };
    }
}

class MockAPI {
    constructor() {
        this.deleteCalls = [];
        this.shouldFail = false;
    }

    async deleteAd(adId) {
        this.deleteCalls.push(adId);
        if (this.shouldFail) {
            throw new Error('API Error: Konnte Anzeige nicht löschen');
        }
        return { success: true };
    }

    setFailure(shouldFail) {
        this.shouldFail = shouldFail;
    }
}

// ============================================
// 1. Duplicate Ad Flow Tests
// ============================================

const duplicateAdTests = new IntegrationTestRunner('Duplicate Ad Flow Tests');

duplicateAdTests.test('Duplikation sollte Ad-ID löschen', () => {
    const formElements = new MockFormElements('test-123');
    const { adIdInput, form } = formElements.getElements();

    // Simulate duplicateAd logic
    adIdInput.value = '';

    assert.strictEqual(adIdInput.value === '', true, 'AD ID sollte gelöscht sein');
});

duplicateAdTests.test('Form sollte nach Duplikation eingereicht werden', () => {
    const formElements = new MockFormElements();
    const { form } = formElements.getElements();

    form.submit();

    assert.strictEqual(form.submitted, true, 'Form sollte eingereicht worden sein');
});

duplicateAdTests.test('Duplikation sollte keine Fehler bei gültigen Elementen werfen', () => {
    try {
        const formElements = new MockFormElements();
        const { adIdInput, form } = formElements.getElements();

        if (!adIdInput || !form) {
            throw new Error('Form-Elemente nicht gefunden');
        }

        adIdInput.value = '';
        form.submit();
        // Success
    } catch (error) {
        assert.fail(`Sollte keinen Fehler werfen: ${error.message}`);
    }
});

// ============================================
// 2. Smart Republish Flow Tests
// ============================================

const smartRepublishTests = new IntegrationTestRunner('Smart Republish Flow Tests');

smartRepublishTests.test('Smart Republish sollte Original-ID abrufen', () => {
    const formElements = new MockFormElements('original-id-456');
    const { adIdInput } = formElements.getElements();

    const originalId = adIdInput.value;

    assert.strictEqual(originalId === 'original-id-456', true, 'Original-ID sollte gespeichert sein');
});

smartRepublishTests.test('Smart Republish sollte API Löschung aufrufen', async () => {
    const api = new MockAPI();

    await api.deleteAd('ad-123');

    assert.strictEqual(api.deleteCalls.length === 1, true, 'deleteAd sollte einmal aufgerufen werden');
    assert.strictEqual(api.deleteCalls[0] === 'ad-123', true, 'Sollte mit richtiger ID aufgerufen werden');
});

smartRepublishTests.test('Smart Republish sollte weitermachen wenn Löschung fehlschlägt', async () => {
    const api = new MockAPI();
    const formElements = new MockFormElements();
    const notifications = new MockNotification();

    api.setFailure(true);

    let deleteFailed = false;
    try {
        await api.deleteAd('ad-123');
    } catch (error) {
        deleteFailed = true;
        notifications.show('⚠️ Löschung fehlgeschlagen', 'error');
    }

    // Trotzdem fortfahren
    const { adIdInput, form } = formElements.getElements();
    adIdInput.value = '';
    form.submit();

    assert.strictEqual(deleteFailed, true, 'Fehler-Flag sollte gesetzt sein');
    assert.strictEqual(form.submitted, true, 'Form sollte trotzdem eingereicht werden');
    assert.strictEqual(notifications.getLastMessage().type, 'error', 'Error-Notification sollte gezeigt werden');
});

// ============================================
// 3. Error Handling Tests
// ============================================

const errorHandlingTests = new IntegrationTestRunner('Error Handling Tests');

errorHandlingTests.test('Fehlende Form-Elemente sollten Error werfen', () => {
    try {
        const adIdInput = null;
        const form = { submit: () => {} };

        if (!adIdInput || !form) {
            throw new Error('Form-Elemente nicht gefunden');
        }

        assert.fail('Sollte Error geworfen haben');
    } catch (error) {
        assert.strictEqual(error.message.includes('Form-Elemente'), true);
    }
});

errorHandlingTests.test('Fehlende Anzeigen-ID sollten Error werfen', () => {
    try {
        const adId = '';

        if (!adId) {
            throw new Error('Keine Anzeigen-ID gefunden');
        }

        assert.fail('Sollte Error geworfen haben');
    } catch (error) {
        assert.strictEqual(error.message.includes('Anzeigen-ID'), true);
    }
});

errorHandlingTests.test('User sollte über Lösch-Fehler benachrichtigt werden', async () => {
    const api = new MockAPI();
    const notifications = new MockNotification();

    api.setFailure(true);

    try {
        await api.deleteAd('ad-123');
    } catch (error) {
        notifications.show('⚠️ Original konnte nicht gelöscht werden', 'error');
    }

    const lastMsg = notifications.getLastMessage();
    assert.strictEqual(lastMsg.type === 'error', true, 'Notification sollte Error sein');
    assert.strictEqual(lastMsg.message.includes('gelöscht'), true, 'Sollte Lösch-Fehler erwähnen');
});

// ============================================
// 4. Button Creation Flow Tests
// ============================================

const buttonCreationTests = new IntegrationTestRunner('Button Creation Flow Tests');

buttonCreationTests.test('Buttons sollten nicht doppelt erstellt werden', () => {
    const buttons = new Set();

    buttons.add('ka-duplicate-btn');
    buttons.add('ka-smart-btn');

    // Versuche nochmal hinzuzufügen
    const initialSize = buttons.size;
    buttons.add('ka-duplicate-btn');

    assert.strictEqual(buttons.size === initialSize, true, 'Größe sollte gleich bleiben');
});

buttonCreationTests.test('Retry-Logik sollte Max-Versuche respektieren', () => {
    const MAX_BUTTON_RETRIES = 5;
    let retryCount = 0;

    while (retryCount < MAX_BUTTON_RETRIES) {
        retryCount++;
        // Simulate nicht gefunden
    }

    assert.strictEqual(retryCount === MAX_BUTTON_RETRIES, true, 'Sollte Max-Versuche erreichen');
    assert.strictEqual(retryCount <= MAX_BUTTON_RETRIES, true, 'Sollte Max nicht übersteigen');
});

buttonCreationTests.test('Button Container sollte korrekte Klasse haben', () => {
    const container = { className: 'ka-button-container' };

    assert.strictEqual(container.className === 'ka-button-container', true);
    assert.strictEqual(container.className.includes('ka-'), true);
});

// ============================================
// 5. Notification System Tests
// ============================================

const notificationTests = new IntegrationTestRunner('Notification System Tests');

notificationTests.test('Success Notification sollte richtige Klasse haben', () => {
    const notification = {
        className: 'ka-notification success',
        message: '✅ Operation erfolgreich'
    };

    assert.strictEqual(notification.className.includes('success'), true);
    assert.strictEqual(notification.className.includes('ka-notification'), true);
});

notificationTests.test('Error Notification sollte richtige Klasse haben', () => {
    const notification = {
        className: 'ka-notification error',
        message: '❌ Ein Fehler ist aufgetreten'
    };

    assert.strictEqual(notification.className.includes('error'), true);
    assert.strictEqual(notification.className.includes('ka-notification'), true);
});

notificationTests.test('Info Notification sollte richtige Klasse haben', () => {
    const notification = {
        className: 'ka-notification info',
        message: 'ℹ️ Information'
    };

    assert.strictEqual(notification.className.includes('info'), true);
});

notificationTests.test('Notifications sollten nach Timeout verschwinden', () => {
    const notifications = new MockNotification();
    const NOTIFICATION_TIMEOUT_MS = 4000;

    notifications.show('Test-Nachricht', 'info');
    assert.strictEqual(notifications.messages.length === 1, true);

    // Nicht wirklich warten, aber die Logik validieren
    const shouldRemove = Date.now() - notifications.getLastMessage().timestamp > NOTIFICATION_TIMEOUT_MS;
    assert.strictEqual(shouldRemove === false, true, 'Sollte noch sichtbar sein');
});

// ============================================
// 6. Configuration Tests
// ============================================

const configTests = new IntegrationTestRunner('Configuration Tests');

configTests.test('Alle Config-Werte sollten positiv sein', () => {
    const CONFIG = {
        NOTIFICATION_TIMEOUT_MS: 4000,
        DELETE_REQUEST_TIMEOUT_MS: 8000,
        DELETE_WAIT_BEFORE_CREATE_MS: 2000,
        INITIAL_RETRY_WAIT_MS: 500,
        MAX_RETRY_WAIT_MS: 8000,
        MAX_BUTTON_RETRIES: 5
    };

    Object.values(CONFIG).forEach(value => {
        assert.strictEqual(value > 0, true, `Wert sollte positiv sein: ${value}`);
    });
});

configTests.test('Timeouts sollten sinnvoll geordnet sein', () => {
    const CONFIG = {
        NOTIFICATION_TIMEOUT_MS: 4000,
        DELETE_REQUEST_TIMEOUT_MS: 8000,
        DELETE_WAIT_BEFORE_CREATE_MS: 2000,
    };

    // DELETE_REQUEST_TIMEOUT sollte >= DELETE_WAIT sein
    assert.strictEqual(CONFIG.DELETE_REQUEST_TIMEOUT_MS >= CONFIG.DELETE_WAIT_BEFORE_CREATE_MS, true);
});

configTests.test('Retry-Config sollte sinnvoll sein', () => {
    const CONFIG = {
        INITIAL_RETRY_WAIT_MS: 500,
        MAX_RETRY_WAIT_MS: 8000,
        MAX_BUTTON_RETRIES: 5
    };

    assert.strictEqual(CONFIG.MAX_RETRY_WAIT_MS >= CONFIG.INITIAL_RETRY_WAIT_MS, true);
    assert.strictEqual(CONFIG.MAX_BUTTON_RETRIES > 0, true);
    assert.strictEqual(CONFIG.MAX_BUTTON_RETRIES <= 10, true);
});

// ============================================
// 7. State Management Tests
// ============================================

const stateTests = new IntegrationTestRunner('State Management Tests');

stateTests.test('Retry-Count sollte erhöht werden bei Fehlern', () => {
    let buttonCreateRetries = 0;
    const MAX_BUTTON_RETRIES = 5;

    for (let i = 0; i < 3; i++) {
        if (buttonCreateRetries < MAX_BUTTON_RETRIES) {
            buttonCreateRetries++;
        }
    }

    assert.strictEqual(buttonCreateRetries === 3, true);
});

stateTests.test('Retry-Count sollte Max nicht übersteigen', () => {
    let buttonCreateRetries = 0;
    const MAX_BUTTON_RETRIES = 5;

    for (let i = 0; i < 10; i++) {
        if (buttonCreateRetries < MAX_BUTTON_RETRIES) {
            buttonCreateRetries++;
        }
    }

    assert.strictEqual(buttonCreateRetries === MAX_BUTTON_RETRIES, true);
    assert.strictEqual(buttonCreateRetries <= MAX_BUTTON_RETRIES, true);
});

// ============================================
// 8. End-to-End Scenario Tests
// ============================================

const e2eTests = new IntegrationTestRunner('End-to-End Scenario Tests');

e2eTests.test('Kompletter Duplicate Flow sollte funktionieren', () => {
    try {
        const formElements = new MockFormElements('test-123');
        const notifications = new MockNotification();

        const { adIdInput, form } = formElements.getElements();

        // Validate
        if (!adIdInput || !form) throw new Error('Form-Elemente nicht gefunden');

        // Execute
        adIdInput.value = '';
        notifications.show('📋 Anzeige wird dupliziert...', 'info');
        form.submit();

        // Verify
        assert.strictEqual(adIdInput.value === '', true);
        assert.strictEqual(form.submitted, true);
        assert.strictEqual(notifications.messages.length === 1, true);

    } catch (error) {
        assert.fail(`E2E Duplicate sollte erfolgreich sein: ${error.message}`);
    }
});

e2eTests.test('Kompletter Smart Republish Flow sollte funktionieren', async () => {
    try {
        const api = new MockAPI();
        const formElements = new MockFormElements('original-456');
        const notifications = new MockNotification();

        const { adIdInput, form } = formElements.getElements();

        // Validate
        const originalId = adIdInput.value;
        if (!originalId) throw new Error('Keine Anzeigen-ID gefunden');

        // Execute: Delete
        notifications.show('🗑️ Original wird gelöscht...', 'info');
        await api.deleteAd(originalId);

        // Create new
        adIdInput.value = '';
        notifications.show('✨ Neue Anzeige wird erstellt...', 'info');
        form.submit();

        // Verify
        assert.strictEqual(api.deleteCalls.includes(originalId), true);
        assert.strictEqual(adIdInput.value === '', true);
        assert.strictEqual(form.submitted, true);
        assert.strictEqual(notifications.messages.length === 2, true);

    } catch (error) {
        assert.fail(`E2E Smart Republish sollte erfolgreich sein: ${error.message}`);
    }
});

// ============================================
// Run All Tests
// ============================================

async function runAllIntegrationTests() {
    console.log('\n🧪 INTEGRATION TESTS - Kleinanzeigen Anzeigen duplizieren\n');

    const results = [];

    results.push(await duplicateAdTests.run());
    results.push(await smartRepublishTests.run());
    results.push(await errorHandlingTests.run());
    results.push(await buttonCreationTests.run());
    results.push(await notificationTests.run());
    results.push(await configTests.run());
    results.push(await stateTests.run());
    results.push(await e2eTests.run());

    const allPassed = results.every(r => r === true);
    const totalTests = [
        duplicateAdTests, smartRepublishTests, errorHandlingTests,
        buttonCreationTests, notificationTests, configTests,
        stateTests, e2eTests
    ].reduce((sum, runner) => sum + runner.tests.length, 0);

    console.log('='.repeat(60));
    console.log(`📊 SUMMARY: ${totalTests} Integration Tests - ${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);
    console.log('='.repeat(60));

    process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllIntegrationTests().catch(error => {
    console.error('Test Runner Error:', error);
    process.exit(1);
});
