// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.RELEASE_IDENTITY_URL || 'http://127.0.0.1:18784';
const screenshot = process.env.RELEASE_IDENTITY_SCREENSHOT || null;

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__M11_READY__ === true);
  assert.match(await page.locator('main > footer').textContent(), /Intent MCU Simulator 1\.1\.0-rc\.145 source release/u);
  assert.equal(await page.locator('#release-version').textContent(), '1.1.0-rc.145');
  assert.equal(await page.locator('#example-select option').count(), 23);
  const delta = await page.evaluate(async () => {
    const result = await fetch('/release-changes.json', { cache: 'no-store', credentials: 'omit' });
    return { status: result.status, value: await result.json() };
  });
  assert.equal(delta.status, 200);
  assert.deepEqual(delta.value.release, { previous: '1.1.0-rc.144', current: '1.1.0-rc.145' });
  assert.deepEqual(delta.value.changes.map(({ id, classification }) => ({ id, classification })),
    [{ id: 'X72', classification: 'additive' }]);
  if (screenshot) {
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  }
  assert.deepEqual(errors, []);
  assert.equal((await context.cookies()).length, 0);
  console.log(JSON.stringify({ result: 'pass', version: '1.1.0-rc.145', avrChooserChoices: 23,
    release: delta.value.release, changes: delta.value.changes.map(({ id }) => id), screenshot }));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
