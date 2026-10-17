// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.SEVEN_SEGMENT_UI_URL || 'http://127.0.0.1:18775';
const fixtureDirectory = process.env.SEVEN_SEGMENT_UI_FIXTURES;
const browserName = process.env.SEVEN_SEGMENT_UI_BROWSER || 'chromium';
const screenshotPath = process.env.SEVEN_SEGMENT_UI_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType || !fixtureDirectory) throw new Error('Seven-segment UI browser/fixture configuration missing');

const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const outputPins = ['D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];

function assert(condition, message) { if (!condition) throw new Error(message); }
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y); }

async function addCataloguePart(page, type, query) {
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

async function expectSegments(page, expected) {
  const canonical = [...expected].sort().join('');
  await page.waitForFunction((value) => {
    const artwork = document.querySelector('[data-artwork-key="output-seven-segment-common-cathode"]');
    return artwork?.dataset.activeSegments === value;
  }, canonical, { timeout: 10_000 });
}

async function sendDigit(page, digit, expected) {
  await page.fill('#serial-input', digit);
  await page.selectOption('#serial-newline', 'none');
  await page.click('#serial-send');
  await page.waitForFunction((value) => document.querySelector('#serial-output').textContent.includes(`DIGIT=${value}`), digit, { timeout: 10_000 });
  await expectSegments(page, expected);
}

const allEndpoints = [
  'seven-segment-1.COM', 'board-1.GND2',
  ...segments.flatMap((segment, index) => [
    `seven-segment-1.${segment}`,
    `resistor-${index + 3}.A`,
    `resistor-${index + 3}.B`,
    `board-1.${outputPins[index]}`,
  ]),
];

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__SEVEN_SEGMENT_FILE_TEXT__ = '';
    window.__SEVEN_SEGMENT_FILE_HANDLE__ = {
      name: 'seven-segment-common-cathode.intent-mcu.json',
      async createWritable() {
        return {
          async write(blob) { window.__SEVEN_SEGMENT_FILE_TEXT__ = await blob.text(); },
          async close() {},
        };
      },
      async getFile() {
        return new File([window.__SEVEN_SEGMENT_FILE_TEXT__], this.name, { type: 'application/json' });
      },
    };
    window.showSaveFilePicker = async () => window.__SEVEN_SEGMENT_FILE_HANDLE__;
    window.showOpenFilePicker = async () => [window.__SEVEN_SEGMENT_FILE_HANDLE__];
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
  await page.setInputFiles('#project-open-input', path.join(fixtureDirectory, 'seven-segment-common-cathode-draft.json'));
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');

  await addCataloguePart(page, 'output.seven-segment-common-cathode-v1', 'single digit seven segment');
  await page.waitForSelector('[data-component-id="seven-segment-1"]');
  assert((await page.textContent('#circuit-diagnostics')).includes('SEVEN_SEGMENT_COMMON_DISCONNECTED'),
    'unwired display did not expose the common-cathode diagnostic');
  for (let index = 0; index < 7; index += 1) {
    await addCataloguePart(page, 'resistor.fixed-v1', 'axial fixed resistor');
  }
  const resistorIds = await page.evaluate(() => window.__M6_PROJECT__().candidateCircuit.components
    .filter((item) => item.type === 'resistor.fixed-v1').map((item) => item.id).sort());
  assert(resistorIds.length === 9,
    `seven resistor additions did not persist: ${JSON.stringify(resistorIds)} · ${await page.textContent('#project-message')}`);
  for (let id = 3; id <= 9; id += 1) await page.waitForSelector(`[data-component-id="resistor-${id}"]`);

  await connect(page, 'seven-segment-1.COM', 'board-1.GND2');
  assert((await page.textContent('#circuit-diagnostics')).includes('SEVEN_SEGMENT_A_DISCONNECTED'),
    'common wiring did not advance to segment a');
  for (const [index, segment] of segments.entries()) {
    await connect(page, `seven-segment-1.${segment}`, `resistor-${index + 3}.A`);
    assert((await page.textContent('#circuit-diagnostics')).includes(`SEVEN_SEGMENT_${segment.toUpperCase()}_OUTPUT_DISCONNECTED`),
      `segment ${segment} resistor without an output did not stay blocked`);
    await connect(page, `resistor-${index + 3}.B`, `board-1.${outputPins[index]}`);
    if (index < segments.length - 1) {
      assert((await page.textContent('#circuit-diagnostics')).includes(`SEVEN_SEGMENT_${segments[index + 1].toUpperCase()}_DISCONNECTED`),
        `segment ${segment} wiring did not advance to ${segments[index + 1]}`);
    }
  }
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));

  const card = page.locator('[data-component-id="seven-segment-1"]');
  await card.click();
  const support = await page.textContent('#selection-support');
  assert(/each require one dedicated external series resistor/u.test(support)
      && /no decimal point, multiplexing/iu.test(support),
    'display current-limit or honest model boundary is absent from the inspector');
  const artworkLabel = await card.locator('[data-artwork-key="output-seven-segment-common-cathode"]').getAttribute('aria-label');
  assert(/common-cathode seven-segment/u.test(artworkLabel) && /no physical brightness/u.test(artworkLabel),
    'display artwork does not state its idealized visual boundary');
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  const beforeX = (await card.boundingBox()).x;
  await card.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="seven-segment-1"]').getBoundingClientRect().x < left, beforeX);
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
  assert(mutationRequests.length === 1 && mutationRequests[0].method === 'POST'
      && mutationRequests[0].path === '/api/build' && mutationRequests[0].bytes > 0,
  `source left the browser outside the one bounded compiler request: ${JSON.stringify(mutationRequests)}`);
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('DIGIT=0'), null, { timeout: 10_000 });
  await expectSegments(page, 'abcdef');
  await page.click('#serial-tab');
  await sendDigit(page, '1', 'bc');
  await sendDigit(page, '2', 'abdeg');
  const digitTwoPins = await page.evaluate(() => Object.fromEntries(window.__M6_STATE__.runtime.pins
    .filter((pin) => ['D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'].includes(pin.pin))
    .map((pin) => [pin.pin, { mode: pin.mode, level: pin.level }])));
  assert(JSON.stringify(digitTwoPins) === JSON.stringify({
    D3: { mode: 'OUTPUT', level: true }, D4: { mode: 'OUTPUT', level: true },
    D5: { mode: 'OUTPUT', level: false }, D6: { mode: 'OUTPUT', level: true },
    D7: { mode: 'OUTPUT', level: true }, D8: { mode: 'OUTPUT', level: false },
    D9: { mode: 'OUTPUT', level: true },
  }), `compiled digit-two GPIO mapping was not observed: ${JSON.stringify(digitTwoPins)}`);
  await sendDigit(page, '8', 'abcdefg');

  await page.click('#reset');
  await expectSegments(page, '');
  await page.click('#run');
  await page.waitForFunction(() => (document.querySelector('#serial-output').textContent.match(/DIGIT=0/gu) ?? []).length >= 1, null, { timeout: 10_000 });
  await expectSegments(page, 'abcdef');

  await page.click('#project-save');
  await page.waitForFunction(() => {
    try {
      const saved = JSON.parse(window.__SEVEN_SEGMENT_FILE_TEXT__);
      return saved.candidateCircuit.components.some((item) => item.id === 'seven-segment-1')
        && saved.candidateCircuit.components.filter((item) => item.type === 'resistor.fixed-v1').length === 9;
    } catch { return false; }
  });
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.click('#project-open');
  await page.waitForSelector('[data-component-id="seven-segment-1"]');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);
  const exactBeforeDelete = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.locator('[data-component-id="seven-segment-1"]').evaluate((node) => node.click());
  await page.waitForFunction(() => !document.querySelector('#delete-component').disabled);
  await page.click('#delete-component');
  await page.waitForFunction(() => !document.querySelector('[data-component-id="seven-segment-1"]'));
  assert(await page.locator('#run').isDisabled(), 'display deletion retained a stale runnable artifact');
  await page.click('#undo');
  await page.waitForSelector('[data-component-id="seven-segment-1"]');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === exactBeforeDelete,
    'Undo did not restore the exact display, resistors, wires and routes');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCard = page.locator('[data-component-id="seven-segment-1"]');
  await mobileCard.evaluate((node) => node.click());
  const mobileBefore = (await mobileCard.boundingBox()).x;
  await mobileCard.focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="seven-segment-1"]').getBoundingClientRect().x > left, mobileBefore);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    pins: document.querySelectorAll('[data-component-id="seven-segment-1"] .pin-anchor').length,
    saveVisible: Boolean(document.querySelector('#project-save').getClientRects().length),
  }));
  assert(mobile.overflow <= 1 && mobile.pins === 8 && mobile.saveVisible,
    `mobile display workflow overflowed or lost controls: ${JSON.stringify(mobile)}`);
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
  assert(fs.statSync(path.join(fixtureDirectory, 'seven-segment-common-cathode-draft.json')).size > 0,
    'fixture disappeared');
  console.log(JSON.stringify({
    browser: browserName,
    result: 'pass',
    actualCatalogueAddAndWire: true,
    visibleTerminalAttachmentsBeforeAndAfterMove: allEndpoints.length,
    compiledFirmwareDigits: ['0', '1', '2', '8'],
    gpioPins: outputPins,
    saveOpenResetDeleteUndo: true,
    mobileKeyboard: true,
    compilerMutationRequests: mutationRequests,
    outsideRequests: 0,
  }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
