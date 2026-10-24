// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.BEGINNER_START_URL || 'http://127.0.0.1:18932';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const page = await context.newPage();
      let buildRequests = 0;
      await page.route('**/api/build', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        buildRequests += 1;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'BEGINNER_TEST_BUILD_UNAVAILABLE' }) });
      });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__M11_READY__ === true);
      const first = await page.evaluate(() => ({
        mode: document.body.dataset.workbenchView,
        name: window.__M6_PROJECT__().metadata.name,
        types: window.__M6_PROJECT__().circuit.components.map((component) => component.type),
        moreOpen: document.querySelector('#workbench-more').open,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      assert.equal(first.mode, 'simple');
      assert.equal(first.name, 'Blink demo');
      assert.deepEqual(first.types, ['board.atmega328p-16mhz-v1', 'led.basic-v1', 'resistor.fixed-v1']);
      assert.equal(first.moreOpen, false);
      assert(first.overflow <= 1, `${viewport.width}: first screen overflows`);
      assert.equal(await page.locator('#beginner-run').isVisible(), true);
      assert.equal(await page.locator('#quick-build').isVisible(), false);

      await page.click('#beginner-examples');
      assert.equal(await page.locator('#example-picker-dialog').evaluate((node) => node.open), true);
      assert.equal(await page.locator('.starter-card').filter({ visible: true }).count(), 15);
      await page.keyboard.press('Escape');

      await page.click('#beginner-scratch');
      await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.length === 0);
      assert.match(await page.textContent('#beginner-status'), /Tomt prosjekt/u);
      assert.equal(await page.textContent('#beginner-run'), 'Legg til kontroller');
      assert.equal(await page.locator('#workbench-parts-dialog').evaluate((node) => node.open), true);
      await page.keyboard.press('Escape');

      await page.click('#beginner-run');
      assert.equal(await page.locator('#workbench-parts-dialog').evaluate((node) => node.open), true);
      assert.equal(buildRequests, 0);
      assert.equal((await page.evaluate(() => window.__M6_PROJECT__().metadata.name)), 'Untitled project');
      assert.match(await page.textContent('#beginner-status'), /Ingenting ble erstattet/u);
      await page.keyboard.press('Escape');

      await page.click('#beginner-examples');
      await page.click('.starter-card[data-example="blink"]');
      if (await page.locator('#unsaved-change-dialog').isVisible()) await page.click('#unsaved-discard');
      assert.equal(await page.textContent('#beginner-run'), 'Kjør LED-eksempelet');
      await page.click('#beginner-run');
      await page.waitForFunction(() => document.querySelector('#beginner-status').textContent.includes('kunne ikke startes'));
      assert.equal(buildRequests, 1);
      assert.equal((await page.evaluate(() => window.__M6_PROJECT__().metadata.name)), 'Blink demo');
      assert.match(await page.textContent('#beginner-status'), /prøv Kjør igjen/u);

      await page.click('#workbench-more > summary');
      for (const selector of ['#quick-build', '#quick-run', '#quick-pause', '#quick-reset', '#project-files-open', '#firmware-open']) {
        assert.equal(await page.locator(selector).isVisible(), true, `${selector} missing below More`);
      }
      assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
      await context.close();
    }
    process.stdout.write(`${JSON.stringify({ result: 'pass', freshDesktopJourneys: 2, nativeBuilds: 0, nativeRuns: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
