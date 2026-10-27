// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.CHARACTER_LCD_20X4_UI_URL || 'http://127.0.0.1:18776';
const examplePath = path.resolve('examples/lcd/parallel-hd44780-20x4-cgram.intent-mcu.json');

async function openProject(page, filePath) {
  if (!(await page.locator('#workbench-more').evaluate((node) => node.open))) await page.click('#workbench-more > summary');
  await page.click('#project-files-open');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#project-open');
  await (await chooser).setFiles(filePath);
  if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) await page.click('#unsaved-discard');
  await page.waitForSelector('[data-component-id="character-lcd-1"] [data-artwork-key="output-character-lcd-20x4-4bit"]');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    const errors = []; const mutations = [];
    await page.route('**/api/page-views', (route) => route.fulfill({ status: 200,
      contentType: 'application/json', body: '{"status":"disabled"}' }));
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push({ method: request.method(), path: new URL(request.url()).pathname });
    });
    await page.goto(base); await page.waitForFunction(() => window.__M11_READY__ === true);
    await openProject(page, examplePath);
    assert.equal(await page.locator('[data-component-id="character-lcd-1"] .pin-anchor').count(), 9);
    assert.equal(await page.locator('[data-component-id="character-lcd-1"] [data-lcd-cell]').count(), 80);
    await page.click('#workbench-project-dialog .workbench-popup-close');
    await page.click('#firmware-open');
    await page.waitForFunction(() => document.querySelector('#workbench-firmware-dialog').open);
    await page.click('#build');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
    await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
    await page.locator('#run').evaluate((button) => button.click());
    try {
      await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('LCD20X4=CGRAM_READY'), null, { timeout: 15_000 });
    } catch {
      throw new Error(`20x4 firmware did not reach its marker: ${JSON.stringify(await page.evaluate(() => ({
        build: document.querySelector('#build-state')?.textContent,
        log: document.querySelector('#build-log')?.textContent,
        serial: document.querySelector('#serial-output')?.textContent,
        runtime: window.__M6_STATE__?.runtime,
        lcd: window.__M6_STATE__?.characterLcd,
      })))}`);
    }
    try {
      await page.waitForFunction(() => {
        const lcd = document.querySelector('[data-component-id="character-lcd-1"] [data-artwork-key="output-character-lcd-20x4-4bit"]');
        return lcd?.dataset.protocolState === 'ready'
          && lcd.dataset.line1.trimEnd() === 'Teach the Company'
          && lcd.dataset.line2.trimEnd() === '20x4 GPIO ready'
          && lcd.dataset.line3?.startsWith('CGRAM heart:')
          && lcd.dataset.line4.trimEnd() === 'Rows 00 40 14 54'
          && lcd.querySelectorAll('[data-lcd-runtime-glyph] rect').length > 0;
      }, null, { timeout: 15_000 });
    } catch {
      throw new Error(`20x4 visible state mismatch: ${JSON.stringify(await page.evaluate(() => {
        const lcd = document.querySelector('[data-component-id="character-lcd-1"] [data-artwork-key="output-character-lcd-20x4-4bit"]');
        return { dataset: lcd ? { ...lcd.dataset } : null, glyphPixels: lcd?.querySelectorAll('[data-lcd-runtime-glyph] rect').length,
          runtime: window.__M6_STATE__?.characterLcd };
      }))}`);
    }
    const visible = await page.locator('[data-component-id="character-lcd-1"] [data-artwork-key="output-character-lcd-20x4-4bit"]').evaluate((lcd) => ({
      lines: [lcd.dataset.line1, lcd.dataset.line2, lcd.dataset.line3, lcd.dataset.line4],
      glyphPixels: lcd.querySelectorAll('[data-lcd-runtime-glyph] rect').length,
      cursor: lcd.dataset.cursor, blink: lcd.dataset.blink,
    }));
    assert.deepEqual(visible.lines.slice(0, 2).map((line) => line.trimEnd()), ['Teach the Company', '20x4 GPIO ready']);
    assert(visible.glyphPixels > 0 && visible.cursor === 'on' && visible.blink === 'on');
    assert.deepEqual(mutations, [{ method: 'POST', path: '/api/build' }]);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'pass', rows: 4, cells: 80, namedPins: 9,
      glyphPixels: visible.glyphPixels, cursor: visible.cursor, blink: visible.blink,
      compilerMutationRequests: mutations }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
