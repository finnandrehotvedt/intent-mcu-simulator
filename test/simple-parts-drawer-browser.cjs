// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.SIMPLE_PARTS_URL || 'http://127.0.0.1:18935';
const profiles = [
  { id: 'board.rp2040-pico-v1', global: '__RP2040_PUBLIC_WORKBENCH__', diagram: '#pico-diagram' },
  { id: 'board.esp32-c3-devmodule-v1', global: '__ESP32C3_PUBLIC_WORKBENCH__', diagram: '#c3-diagram' },
  { id: 'board.stm32f429zi-nucleo144-v1', global: '__STM32_PUBLIC_WORKBENCH__', diagram: '#stm32-diagram' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  let buildPosts = 0;
  try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.route('**/api/page-views', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'disabled' }),
      }));
      page.on('request', (request) => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/build') buildPosts += 1;
      });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__M11_READY__ === true);
      assert.equal(await page.locator('#simple-parts-drawer').isVisible(), true);
      assert.equal(await page.locator('#active-canvas-mount').isVisible(), true);
      assert.equal(await page.locator('#catalog-list').evaluate((node) => node.compareDocumentPosition(document.querySelector('.catalog-advanced-filters')) & Node.DOCUMENT_POSITION_FOLLOWING), 4);
      assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);

      await page.click('#beginner-scratch');
      const before = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
      const led = page.locator('.catalog-item[data-type="led.basic-v1"]');
      await led.dragTo(page.locator('#circuit-canvas'), { targetPosition: { x: 650, y: 220 } });
      await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.some((item) => item.type === 'led.basic-v1'));
      const ledPosition = await page.evaluate(() => {
        const project = window.__M6_PROJECT__();
        const component = project.circuit.components.find((item) => item.type === 'led.basic-v1');
        return project.layout.positions[component.id];
      });
      assert(ledPosition.x > 0.5 && ledPosition.x < 0.85);
      await page.click('#simple-parts-undo');
      assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), before);
      await page.locator('.catalog-item[data-type="resistor.fixed-v1"]').click();
      assert.equal(await page.evaluate(() => window.__M6_PROJECT__().circuit.components.length), 1);
      await page.locator('.catalog-item[data-type="board.atmega328p-16mhz-v1"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__M6_PROJECT__().circuit.components.length), 2);
      const countBeforeCancel = await page.evaluate(() => window.__M6_PROJECT__().circuit.components.length);
      await page.locator('.catalog-item[data-type="button.momentary-v1"]').dragTo(page.locator('#top-workbench-title'));
      assert.equal(await page.evaluate(() => window.__M6_PROJECT__().circuit.components.length), countBeforeCancel);

      for (const [index, profile] of profiles.entries()) {
        await page.selectOption('#board-select', profile.id);
        await page.waitForFunction((name) => window[name]?.state?.().active === true, profile.global);
        assert.equal(await page.locator('#simple-parts-drawer').isVisible(), true);
        assert.equal(await page.locator(profile.diagram).isVisible(), true);
        const wireBefore = await page.evaluate((name) => JSON.stringify(window[name].state().circuitEditor.draft), profile.global);
        await page.evaluate((name) => {
          const api = window[name];
          const series = api.state().circuitEditor.draft.nets.find((net) => net.id === 'net-series');
          api.selectCircuit({ kind: 'net', id: series.id });
          if (!api.deleteSelected().ok) throw new Error('delete named cable failed');
          if (!api.activateEndpoint(series.endpoints[0]).ok) throw new Error('first named pin failed');
          if (!api.activateEndpoint(series.endpoints[1]).ok) throw new Error('second named pin failed');
          if (!api.undoCircuit().ok || !api.undoCircuit().ok) throw new Error('named cable undo failed');
        }, profile.global);
        assert.equal(await page.evaluate((name) => JSON.stringify(window[name].state().circuitEditor.draft), profile.global), wireBefore);
        await page.evaluate((name) => {
          const api = window[name];
          api.selectCircuit({ kind: 'component', id: 'led-1' });
          const deleted = api.deleteSelected();
          if (!deleted.ok) throw new Error(deleted.code);
        }, profile.global);
        const beforeProfile = await page.evaluate((name) => JSON.stringify(window[name].state().circuitEditor.draft), profile.global);
        const card = page.locator('#simple-parts-mount .bounded-part-card[data-type="led.basic-v1"][draggable="true"]');
        await card.waitFor({ state: 'visible' });
        if (index === 0) {
          await card.dragTo(page.locator(profile.diagram), { targetPosition: { x: 520, y: 300 } });
        } else if (index === 1) {
          await card.locator('button[data-bounded-add="led.basic-v1"]').click();
        } else {
          await card.locator('button[data-bounded-add="led.basic-v1"]').focus();
          await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(250);
        const added = await page.evaluate((name) => ({
          components: window[name].state().circuitEditor.draft.components.map((item) => item.id),
          status: document.querySelector('#simple-parts-status').textContent,
        }), profile.global);
        assert(added.components.includes('led-1'), `${profile.id}: ${JSON.stringify(added)}`);
        await page.click('#simple-parts-undo');
        assert.equal(await page.evaluate((name) => JSON.stringify(window[name].state().circuitEditor.draft), profile.global), beforeProfile);
      }
      assert.equal(await page.locator('#simple-parts-drawer').isVisible(), true);
      if (process.env.SIMPLE_PARTS_SCREENSHOT && viewport.width === 1440) {
        fs.mkdirSync(path.dirname(process.env.SIMPLE_PARTS_SCREENSHOT), { recursive: true });
        await page.screenshot({ path: process.env.SIMPLE_PARTS_SCREENSHOT, fullPage: true });
      }
      await page.click('#workbench-view-advanced');
      assert.equal(await page.locator('#simple-parts-drawer').isVisible(), false);
      assert.equal(await page.locator('#toggle-catalog').isVisible(), true);
      await context.close();
    }
    assert.equal(buildPosts, 0);
    process.stdout.write(`${JSON.stringify({ result: 'pass', viewports: 2, profiles: 4,
      avrDragClickKeyboard: true, boundedDragClickKeyboard: true, cancelAtomic: true,
      undoExact: true, buildPosts, workerCreations: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
