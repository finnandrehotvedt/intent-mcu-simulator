// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.DIGITAL_THRESHOLD_UI_URL || 'http://127.0.0.1:18772';
const fixtureDirectory = process.env.DIGITAL_THRESHOLD_UI_FIXTURES;
const browserName = process.env.DIGITAL_THRESHOLD_UI_BROWSER || 'chromium';
const screenshotPath = process.env.DIGITAL_THRESHOLD_UI_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType || !fixtureDirectory) throw new Error('Digital threshold UI browser/fixture configuration missing');

function assert(condition, message) { if (!condition) throw new Error(message); }
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y); }

async function addThresholdModule(page) {
  await page.fill('#catalog-search', 'digital light threshold');
  const row = page.locator('.catalog-item[data-type="sensor.light-threshold-digital-v1"]');
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

async function setLight(page, value) {
  await page.locator('[data-control="light-threshold-1.lightLevelPercent"]').fill(String(value));
}

async function expectPin(page, pin, level) {
  await page.selectOption('#pin-select', pin);
  await page.waitForFunction((expected) => document.querySelector('#pin-level').textContent === expected,
    level, { timeout: 10_000 });
}

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__DIGITAL_THRESHOLD_FILE_TEXT__ = '';
    window.__DIGITAL_THRESHOLD_FILE_HANDLE__ = {
      name: 'digital-light-threshold.intent-mcu.json',
      async createWritable() {
        return {
          async write(blob) { window.__DIGITAL_THRESHOLD_FILE_TEXT__ = await blob.text(); },
          async close() {},
        };
      },
      async getFile() {
        return new File([window.__DIGITAL_THRESHOLD_FILE_TEXT__], this.name, { type: 'application/json' });
      },
    };
    window.showSaveFilePicker = async () => window.__DIGITAL_THRESHOLD_FILE_HANDLE__;
    window.showOpenFilePicker = async () => [window.__DIGITAL_THRESHOLD_FILE_HANDLE__];
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
  await page.setInputFiles('#project-open-input', path.join(fixtureDirectory, 'digital-light-threshold-draft.json'));
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');

  await addThresholdModule(page);
  await page.waitForSelector('[data-component-id="light-threshold-1"]');
  assert((await page.textContent('#circuit-diagnostics')).includes('DIGITAL_LIGHT_THRESHOLD_VCC_DISCONNECTED'),
    'unwired module did not expose the VCC diagnostic');
  await connect(page, 'light-threshold-1.VCC', 'board-1.5V');
  assert((await page.textContent('#circuit-diagnostics')).includes('DIGITAL_LIGHT_THRESHOLD_GND_DISCONNECTED'),
    'VCC wiring did not advance to the GND diagnostic');
  await connect(page, 'light-threshold-1.GND', 'board-1.GND1');
  assert((await page.textContent('#circuit-diagnostics')).includes('DIGITAL_LIGHT_THRESHOLD_DOUT_DISCONNECTED'),
    'ground wiring did not advance to the DOUT diagnostic');
  await connect(page, 'light-threshold-1.DOUT', 'board-1.D7');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));

  const card = page.locator('[data-component-id="light-threshold-1"]');
  await card.click();
  const support = await page.textContent('#selection-support');
  assert(/active LOW/u.test(support) && /percentage points/u.test(support) && /No lux calibration/u.test(support),
    'threshold polarity, units or physical limits are absent from the inspector');
  const artwork = await card.locator('[data-artwork-key="sensor-light-threshold-digital"]').getAttribute('aria-label');
  assert(/light 40 percent, threshold 50 percent, hysteresis 5 percentage points, DOUT HIGH/u.test(artwork),
    'threshold artwork lacks its live state label');
  for (const endpoint of ['light-threshold-1.VCC', 'light-threshold-1.GND', 'light-threshold-1.DOUT']) {
    await assertAttachment(page, endpoint);
  }

  const beforeX = (await card.boundingBox()).x;
  await card.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="light-threshold-1"]').getBoundingClientRect().x < left, beforeX);
  for (const endpoint of ['light-threshold-1.VCC', 'light-threshold-1.GND', 'light-threshold-1.DOUT']) {
    await assertAttachment(page, endpoint);
  }

  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
  assert(mutationRequests.length === 1 && mutationRequests[0].method === 'POST'
      && mutationRequests[0].path === '/api/build' && mutationRequests[0].bytes > 0,
  `source left the browser outside the one bounded compiler request: ${JSON.stringify(mutationRequests)}`);
  await page.click('#run');
  await expectPin(page, 'D7', 'HIGH');
  await expectPin(page, 'D13', 'LOW');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('THRESHOLD_ACTIVE=0'), null, { timeout: 10_000 });

  await setLight(page, 50);
  await expectPin(page, 'D7', 'LOW');
  await expectPin(page, 'D13', 'HIGH');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('THRESHOLD_ACTIVE=1'), null, { timeout: 10_000 });
  const activeSerial = await page.textContent('#serial-output');
  await setLight(page, 49);
  await expectPin(page, 'D7', 'LOW');
  await setLight(page, 46);
  await expectPin(page, 'D7', 'LOW');
  await page.waitForTimeout(150);
  assert((await page.textContent('#serial-output')) === activeSerial,
    'output chattered while the input moved inside the retained hysteresis band');
  await setLight(page, 45);
  await expectPin(page, 'D7', 'HIGH');
  await expectPin(page, 'D13', 'LOW');
  await page.waitForFunction((prior) => {
    const text = document.querySelector('#serial-output').textContent;
    return text !== prior && (text.match(/THRESHOLD_ACTIVE=0/gu) ?? []).length === 2;
  }, activeSerial, { timeout: 10_000 });

  await setLight(page, 50);
  await setLight(page, 48);
  await expectPin(page, 'D7', 'LOW');
  await page.click('#reset');
  await expectPin(page, 'D7', 'LOW');
  assert((await page.inputValue('[data-control="light-threshold-1.lightLevelPercent"]')) === '48',
    'reset lost the retained hysteresis input');
  await page.click('#run');
  await expectPin(page, 'D13', 'HIGH');

  await page.click('#project-save');
  await page.waitForFunction(() => {
    try {
      const component = JSON.parse(window.__DIGITAL_THRESHOLD_FILE_TEXT__).candidateCircuit.components
        .find((item) => item.id === 'light-threshold-1');
      return component.controls.lightLevelPercent === 48 && component.controls.outputActive === true;
    } catch { return false; }
  });
  await page.click('#project-new');
  await page.click('#project-open');
  await page.waitForSelector('[data-component-id="light-threshold-1"]');
  assert((await page.inputValue('[data-control="light-threshold-1.lightLevelPercent"]')) === '48',
    'Save/Open lost the threshold input');
  assert((await page.locator('[data-component-id="light-threshold-1"] [data-artwork-key="sensor-light-threshold-digital"]')
    .getAttribute('data-output-level')) === 'LOW', 'Save/Open lost retained active output');
  const exactBeforeDelete = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.locator('[data-component-id="light-threshold-1"]').click();
  await page.click('#delete-component');
  await page.waitForFunction(() => !document.querySelector('[data-component-id="light-threshold-1"]'));
  assert(await page.locator('#run').isDisabled(), 'module deletion retained a stale runnable artifact');
  await page.click('#undo');
  await page.waitForSelector('[data-component-id="light-threshold-1"]');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === exactBeforeDelete,
    'Undo did not restore the exact module, wires, route and retained state');

  await page.setViewportSize({ width: 390, height: 844 });
  const lightControl = page.locator('[data-control="light-threshold-1.lightLevelPercent"]');
  await lightControl.focus(); await page.keyboard.press('Home');
  await page.waitForFunction(() => document.querySelector('[data-control="light-threshold-1.lightLevelPercent"]').value === '0');
  await page.locator('[data-control="light-threshold-1.lightLevelPercent"]').focus(); await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('[data-control="light-threshold-1.lightLevelPercent"]').value === '100');
  await page.locator('[data-control="light-threshold-1.thresholdPercent"]').focus(); await page.keyboard.press('Home');
  await page.waitForFunction(() => document.querySelector('[data-control="light-threshold-1.thresholdPercent"]').value === '10');
  await page.locator('[data-control="light-threshold-1.hysteresisPercentagePoints"]').focus(); await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('[data-control="light-threshold-1.hysteresisPercentagePoints"]').value === '10');
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    controls: [...document.querySelectorAll('[data-control^="light-threshold-1."]')]
      .filter((element) => element.getClientRects().length).length,
    saveVisible: Boolean(document.querySelector('#project-save').getClientRects().length),
  }));
  assert(mobile.overflow <= 1 && mobile.controls === 3 && mobile.saveVisible,
    `mobile threshold workflow overflowed or lost controls: ${JSON.stringify(mobile)}`);
  for (const endpoint of ['light-threshold-1.VCC', 'light-threshold-1.GND', 'light-threshold-1.DOUT']) {
    await assertAttachment(page, endpoint);
  }

  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
  assert(fs.statSync(path.join(fixtureDirectory, 'digital-light-threshold-draft.json')).size > 0,
    'fixture disappeared');
  console.log(JSON.stringify({
    browser: browserName,
    result: 'pass',
    actualCatalogueAddAndWire: true,
    visibleTerminalsAndMovedAttachments: 3,
    compiledActiveLowLedAndSerial: true,
    exactActivationBoundary: 50,
    exactReleaseBoundary: 45,
    noChatterInsideBand: [49, 46],
    saveOpenResetDeleteUndo: true,
    mobileKeyboardBoundaries: true,
    compilerMutationRequests: mutationRequests,
    outsideRequests: 0,
  }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
