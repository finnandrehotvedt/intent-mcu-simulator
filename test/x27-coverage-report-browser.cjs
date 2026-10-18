// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X27_COVERAGE_URL || 'http://127.0.0.1:18793';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage(); const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X27_COVERAGE_REPORT__?.ready === true);
    assert.match(await page.textContent('#regression-matrix'), /Seven declared partitions/u);
    assert.match(await page.textContent('#regression-matrix'), /Instruction coverage is unavailable/u);
    assert.match(await page.textContent('#regression-matrix'), /QEMU CPU\/UART evidence remains separate/u);
    const report = await page.evaluate(() => window.__X27_COVERAGE_REPORT__.run('all'));
    assert.equal(report.schema, 'intent-mcu-coverage-report@1');
    assert.deepEqual(report.counts, { declared: 7, supported: 7, executed: 7, passed: 7, failed: 0,
      notRun: 0, unsupported: 0, indeterminate: 0, infrastructureError: 0 });
    assert.equal((await page.textContent('#coverage-report-state')).trim(), '7/7 partitions passed');
    await page.evaluate(() => window.__X27_COVERAGE_REPORT__.clear());
    assert.equal(await page.evaluate(() => window.__X27_COVERAGE_REPORT__.report()), null);
    assert.equal((await page.textContent('#coverage-report-state')).trim(), 'Not run');
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
