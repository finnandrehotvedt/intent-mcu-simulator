// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.PICO_PUBLIC_URL || 'http://127.0.0.1:18774';
const screenshotDir = process.env.PICO_PUBLIC_SCREENSHOT_DIR || '/tmp';
const HIGH = `/* Intent MCU Simulator public RP2040 source v1 */
int main(void)
{
  intent_gpio0_output(1u);
  intent_uart0_text("PICO HIGH TEST");
  intent_halt();
}
`;
const LOW = HIGH.replace('1u', '0u').replace('PICO HIGH TEST', 'PICO LOW TEST');

async function selectPico(page) {
  await page.selectOption('#board-select', 'board.rp2040-pico-v1');
  await page.waitForFunction(() => !document.querySelector('#pico-public-workbench').hidden
    && window.__RP2040_PUBLIC_WORKBENCH__?.state().active === true);
}

async function build(page, source) {
  await page.fill('#pico-source', source);
  await page.click('#pico-build');
  await page.waitForFunction(() => ['built', 'failed', 'blocked'].includes(window.__RP2040_PUBLIC_WORKBENCH__.state().phase), null, { timeout: 20_000 });
  const state = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state());
  assert.equal(state.phase, 'built', state.message);
  assert.match(state.artifact.sourceSha256, /^[0-9a-f]{64}$/);
  assert.match(state.artifact.uf2Sha256, /^[0-9a-f]{64}$/);
  return state;
}

async function wiringGeometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      led: rect('#pico-external-led'),
      ledReturn: rect('.pico-wire-led-return'),
      ground: rect('.pico-wire-ground'),
      resistor: rect('.pico-resistor'),
      resistorLabel: rect('.pico-resistor-label'),
    };
  });
}

function assertContinuousWiring(geometry) {
  assert.ok(geometry.ledReturn.top < geometry.led.bottom, JSON.stringify(geometry));
  assert.ok(geometry.ledReturn.left >= geometry.led.left
    && geometry.ledReturn.right <= geometry.led.right, JSON.stringify(geometry));
  assert.ok(geometry.ledReturn.bottom >= geometry.ground.top
    && geometry.ledReturn.bottom <= geometry.ground.bottom, JSON.stringify(geometry));
  assert.ok(geometry.ground.right >= geometry.ledReturn.right, JSON.stringify(geometry));
  assert.ok(geometry.resistorLabel.bottom <= geometry.resistor.top - 8, JSON.stringify(geometry));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const page = await context.newPage();
  const outside = [];
  const errors = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);

  const desktop = await page.evaluate(() => {
    const rect = document.querySelector('main').getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert.ok(desktop.left >= 15 && desktop.left <= 24, JSON.stringify(desktop));
  assert.ok(desktop.viewport - desktop.right >= 15 && desktop.viewport - desktop.right <= 24, JSON.stringify(desktop));
  assert.ok(desktop.width >= 1880, JSON.stringify(desktop));
  assert.ok(desktop.overflow <= 1, JSON.stringify(desktop));

  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktop1440 = await page.evaluate(() => {
    const rect = document.querySelector('main').getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert.ok(desktop1440.left >= 15 && desktop1440.left <= 24, JSON.stringify(desktop1440));
  assert.ok(desktop1440.viewport - desktop1440.right >= 15 && desktop1440.viewport - desktop1440.right <= 24, JSON.stringify(desktop1440));
  assert.ok(desktop1440.width >= 1400, JSON.stringify(desktop1440));
  assert.ok(desktop1440.overflow <= 1, JSON.stringify(desktop1440));
  await page.setViewportSize({ width: 1920, height: 1080 });

  await selectPico(page);
  const picoLayout = await page.evaluate(() => ({
    panel: document.querySelector('#pico-public-workbench').getBoundingClientRect().width,
    avrWorkspaceParked: document.querySelector('#workbench-workspace').classList.contains('public-preview-mode'),
    gp0: document.querySelector('.pico-pin-gp0').textContent,
    gnd: document.querySelector('.pico-pin-gnd').textContent,
    onboard: document.querySelector('.pico-onboard-led').textContent,
  }));
  assert.ok(picoLayout.panel >= 1800, JSON.stringify(picoLayout));
  assert.equal(picoLayout.avrWorkspaceParked, true);
  assert.match(picoLayout.gp0, /physical pin 1/);
  assert.match(picoLayout.gnd, /physical pin 3/);
  assert.match(picoLayout.onboard, /GPIO25.*onboard LED only/s);
  const desktopWiring = await wiringGeometry(page);
  assertContinuousWiring(desktopWiring);

  await page.fill('#pico-source', HIGH.replace('int main(void)\n{', 'int main(void) {'));
  await page.click('#pico-build');
  const rejected = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state());
  assert.equal(rejected.phase, 'blocked');
  assert.match(rejected.message, /complete template and line breaks exactly as shown/);

  const high = await build(page, HIGH);
  await page.click('#pico-run');
  await page.waitForFunction(() => document.querySelector('#pico-serial').textContent.includes('PICO HIGH TEST')
    && document.querySelector('#pico-external-led').classList.contains('on'), null, { timeout: 10_000 });
  await page.click('#pico-reset');
  await page.waitForFunction(() => window.__RP2040_PUBLIC_WORKBENCH__.state().phase === 'paused');
  await page.click('#pico-run');
  await page.waitForFunction(() => document.querySelector('#pico-serial').textContent.includes('PICO HIGH TEST'));
  await page.click('#pico-pause');
  await page.waitForFunction(() => window.__RP2040_PUBLIC_WORKBENCH__.state().phase === 'paused');
  await page.click('#pico-stop');
  assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).runnable, false);

  const low = await build(page, LOW);
  assert.notEqual(low.artifact.sourceSha256, high.artifact.sourceSha256);
  assert.notEqual(low.artifact.uf2Sha256, high.artifact.uf2Sha256);
  await page.click('#pico-run');
  await page.waitForFunction(() => document.querySelector('#pico-serial').textContent.includes('PICO LOW TEST'));
  assert.equal(await page.locator('#pico-external-led').evaluate((node) => node.classList.contains('on')), false);

  await page.click('#pico-disconnect');
  let disconnected = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state());
  assert.equal(disconnected.circuitValid, false);
  assert.equal(disconnected.runnable, false);
  await page.click('#pico-build');
  disconnected = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state());
  assert.equal(disconnected.phase, 'blocked');
  assert.match(disconnected.message, /Circuit blocked/);
  await page.click('#pico-reconnect');
  assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).circuitValid, true);

  const downloadPromise = page.waitForEvent('download');
  await page.click('#pico-save');
  const savedPath = await (await downloadPromise).path();
  await page.fill('#pico-source', HIGH);
  await page.locator('#pico-open-input').setInputFiles(savedPath);
  await page.waitForFunction((expected) => document.querySelector('#pico-source').value === expected
    && window.__RP2040_PUBLIC_WORKBENCH__.state().runnable === false, LOW);

  await page.screenshot({ path: `${screenshotDir}/public-pico-desktop-1920.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await selectPico(page);
  const mobileWiring = await wiringGeometry(page);
  assertContinuousWiring(mobileWiring);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panel: document.querySelector('#pico-public-workbench').getBoundingClientRect(),
    controls: [...document.querySelectorAll('#quick-controls button')].map((node) => ({
      id: node.id, rect: node.getBoundingClientRect().toJSON(), hidden: node.hidden,
    })),
  }));
  assert.ok(mobile.overflow <= 1, JSON.stringify(mobile));
  assert.ok(mobile.panel.left >= 8 && mobile.panel.right <= 382, JSON.stringify(mobile.panel));
  assert.ok(mobile.controls.every((item) => !item.hidden && item.rect.left >= 0 && item.rect.right <= 390), JSON.stringify(mobile.controls));
  await page.screenshot({ path: `${screenshotDir}/public-pico-mobile-390.png`, fullPage: true });

  assert.deepEqual(outside, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(await context.cookies(), []);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', desktop, desktop1440, picoLayout, desktopWiring, high: high.artifact, low: low.artifact, mobileWiring, mobile })}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
