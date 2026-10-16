// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.TEMPERATURE_SENSOR_UI_URL || 'http://127.0.0.1:18771';
const fixtureDirectory = process.env.TEMPERATURE_SENSOR_UI_FIXTURES;
const browserName = process.env.TEMPERATURE_SENSOR_UI_BROWSER || 'chromium';
const screenshotPath = process.env.TEMPERATURE_SENSOR_UI_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType || !fixtureDirectory) throw new Error('Temperature sensor UI browser/fixture configuration missing');

function assert(condition, message) { if (!condition) throw new Error(message); }
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y); }

async function addTemperatureModule(page) {
  await page.fill('#catalog-search', 'analogue temperature module');
  const row = page.locator('.catalog-item[data-type="sensor.temperature-analogue-v1"]');
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
    window.__TEMPERATURE_SENSOR_FILE_TEXT__ = '';
    window.__TEMPERATURE_SENSOR_FILE_HANDLE__ = {
      name: 'temperature-sensor.intent-mcu.json',
      async createWritable() {
        return {
          async write(blob) { window.__TEMPERATURE_SENSOR_FILE_TEXT__ = await blob.text(); },
          async close() {},
        };
      },
      async getFile() {
        return new File([window.__TEMPERATURE_SENSOR_FILE_TEXT__], this.name, { type: 'application/json' });
      },
    };
    window.showSaveFilePicker = async () => window.__TEMPERATURE_SENSOR_FILE_HANDLE__;
    window.showOpenFilePicker = async () => [window.__TEMPERATURE_SENSOR_FILE_HANDLE__];
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
  await page.setInputFiles('#project-open-input', path.join(fixtureDirectory, 'temperature-sensor-draft.json'));
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');

  await addTemperatureModule(page);
  await page.waitForSelector('[data-component-id="temperature-sensor-1"]');
  assert((await page.textContent('#circuit-diagnostics')).includes('TEMPERATURE_SENSOR_VCC_DISCONNECTED'),
    'adding the unwired module did not expose the VCC diagnostic');
  await connect(page, 'temperature-sensor-1.VCC', 'board-1.5V');
  assert((await page.textContent('#circuit-diagnostics')).includes('TEMPERATURE_SENSOR_GND_DISCONNECTED'),
    'VCC wiring did not advance to the GND diagnostic');
  await connect(page, 'temperature-sensor-1.GND', 'board-1.GND1');
  assert((await page.textContent('#circuit-diagnostics')).includes('TEMPERATURE_SENSOR_AOUT_DISCONNECTED'),
    'ground wiring did not advance to the AOUT diagnostic');
  await connect(page, 'temperature-sensor-1.AOUT', 'board-1.A1');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));

  const card = page.locator('[data-component-id="temperature-sensor-1"]');
  await card.click();
  const support = await page.textContent('#selection-support');
  assert(/-50 to 150 °C maps linearly to 0–5 V/u.test(support)
      && /No physical-sensor accuracy/u.test(support),
  'honest temperature transfer and physical limits are absent from the actual inspector');
  const artwork = await card.locator('[data-artwork-key="sensor-temperature-analogue"]').getAttribute('aria-label');
  assert(/idealized temperature 25 degrees Celsius, 1\.875 volt output/u.test(artwork),
    'temperature artwork lacks its live signal label');
  for (const endpoint of ['temperature-sensor-1.VCC', 'temperature-sensor-1.GND', 'temperature-sensor-1.AOUT']) {
    await assertAttachment(page, endpoint);
  }

  const beforeX = (await card.boundingBox()).x;
  await card.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="temperature-sensor-1"]').getBoundingClientRect().x < left, beforeX);
  for (const endpoint of ['temperature-sensor-1.VCC', 'temperature-sensor-1.GND', 'temperature-sensor-1.AOUT']) {
    await assertAttachment(page, endpoint);
  }

  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
  assert(mutationRequests.length === 1 && mutationRequests[0].method === 'POST'
      && mutationRequests[0].path === '/api/build' && mutationRequests[0].bytes > 0,
  `source left the browser outside the one bounded compiler request: ${JSON.stringify(mutationRequests)}`);
  await page.selectOption('#pin-select', 'A1');
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#pin-detail').textContent === 'ADC 384', null, { timeout: 10_000 });
  assert((await page.textContent('#pin-level')) === '1.875 V', 'initial 25 C signal did not reach A1');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('TEMP_C=25'), null, { timeout: 10_000 });
  await page.selectOption('#pin-select', 'D13');
  await page.waitForFunction(() => document.querySelector('#pin-level').textContent === 'LOW', null, { timeout: 10_000 });

  const slider = page.locator('[data-control="temperature-sensor-1.temperatureC"]');
  await slider.fill('100');
  await page.selectOption('#pin-select', 'A1');
  await page.waitForFunction(() => document.querySelector('#pin-level').textContent === '3.750 V'
    && document.querySelector('#pin-detail').textContent === 'ADC 768', null, { timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('TEMP_C=100'), null, { timeout: 10_000 });
  await page.selectOption('#pin-select', 'D13');
  await page.waitForFunction(() => document.querySelector('#pin-level').textContent === 'HIGH', null, { timeout: 10_000 });

  await page.click('#reset');
  await page.selectOption('#pin-select', 'A1');
  await page.waitForFunction(() => document.querySelector('#pin-level').textContent === '3.750 V');
  assert((await page.inputValue('[data-control="temperature-sensor-1.temperatureC"]')) === '100',
    'reset lost the temperature control');
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#pin-detail').textContent === 'ADC 768', null, { timeout: 10_000 });

  await page.click('#project-save');
  await page.waitForFunction(() => {
    try {
      return JSON.parse(window.__TEMPERATURE_SENSOR_FILE_TEXT__).candidateCircuit.components
        .find((component) => component.id === 'temperature-sensor-1').controls.temperatureC === 100;
    } catch { return false; }
  });
  await page.click('#project-new');
  await page.click('#project-open');
  await page.waitForSelector('[data-component-id="temperature-sensor-1"]');
  assert((await page.inputValue('[data-control="temperature-sensor-1.temperatureC"]')) === '100',
    'Save/Open lost the temperature');
  const exactBeforeDelete = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.locator('[data-component-id="temperature-sensor-1"]').click();
  await page.click('#delete-component');
  await page.waitForFunction(() => !document.querySelector('[data-component-id="temperature-sensor-1"]'));
  assert(await page.locator('#run').isDisabled(), 'module deletion retained a stale runnable artifact');
  await page.click('#undo');
  await page.waitForSelector('[data-component-id="temperature-sensor-1"]');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === exactBeforeDelete,
    'Undo did not restore the exact module, wires, route and temperature');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileSlider = page.locator('[data-control="temperature-sensor-1.temperatureC"]');
  await mobileSlider.focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(() => document.querySelector('[data-control="temperature-sensor-1.temperatureC"]').value === '-50');
  await page.locator('[data-control="temperature-sensor-1.temperatureC"]').focus();
  await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('[data-control="temperature-sensor-1.temperatureC"]').value === '150');
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    controlVisible: Boolean(document.querySelector('[data-control="temperature-sensor-1.temperatureC"]').getClientRects().length),
    saveVisible: Boolean(document.querySelector('#project-save').getClientRects().length),
  }));
  assert(mobile.overflow <= 1 && mobile.controlVisible && mobile.saveVisible,
    `mobile temperature workflow overflowed or lost controls: ${JSON.stringify(mobile)}`);
  for (const endpoint of ['temperature-sensor-1.VCC', 'temperature-sensor-1.GND', 'temperature-sensor-1.AOUT']) {
    await assertAttachment(page, endpoint);
  }

  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
  assert(fs.statSync(path.join(fixtureDirectory, 'temperature-sensor-draft.json')).size > 0, 'fixture disappeared');
  console.log(JSON.stringify({
    browser: browserName,
    result: 'pass',
    actualCatalogueAddAndWire: true,
    visibleTerminalsAndMovedAttachments: 3,
    compiledAvrAdcToTemperatureLedAndSerial: true,
    saveOpenResetDeleteUndo: true,
    mobileKeyboardBoundaries: true,
    idealizedTransferDisclosure: true,
    compilerMutationRequests: mutationRequests,
    outsideRequests: 0,
  }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
