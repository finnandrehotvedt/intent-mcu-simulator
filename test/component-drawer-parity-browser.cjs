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
    await page.evaluate(() => { window.__componentDrawerIdentity = document.querySelector('#simple-parts-drawer'); });
    const profiles = [
      'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
      'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
    ];
    const requiredRoles = ['search', 'count', 'feature', 'feature-artwork', 'feature-open', 'list', 'empty',
      'clear', 'prev', 'page', 'next', 'category', 'interface', 'status', 'supply-voltage',
      'pin-voltage', 'favorites', 'support-open'];
    let avrShape = null; let avrRowStyle = null;
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile);
      await page.waitForFunction((value) => document.querySelector('#board-select').value === value, profile);
      assert.equal(await page.locator('#simple-parts-drawer').getAttribute('aria-hidden'), 'false');
      assert.equal(await page.evaluate(() => (
        document.querySelector('#simple-parts-drawer') === window.__componentDrawerIdentity
      )), true);
      const picker = page.locator('#simple-parts-mount > [data-component-picker-contract]');
      assert.equal(await picker.count(), 1);
      assert.equal(await picker.getAttribute('data-component-picker-contract'), 'intent-mcu-avr-catalog-picker@1');
      assert.equal(await picker.getAttribute('data-component-picker-profile'), profile);
      for (const role of requiredRoles) assert.equal(await picker.locator(`[data-picker-role="${role}"]`).count(), 1, `${profile}:${role}`);
      assert.equal(await picker.locator('[data-picker-role="feature-artwork"] svg[role="img"]').count(), 1, profile);
      assert.equal(await picker.locator('.catalog-advanced-filters').count(), 1, profile);
      assert.equal(await picker.locator('.catalog-pagination').count(), 1, profile);
      assert.equal(await picker.locator('.catalog-support-card').count(), 1, profile);
      const shape = await picker.evaluate((node) => [...node.children].map((child) => ({
        tag: child.tagName, classes: [...child.classList].sort(),
      })));
      if (!avrShape) avrShape = shape; else assert.deepEqual(shape, avrShape, `${profile}: picker structure drifted from AVR`);

      await picker.locator('.catalog-advanced-filters').evaluate((node) => { node.open = true; });
      await picker.locator('[data-picker-role="status"]').selectOption('all');
      await picker.locator('[data-picker-role="search"]').fill('RES-AXIAL-025W');
      assert.equal(await picker.locator('[data-picker-role="count"]').textContent(), '1 part', profile);
      assert.equal(await picker.locator('[data-picker-role="list"] .catalog-item').count(), 1, profile);
      const rowStyle = await picker.locator('[data-picker-role="list"] .catalog-item').evaluate((node) => {
        const rect = node.getBoundingClientRect(); const style = getComputedStyle(node);
        const copy = getComputedStyle(node.querySelector('.catalog-item-copy'));
        const favorite = getComputedStyle(node.querySelector('.catalog-favourite'));
        return { display: style.display, columns: style.gridTemplateColumns, gap: style.gap,
          minHeight: style.minHeight, padding: style.padding, height: Math.round(rect.height),
          copyMinWidth: copy.minWidth, favoriteMinHeight: favorite.minHeight };
      });
      if (!avrRowStyle) avrRowStyle = rowStyle; else assert.deepEqual(rowStyle, avrRowStyle, `${profile}: card style drifted from AVR`);
      assert.equal(rowStyle.display, 'grid'); assert(rowStyle.height >= 68, profile);
      assert.equal(await picker.locator('.catalog-favourite').isVisible(), true, profile);

      await picker.locator('[data-picker-role="search"]').fill('definitely-no-component');
      assert.equal(await picker.locator('[data-picker-role="empty"]').isVisible(), true, profile);
      await picker.locator('[data-picker-role="clear"]').click();
      assert.equal(await picker.locator('[data-picker-role="search"]').inputValue(), '', profile);
    }

    fs.mkdirSync(path.dirname(output), { recursive: true });
    await page.screenshot({ path: output, fullPage: false });
    assert.deepEqual(errors, []);
    assert.deepEqual(builds, []);
    assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, profiles: 4, trafficLightFeature: true,
      contract: 'intent-mcu-avr-catalog-picker@1', structureParity: true, cardStyleParity: true, screenshot: output })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
