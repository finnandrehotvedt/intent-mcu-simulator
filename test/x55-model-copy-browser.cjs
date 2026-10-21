// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X55_COPY_URL || 'http://host.docker.internal:18895';
const output = process.env.X55_COPY_OUTPUT || '/tmp/x55-model-copy';
const profiles = [
  { id: 'avr', option: 'board.atmega328p-16mhz-v1', layer: '#component-layer', root: '#component-editor',
    input: '[data-property="ohms"]', drawing: '#component-editor-drawing-tab', drawingStatus: '#appearance-status' },
  { id: 'pico', option: 'board.rp2040-pico-v1', layer: '#pico-editor-components', root: '#pico-part-properties' },
  { id: 'c3', option: 'board.esp32-c3-devmodule-v1', layer: '#c3-editor-components', root: '#c3-part-properties' },
  { id: 'stm32', option: 'board.stm32f429zi-nucleo144-v1', layer: '#stm32-editor-components', root: '#stm32-part-properties' },
];
const modelCopy = /Model preview only.*no project or runtime state has changed.*Apply changes ohms.*revalidates the model property and circuit.*retires current executable and runtime evidence.*requires a fresh Build before Run.*Pins, anchors, named nets, drawing and source stay unchanged/iu;

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        const NativeWorker = window.Worker; window.__X55_COPY_WORKERS__ = 0;
        window.Worker = class extends NativeWorker {
          constructor(...args) { window.__X55_COPY_WORKERS__ += 1; super(...args); }
        };
      });
      const page = await context.newPage(); const producerRequests = [];
      page.on('request', (request) => {
        if (/\/(?:api|compile|run|scenario)(?:\/|$)/u.test(new URL(request.url()).pathname)) {
          producerRequests.push(request.url());
        }
      });
      assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true);
      await page.click('#project-files-open'); await page.click('#project-demo');
      await page.click('.starter-card[data-example="blink"]');
      for (const raw of profiles) {
        const profile = raw.id === 'avr' ? raw : { ...raw, input: '[data-bounded-property="ohms"]',
          drawing: '[data-component-editor-mode="drawing"]', drawingStatus: '.bounded-appearance-row small' };
        await page.selectOption('#board-select', profile.option);
        if (await page.locator('#workbench-inspector-dialog').getAttribute('open') !== null) await page.keyboard.press('Escape');
        await page.locator(`${profile.layer} [data-component-id="resistor-1"]`).click();
        await page.click('#toggle-inspector'); await page.waitForSelector('#workbench-inspector-dialog[open]');
        const root = page.locator(profile.root); await root.locator(profile.input).fill('330');
        const text = await root.locator('.component-editor-invariant').first().textContent();
        assert.match(text, modelCopy, `${profile.id}/${viewport.width}: model copy mismatch`);
        const dialogBox = await page.locator('#workbench-inspector-dialog').boundingBox();
        assert(dialogBox && dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= viewport.width,
          `${profile.id}/${viewport.width}: corrected copy overflowed horizontally`);
        await root.locator(profile.drawing).click();
        const drawingText = await root.locator(profile.drawingStatus).filter({ hasText: profile.id === 'avr'
          ? 'Invariant pass' : 'Visual preview only' }).first().textContent();
        assert.match(drawingText, profile.id === 'avr'
          ? /electrical properties, source, position and rotation unchanged/iu
          : /electrical properties and runtime semantics stay unchanged/iu,
        `${profile.id}/${viewport.width}: Drawing invariant copy changed`);
        if (profile.id === 'avr') await page.locator('#workbench-inspector-dialog').screenshot({
          path: path.join(output, `corrected-model-copy-${viewport.width}x${viewport.height}.png`),
        });
        await page.keyboard.press('Escape');
        report.push({ profile: profile.option, viewport, modelCopy: 'pass', drawingCopyUnchanged: true });
      }
      assert.deepEqual(producerRequests, []);
      assert.equal(await page.evaluate(() => window.__X55_COPY_WORKERS__), 0);
      await context.close();
    }
    const result = { result: 'pass', rows: report, firmwareBuilds: 0, runtimeRuns: 0,
      scenarios: 0, workers: 0, producerRequests: 0 };
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ result: 'pass', rows: report.length, screenshots: 2, workers: 0 }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
