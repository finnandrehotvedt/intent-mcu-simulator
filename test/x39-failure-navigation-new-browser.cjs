// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.X39_UI_URL || 'http://127.0.0.1:18821';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.selectOption('#example-select', 'avr-thermostat-boundary-v1');
    await page.click('#project-demo');
    await page.click('#thermostat-load-bad');
    await page.click('#build');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 60_000 });
    await page.click('#thermostat-run-tests');
    await page.waitForFunction(() => window.__M6_STATE__.x39FailureLocator, null, { timeout: 40_000 });
    await page.click('#project-new');
    if (await page.locator('#unsaved-change-dialog[open]').count()) await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__M6_STATE__.x39FailureLocator === null);
    assert.equal(await page.locator('[data-x39-failure-action]').count(), 0);
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ status: 'pass', browser: 'chromium', lifecycleClear: 'New' })}\n`);
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
