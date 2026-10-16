// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.RGB_LED_UI_URL || 'http://127.0.0.1:18773';
const fixtureDirectory = process.env.RGB_LED_UI_FIXTURES;
const browserName = process.env.RGB_LED_UI_BROWSER || 'chromium';
const screenshotPath = process.env.RGB_LED_UI_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType || !fixtureDirectory) throw new Error('RGB LED UI browser/fixture configuration missing');

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

async function expectRgb(page, red, green, blue) {
  await page.waitForFunction(({ r, g, b }) => {
    const artwork = document.querySelector('[data-artwork-key="output-rgb-led-common-cathode"]');
    if (!artwork) return false;
    const actual = [artwork.dataset.rDuty, artwork.dataset.gDuty, artwork.dataset.bDuty].map(Number);
    return Math.abs(actual[0] - r) < 0.035 && Math.abs(actual[1] - g) < 0.035
      && Math.abs(actual[2] - b) < 0.035;
  }, { r: red, g: green, b: blue }, { timeout: 10_000 });
}

async function sendColour(page, command, serialText, duties) {
  await page.fill('#serial-input', command);
  await page.selectOption('#serial-newline', 'none');
  await page.click('#serial-send');
  await page.waitForFunction((text) => document.querySelector('#serial-output').textContent.includes(text), serialText, { timeout: 10_000 });
  await expectRgb(page, ...duties);
}

const allEndpoints = [
  'rgb-led-1.COM', 'board-1.GND2',
  'rgb-led-1.R', 'resistor-3.A', 'resistor-3.B', 'board-1.D3',
  'rgb-led-1.G', 'resistor-4.A', 'resistor-4.B', 'board-1.D5',
  'rgb-led-1.B', 'resistor-5.A', 'resistor-5.B', 'board-1.D6',
];

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__RGB_LED_FILE_TEXT__ = '';
    window.__RGB_LED_FILE_HANDLE__ = {
      name: 'common-cathode-rgb-led.intent-mcu.json',
      async createWritable() {
        return {
          async write(blob) { window.__RGB_LED_FILE_TEXT__ = await blob.text(); },
          async close() {},
        };
      },
      async getFile() {
        return new File([window.__RGB_LED_FILE_TEXT__], this.name, { type: 'application/json' });
      },
    };
    window.showSaveFilePicker = async () => window.__RGB_LED_FILE_HANDLE__;
    window.showOpenFilePicker = async () => [window.__RGB_LED_FILE_HANDLE__];
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
  await page.setInputFiles('#project-open-input', path.join(fixtureDirectory, 'common-cathode-rgb-led-draft.json'));
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');

  await addCataloguePart(page, 'output.rgb-led-common-cathode-v1', 'common cathode rgb');
  await page.waitForSelector('[data-component-id="rgb-led-1"]');
  assert((await page.textContent('#circuit-diagnostics')).includes('RGB_LED_COMMON_DISCONNECTED'),
    'unwired RGB LED did not expose the common-cathode diagnostic');
  for (let index = 0; index < 3; index += 1) {
    await addCataloguePart(page, 'resistor.fixed-v1', 'axial fixed resistor');
  }
  for (const id of ['resistor-3', 'resistor-4', 'resistor-5']) await page.waitForSelector(`[data-component-id="${id}"]`);

  await connect(page, 'rgb-led-1.COM', 'board-1.GND2');
  assert((await page.textContent('#circuit-diagnostics')).includes('RGB_LED_R_DISCONNECTED'),
    'common wiring did not advance to the red-channel diagnostic');
  await connect(page, 'rgb-led-1.R', 'resistor-3.A');
  assert((await page.textContent('#circuit-diagnostics')).includes('RGB_LED_R_REQUIRES_PWM'),
    'red resistor without a source did not stay blocked');
  await connect(page, 'resistor-3.B', 'board-1.D3');
  assert((await page.textContent('#circuit-diagnostics')).includes('RGB_LED_G_DISCONNECTED'),
    'red wiring did not advance to green');
  await connect(page, 'rgb-led-1.G', 'resistor-4.A');
  await connect(page, 'resistor-4.B', 'board-1.D5');
  assert((await page.textContent('#circuit-diagnostics')).includes('RGB_LED_B_DISCONNECTED'),
    'green wiring did not advance to blue');
  await connect(page, 'rgb-led-1.B', 'resistor-5.A');
  await connect(page, 'resistor-5.B', 'board-1.D6');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));

  const card = page.locator('[data-component-id="rgb-led-1"]');
  await card.click();
  const support = await page.textContent('#selection-support');
  assert(/dedicated external series resistor/u.test(support) && /No wavelength/u.test(support),
    'RGB current-limit or honest colour boundary is absent from the inspector');
  const artworkLabel = await card.locator('[data-artwork-key="output-rgb-led-common-cathode"]').getAttribute('aria-label');
  assert(/common cathode RGB LED/u.test(artworkLabel) && /no physical colour accuracy/u.test(artworkLabel),
    'RGB artwork does not state its idealized visual boundary');
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  const beforeX = (await card.boundingBox()).x;
  await card.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="rgb-led-1"]').getBoundingClientRect().x < left, beforeX);
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
  assert(mutationRequests.length === 1 && mutationRequests[0].method === 'POST'
      && mutationRequests[0].path === '/api/build' && mutationRequests[0].bytes > 0,
  `source left the browser outside the one bounded compiler request: ${JSON.stringify(mutationRequests)}`);
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('RGB=255,0,0'), null, { timeout: 10_000 });
  await expectRgb(page, 1, 0, 0);
  await page.click('#serial-tab');
  await sendColour(page, 'g', 'RGB=0,255,0', [0, 1, 0]);
  await sendColour(page, 'b', 'RGB=0,0,255', [0, 0, 1]);
  await sendColour(page, 'm', 'RGB=255,128,64', [1, 0.5, 0.25]);
  const pwm = await page.evaluate(() => Object.fromEntries(window.__M6_STATE__.runtime.pins
    .filter((pin) => ['D3', 'D5', 'D6'].includes(pin.pin))
    .map((pin) => [pin.pin, { mode: pin.mode, level: pin.level, duty: pin.pwm?.duty ?? null }])));
  assert(pwm.D3.level === true && Math.abs(pwm.D5.duty - 0.5) < 0.035 && Math.abs(pwm.D6.duty - 0.25) < 0.035,
    `compiled PWM mix was not observed: ${JSON.stringify(pwm)}`);

  await page.click('#reset');
  await expectRgb(page, 0, 0, 0);
  await page.click('#run');
  await page.waitForFunction(() => (document.querySelector('#serial-output').textContent.match(/RGB=255,0,0/gu) ?? []).length >= 1, null, { timeout: 10_000 });
  await expectRgb(page, 1, 0, 0);

  await page.click('#project-save');
  await page.waitForFunction(() => {
    try {
      const saved = JSON.parse(window.__RGB_LED_FILE_TEXT__);
      return saved.candidateCircuit.components.some((item) => item.id === 'rgb-led-1')
        && saved.candidateCircuit.components.filter((item) => item.type === 'resistor.fixed-v1').length === 5;
    } catch { return false; }
  });
  await page.click('#project-new');
  await page.click('#project-open');
  await page.waitForSelector('[data-component-id="rgb-led-1"]');
  await page.waitForFunction(() => document.querySelector('#circuit-diagnostics').textContent.startsWith('Candidate accepted'));
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);
  const exactBeforeDelete = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.locator('[data-component-id="rgb-led-1"]').evaluate((node) => node.click());
  await page.waitForFunction(() => !document.querySelector('#delete-component').disabled);
  await page.click('#delete-component');
  await page.waitForFunction(() => !document.querySelector('[data-component-id="rgb-led-1"]'));
  assert(await page.locator('#run').isDisabled(), 'RGB deletion retained a stale runnable artifact');
  await page.click('#undo');
  await page.waitForSelector('[data-component-id="rgb-led-1"]');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === exactBeforeDelete,
    'Undo did not restore the exact RGB component, resistors, wires and routes');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCard = page.locator('[data-component-id="rgb-led-1"]');
  await mobileCard.evaluate((node) => node.click());
  const mobileBefore = (await mobileCard.boundingBox()).x;
  await mobileCard.focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction((left) => document.querySelector('[data-component-id="rgb-led-1"]').getBoundingClientRect().x > left, mobileBefore);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    pins: document.querySelectorAll('[data-component-id="rgb-led-1"] .pin-anchor').length,
    saveVisible: Boolean(document.querySelector('#project-save').getClientRects().length),
  }));
  assert(mobile.overflow <= 1 && mobile.pins === 4 && mobile.saveVisible,
    `mobile RGB workflow overflowed or lost controls: ${JSON.stringify(mobile)}`);
  for (const endpoint of allEndpoints) await assertAttachment(page, endpoint);

  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
  assert(fs.statSync(path.join(fixtureDirectory, 'common-cathode-rgb-led-draft.json')).size > 0,
    'fixture disappeared');
  console.log(JSON.stringify({
    browser: browserName,
    result: 'pass',
    actualCatalogueAddAndWire: true,
    visibleTerminalAttachmentsBeforeAndAfterMove: allEndpoints.length,
    compiledFirmwareColours: ['red', 'green', 'blue', 'mixed-255-128-64'],
    pwmPins: ['D3', 'D5', 'D6'],
    saveOpenResetDeleteUndo: true,
    mobileKeyboard: true,
    compilerMutationRequests: mutationRequests,
    outsideRequests: 0,
  }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
