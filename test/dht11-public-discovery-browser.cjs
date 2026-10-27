// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.DHT11_DISCOVERY_URL || 'http://127.0.0.1:18796';
const screenshot = process.env.DHT11_DISCOVERY_SCREENSHOT || null;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(30_000);
    const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
    });
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/page-views', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
    }));

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    assert.equal(await page.locator('body').getAttribute('data-workbench-view'), 'simple');
    const direct = page.locator('#beginner-dht11');
    assert.equal(await direct.isVisible(), true, 'DHT11 is not visible in the ordinary first view');
    assert.match(await direct.textContent(), /DHT11/u);
    await direct.click();
    await page.waitForFunction(() => {
      const value = window.__M6_PROJECT__();
      return (value?.project ?? value)?.metadata?.name === 'DHT11 temperature and humidity';
    });
    assert.equal(await page.locator('[data-component-id="dht11-1"]').isVisible(), true);
    assert.match(await page.locator('#beginner-status').textContent(), /DHT11 loaded/u);

    await page.click('#toggle-catalog');
    assert.equal(await page.locator('#catalog-release-feature-title').textContent(),
      'DHT11 temperature and humidity');
    assert.equal(await page.locator(
      '#catalog-release-feature-artwork [data-artwork-key="sensor-dht11-temperature-humidity"]',
    ).count(), 1);
    const picker = page.locator('#simple-parts-mount > [data-component-picker-contract]');
    await picker.locator('[data-picker-role="search"]').fill('DHT11');
    assert.equal(await picker.locator('[data-picker-role="list"] .catalog-item').count(), 1);
    assert.match(await picker.locator('[data-picker-role="list"] .catalog-item').textContent(), /DHT11/u);
    await page.click('#toggle-catalog');

    await page.click('#beginner-examples');
    assert.equal(await page.locator('#example-picker-dialog').evaluate((dialog) => dialog.open), true);
    assert.equal(await page.locator('.starter-card').nth(2).getAttribute('data-example'),
      'avr-dht11-temperature-humidity');
    assert.equal(await page.locator(
      '.starter-card[data-example="avr-dht11-temperature-humidity"]',
    ).isVisible(), true);
    assert.equal(await page.locator('#example-picker-status').textContent(), '23 examples available');

    if (screenshot) {
      fs.mkdirSync(path.dirname(screenshot), { recursive: true });
      await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, simpleView: true, directDht11: true,
      releaseFeature: 'DHT11 temperature and humidity', examples: 23, outsideRequests: 0,
      screenshot })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
