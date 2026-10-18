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
  assert.match(await page.locator('footer').textContent(), /Intent MCU Simulator 1\.1\.0-rc\.48 public release/u);

  await page.selectOption('#example-select', 'avr-thermostat-boundary-v1');
  await page.click('#project-demo');
  assert.equal(await page.locator('#thermostat-run-tests').textContent(), 'Run 4 boundary tests');
  assert.match(await page.locator('#thermostat-experiment-message').textContent(), /four boundary scenarios/u);
  assert.equal(await page.inputValue('#seeded-property-seed'), '305419896');
  assert.equal(await page.locator('#seeded-property-seed').getAttribute('aria-describedby'), 'seeded-property-exact-value');
  assert.equal(await page.locator('#seeded-property-exact-value').textContent(), 'Exact seed value: 305419896');
  await page.click('#seeded-property-generate');
  assert.equal(await page.evaluate(() => window.__M6_STATE__.thermostatExperiment.authoredTimeline.propertySuite.seed), 305419896);
  assert.equal(await page.inputValue('#seeded-property-seed'), '305419896');
  assert.equal(await page.locator('#seeded-property-exact-value').textContent(), 'Exact seed value: 305419896');
  await page.click('#thermostat-load-bad');
  assert.match(await page.locator('#thermostat-experiment-message').textContent(),
    /current authored timeline or the four fixed boundary scenarios/u);
  await page.click('#fault-suite-load');
  assert.match(await page.locator('#fault-suite-summary').textContent(), /Bus-response fault remains unsupported/iu);
  if (screenshot) {
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  }
  assert.deepEqual(errors, []);
  assert.equal((await context.cookies()).length, 0);
  console.log(JSON.stringify({ result: 'pass', version: '1.1.0-rc.48', boundaryCases: 4,
    exactSeed: '305419896', faultCases: 3, busResponse: 'unsupported', screenshot }));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
