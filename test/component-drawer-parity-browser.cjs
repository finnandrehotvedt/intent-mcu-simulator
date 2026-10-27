// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.COMPONENT_DRAWER_URL || 'http://127.0.0.1:18891';
const output = process.env.COMPONENT_DRAWER_OUTPUT || '/tmp/component-drawer-parity.png';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = []; const builds = []; const outside = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(60_000);
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/page-views', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
    }));
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (request.method() === 'POST' && url.pathname === '/api/build') builds.push(request.url());
    });

    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    assert.equal(await page.locator('#simple-parts-drawer').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('#toggle-catalog').isVisible(), true);
    await page.click('#toggle-catalog');
    await page.waitForSelector('#simple-parts-drawer.is-open');
    assert.equal(await page.locator('#catalog-release-feature').isVisible(), true);
    assert.equal(await page.locator('#catalog-release-feature-artwork [data-artwork-key="output-traffic-light-module"]').count(), 1);
    assert.equal(await page.locator('#catalog-release-feature-open').isVisible(), true);
    const avrRow = await page.locator('#catalog-list .catalog-item').first().evaluate((node) => {
      const rect = node.getBoundingClientRect(); const style = getComputedStyle(node);
      return { height: rect.height, display: style.display, columns: style.gridTemplateColumns };
    });
    assert.equal(avrRow.display, 'grid');
    assert(avrRow.height >= 68);

    await page.click('#catalog-release-feature-open');
    if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(() => {
      const value = window.__M6_PROJECT__();
      return (value?.project ?? value)?.metadata?.name === 'Traffic light sequence';
    });
    assert.equal(await page.locator('[data-component-id="traffic-light-1"] [data-artwork-key="output-traffic-light-module"]').count(), 1);
    assert.equal(await page.locator('#simple-parts-drawer').getAttribute('aria-hidden'), 'true');

    await page.selectOption('#board-select', 'board.esp32-c3-devmodule-v1');
    await page.waitForFunction(() => document.querySelector('#board-select').value === 'board.esp32-c3-devmodule-v1');
    await page.click('#toggle-catalog');
    await page.fill('#c3-parts-search', 'resistor');
    assert.match(await page.locator('#c3-parts-count').textContent(), /^1 of /u);
    assert.equal(await page.locator('#c3-parts-list .catalog-item').count(), 1);
    const c3Row = await page.locator('#c3-parts-list .catalog-item').evaluate((node) => {
      const rect = node.getBoundingClientRect(); const style = getComputedStyle(node);
      const action = getComputedStyle(node.querySelector('.bounded-part-add'));
      return { height: rect.height, display: style.display, columns: style.gridTemplateColumns,
        actionColumn: action.gridColumnStart };
    });
    assert.equal(c3Row.display, 'grid');
    assert(c3Row.height >= 68);
    assert.equal(c3Row.actionColumn, '3');
    assert.equal(c3Row.columns.split(' ').length, avrRow.columns.split(' ').length);

    await page.evaluate(() => { window.__componentDrawerIdentity = document.querySelector('#simple-parts-drawer'); });
    for (const [profile, search] of [
      ['board.rp2040-pico-v1', '#pico-parts-search'],
      ['board.stm32f429zi-nucleo144-v1', '#stm32-parts-search'],
      ['board.atmega328p-16mhz-v1', '#catalog-search'],
    ]) {
      await page.selectOption('#board-select', profile);
      await page.waitForFunction((value) => document.querySelector('#board-select').value === value, profile);
      assert.equal(await page.locator('#simple-parts-drawer').getAttribute('aria-hidden'), 'false');
      assert.equal(await page.locator(`#simple-parts-drawer ${search}`).count(), 1);
      assert.equal(await page.evaluate(() => (
        document.querySelector('#simple-parts-drawer') === window.__componentDrawerIdentity
      )), true);
    }

    fs.mkdirSync(path.dirname(output), { recursive: true });
    await page.screenshot({ path: output, fullPage: false });
    assert.deepEqual(errors, []);
    assert.deepEqual(builds, []);
    assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, profiles: 4, trafficLightFeature: true, searchParity: true, screenshot: output })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
