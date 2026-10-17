// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.LIGHT_SENSOR_UI_URL || 'http://127.0.0.1:18770';
const fixtureDirectory = process.env.LIGHT_SENSOR_UI_FIXTURES;
const browserName = process.env.LIGHT_SENSOR_UI_BROWSER || 'chromium';
const screenshotPath = process.env.LIGHT_SENSOR_UI_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType || !fixtureDirectory) throw new Error('Light sensor UI browser/fixture configuration missing');

function assert(condition, message) { if (!condition) throw new Error(message); }
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y); }

async function addCataloguePart(page, type) {
  await page.fill('#catalog-search', type === 'sensor.light-analogue-v1' ? 'analogue light sensor' : type);
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

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__LIGHT_SENSOR_FILE_TEXT__ = '';
    window.__LIGHT_SENSOR_FILE_HANDLE__ = {
      name: 'light-sensor.intent-mcu.json',
      async createWritable() {
        return {
          async write(blob) { window.__LIGHT_SENSOR_FILE_TEXT__ = await blob.text(); },
          async close() {},
        };
      },
      async getFile() {
        return new File([window.__LIGHT_SENSOR_FILE_TEXT__], this.name, { type: 'application/json' });
      },
    };
    window.showSaveFilePicker = async () => window.__LIGHT_SENSOR_FILE_HANDLE__;
    window.showOpenFilePicker = async () => [window.__LIGHT_SENSOR_FILE_HANDLE__];
  });
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  let buildPosts = 0;
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (request.method() === 'POST' && url.pathname === '/api/build') buildPosts += 1;
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.setInputFiles('#project-open-input', path.join(fixtureDirectory, 'light-sensor-draft.json'));
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');

  await addCataloguePart(page, 'sensor.light-analogue-v1');
  await page.waitForSelector('[data-component-id="light-sensor-1"]');
  assert((await page.textContent('#circuit-diagnostics')).includes('LIGHT_SENSOR_VCC_DISCONNECTED'),
    'adding the unwired sensor did not expose the VCC diagnostic');
  await connect(page, 'light-sensor-1.VCC', 'board-1.5V');
  assert((await page.textContent('#circuit-diagnostics')).includes('LIGHT_SENSOR_GND_DISCONNECTED'),
    'VCC wiring did not advance to the GND diagnostic');
  await connect(page, 'light-sensor-1.GND', 'board-1.GND1');
  assert((await page.textContent('#circuit-diagnostics')).includes('LIGHT_SENSOR_AOUT_DISCONNECTED'),
    'ground wiring did not advance to the AOUT diagnostic');
  await connect(page, 'light-sensor-1.AOUT', 'board-1.A1');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));

  const card = page.locator('[data-component-id="light-sensor-1"]');
  await card.click();
  const support = await page.textContent('#selection-support');
  assert(/Idealized module signal only/u.test(support) && /No lux calibration/u.test(support),
    'honest sensor transfer-model limits are absent from the actual inspector');
  const artwork = await card.locator('[data-artwork-key="sensor-light-analogue"]').getAttribute('aria-label');
  assert(/idealized light 50 percent, 2\.50 volt output/u.test(artwork), 'sensor artwork lacks its live idealized signal label');
  for (const endpoint of ['light-sensor-1.VCC', 'light-sensor-1.GND', 'light-sensor-1.AOUT']) {
    await assertAttachment(page, endpoint);
  }

  const beforeX = (await card.boundingBox()).x;
  await card.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="light-sensor-1"]').getBoundingClientRect().x > left, beforeX);
  for (const endpoint of ['light-sensor-1.VCC', 'light-sensor-1.GND', 'light-sensor-1.AOUT']) {
    await assertAttachment(page, endpoint);
  }

  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
  assert(buildPosts === 1, `expected one isolated compiler request, observed ${buildPosts}`);
  await page.selectOption('#pin-select', 'A1');
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#pin-detail').textContent === 'ADC 512', null, { timeout: 10_000 });
  assert((await page.textContent('#pin-level')) === '2.500 V', 'initial light level did not reach the A1 voltage view');

  const slider = page.locator('[data-control="light-sensor-1.lightLevel"]');
  await slider.fill('80');
  await page.waitForFunction(() => document.querySelector('#pin-level').textContent === '4.000 V'
    && document.querySelector('#pin-detail').textContent === 'ADC 819', null, { timeout: 10_000 });
  await page.selectOption('#pin-select', 'D13');
  await page.waitForFunction(() => document.querySelector('#pin-level').textContent === 'HIGH', null, { timeout: 10_000 });
  assert((await page.textContent('#serial-output')).match(/819/u), 'compiled firmware did not print the updated ADC value');

  await page.click('#reset');
  await page.selectOption('#pin-select', 'A1');
  await page.waitForFunction(() => document.querySelector('#pin-level').textContent === '4.000 V');
  assert((await page.inputValue('[data-control="light-sensor-1.lightLevel"]')) === '80', 'reset lost the sensor control');
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#pin-detail').textContent === 'ADC 819', null, { timeout: 10_000 });

  await page.click('#project-save');
  await page.waitForFunction(() => {
    try {
      return JSON.parse(window.__LIGHT_SENSOR_FILE_TEXT__).candidateCircuit.components
        .find((component) => component.id === 'light-sensor-1').controls.lightLevel === 0.8;
    } catch { return false; }
  });
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.click('#project-open');
  await page.waitForSelector('[data-component-id="light-sensor-1"]');
  assert((await page.inputValue('[data-control="light-sensor-1.lightLevel"]')) === '80', 'Save/Open lost the light level');
  const exactBeforeDelete = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.locator('[data-component-id="light-sensor-1"]').click();
  await page.click('#delete-component');
  await page.waitForFunction(() => !document.querySelector('[data-component-id="light-sensor-1"]'));
  assert(await page.locator('#run').isDisabled(), 'sensor deletion retained a stale runnable artifact');
  await page.click('#undo');
  await page.waitForSelector('[data-component-id="light-sensor-1"]');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === exactBeforeDelete,
    'Undo did not restore the exact sensor, wires, route and light level');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileSlider = page.locator('[data-control="light-sensor-1.lightLevel"]');
  await mobileSlider.focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(() => document.querySelector('[data-control="light-sensor-1.lightLevel"]').value === '0');
  await page.locator('[data-control="light-sensor-1.lightLevel"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[data-control="light-sensor-1.lightLevel"]').value === '1');
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    controlVisible: Boolean(document.querySelector('[data-control="light-sensor-1.lightLevel"]').getClientRects().length),
    saveVisible: Boolean(document.querySelector('#project-save').getClientRects().length),
  }));
  assert(mobile.overflow <= 1 && mobile.controlVisible && mobile.saveVisible,
    `mobile sensor workflow overflowed or lost controls: ${JSON.stringify(mobile)}`);
  for (const endpoint of ['light-sensor-1.VCC', 'light-sensor-1.GND', 'light-sensor-1.AOUT']) {
    await assertAttachment(page, endpoint);
  }

  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
  assert(fs.statSync(path.join(fixtureDirectory, 'light-sensor-draft.json')).size > 0, 'fixture disappeared');
  console.log(JSON.stringify({
    browser: browserName,
    result: 'pass',
    actualCatalogueAddAndWire: true,
    visibleTerminalsAndMovedAttachments: 3,
    compiledAvrAdcToLedAndSerial: true,
    saveOpenResetDeleteUndo: true,
    mobileKeyboard: true,
    idealizedTransferDisclosure: true,
    buildPosts,
    outsideRequests: 0,
  }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
