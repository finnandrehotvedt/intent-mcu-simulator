// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.PCF8574_LCD_UI_URL || 'http://127.0.0.1:18776';
const verifiedHexPath = process.env.PCF8574_LCD_VERIFIED_HEX;
if (!verifiedHexPath) throw new Error('PCF8574_LCD_VERIFIED_HEX_REQUIRED');
const verifiedHex = fs.readFileSync(verifiedHexPath, 'utf8');
const verifiedSource = fs.readFileSync(path.join(__dirname, '../fixtures/pcf8574_lcd_hello/pcf8574_lcd_hello.ino'), 'utf8');
const verifiedHexSha256 = crypto.createHash('sha256').update(verifiedHex).digest('hex');
if (verifiedHexSha256 !== '4b265b4f414ffff598e96ff71394b6fc7c0ac76c89e6332c3fca52cd02dd2c96') throw new Error('PCF8574_LCD_VERIFIED_HEX_IDENTITY');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__PCF_LCD_SAVED__ = '';
    window.__PCF_LCD_HANDLE__ = {
      name: 'avr-pcf8574-lcd-hello.intent-mcu.json',
      async createWritable() { return { async write(blob) { window.__PCF_LCD_SAVED__ = await blob.text(); }, async close() {} }; },
      async getFile() { return new File([window.__PCF_LCD_SAVED__], this.name, { type: 'application/json' }); },
    };
    window.showSaveFilePicker = async () => window.__PCF_LCD_HANDLE__;
    window.showOpenFilePicker = async () => [window.__PCF_LCD_HANDLE__];
  });
  const page = await context.newPage(); const errors = []; const outside = []; const mutations = [];
  let verifiedSourceDigest = null;
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url()); if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push([request.method(), url.pathname]);
  });
  await page.route((url) => url.pathname.startsWith('/api/build'), async (route) => {
    if (route.request().method() === 'POST') {
      const submitted = JSON.parse(route.request().postData() || '{}');
      assert(submitted.schema === 'teach-lab-build-request@1' && submitted.board === 'board.atmega328p-16mhz-v1', 'cached build target mismatch');
      assert(submitted.files?.length === 1 && submitted.files[0].name === 'main.ino'
        && submitted.files[0].content === verifiedSource, 'cached build source mismatch');
      verifiedSourceDigest = crypto.createHash('sha256').update(JSON.stringify({ schema: submitted.schema, board: submitted.board, files: submitted.files })).digest('hex');
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
        jobId: 'verified-pcf8574-lcd-fixture', capability: 'verified-isolated-avr-fixture-cache',
      }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'succeeded', cacheHit: true, result: {
        artifactIdentity: verifiedHexSha256, inputIdentity: verifiedSourceDigest,
        artifact: { hex: verifiedHex, hexSha256: verifiedHexSha256 }, diagnostics: [],
      },
    }) });
  });
  await page.route((url) => url.pathname === '/api/page-views', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
  }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  if (await page.locator('#walkthrough').getAttribute('open') !== null) await page.locator('#walkthrough button').last().click();
  if (!await page.locator('#workbench-more').evaluate((node) => node.open)) await page.click('#workbench-more > summary');
  await page.click('#project-files-open');
  await page.click('#project-demo');
  await page.click('.starter-card[data-example="avr-pcf8574-lcd-hello"] .starter-action');
  await page.waitForSelector('[data-component-id="pcf8574-lcd-1"]');
  if (await page.locator('#workbench-project-dialog').getAttribute('open') !== null) await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));
  const authored = await page.evaluate(() => {
    const project = window.__M6_PROJECT__(); const display = project.candidateCircuit.components.find((item) => item.id === 'pcf8574-lcd-1');
    const endpoints = project.candidateCircuit.nets.flatMap((net) => net.endpoints.map((item) => `${item.component}.${item.pin}`));
    return { address: display?.properties.address, endpoints, pins: [...document.querySelectorAll('[data-component-id="pcf8574-lcd-1"] .pin-anchor')].map((item) => item.dataset.endpoint).sort() };
  });
  assert(authored.address === 0x27, 'fixed address missing');
  for (const endpoint of ['board-1.5V', 'board-1.GND1', 'board-1.A4', 'board-1.A5', 'pcf8574-lcd-1.VCC', 'pcf8574-lcd-1.GND', 'pcf8574-lcd-1.SDA', 'pcf8574-lcd-1.SCL']) assert(authored.endpoints.includes(endpoint), endpoint);
  assert(authored.pins.length === 4, 'four named LCD terminals not rendered');
  const card = page.locator('[data-component-id="pcf8574-lcd-1"]'); await card.click();
  const before = await card.boundingBox(); await card.focus(); await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((x) => document.querySelector('[data-component-id="pcf8574-lcd-1"]').getBoundingClientRect().x < x, before.x);
  await page.click('#quick-build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.click('#quick-run');
  await page.waitForFunction(() => {
    const lcd = document.querySelector('[data-component-id="pcf8574-lcd-1"] [data-artwork-key="output-character-lcd-16x2-pcf8574"]');
    return lcd?.dataset.protocolState === 'ready' && lcd.dataset.line1 === 'I2C LCD ready   ' && lcd.dataset.line2 === 'Address 0x27    ';
  }, null, { timeout: 20_000 });
  const exact = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await card.click(); await card.focus(); await page.keyboard.press('Delete');
  await page.waitForFunction(() => !document.querySelector('[data-component-id="pcf8574-lcd-1"]'));
  await page.keyboard.press('Control+z'); await page.waitForSelector('[data-component-id="pcf8574-lcd-1"]');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === exact, 'undo did not restore exact LCD graph');
  await page.keyboard.press('Control+Shift+z'); await page.waitForFunction(() => !document.querySelector('[data-component-id="pcf8574-lcd-1"]'));
  await page.keyboard.press('Control+z');
  await page.click('#project-files-open');
  const downloadPromise = page.waitForEvent('download');
  await page.click('#project-save');
  const download = await downloadPromise; const downloadPath = await download.path();
  assert(download.suggestedFilename().endsWith('.json') && downloadPath, 'browser project download missing');
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) await page.click('#unsaved-discard');
  await page.setInputFiles('#project-open-input', downloadPath);
  await page.waitForSelector('[data-component-id="pcf8574-lcd-1"]');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === exact, 'Save/Open did not restore exact LCD graph');
  assert(mutations.length === 1 && mutations[0][0] === 'POST' && mutations[0][1] === '/api/build', JSON.stringify(mutations));
  assert(outside.length === 0, JSON.stringify(outside)); assert(errors.length === 0, JSON.stringify(errors));
  console.log(JSON.stringify({ result: 'pass', fixedAddress: '0x27', compiledVisibleLines: ['I2C LCD ready', 'Address 0x27'], verifiedArtifactCache: verifiedHexSha256, moveDeleteUndoRedoSaveOpen: true, outsideRequests: 0 }));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
