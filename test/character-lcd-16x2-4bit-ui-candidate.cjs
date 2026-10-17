// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.CHARACTER_LCD_UI_URL || 'http://127.0.0.1:18776';
const fixtureDirectory = process.env.CHARACTER_LCD_UI_FIXTURES;
const browserName = process.env.CHARACTER_LCD_UI_BROWSER || 'chromium';
const screenshotPath = process.env.CHARACTER_LCD_UI_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType || !fixtureDirectory) throw new Error('Character LCD UI browser/fixture configuration missing');

const signalPins = { RS: 'D3', E: 'D4', D4: 'D5', D5: 'D6', D6: 'D7', D7: 'D8' };
const allEndpoints = [
  'character-lcd-1.VCC', 'board-1.5V',
  'character-lcd-1.GND', 'character-lcd-1.RW', 'board-1.GND1',
  ...Object.entries(signalPins).flatMap(([signal, pin]) => [
    `character-lcd-1.${signal}`, `board-1.${pin}`,
  ]),
];

function assert(condition, message) { if (!condition) throw new Error(message); }
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y); }

async function addCataloguePart(page, type, query) {
  await page.selectOption('#catalog-status', 'all');
  await page.fill('#catalog-search', query);
  const row = page.locator(`.catalog-item[data-type="${type}"]`);
  await row.waitFor();
  await row.focus();
  await page.keyboard.press('Enter');
}

async function clickVisiblePin(page, endpoint) {
  const locator = page.locator(`.pin-anchor[data-endpoint="${endpoint}"]`);
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const target = await page.evaluate((endpointName) => {
    const anchor = document.querySelector(`.pin-anchor[data-endpoint="${endpointName}"]`);
    if (!anchor) return null;
    const box = anchor.getBoundingClientRect();
    const offsets = [0, -5, 5, -9, 9];
    for (const yOffset of offsets) for (const xOffset of offsets) {
      const x = box.left + box.width / 2 + xOffset;
      const y = box.top + box.height / 2 + yOffset;
      const hit = document.elementFromPoint(x, y);
      if (hit === anchor || anchor.contains(hit)) return { x, y };
    }
    const centre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { blocked: centre?.outerHTML?.slice(0, 240) ?? 'no hit target', box: box.toJSON() };
  }, endpoint);
  assert(target && !target.blocked, `${endpoint} has no user-clickable pointer area: ${JSON.stringify(target)}`);
  await page.mouse.click(target.x, target.y);
}

async function connect(page, from, to) {
  await clickVisiblePin(page, from);
  await page.waitForFunction((endpoint) => document.querySelector('#wire-state').textContent.includes(endpoint), from);
  await clickVisiblePin(page, to);
  await page.waitForFunction(({ fromEndpoint, toEndpoint }) => {
    const key = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
    return window.__M6_PROJECT__().candidateCircuit.nets.some((net) => {
      const endpoints = new Set(net.endpoints.map(key));
      return endpoints.has(fromEndpoint) && endpoints.has(toEndpoint);
    });
  }, { fromEndpoint: from, toEndpoint: to });
}

async function attachment(page, endpoint) {
  return page.evaluate((endpointName) => {
    const anchor = document.querySelector(`.pin-anchor[data-endpoint="${endpointName}"]`);
    const pathNode = document.querySelector(`.circuit-wire[data-endpoint="${endpointName}"]`);
    const pinId = endpointName.slice(endpointName.lastIndexOf('.') + 1);
    const componentId = endpointName.slice(0, endpointName.lastIndexOf('.'));
    const terminal = document.querySelector(`[data-component-id="${componentId}"] [data-terminal-pin="${pinId}"]`);
    if (!anchor || !pathNode || !terminal) return null;
    const local = pathNode.getPointAtLength(0);
    const screen = new DOMPoint(local.x, local.y).matrixTransform(pathNode.getScreenCTM());
    const centre = (box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    return {
      route: { x: screen.x, y: screen.y },
      anchor: centre(anchor.getBoundingClientRect()),
      terminal: centre(terminal.getBoundingClientRect()),
    };
  }, endpoint);
}

async function assertAttachment(page, endpoint) {
  const measured = await attachment(page, endpoint);
  assert(measured, `missing rendered endpoint ${endpoint}`);
  assert(distance(measured.route, measured.anchor) <= 0.6, `${endpoint} route misses DOM pin anchor`);
  assert(distance(measured.route, measured.terminal) <= 0.6, `${endpoint} route misses visible SVG terminal`);
}

async function expectDisplay(page, line1, line2) {
  try {
    await page.waitForFunction(({ first, second }) => {
      const artwork = document.querySelector('[data-component-id="character-lcd-1"] [data-artwork-key="output-character-lcd-16x2-4bit"]');
      return artwork?.dataset.protocolState === 'ready'
        && artwork.dataset.line1 === first && artwork.dataset.line2 === second;
    }, { first: line1, second: line2 }, { timeout: 15_000 });
  } catch {
    const actual = await page.evaluate(() => {
      const artwork = document.querySelector('[data-component-id="character-lcd-1"] [data-artwork-key="output-character-lcd-16x2-4bit"]');
      return { dataset: artwork ? { ...artwork.dataset } : null, state: window.__M6_STATE__.characterLcd };
    });
    throw new Error(`LCD text mismatch: expected ${JSON.stringify([line1, line2])}, actual ${JSON.stringify(actual)}`);
  }
}

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__CHARACTER_LCD_FILE_TEXT__ = '';
    window.__CHARACTER_LCD_FILE_HANDLE__ = {
      name: 'character-lcd-16x2-4bit.intent-mcu.json',
      async createWritable() {
        return {
          async write(blob) { window.__CHARACTER_LCD_FILE_TEXT__ = await blob.text(); },
          async close() {},
        };
      },
      async getFile() {
        return new File([window.__CHARACTER_LCD_FILE_TEXT__], this.name, { type: 'application/json' });
      },
    };
    window.showSaveFilePicker = async () => window.__CHARACTER_LCD_FILE_HANDLE__;
    window.showOpenFilePicker = async () => [window.__CHARACTER_LCD_FILE_HANDLE__];
  });
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  const mutationRequests = [];
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
  await page.setInputFiles('#project-open-input', path.join(fixtureDirectory, 'character-lcd-16x2-4bit-draft.json'));
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');

  await addCataloguePart(page, 'output.character-lcd-16x2-4bit-v1', '16x2 character lcd');
  await page.waitForSelector('[data-component-id="character-lcd-1"]');
  assert((await page.textContent('#circuit-diagnostics')).includes('CHARACTER_LCD_VCC_DISCONNECTED'),
    'unwired LCD did not expose the VCC diagnostic');
  await connect(page, 'character-lcd-1.VCC', 'board-1.5V');
  assert((await page.textContent('#circuit-diagnostics')).includes('CHARACTER_LCD_GND_DISCONNECTED'),
    'VCC wiring did not advance to GND');
  await connect(page, 'character-lcd-1.GND', 'board-1.GND1');
  assert((await page.textContent('#circuit-diagnostics')).includes('CHARACTER_LCD_RW_DISCONNECTED'),
    'GND wiring did not advance to RW');
  await connect(page, 'character-lcd-1.RW', 'board-1.GND1');
  for (const [signal, pin] of Object.entries(signalPins)) {
    assert((await page.textContent('#circuit-diagnostics')).includes(`CHARACTER_LCD_${signal}_DISCONNECTED`),
      `wiring did not advance to ${signal}`);
    await connect(page, `character-lcd-1.${signal}`, `board-1.${pin}`);
  }
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));

  const card = page.locator('[data-component-id="character-lcd-1"]');
  await card.click();
  const support = await page.textContent('#selection-support');
  assert(/write-only 4-bit decoder/iu.test(support)
      && /I²C/iu.test(support) && /backpacks/iu.test(support),
  'LCD inspector omitted the bounded decoder or unsupported-interface statement');
  const artworkLabel = await card.locator('[data-artwork-key="output-character-lcd-16x2-4bit"]').getAttribute('aria-label');
  assert(/blank 16 by 2/iu.test(artworkLabel) && /no I2C/iu.test(artworkLabel),
    'LCD artwork does not state its initial and interface boundary');
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  const beforeX = (await card.boundingBox()).x;
  await card.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="character-lcd-1"]').getBoundingClientRect().x < left, beforeX);
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
  assert(mutationRequests.length === 1 && mutationRequests[0].method === 'POST'
      && mutationRequests[0].path === '/api/build' && mutationRequests[0].bytes > 0,
  `source left the browser outside the one bounded compiler request: ${JSON.stringify(mutationRequests)}`);
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('LCD=HELLO'), null, { timeout: 15_000 });
  await expectDisplay(page, 'Hello, Company! ', 'GPIO 4-bit ready');
  const mappedPins = await page.evaluate(() => Object.fromEntries(window.__M6_STATE__.runtime.pins
    .filter((pin) => ['D3', 'D4', 'D5', 'D6', 'D7', 'D8'].includes(pin.pin))
    .map((pin) => [pin.pin, pin.mode])));
  assert(Object.values(mappedPins).every((mode) => mode === 'OUTPUT') && Object.keys(mappedPins).length === 6,
    `compiled LCD GPIO outputs were not observed: ${JSON.stringify(mappedPins)}`);

  await page.click('#serial-tab');
  await page.fill('#serial-input', 'u');
  await page.selectOption('#serial-newline', 'none');
  await page.click('#serial-send');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('LCD=UPDATED'), null, { timeout: 10_000 });
  await expectDisplay(page, 'Updated by AVR  ', 'Count: 42       ');
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: false });

  await page.click('#reset');
  await page.waitForFunction(() => {
    const artwork = document.querySelector('[data-component-id="character-lcd-1"] [data-artwork-key="output-character-lcd-16x2-4bit"]');
    return artwork?.dataset.line1 === '' && artwork.dataset.line2 === '';
  });
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('LCD=HELLO'), null, { timeout: 15_000 });
  await expectDisplay(page, 'Hello, Company! ', 'GPIO 4-bit ready');

  await page.click('#project-save');
  await page.waitForFunction(() => {
    try {
      const saved = JSON.parse(window.__CHARACTER_LCD_FILE_TEXT__);
      return saved.candidateCircuit.components.some((item) => item.id === 'character-lcd-1')
        && saved.candidateCircuit.nets.filter((net) => net.endpoints.some(
          (endpoint) => endpoint.component === 'character-lcd-1',
        )).length === 8;
    } catch { return false; }
  });
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.click('#project-open');
  await page.waitForSelector('[data-component-id="character-lcd-1"]');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);
  const exactBeforeDelete = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.locator('[data-component-id="character-lcd-1"]').evaluate((node) => node.click());
  await page.waitForFunction(() => !document.querySelector('#delete-component').disabled);
  await page.click('#delete-component');
  await page.waitForFunction(() => !document.querySelector('[data-component-id="character-lcd-1"]'));
  assert(await page.locator('#run').isDisabled(), 'LCD deletion retained a stale runnable artifact');
  await page.click('#undo');
  await page.waitForSelector('[data-component-id="character-lcd-1"]');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === exactBeforeDelete,
    'Undo did not restore the exact LCD, wires and routes');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCard = page.locator('[data-component-id="character-lcd-1"]');
  await mobileCard.evaluate((node) => node.click());
  const mobileBefore = (await mobileCard.boundingBox()).x;
  await mobileCard.focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="character-lcd-1"]').getBoundingClientRect().x > left, mobileBefore);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    pins: document.querySelectorAll('[data-component-id="character-lcd-1"] .pin-anchor').length,
    saveVisible: Boolean(document.querySelector('#project-save').getClientRects().length),
  }));
  assert(mobile.overflow <= 1 && mobile.pins === 9 && mobile.saveVisible,
    `mobile LCD workflow overflowed or lost controls: ${JSON.stringify(mobile)}`);
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
  assert(fs.statSync(path.join(fixtureDirectory, 'character-lcd-16x2-4bit-draft.json')).size > 0,
    'fixture disappeared');
  console.log(JSON.stringify({
    browser: browserName,
    result: 'pass',
    actualCatalogueAddAndWire: true,
    visibleTerminalAttachmentsBeforeAndAfterMove: allEndpoints.length,
    compiledFirmwareText: ['Hello, Company!', 'Updated by AVR', 'Count: 42'],
    gpioPins: Object.values(signalPins),
    saveOpenResetDeleteUndo: true,
    mobileKeyboard: true,
    compilerMutationRequests: mutationRequests,
    outsideRequests: 0,
  }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
