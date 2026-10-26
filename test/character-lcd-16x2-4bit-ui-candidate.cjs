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
  await page.evaluate(({ search }) => {
    const details = document.querySelector('.catalog-advanced-filters');
    details.open = true;
    const status = document.querySelector('#catalog-status');
    status.value = 'all';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    const input = document.querySelector('#catalog-search');
    input.value = search;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { search: query });
  const row = page.locator(`.catalog-item[data-type="${type}"]`);
  await row.waitFor({ state: 'attached' });
  await row.evaluate((element) => element.click());
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
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };
    const svg = document.querySelector('#circuit-wires');
    const canvas = document.querySelector('#circuit-canvas');
    const matrix = pathNode.getScreenCTM();
    return {
      route: { x: screen.x, y: screen.y },
      anchor: centre(anchor.getBoundingClientRect()),
      terminal: centre(terminal.getBoundingClientRect()),
      local: { x: local.x, y: local.y },
      path: { net: pathNode.dataset.net, endpoint: pathNode.dataset.endpoint, d: pathNode.getAttribute('d') },
      canvas: box(canvas),
      svg: { ...box(svg), viewBox: svg.getAttribute('viewBox') },
      component: box(anchor.closest('.circuit-component')),
      matrix: matrix && { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f },
      viewport: { innerWidth, innerHeight, scrollX, scrollY },
      missingAnchors: window.__M6_PROJECT__().candidateCircuit.nets.flatMap((net) => net.endpoints
        .map((endpoint) => `${endpoint.component}.${endpoint.pin}`)
        .filter((key) => !document.querySelector(`.pin-anchor[data-endpoint="${key}"]`))),
    };
  }, endpoint);
}

async function assertAttachment(page, endpoint) {
  const measured = await attachment(page, endpoint);
  assert(measured, `missing rendered endpoint ${endpoint}`);
  assert(distance(measured.route, measured.anchor) <= 0.6,
    `${endpoint} route misses DOM pin anchor: ${JSON.stringify(measured)}`);
  assert(distance(measured.route, measured.terminal) <= 0.6,
    `${endpoint} route misses visible SVG terminal: ${JSON.stringify(measured)}`);
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

async function sendSerial(page, value, marker) {
  await page.evaluate((text) => {
    document.querySelector('#serial-tab').click();
    const input = document.querySelector('#serial-input');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#serial-newline').value = 'none';
    document.querySelector('#serial-send').click();
  }, value);
  await page.waitForFunction((text) => document.querySelector('#serial-output').textContent.includes(text), marker, { timeout: 10_000 });
}

async function activate(page, selector) {
  await page.locator(selector).evaluate((element) => element.click());
}

async function closeProjectDialog(page) {
  const dialog = page.locator('#workbench-project-dialog');
  if (await dialog.evaluate((node) => node.open)) {
    await dialog.locator('.workbench-popup-close').click();
  }
}

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__CHARACTER_LCD_FILE_TEXT__ = '';
    window.__CHARACTER_LCD_OPEN_COUNT__ = 0;
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
    window.showOpenFilePicker = async () => {
      window.__CHARACTER_LCD_OPEN_COUNT__ += 1;
      return [window.__CHARACTER_LCD_FILE_HANDLE__];
    };
  });
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  const mutationRequests = [];
  await page.route('**/api/page-views', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
  }));
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} · ${message.location().url || 'unknown resource'}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      mutationRequests.push({ method: request.method(), path: url.pathname, bytes: request.postDataBuffer()?.length ?? 0 });
    }
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('#workbench-view-advanced');
  await page.setInputFiles('#project-open-input', path.join(fixtureDirectory, 'character-lcd-16x2-4bit-draft.json'));
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');
  await closeProjectDialog(page);

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
  await card.evaluate((node) => node.click());
  const support = await page.textContent('#selection-support');
  assert(/write-only 4-bit decoder/iu.test(support)
      && /I²C/iu.test(support) && /backpacks/iu.test(support),
  `LCD inspector omitted the bounded decoder or unsupported-interface statement: ${JSON.stringify(support)}`);
  const artworkLabel = await card.locator('[data-artwork-key="output-character-lcd-16x2-4bit"]').getAttribute('aria-label');
  assert(/blank 16 by 2/iu.test(artworkLabel) && /no I2C/iu.test(artworkLabel),
    'LCD artwork does not state its initial and interface boundary');
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  const beforeX = (await card.boundingBox()).x;
  await card.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="character-lcd-1"]').getBoundingClientRect().x < left, beforeX);
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  await activate(page, '#firmware-open');
  await page.waitForFunction(() => document.querySelector('#workbench-firmware-dialog').open);
  await page.click('#build');
  try {
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  } catch {
    throw new Error(`build did not succeed: ${JSON.stringify({
      state: await page.textContent('#build-state'), log: await page.textContent('#build-log'),
    })}`);
  }
  await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
  assert(mutationRequests.length === 1 && mutationRequests[0].method === 'POST'
      && mutationRequests[0].path === '/api/build' && mutationRequests[0].bytes > 0,
  `source left the browser outside the one bounded compiler request: ${JSON.stringify(mutationRequests)}`);
  await activate(page, '#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('LCD=HELLO'), null, { timeout: 15_000 });
  await expectDisplay(page, 'Hello, Company! ', 'GPIO 4-bit ready');
  const mappedPins = await page.evaluate(() => Object.fromEntries(window.__M6_STATE__.runtime.pins
    .filter((pin) => ['D3', 'D4', 'D5', 'D6', 'D7', 'D8'].includes(pin.pin))
    .map((pin) => [pin.pin, pin.mode])));
  assert(Object.values(mappedPins).every((mode) => mode === 'OUTPUT') && Object.keys(mappedPins).length === 6,
    `compiled LCD GPIO outputs were not observed: ${JSON.stringify(mappedPins)}`);

  await sendSerial(page, 'u', 'LCD=UPDATED');
  await expectDisplay(page, 'Updated by AVR  ', 'Count: 42       ');

  await sendSerial(page, 'c', 'LCD=WRAP12');
  await expectDisplay(page, '               X', 'Y               ');
  let controls = await card.locator('[data-artwork-key="output-character-lcd-16x2-4bit"]').evaluate((node) => ({
    cursor: node.dataset.cursor, blink: node.dataset.blink,
  }));
  assert(controls.cursor === 'on' && controls.blink === 'on', `visible cursor/blink state missing: ${JSON.stringify(controls)}`);

  await sendSerial(page, 'r', 'LCD=WRAP21');
  await expectDisplay(page, 'R               ', '               Q');
  await sendSerial(page, 'o', 'LCD=OFF');
  await expectDisplay(page, '', '');
  await sendSerial(page, 'n', 'LCD=ON');
  await expectDisplay(page, 'R               ', '               Q');
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: false });

  await activate(page, '#reset');
  await page.waitForFunction(() => {
    const artwork = document.querySelector('[data-component-id="character-lcd-1"] [data-artwork-key="output-character-lcd-16x2-4bit"]');
    return artwork?.dataset.line1 === '' && artwork.dataset.line2 === '';
  });
  await activate(page, '#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('LCD=HELLO'), null, { timeout: 15_000 });
  await expectDisplay(page, 'Hello, Company! ', 'GPIO 4-bit ready');

  await page.click('#workbench-instruments-dialog .workbench-popup-close');
  await page.click('#project-files-open');
  await page.waitForFunction(() => document.querySelector('#workbench-project-dialog').open);
  const downloadPromise = page.waitForEvent('download');
  await page.click('#project-save');
  const download = await downloadPromise;
  const restoredPath = path.join(fixtureDirectory, 'character-lcd-16x2-4bit-restored.json');
  await download.saveAs(restoredPath);
  const saved = JSON.parse(fs.readFileSync(restoredPath, 'utf8'));
  const savedDocument = saved.schema === 'intent-mcu-project-envelope@8' ? saved.project : saved;
  assert(savedDocument.candidateCircuit.components.some((item) => item.id === 'character-lcd-1')
      && savedDocument.candidateCircuit.nets.filter((net) => net.endpoints.some(
        (endpoint) => endpoint.component === 'character-lcd-1',
      )).length === 8,
  'downloaded project did not preserve the LCD and its eight nets');
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.click('#project-open');
  await (await chooserPromise).setFiles(restoredPath);
  await page.waitForSelector('[data-component-id="character-lcd-1"]');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));
  await closeProjectDialog(page);
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);
  const exactBeforeDelete = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.locator('[data-component-id="character-lcd-1"]').evaluate((node) => node.click());
  await page.waitForFunction(() => !document.querySelector('#delete-component').disabled);
  await activate(page, '#toggle-inspector');
  await page.waitForFunction(() => document.querySelector('#workbench-inspector-dialog').open);
  await page.click('#delete-component');
  await page.waitForFunction(() => !document.querySelector('[data-component-id="character-lcd-1"]'));
  assert(await page.locator('#run').isDisabled(), 'LCD deletion retained a stale runnable artifact');
  await page.keyboard.press('Control+z');
  await page.waitForSelector('[data-component-id="character-lcd-1"]');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === exactBeforeDelete,
    'Undo did not restore the exact LCD, wires and routes');
  await page.locator('#workbench-inspector-dialog .workbench-popup-close').click();

  await page.click('#workbench-view-simple');
  const simpleCard = page.locator('[data-component-id="character-lcd-1"]');
  await simpleCard.evaluate((node) => node.click());
  const simpleBefore = (await simpleCard.boundingBox()).x;
  await simpleCard.focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="character-lcd-1"]').getBoundingClientRect().x > left, simpleBefore);
  await page.click('#workbench-more > summary');
  await page.click('#project-files-open');
  await page.waitForFunction(() => document.querySelector('#workbench-project-dialog').open);
  const simple = await page.evaluate(() => ({
    pins: document.querySelectorAll('[data-component-id="character-lcd-1"] .pin-anchor').length,
    saveVisible: Boolean(document.querySelector('#project-save').getClientRects().length),
  }));
  assert(simple.pins === 9 && simple.saveVisible,
    `simple desktop LCD workflow lost controls: ${JSON.stringify(simple)}`);
  await page.click('#workbench-project-dialog .workbench-popup-close');
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
    compiledFirmwareText: ['Hello, Company!', 'Updated by AVR', 'Count: 42', 'LCD=WRAP12', 'LCD=WRAP21'],
    visibleCursorBlinkAndBidirectionalWrap: true,
    displayOffOn: true,
    actualOpenFileRestoration: true,
    gpioPins: Object.values(signalPins),
    saveOpenResetDeleteUndo: true,
    simpleDesktopKeyboard: true,
    compilerMutationRequests: mutationRequests,
    outsideRequests: 0,
  }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
