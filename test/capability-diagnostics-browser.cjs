// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, firefox, webkit } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.CAPABILITY_DIAGNOSTICS_URL || 'http://127.0.0.1:18766';
const browserName = process.env.CAPABILITY_DIAGNOSTICS_BROWSER || 'chromium';
const full = process.env.CAPABILITY_DIAGNOSTICS_FULL !== '0';
const screenshotDirectory = process.env.CAPABILITY_DIAGNOSTICS_SCREENSHOT_DIR || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

const profiles = {
  pico: {
    option: 'board.rp2040-pico-v1', source: '#pico-source', build: '#pico-build',
    state: () => window.__RP2040_PUBLIC_WORKBENCH__.state(), links: '#pico-diagnostic-links',
    bad: (value) => value.replace('intent_gpio0_output', 'intent_gpio0_broken'), expectedLine: 4,
  },
  c3: {
    option: 'board.esp32-c3-devmodule-v1', source: '#c3-source', build: '#c3-build',
    state: () => window.__ESP32C3_PUBLIC_WORKBENCH__.state(), links: '#c3-diagnostic-links',
    bad: (value) => value.replace('pinMode(2, OUTPUT)', 'pinModeBroken(2, OUTPUT)'), expectedLine: 6,
  },
  stm32: {
    option: 'board.stm32f429zi-nucleo144-v1', source: '#stm32-source', build: '#stm32-build',
    state: () => window.__STM32_PUBLIC_WORKBENCH__.state(), links: '#stm32-diagnostic-links',
    bad: (value) => value.replace('intent_pb0_output', 'intent_pb0_broken'), expectedLine: 4,
  },
};

async function docs(page) {
  await page.goto(`${base}/controllers.html`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('#peripheral-capability-matrix tbody tr').count(), 4);
  assert.equal(await page.locator('#peripheral-capability-matrix tbody td').count(), 24);
  assert.equal(await page.locator('#language-api-matrix .docs-card').count(), 4);
  const text = await page.locator('#peripheral-capability-matrix').textContent();
  for (const label of ['GPIO', 'ADC', 'PWM', 'UART', 'Timers', 'Interrupts', 'Unavailable', 'Project model']) {
    assert(text.includes(label), `controller matrix omitted ${label}`);
  }
  if (screenshotDirectory && browserName === 'chromium') {
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDirectory, 'controller-capability-reference.png'),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.goto(`${base}/support.html`, { waitUntil: 'networkidle' });
  assert((await page.locator('#compiler-diagnostics').textContent()).includes('stale-source'));
}

async function choose(page, option) {
  await page.selectOption('#board-select', option);
  await page.waitForFunction((profile) => document.querySelector('#board-select').value === profile, option);
}

async function verifyNarrow(page, id, config) {
  await choose(page, config.option);
  const original = await page.inputValue(config.source);
  const bad = config.bad(original);
  assert.notEqual(bad, original, `${id}: bad source fixture did not change source`);
  await page.fill(config.source, bad);
  await page.click(config.build);
  await page.waitForFunction((name) => {
    const state = name === 'pico' ? window.__RP2040_PUBLIC_WORKBENCH__.state()
      : name === 'c3' ? window.__ESP32C3_PUBLIC_WORKBENCH__.state()
        : window.__STM32_PUBLIC_WORKBENCH__.state();
    return state.phase === 'failed';
  }, id);
  const state = await page.evaluate(config.state);
  assert.equal(state.diagnostics.length, 1, `${id}: no returned source diagnostic`);
  assert.equal(state.diagnostics[0].line, config.expectedLine, `${id}: wrong source line`);
  assert.equal(state.diagnostics[0].profile, config.option, `${id}: wrong profile binding`);
  assert.equal(await page.locator(`${config.links} button`).count(), 1, `${id}: missing navigation control`);
  const before = await page.inputValue(config.source);
  await page.locator(`${config.links} button`).press('Enter');
  const selected = await page.locator(config.source).evaluate((node) => ({
    active: document.activeElement === node,
    selected: node.value.slice(node.selectionStart, node.selectionEnd),
    source: node.value,
  }));
  assert.equal(selected.active, true, `${id}: editor was not focused`);
  assert.equal(selected.source, before, `${id}: navigation mutated source`);
  assert(selected.selected.toLowerCase().includes('broken'), `${id}: wrong source line selected`);
  await page.fill(config.source, original);
  assert.equal(await page.locator(`${config.links} button`).count(), 0, `${id}: stale diagnostic survived edit`);
  await page.click(config.build);
  await page.waitForFunction((name) => {
    const state = name === 'pico' ? window.__RP2040_PUBLIC_WORKBENCH__.state()
      : name === 'c3' ? window.__ESP32C3_PUBLIC_WORKBENCH__.state()
        : window.__STM32_PUBLIC_WORKBENCH__.state();
    return ['built', 'failed', 'blocked'].includes(state.phase);
  }, id, { timeout: id === 'c3' ? 190_000 : 45_000 });
  const fixed = await page.evaluate(config.state);
  assert.equal(fixed.phase, 'built', `${id}: corrected fresh Build failed: ${fixed.message}`);
  assert.equal(fixed.diagnostics.filter((item) => item.severity === 'error').length, 0);
}

async function verifyAvr(page) {
  await choose(page, 'board.atmega328p-16mhz-v1');
  await page.selectOption('#example-select', 'blink');
  await page.click('#project-demo');
  const original = await page.inputValue('#source');
  const bad = 'void setup() {\n  this_will_not_compile\n}\nvoid loop() {}\n';
  await page.fill('#source', bad);
  await page.click('#build');
  await page.waitForFunction(() => window.__M6_STATE__.buildState === 'failed', null, { timeout: 45_000 });
  assert(await page.locator('#diagnostic-links button').count() > 0, 'AVR actual compiler returned no navigable diagnostic');
  const publicText = `${await page.textContent('#diagnostics')} ${await page.textContent('#build-log')}`;
  assert(!publicText.includes('/workspace/') && !publicText.includes('/opt/'), 'AVR diagnostic exposed an internal path');
  await page.locator('#diagnostic-links button').first().press('Enter');
  const selected = await page.locator('#source').evaluate((node) => ({
    active: document.activeElement === node,
    selected: node.value.slice(node.selectionStart, node.selectionEnd),
    start: node.selectionStart,
    source: node.value,
  }));
  assert.equal(selected.active, true);
  assert.equal(selected.source, bad);
  assert.equal(bad.slice(0, selected.start).split('\n').length, 2, 'AVR diagnostic did not select or place the caret on the compiler-reported line');
  await page.fill('#source', original);
  assert.equal(await page.locator('#diagnostic-links button').count(), 0, 'AVR stale diagnostic survived edit');
  await page.click('#build');
  await page.waitForFunction(() => window.__M6_STATE__.buildState === 'succeeded', null, { timeout: 45_000 });
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await docs(page);
  if (full) {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await verifyAvr(page);
    for (const [id, config] of Object.entries(profiles)) await verifyNarrow(page, id, config);
  }
  assert.deepEqual(errors, []);
  assert.equal((await context.cookies()).length, 0);
  console.log(JSON.stringify({ browser: browserName, docs: true, full, profiles: full ? 4 : 0 }));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
