#!/usr/bin/env node

/**
 * Master Test Runner
 * Führt alle Tests aus und erstellt einen finalen Report
 */

const { spawn } = require('child_process');
const path = require('path');

// ============================================
// Test Runner
// ============================================

class MasterTestRunner {
    constructor() {
        this.results = [];
        this.totalTests = 0;
        this.totalPassed = 0;
        this.totalFailed = 0;
        this.startTime = Date.now();
    }

    async runTest(testFile, testName) {
        return new Promise((resolve) => {
            console.log(`\n🧪 Running ${testName}...`);
            console.log('─'.repeat(60));

            const testPath = path.join(__dirname, testFile);
            const process = spawn('node', [testPath]);

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                process.stdout.write(output);
            });

            process.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                process.stderr.write(output);
            });

            process.on('close', (code) => {
                const success = code === 0;
                this.results.push({
                    name: testName,
                    file: testFile,
                    success,
                    code,
                    output: stdout,
                    error: stderr
                });
                resolve(success);
            });
        });
    }

    async runAll() {
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║        KLEINANZEIGEN ANZEIGEN-DUPLIZIEREN v3.0.0       ║');
        console.log('║                    MASTER TEST RUNNER                  ║');
        console.log('╚════════════════════════════════════════════════════════╝');

        const tests = [
            { file: 'helpers.test.js', name: 'Unit Tests (Helper Functions)' },
            { file: 'integration.test.js', name: 'Integration Tests (Workflows)' }
        ];

        for (const test of tests) {
            await this.runTest(test.file, test.name);
        }

        this.generateReport();
    }

    generateReport() {
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);

        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║                      FINAL REPORT                      ║');
        console.log('╚════════════════════════════════════════════════════════╝\n');

        // Test Results Summary
        console.log('📊 Test Suite Results:\n');
        this.results.forEach((result, index) => {
            const status = result.success ? '✅ PASSED' : '❌ FAILED';
            console.log(`${index + 1}. ${result.name}`);
            console.log(`   Status: ${status}`);
            console.log(`   File: ${result.file}`);
            console.log(`   Exit Code: ${result.code}\n`);
        });

        // Overall Results
        const allPassed = this.results.every(r => r.success);
        console.log('═'.repeat(60));
        console.log(`\n⏱️  Total Time: ${elapsed}s`);
        console.log(`🎯 Test Suites: ${this.results.length}`);
        console.log(`📈 Overall Status: ${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}\n`);

        if (allPassed) {
            console.log('╔════════════════════════════════════════════════════════╗');
            console.log('║  🎉 ALL TESTS PASSED! The code is production-ready.   ║');
            console.log('╚════════════════════════════════════════════════════════╝\n');
            process.exit(0);
        } else {
            console.log('╔════════════════════════════════════════════════════════╗');
            console.log('║  ⚠️  Some tests failed. Please review the errors above. ║');
            console.log('╚════════════════════════════════════════════════════════╝\n');
            process.exit(1);
        }
    }
}

// ============================================
// Run Master Test Runner
// ============================================

const runner = new MasterTestRunner();
runner.runAll().catch(error => {
    console.error('❌ Test Runner Error:', error);
    process.exit(1);
});
