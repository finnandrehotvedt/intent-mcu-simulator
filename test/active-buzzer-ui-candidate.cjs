// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.ACTIVE_BUZZER_UI_URL || 'http://127.0.0.1:18774';
const fixtureDirectory = process.env.ACTIVE_BUZZER_UI_FIXTURES;
const browserName = process.env.ACTIVE_BUZZER_UI_BROWSER || 'chromium';
const screenshotPath = process.env.ACTIVE_BUZZER_UI_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType || !fixtureDirectory) throw new Error('Active buzzer UI browser/fixture configuration missing');

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
    const offsets = [0, -8, 8, -12, 12];
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

async function expectBuzzer(page, enabled, state) {
  const states = Array.isArray(state) ? state : [state];
  try {
    await page.waitForFunction(({ expectedEnabled, expectedStates }) => {
      const artwork = document.querySelector('[data-component-id="active-buzzer-1"] [data-artwork-key="output-active-buzzer-module"]');
      return artwork?.dataset.enabled === String(expectedEnabled)
        && expectedStates.includes(artwork.dataset.driveState)
        && artwork.querySelector('.active-buzzer-disc')?.classList.contains('on') === expectedEnabled;
    }, { expectedEnabled: enabled, expectedStates: states }, { timeout: 10_000 });
  } catch (error) {
    const debug = await page.evaluate(() => {
      const artwork = document.querySelector('[data-component-id="active-buzzer-1"] [data-artwork-key="output-active-buzzer-module"]');
      return {
        artwork: artwork ? {
          enabled: artwork.dataset.enabled,
          driveState: artwork.dataset.driveState,
          discOn: artwork.querySelector('.active-buzzer-disc')?.classList.contains('on'),
          label: artwork.getAttribute('aria-label'),
        } : null,
        pin: window.__M6_STATE__.runtime?.pins?.find((item) => item.pin === 'D8') ?? null,
      };
    });
    throw new Error(`buzzer visual mismatch: ${JSON.stringify(debug)}; ${error.message}`);
  }
}

async function sendEnable(page, value, serialText, enabled) {
  await page.fill('#serial-input', value);
  await page.selectOption('#serial-newline', 'none');
  await page.click('#serial-send');
  await page.waitForFunction((text) => document.querySelector('#serial-output').textContent.includes(text), serialText, { timeout: 10_000 });
  await expectBuzzer(page, enabled, enabled ? 'enabled' : 'disabled');
}

const allEndpoints = [
  'active-buzzer-1.VCC', 'board-1.5V',
  'active-buzzer-1.GND', 'board-1.GND1',
  'active-buzzer-1.EN', 'board-1.D8',
];

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__ACTIVE_BUZZER_FILE_TEXT__ = '';
    window.__ACTIVE_BUZZER_FILE_HANDLE__ = {
      name: 'active-buzzer.intent-mcu.json',
      async createWritable() {
        return {
          async write(blob) { window.__ACTIVE_BUZZER_FILE_TEXT__ = await blob.text(); },
          async close() {},
        };
      },
      async getFile() {
        return new File([window.__ACTIVE_BUZZER_FILE_TEXT__], this.name, { type: 'application/json' });
      },
    };
    window.showSaveFilePicker = async () => window.__ACTIVE_BUZZER_FILE_HANDLE__;
    window.showOpenFilePicker = async () => [window.__ACTIVE_BUZZER_FILE_HANDLE__];
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
  await page.setInputFiles('#project-open-input', path.join(fixtureDirectory, 'active-buzzer-draft.json'));
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');

  await page.selectOption('#catalog-status', 'all');
  await addCataloguePart(page, 'output.active-buzzer-module-v1', 'active buzzer');
  await page.waitForSelector('[data-component-id="active-buzzer-1"]');
  assert((await page.textContent('#circuit-diagnostics')).includes('ACTIVE_BUZZER_VCC_DISCONNECTED'),
    'unwired buzzer did not expose its VCC diagnostic');
  await connect(page, 'active-buzzer-1.VCC', 'board-1.5V');
  assert((await page.textContent('#circuit-diagnostics')).includes('ACTIVE_BUZZER_GND_DISCONNECTED'),
    'VCC wiring did not advance to GND');
  await connect(page, 'active-buzzer-1.GND', 'board-1.GND1');
  assert((await page.textContent('#circuit-diagnostics')).includes('ACTIVE_BUZZER_EN_DISCONNECTED'),
    'GND wiring did not advance to EN');
  await connect(page, 'active-buzzer-1.EN', 'board-1.D8');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));

  const card = page.locator('[data-component-id="active-buzzer-1"]');
  await card.click();
  const support = await page.textContent('#selection-support');
  assert(/silent visual/u.test(support) && /No oscillator/u.test(support) && /current/u.test(support),
    `buzzer inspector omitted its silent/current/acoustic boundary: ${JSON.stringify(support)}`);
  const artwork = card.locator('[data-artwork-key="output-active-buzzer-module"]');
  const artworkLabel = await artwork.getAttribute('aria-label');
  assert(/silent logical active-buzzer indicator/u.test(artworkLabel) && /no acoustic or current accuracy/u.test(artworkLabel),
    'buzzer artwork does not state its honest visual-only boundary');
  assert(await page.locator('audio').count() === 0, 'buzzer candidate added an autoplay-capable audio element');
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  const beforeX = (await card.boundingBox()).x;
  await card.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="active-buzzer-1"]').getBoundingClientRect().x < left, beforeX);
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
  assert(mutationRequests.length === 1 && mutationRequests[0].method === 'POST'
      && mutationRequests[0].path === '/api/build' && mutationRequests[0].bytes > 0,
  `source left the browser outside the one bounded compiler request: ${JSON.stringify(mutationRequests)}`);
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('BUZZER=0'), null, { timeout: 10_000 });
  await expectBuzzer(page, false, 'disabled');
  await page.click('#serial-tab');
  await sendEnable(page, '1', 'BUZZER=1', true);
  const pinHigh = await page.evaluate(() => window.__M6_STATE__.runtime.pins.find((pin) => pin.pin === 'D8'));
  assert(pinHigh.mode === 'OUTPUT' && pinHigh.level === true, `compiled D8 HIGH was not observed: ${JSON.stringify(pinHigh)}`);
  await sendEnable(page, '0', 'BUZZER=0', false);
  const pinLow = await page.evaluate(() => window.__M6_STATE__.runtime.pins.find((pin) => pin.pin === 'D8'));
  assert(pinLow.mode === 'OUTPUT' && pinLow.level === false, `compiled D8 LOW was not observed: ${JSON.stringify(pinLow)}`);

  await page.click('#reset');
  await expectBuzzer(page, false, ['not-driven', 'disabled']);
  await page.click('#run');
  await page.waitForFunction(() => (document.querySelector('#serial-output').textContent.match(/BUZZER=0/gu) ?? []).length >= 1, null, { timeout: 10_000 });
  await expectBuzzer(page, false, 'disabled');

  await page.click('#project-save');
  await page.waitForFunction(() => {
    try {
      const saved = JSON.parse(window.__ACTIVE_BUZZER_FILE_TEXT__);
      return saved.candidateCircuit.components.some((item) => item.id === 'active-buzzer-1');
    } catch { return false; }
  });
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.click('#project-open');
  await page.waitForSelector('[data-component-id="active-buzzer-1"]');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);
  const exactBeforeDelete = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.locator('[data-component-id="active-buzzer-1"]').evaluate((node) => node.click());
  await page.waitForFunction(() => !document.querySelector('#delete-component').disabled);
  await page.click('#delete-component');
  await page.waitForFunction(() => !document.querySelector('[data-component-id="active-buzzer-1"]'));
  assert(await page.locator('#run').isDisabled(), 'buzzer deletion retained a stale runnable artifact');
  await page.click('#undo');
  await page.waitForSelector('[data-component-id="active-buzzer-1"]');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === exactBeforeDelete,
    'Undo did not restore the exact buzzer component, wires and routes');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCard = page.locator('[data-component-id="active-buzzer-1"]');
  await mobileCard.evaluate((node) => node.click());
  const mobileBefore = (await mobileCard.boundingBox()).x;
  await mobileCard.focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="active-buzzer-1"]').getBoundingClientRect().x > left, mobileBefore);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    pins: document.querySelectorAll('[data-component-id="active-buzzer-1"] .pin-anchor').length,
    saveVisible: Boolean(document.querySelector('#project-save').getClientRects().length),
  }));
  assert(mobile.overflow <= 1 && mobile.pins === 3 && mobile.saveVisible,
    `mobile buzzer workflow overflowed or lost controls: ${JSON.stringify(mobile)}`);
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
  assert(fs.statSync(path.join(fixtureDirectory, 'active-buzzer-draft.json')).size > 0, 'fixture disappeared');
  console.log(JSON.stringify({
    browser: browserName,
    result: 'pass',
    actualCatalogueAddAndWire: true,
    visibleTerminalAttachmentsBeforeAndAfterMove: allEndpoints.length,
    compiledFirmwareStates: ['disabled', 'enabled', 'disabled'],
    gpioPin: 'D8',
    silentVisualOnly: true,
    saveOpenResetDeleteUndo: true,
    mobileKeyboard: true,
    compilerMutationRequests: mutationRequests,
    outsideRequests: 0,
  }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
