// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.ORDINARY_UX_URL || 'http://host.docker.internal:18938';
const outputDir = process.env.ORDINARY_UX_OUTPUT || '/tmp/ordinary-ux-polish';

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { base, viewports: [], producerRequests: [], mutatingRequests: [] };
  try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (/\/api\//u.test(pathname) && pathname !== '/api/page-views') report.producerRequests.push([request.method(), pathname]);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && pathname !== '/api/page-views') report.mutatingRequests.push([request.method(), pathname]);
      });
      assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true);

      assert.match(await page.locator('.app-introduction .lede').innerText(), /Build a circuit\. Connect pins\. Run\./u);
      assert.equal(await page.locator('.app-introduction details').getAttribute('open'), null);
      assert.equal(await page.locator('#beginner-run').innerText(), 'Run LED example');
      assert.equal(await page.locator('#workbench-more > summary').innerText(), 'More');

      for (const pin of ['D13', 'GND1', 'ANODE', 'CATHODE']) {
        const anchor = page.locator(`.pin-anchor[data-endpoint$=".${pin}"]`).first();
        assert.equal(await anchor.count(), 1, `${pin} missing`);
        await anchor.focus();
        assert.equal(await anchor.locator('.pin-anchor-label').isVisible(), true, `${pin} label hidden on keyboard focus`);
      }
      const ground = page.locator('.pin-anchor[data-endpoint$=".GND1"]').first();
      assert.equal(await ground.getAttribute('data-pin-role'), 'ground');
      await page.locator('.pin-anchor[data-endpoint$=".D13"]').first().click();
      assert((await page.locator('.pin-anchor.compatible').count()) > 0, 'compatible targets were not emphasized');
      await page.keyboard.press('Escape');

      await page.click('#beginner-examples');
      await page.waitForSelector('#example-picker-dialog[open]');
      assert.equal(await page.locator('.starter-card').count(), 15);
      assert.equal(await page.locator('.starter-card .starter-visual').count(), 15);
      assert.equal(await page.locator('.starter-card .starter-action').first().innerText(), 'Open');
      assert.equal(await page.locator('.starter-teaching[open]').count(), 0);
      await page.fill('#example-picker-search', 'button');
      assert((await page.locator('.starter-card:visible').count()) >= 1);
      await page.fill('#example-picker-search', 'potentiometer');
      assert((await page.locator('.starter-card:visible').count()) >= 1);
      await page.click('#example-picker-close');
      await page.waitForFunction(() => !document.querySelector('#example-picker-dialog').open);

      await page.click('#workbench-more > summary');
      await page.click('#project-files-open');
      await page.waitForSelector('#workbench-project-dialog[open]');
      assert.match(await page.locator('#workbench-project-dialog .project-name-field').innerText(), /^name$/iu);
      assert.equal(await page.locator('#project-save').innerText(), 'Save copy');
      assert.equal(await page.locator('#project-open').innerText(), 'Open file');
      assert.match(await page.locator('#project-file-connection').innerText(), /Save copy and Open file/u);
      assert.match(await page.locator('.project-file-advanced > summary').innerText(), /browser recovery/iu);
      assert.equal(await page.locator('.project-file-advanced').getAttribute('open'), null);
      await page.keyboard.press('Escape');

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 1, `horizontal overflow ${overflow}`);
      const screenshot = path.join(outputDir, `ordinary-ux-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      report.viewports.push({ viewport, screenshot, namedPins: true, examples: true, files: true, overflow });
      await context.close();
    }
    assert.deepEqual(report.producerRequests, []);
    assert.deepEqual(report.mutatingRequests, []);
    fs.writeFileSync(path.join(outputDir, 'ordinary-ux-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ result: 'pass', cases: report.viewports.length, producerActivity: [0, 0], screenshots: report.viewports.map(({ screenshot }) => screenshot) })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
