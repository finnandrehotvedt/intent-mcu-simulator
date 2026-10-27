// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.DS18B20_UI_URL || 'http://127.0.0.1:18794';
const verifiedHexPath = process.env.DS18B20_VERIFIED_HEX;
if (!verifiedHexPath) throw new Error('DS18B20_VERIFIED_HEX_REQUIRED');
const verifiedHex = fs.readFileSync(verifiedHexPath, 'utf8');
const verifiedSource = fs.readFileSync(path.join(__dirname, 'fixtures/ds18b20_read/ds18b20_read.ino'), 'utf8');
const verifiedHexSha256 = crypto.createHash('sha256').update(verifiedHex).digest('hex');
if (verifiedHexSha256 !== 'db4b3a929adee1d2848c96af4410d06ec875ee053c7a8c7fe6fd38452d55b701') {
  throw new Error(`DS18B20_VERIFIED_HEX_IDENTITY:${verifiedHexSha256}`);
}

async function discardIfRequired(page) {
  if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) {
    await page.click('#unsaved-discard');
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    page.setDefaultTimeout(60_000);
    const errors = []; const outside = []; const builds = [];
    let verifiedSourceDigest = null;
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
    });
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.route((url) => url.pathname.startsWith('/api/build'), async (route) => {
      if (route.request().method() === 'POST') {
        const submitted = JSON.parse(route.request().postData() || '{}');
        assert.equal(submitted.schema, 'teach-lab-build-request@1');
        assert.equal(submitted.board, 'board.atmega328p-16mhz-v1');
        assert.deepEqual(submitted.files, [{ name: 'main.ino', content: verifiedSource }]);
        verifiedSourceDigest = crypto.createHash('sha256').update(JSON.stringify({
          schema: submitted.schema, board: submitted.board, files: submitted.files,
        })).digest('hex');
        builds.push(verifiedSourceDigest);
        await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
          jobId: 'verified-ds18b20-fixture', capability: 'verified-isolated-avr-fixture-cache',
        }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'succeeded', cacheHit: true, result: {
          artifactIdentity: verifiedHexSha256, inputIdentity: verifiedSourceDigest,
          artifact: { hex: verifiedHex, hexSha256: verifiedHexSha256 }, diagnostics: [],
        },
      }) });
    });
    await page.route('**/api/page-views', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
    }));

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#workbench-view-advanced');

    await page.evaluate(() => document.querySelector(
      '.starter-card[data-example="avr-ds18b20-temperature"] .starter-action',
    ).click());
    await discardIfRequired(page);
    await page.waitForFunction(() => {
      const value = window.__M6_PROJECT__();
      return (value?.project ?? value)?.metadata?.name === 'DS18B20 OneWire temperature';
    });
    await page.click('#toggle-catalog');
    const picker = page.locator('#simple-parts-mount > [data-component-picker-contract]');
    await picker.locator('[data-picker-role="search"]').fill('DS18B20');
    assert.equal(await picker.locator('[data-picker-role="list"] .catalog-item').count(), 1);
    assert.match(await picker.locator('[data-picker-role="list"] .catalog-item').textContent(), /DS18B20/u);
    assert.equal(await picker.locator('[data-picker-role="list"] [data-artwork-key="sensor-ds18b20-temperature"]').count(), 1);
    await page.click('#toggle-catalog');

    const card = page.locator('[data-component-id="ds18b20-1"]');
    assert.equal(await card.locator('[data-artwork-key="sensor-ds18b20-temperature"]').count(), 1);
    for (const pin of ['VCC', 'DQ', 'GND']) {
      assert.equal(await card.locator(`[data-terminal-pin="${pin}"]`).count(), 1, pin);
    }
    await card.click({ force: true });
    await page.click('#toggle-inspector');
    const temperature = page.locator('[data-control="ds18b20-1.temperatureC"]');
    assert.deepEqual(await temperature.evaluate((node) => ({
      min: node.min, max: node.max, step: node.step, value: node.value,
    })), { min: '-55', max: '125', step: '0.0625', value: '23.5' });

    await page.click('#workbench-inspector-dialog .workbench-popup-close');
    await page.click('#quick-build');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded');
    await page.click('#quick-run');
    await page.waitForFunction(() => !document.querySelector('#speed').disabled);
    await page.evaluate(() => {
      const speed = document.querySelector('#speed');
      speed.value = 'maximum'; speed.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => /TEMP_C=23\.5000 CRC=OK/u.test(
      document.querySelector('#serial-output').textContent), null, { timeout: 20_000 });

    await page.click('#toggle-inspector');
    await temperature.evaluate((node) => {
      node.value = '-10.125'; node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components.find(
      ({ id }) => id === 'ds18b20-1')?.controls?.temperatureC === -10.125);
    await page.waitForFunction(() => /TEMP_C=-10\.1250 CRC=OK/u.test(
      document.querySelector('#serial-output').textContent), null, { timeout: 20_000 });
    assert.doesNotMatch(await page.textContent('#serial-output'), /DS18B20 READ ERROR/u);
    assert.equal(await card.locator('[data-artwork-key="sensor-ds18b20-temperature"]')
      .getAttribute('data-temperature-c'), '-10.125');

    if (await page.locator('#workbench-inspector-dialog').evaluate((dialog) => dialog.open)) {
      await page.click('#workbench-inspector-dialog .workbench-popup-close');
    }
    await page.click('#quick-pause');
    await page.waitForFunction(() => document.querySelector('#worker-state').textContent.includes('Paused'));
    const exact = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    await page.click('#project-files-open');
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.click('#project-save'),
    ]);
    const savedPath = await download.path();
    assert(savedPath && fs.statSync(savedPath).size > 500);
    await page.setInputFiles('#project-open-input', savedPath);
    await discardIfRequired(page);
    await page.waitForFunction((value) => JSON.stringify(window.__M6_PROJECT__()) === value, exact);
    assert.equal(await page.locator('#quick-run').isDisabled(), true,
      'Open restored stale runtime authority');

    assert.equal(builds.length, 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, picker: true, artwork: true,
      temperatureC: -10.125, serial: 'TEMP_C=-10.1250 CRC=OK', saveOpen: true,
      staleRuntimeAuthorityCleared: true, verifiedHexSha256, compilerPosts: builds.length,
      outsideRequests: outside.length })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
