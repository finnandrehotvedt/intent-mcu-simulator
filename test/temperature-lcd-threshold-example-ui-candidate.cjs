// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.TEMPERATURE_LCD_UI_URL || 'http://127.0.0.1:18776';
const browserName = process.env.TEMPERATURE_LCD_UI_BROWSER || 'chromium';
const screenshotPath = process.env.TEMPERATURE_LCD_UI_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

function assert(condition, message) { if (!condition) throw new Error(message); }
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y); }

async function attachment(page, endpoint) {
  return page.evaluate((endpointName) => {
    const anchor = document.querySelector(`.pin-anchor[data-endpoint="${endpointName}"]`);
    const pathNode = document.querySelector(`.circuit-wire[data-endpoint="${endpointName}"]`);
    const split = endpointName.lastIndexOf('.');
    const componentId = endpointName.slice(0, split); const pinId = endpointName.slice(split + 1);
    const terminal = document.querySelector(`[data-component-id="${componentId}"] [data-terminal-pin="${pinId}"]`);
    if (!anchor || !pathNode || !terminal) return null;
    const local = pathNode.getPointAtLength(0);
    const screen = new DOMPoint(local.x, local.y).matrixTransform(pathNode.getScreenCTM());
    const centre = (box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    return { route: { x: screen.x, y: screen.y }, anchor: centre(anchor.getBoundingClientRect()), terminal: centre(terminal.getBoundingClientRect()) };
  }, endpoint);
}

async function assertAttachments(page, endpoints) {
  for (const endpoint of endpoints) {
    const measured = await attachment(page, endpoint);
    assert(measured, `missing visible cable endpoint ${endpoint}`);
    assert(distance(measured.route, measured.anchor) <= 0.6, `${endpoint} route misses its DOM pin`);
    assert(distance(measured.route, measured.terminal) <= 0.6, `${endpoint} route misses its visible terminal`);
  }
}

async function expectLcd(page, line1, line2) {
  await page.waitForFunction(({ first, second }) => {
    const artwork = document.querySelector('[data-component-id="character-lcd-1"] [data-artwork-key="output-character-lcd-16x2-4bit"]');
    return artwork?.dataset.protocolState === 'ready'
      && artwork.dataset.line1 === first && artwork.dataset.line2 === second;
  }, { first: line1, second: line2 }, { timeout: 20_000 });
}

async function expectRgb(page, duties) {
  try {
    await page.waitForFunction((expected) => {
      const artwork = document.querySelector('[data-component-id="rgb-led-1"] [data-artwork-key="output-rgb-led-common-cathode"]');
      return artwork && ['rDuty', 'gDuty', 'bDuty'].every((key) => artwork.dataset[key] === expected[key]);
    }, duties, { timeout: 10_000 });
  } catch {
    const actual = await page.evaluate(() => {
      const artwork = document.querySelector('[data-component-id="rgb-led-1"] [data-artwork-key="output-rgb-led-common-cathode"]');
      return { dataset: artwork ? { ...artwork.dataset } : null, pins: window.__M6_STATE__.runtime?.pins };
    });
    throw new Error(`RGB duty mismatch: expected ${JSON.stringify(duties)}, actual ${JSON.stringify(actual)}`);
  }
}

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__TEMPERATURE_EXAMPLE_FILE_TEXT__ = '';
    window.__TEMPERATURE_EXAMPLE_FILE_HANDLE__ = {
      name: 'temperature-lcd-threshold.intent-mcu.json',
      async createWritable() {
        return { async write(blob) { window.__TEMPERATURE_EXAMPLE_FILE_TEXT__ = await blob.text(); }, async close() {} };
      },
      async getFile() { return new File([window.__TEMPERATURE_EXAMPLE_FILE_TEXT__], this.name, { type: 'application/json' }); },
    };
    window.showSaveFilePicker = async () => window.__TEMPERATURE_EXAMPLE_FILE_HANDLE__;
    window.showOpenFilePicker = async () => [window.__TEMPERATURE_EXAMPLE_FILE_HANDLE__];
  });
  const page = await context.newPage();
  const errors = []; const outside = []; const mutationRequests = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      mutationRequests.push({ method: request.method(), path: url.pathname, bytes: request.postDataBuffer()?.length ?? 0 });
    }
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  assert(await page.locator('.starter-card').count() === 21, 'starter gallery did not retain all twenty-one validated AVR examples');

  await page.click('.starter-card[data-example="button"]');
  await page.waitForFunction(() => window.__M6_PROJECT__().metadata?.name === 'Button input');
  const prior = await page.evaluate(() => ({
    source: window.__M6_PROJECT__().source.files[0].content,
    types: window.__M6_PROJECT__().circuit.components.map((item) => item.type),
  }));
  assert(prior.source.includes('INPUT_PULLUP') && prior.types.includes('button.momentary-v1'), 'existing button example regressed');

  await page.click('.starter-card[data-example="temperature-lcd-threshold"]');
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));
  const loaded = await page.evaluate(() => {
    const project = window.__M6_PROJECT__();
    return {
      name: project.project.metadata.name,
      components: project.candidateCircuit.components.length,
      nets: project.candidateCircuit.nets.length,
      endpoints: project.candidateCircuit.nets.flatMap((net) => net.endpoints.map((item) => `${item.component}.${item.pin}`)),
      selector: document.querySelector('#example-select').value,
      source: project.project.source.files[0].content,
      message: document.querySelector('#project-message').textContent,
    };
  });
  assert(loaded.name === 'Temperature display' && loaded.selector === 'temperature-lcd-threshold', 'starter identity or selector mismatch');
  assert(loaded.components === 7 && loaded.nets === 15 && loaded.endpoints.length === 34, `unexpected validated graph size ${JSON.stringify(loaded)}`);
  assert(loaded.source.includes('(raw * 200L) / 1024L') && loaded.message.includes('0.1953125 °C'), 'compiled Celsius calculation or quantization note missing');
  await assertAttachments(page, loaded.endpoints);

  const lcdCard = page.locator('[data-component-id="character-lcd-1"]');
  const leftBefore = (await lcdCard.boundingBox()).x;
  await lcdCard.click(); await lcdCard.focus(); await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="character-lcd-1"]').getBoundingClientRect().x < left, leftBefore);
  await assertAttachments(page, loaded.endpoints);

  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
  assert(mutationRequests.length === 1 && mutationRequests[0].method === 'POST'
    && mutationRequests[0].path === '/api/build' && mutationRequests[0].bytes > 0,
  `expected one compiler request: ${JSON.stringify(mutationRequests)}`);
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('TEMP_C=25 STATE=COOL'), null, { timeout: 20_000 });
  await expectLcd(page, 'Temp: 25 C      ', 'COOL < 30 C     ');
  await expectRgb(page, { rDuty: '0.000', gDuty: '0.375', bDuty: '1.000' });

  const temperature = page.locator('[data-control="temperature-sensor-1.temperatureC"]');
  await temperature.fill('100');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('TEMP_C=100 STATE=HOT'), null, { timeout: 15_000 });
  await expectLcd(page, 'Temp: 100 C     ', 'HOT >= 30 C     ');
  await expectRgb(page, { rDuty: '1.000', gDuty: '0.000', bDuty: '0.000' });
  if (screenshotPath) {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  await page.click('#reset');
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('TEMP_C=100 STATE=HOT'), null, { timeout: 20_000 });
  await expectLcd(page, 'Temp: 100 C     ', 'HOT >= 30 C     ');

  await page.click('#project-save');
  await page.waitForFunction(() => {
    try {
      const project = JSON.parse(window.__TEMPERATURE_EXAMPLE_FILE_TEXT__);
      return project.candidateCircuit.components.find((item) => item.id === 'temperature-sensor-1')?.controls.temperatureC === 100;
    } catch { return false; }
  });
  const saved = await page.evaluate(() => window.__TEMPERATURE_EXAMPLE_FILE_TEXT__);
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.click('#project-open');
  await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit?.components
    .find((item) => item.id === 'temperature-sensor-1')?.controls.temperatureC === 100);
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === saved, 'local file open did not restore exact canonical example');
  await assertAttachments(page, loaded.endpoints);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileSlider = page.locator('[data-control="temperature-sensor-1.temperatureC"]');
  await mobileSlider.focus(); await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components
    .find((item) => item.id === 'temperature-sensor-1').controls.temperatureC === 99);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cards: [...document.querySelectorAll('.starter-card')].filter((item) => item.getClientRects().length).length,
    sliderVisible: Boolean(document.querySelector('[data-control="temperature-sensor-1.temperatureC"]')?.getClientRects().length),
  }));
  assert(mobile.overflow <= 1 && mobile.cards === 15 && mobile.sliderVisible, `mobile workflow failed ${JSON.stringify(mobile)}`);
  await assertAttachments(page, loaded.endpoints);

  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
  console.log(JSON.stringify({
    browser: browserName,
    result: 'pass',
    existingExampleProtected: true,
    validatedGraph: { components: 7, nets: 15, endpoints: 34 },
    visibleCableAttachmentsBeforeAndAfterMove: loaded.endpoints.length,
    compiledTemperaturesC: [25, 100],
    lcdLines: [['Temp: 25 C', 'COOL < 30 C'], ['Temp: 100 C', 'HOT >= 30 C']],
    rgbDuty: { cool: [0, 0.375, 1], hot: [1, 0, 0] },
    saveOpenReset: true,
    mobileKeyboard: true,
    compilerMutationRequests: mutationRequests,
    outsideRequests: 0,
  }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
