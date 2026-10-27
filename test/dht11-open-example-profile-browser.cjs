// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.DHT11_OPEN_EXAMPLE_URL || 'http://127.0.0.1:18892';
const output = process.env.DHT11_OPEN_EXAMPLE_OUTPUT || '/tmp/dht11-open-example-profile.png';
const AVR = 'board.atmega328p-16mhz-v1';
const profiles = [
  { id: 'board.rp2040-pico-v1', source: '#pico-source', marker: '// preserved Pico drawing' },
  { id: 'board.esp32-c3-devmodule-v1', source: '#c3-source', marker: '// preserved C3 drawing' },
  { id: 'board.stm32f429zi-nucleo144-v1', source: '#stm32-source', marker: '// preserved STM32 drawing' },
];

async function prepare(page) {
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/page-views', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
  }));
  assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
}

async function projectName(page) {
  return page.evaluate(() => {
    const value = window.__M6_PROJECT__();
    return (value.project ?? value).metadata.name;
  });
}

async function setSource(page, selector, marker) {
  await page.locator(selector).evaluate((node, suffix) => {
    node.value = `${node.value}\n${suffix}`;
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, marker);
  await page.waitForFunction((value) => Object.values(localStorage).some((stored) => stored.includes(value)), marker);
}

async function assertFeature(page, profile) {
  if (!(await page.locator('#simple-parts-drawer').getAttribute('class')).includes('is-open')) {
    await page.click('#toggle-catalog');
    await page.waitForSelector('#simple-parts-drawer.is-open');
  }
  const picker = page.locator('#simple-parts-mount > [data-component-picker-contract]');
  assert.equal(await picker.getAttribute('data-component-picker-profile'), profile);
  assert.equal(await picker.locator('[data-picker-role="feature-title"]').textContent(),
    'DHT11 temperature and humidity');
  assert.equal(await picker.locator('[data-picker-role="feature-open"]').textContent(), 'Open example');
  assert.equal(await picker.locator(
    '[data-picker-role="feature-artwork"] [data-artwork-key="sensor-dht11-temperature-humidity"]',
  ).count(), 1);
  return picker.locator('[data-picker-role="feature-open"]');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const accepted = [];
  try {
    for (const profile of profiles) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.setDefaultTimeout(60_000);
      const errors = []; const outside = [];
      page.on('pageerror', (error) => errors.push(error.stack || String(error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', (request) => {
        if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
      });
      await prepare(page);
      await page.selectOption('#board-select', profile.id);
      await page.waitForFunction((value) => document.querySelector('#board-select').value === value, profile.id);
      await setSource(page, profile.source, profile.marker);
      const open = await assertFeature(page, profile.id);
      await open.click();
      await page.waitForFunction((value) => document.querySelector('#board-select').value === value, AVR);
      await page.waitForFunction(() => {
        const value = window.__M6_PROJECT__();
        return (value.project ?? value).metadata.name === 'DHT11 temperature and humidity';
      });
      assert.equal((await page.locator(profile.source).inputValue()).includes(profile.marker), true);
      assert.equal(await page.evaluate((value) => Object.values(localStorage).some(
        (stored) => stored.includes(value)), profile.marker), true);
      await page.selectOption('#board-select', profile.id);
      await page.waitForFunction((value) => document.querySelector('#board-select').value === value, profile.id);
      assert.equal((await page.locator(profile.source).inputValue()).includes(profile.marker), true);
      assert.deepEqual(errors, []); assert.deepEqual(outside, []);
      accepted.push(profile.id);
      if (profile.id === 'board.esp32-c3-devmodule-v1') {
        fs.mkdirSync(path.dirname(output), { recursive: true });
        await page.screenshot({ path: output, fullPage: false });
      }
      await page.close();
    }

    const guardPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    guardPage.setDefaultTimeout(60_000);
    await prepare(guardPage);
    const avrMarker = '// preserved AVR edit';
    await guardPage.locator('#source').evaluate((node, suffix) => {
      node.value = `${node.value}\n${suffix}`;
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }, avrMarker);
    await guardPage.selectOption('#board-select', 'board.esp32-c3-devmodule-v1');
    await guardPage.waitForFunction(() => document.querySelector('#board-select').value === 'board.esp32-c3-devmodule-v1');
    let open = await assertFeature(guardPage, 'board.esp32-c3-devmodule-v1');
    await open.click();
    await guardPage.waitForSelector('#unsaved-change-dialog[open]');
    assert.equal(await projectName(guardPage), 'Blink demo');
    assert.equal(await guardPage.locator('#board-select').inputValue(), 'board.esp32-c3-devmodule-v1');
    await guardPage.click('#unsaved-keep');
    assert.equal((await guardPage.locator('#source').inputValue()).includes(avrMarker), true);
    open = await assertFeature(guardPage, 'board.esp32-c3-devmodule-v1');
    await open.click();
    await guardPage.waitForSelector('#unsaved-change-dialog[open]');
    await guardPage.click('#unsaved-discard');
    await guardPage.waitForFunction(() => document.querySelector('#board-select').value === 'board.atmega328p-16mhz-v1');
    assert.equal(await projectName(guardPage), 'DHT11 temperature and humidity');
    await guardPage.close();

    process.stdout.write(`${JSON.stringify({ ok: true, sourceProfileButtons: accepted,
      destination: AVR, dht11Project: true, parkedProfileStoragePreserved: true,
      dirtyAvrGuard: true, screenshot: output })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
