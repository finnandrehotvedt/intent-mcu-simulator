const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/runner/node_modules/playwright');

const base = process.env.X83_URL || 'http://host.docker.internal:18844';
const screenshot = process.env.X83_SCREENSHOT || '/evidence/x83-private-retry.png';

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let syntheticRequests = 0;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/build', async (route) => {
    syntheticRequests += 1;
    await route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Retry-After': '7' },
      body: JSON.stringify({ code: 'BUILD_QUEUE_FULL', retryAfterSeconds: 7,
        retryAdvisory: true, retryReservesCapacity: false, requiresNewRequestId: true }) });
  });
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('#project-demo');
  await page.waitForFunction(() => document.querySelector('#example-picker-dialog').open === true);
  await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);
  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state')?.textContent === 'Build request failed');
  const message = await page.locator('#project-message').textContent();
  assert.match(message, /Try again in 7 seconds with a new request/u);
  assert.match(message, /Capacity is not reserved/u);
  assert.equal(syntheticRequests, 1);
  assert.equal(await page.locator('[data-x83-panel]').count(), 0);
  assert.deepEqual(errors, []);
  assert.equal((await context.cookies()).length, 0);
  fs.mkdirSync(path.dirname(screenshot), { recursive: true });
  await page.locator('.workspace').screenshot({ path: screenshot });
  console.log(JSON.stringify({ result: 'pass', synthetic429: true, firmwareBuilds: 0,
    runtimeRuns: 0, automaticRetries: syntheticRequests - 1, message: message.trim(), screenshot }));
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
