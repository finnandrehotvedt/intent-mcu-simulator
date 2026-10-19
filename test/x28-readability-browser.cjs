// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X28_READABILITY_URL || 'http://127.0.0.1:18794';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1732, height: 1100 } });
    const page = await context.newPage(); const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X28_LONG_DURATION__?.ready === true);
    assert.deepEqual(await page.locator('.long-duration-table thead th').allTextContents(),
      ['Cell', 'Expected', 'Observed', 'Outcome', 'Full evidence']);
    assert.equal(await page.locator('#long-duration-results').textContent(),
      'No current X28 report. Reports are transient and never project, timer or verdict authority.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1), true);
    await page.click('#serial-tab');
    await page.waitForFunction(() => !document.querySelector('#serial-dock').hidden);
    const geometry = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const dock = document.querySelector('#serial-dock').getBoundingClientRect();
      return { mainRight: main.right, dockLeft: dock.left,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.ok(geometry.mainRight <= geometry.dockLeft + 1, JSON.stringify(geometry));
    assert.ok(geometry.overflow <= 1, JSON.stringify(geometry));
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);
    process.stdout.write(`${JSON.stringify({ viewport: '1732x1100', serialNoOverlap: true,
      overflow: geometry.overflow, errors: 0, cookies: 0, thirdPartyRequests: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
