// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.LCD_EXAMPLE_URL || 'http://127.0.0.1:18776';
const fixtures = [
  ['parallel-hd44780-16x2.intent-mcu.json', 'character-lcd-1', 'output-character-lcd-16x2-4bit', 9],
  ['pcf8574-0x27-lcd.intent-mcu.json', 'pcf8574-lcd-1', 'output-character-lcd-16x2-pcf8574', 4],
  ['parallel-hd44780-20x4-cgram.intent-mcu.json', 'character-lcd-1', 'output-character-lcd-20x4-4bit', 9],
];
async function openDialog(page) {
  if (await page.locator('#workbench-project-dialog').getAttribute('open') !== null) return;
  if (!(await page.locator('#workbench-more').evaluate((node) => node.open))) await page.click('#workbench-more > summary');
  await page.click('#project-files-open');
}
async function actualOpen(page, name, bytes) {
  await openDialog(page); const chooserPromise = page.waitForEvent('filechooser'); await page.click('#project-open');
  await (await chooserPromise).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(bytes) });
  if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) await page.click('#unsaved-discard');
}
(async () => {
  const browser = await chromium.launch({ headless: true }); const reports = [];
  try {
    for (const [name, componentId, artwork, pinCount] of fixtures) {
      const bytes = fs.readFileSync(path.join(__dirname, '../examples/lcd', name), 'utf8');
      const expected = JSON.parse(bytes).project; const page = await browser.newPage({ acceptDownloads: true });
      const mutations = []; page.on('request', (request) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(request.url());
      });
      await page.goto(base); await page.waitForFunction(() => window.__M11_READY__ === true);
      await actualOpen(page, name, bytes);
      await page.waitForSelector(`[data-component-id="${componentId}"] [data-artwork-key="${artwork}"]`);
      assert.equal(await page.locator(`[data-component-id="${componentId}"] .pin-anchor`).count(), pinCount);
      assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__()), expected);
      await openDialog(page); const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
      const downloaded = fs.readFileSync(await download.path(), 'utf8');
      assert.deepEqual(JSON.parse(downloaded).project, expected, `${name}: Download graph`);
      await page.click('#project-new');
      if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) await page.click('#unsaved-discard');
      await actualOpen(page, `roundtrip-${name}`, downloaded);
      await page.waitForSelector(`[data-component-id="${componentId}"]`);
      assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__()), expected, `${name}: roundtrip`);
      await page.reload(); await page.waitForFunction(() => window.__M11_READY__ === true);
      assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__()), expected, `${name}: reload`);
      const before = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
      await actualOpen(page, `corrupt-${name}`, `${bytes.slice(0, -2)}x`);
      await page.waitForTimeout(60);
      assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), before, `${name}: corrupt atomicity`);
      assert.match(await page.locator('#project-message').textContent(), /rejected/iu);
      assert.deepEqual(mutations, []); reports.push(name); await page.close();
    }
    process.stdout.write(`${JSON.stringify({ result: 'pass', files: reports, actualFileChooserOpen: 3,
      visibleSvgAndNamedPins: 3, downloadOpenReload: 3, corruptAtomic: 3, mutationRequests: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
