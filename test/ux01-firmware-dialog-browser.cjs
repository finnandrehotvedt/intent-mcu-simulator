// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.UX01_URL || 'http://127.0.0.1:18932';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  let buildPosts = 0;
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(8_000);
    await page.route('**/api/page-views', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'disabled' }),
    }));
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/build') buildPosts += 1;
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    await page.click('#workbench-more > summary');
    await page.click('#firmware-open');
    const dialog = page.locator('#workbench-firmware-dialog');
    const source = page.locator('#source');
    assert.equal(await dialog.evaluate((node) => node.open), true);
    await source.focus();
    const initial = await source.inputValue();
    const marker = '\n// UX01 ordinary edit';
    await source.press('Control+End');
    await page.keyboard.insertText(marker);
    for (const key of [' ', 'Space', 'Enter']) {
      if (key === 'Space') await source.press('Space');
      else if (key === 'Enter') await source.press('Enter');
      else await page.keyboard.insertText(key);
      assert.equal(await dialog.evaluate((node) => node.open), true, `dialog closed after ${key}`);
      assert.equal(await source.evaluate((node) => document.activeElement === node), true, `focus left source after ${key}`);
    }
    await page.keyboard.insertText('pasted-text');
    assert.equal(await dialog.evaluate((node) => node.open), true, 'dialog closed after inserted text');
    assert.equal(await source.evaluate((node) => document.activeElement === node), true, 'focus left source after inserted text');
    const edited = await source.inputValue();
    assert.notEqual(edited, initial);
    assert.match(edited, /UX01 ordinary edit/u);
    assert.match(edited, /pasted-text/u);
    const caret = await source.evaluate((node) => ({ start: node.selectionStart, end: node.selectionEnd }));
    assert.equal(caret.start, caret.end);

    await page.click('#workbench-firmware-dialog .workbench-popup-close');
    await page.click('#firmware-open');
    assert.equal(await source.inputValue(), edited, 'reopening Firmware lost authored source');
    await page.click('#workbench-firmware-dialog .workbench-popup-close');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#workbench-more > summary');
    await page.click('#firmware-open');
    assert.equal(await source.inputValue(), edited, 'reload lost authored source');
    assert.equal(buildPosts, 0);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);
    process.stdout.write(`${JSON.stringify({ result: 'pass', dialogStable: true, focusStable: true,
      caretRetained: true, reopenPersisted: true, reloadPersisted: true, buildPosts, workerCreations: 0 })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
