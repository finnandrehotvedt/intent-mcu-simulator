// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.TWO_BROWSER_URL || 'http://127.0.0.1:18932';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const contexts = [
    await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true, serviceWorkers: 'block' }),
    await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' }),
  ];
  try {
    const [pageA, pageB] = await Promise.all(contexts.map((context) => context.newPage()));
    for (const [owner, page] of [['A', pageA], ['B', pageB]]) {
      await page.route('**/api/page-views', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'disabled' }),
      }));
      await page.addInitScript((value) => localStorage.setItem('isolation-owner-test', value), owner);
    }
    await Promise.all([pageA.goto(base), pageB.goto(base)]);
    await Promise.all([pageA.waitForFunction(() => window.__M11_READY__), pageB.waitForFunction(() => window.__M11_READY__)]);

    assert.equal(await pageA.evaluate(() => localStorage.getItem('isolation-owner-test')), 'A');
    assert.equal(await pageB.evaluate(() => localStorage.getItem('isolation-owner-test')), 'B');
    assert.equal(await pageA.evaluate(() => window.__M6_PROJECT__().metadata.name), 'Blink demo');
    assert.equal(await pageB.evaluate(() => window.__M6_PROJECT__().metadata.name), 'Blink demo');

    await pageA.click('#workbench-more > summary');
    await pageA.click('#firmware-open');
    const sourceA = await pageA.inputValue('#source');
    await pageA.fill('#source', `${sourceA}\n// browser-owner-A`);
    await pageA.locator('#source').press('Tab');
    await pageA.keyboard.press('Escape');
    assert.match(await pageA.evaluate(() => window.__M6_PROJECT__().source.files[0].content), /browser-owner-A/u);
    assert.doesNotMatch(await pageB.evaluate(() => window.__M6_PROJECT__().source.files[0].content), /browser-owner-A/u);
    const authoredBeforeRefresh = await pageA.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    await pageA.reload({ waitUntil: 'domcontentloaded' });
    await pageA.waitForFunction(() => window.__M11_READY__);
    assert.equal(await pageA.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), authoredBeforeRefresh);
    assert.equal(await pageA.locator('#quick-run').isDisabled(), true);
    assert.equal(await pageA.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);

    const tabA2 = await contexts[0].newPage();
    await tabA2.route('**/api/page-views', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'disabled' }),
    }));
    await tabA2.goto(base);
    await tabA2.waitForFunction(() => window.__M11_READY__);
    assert.equal(await tabA2.evaluate(() => window.__M6_PROJECT__().metadata.name), 'Blink demo');
    assert.doesNotMatch(await tabA2.evaluate(() => window.__M6_PROJECT__().source.files[0].content), /browser-owner-A/u);

    await pageB.click('#beginner-examples');
    await pageB.click('.starter-card[data-example="button"]');
    if (await pageB.locator('#unsaved-change-dialog').isVisible()) await pageB.click('#unsaved-discard');
    await pageB.waitForFunction(() => window.__M6_PROJECT__().metadata.name === 'Button input');
    assert.equal(await pageA.evaluate(() => window.__M6_PROJECT__().metadata.name), 'Blink demo');

    await pageA.click('#beginner-scratch');
    if (await pageA.locator('#unsaved-change-dialog').isVisible()) await pageA.click('#unsaved-discard');
    await pageA.waitForFunction(() => window.__M6_PROJECT__().circuit.components.length === 0);
    assert.equal(await pageB.evaluate(() => window.__M6_PROJECT__().metadata.name), 'Button input');
    assert((await pageB.evaluate(() => window.__M6_PROJECT__().circuit.components.length)) > 0);
    await pageA.keyboard.press('Escape');

    async function downloadProject(page) {
      if (!(await page.locator('#workbench-more').evaluate((node) => node.open))) await page.click('#workbench-more > summary');
      await page.click('#project-files-open');
      const downloadPromise = page.waitForEvent('download');
      await page.click(page === pageA ? '#project-save' : '#project-save');
      const download = await downloadPromise;
      const filePath = await download.path();
      assert(fs.statSync(filePath).size > 100);
      await page.keyboard.press('Escape');
      return fs.readFileSync(filePath, 'utf8');
    }
    const [fileA, fileB] = await Promise.all([downloadProject(pageA), downloadProject(pageB)]);
    assert.notEqual(fileA, fileB);
    assert.match(fileA, /Untitled project/u);
    assert.match(fileB, /Button input/u);

    assert.equal(await pageA.evaluate(() => document.querySelector('#serial-output').textContent), 'No firmware bytes.');
    assert.equal(await pageB.evaluate(() => document.querySelector('#serial-output').textContent), 'No firmware bytes.');
    process.stdout.write(`${JSON.stringify({ result: 'pass', browserContexts: 2, isolatedStorage: true,
      sameProfileTabs: 2, refreshRetainedAuthoredBytes: true, isolatedProjectSourceGraph: true,
      isolatedDownloads: true, nativeBuilds: 0, nativeRuns: 0 })}\n`);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
