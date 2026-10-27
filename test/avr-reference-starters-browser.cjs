// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.AVR_REFERENCE_URL || 'http://127.0.0.1:18776';
const screenshotPath = process.env.AVR_REFERENCE_SCREENSHOT || null;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function load(page, id, name) {
  await page.click(`.starter-card[data-example="${id}"] .starter-action`);
  await page.waitForFunction(([expectedId, expectedName]) => {
    const value = window.__M6_PROJECT__();
    return document.querySelector('#example-select').value === expectedId
      && value.schema === 'intent-mcu-project-contact-persistence@1'
      && value.project.metadata.name === expectedName
      && document.querySelector('#build-state').textContent !== 'Build succeeded';
  }, [id, name]);
  assert(await page.locator('#run').isDisabled(), `${id}: stale Run authority`);
}

async function buildRun(page, id) {
  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 45_000 });
  await page.waitForFunction(() => !document.querySelector('#run').disabled, null, { timeout: 10_000 });
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#worker-state')?.textContent.includes('Running'), null, { timeout: 15_000 });
  assert((await page.textContent('#project-message')).length > 0, `${id}: no runtime status`);
}

async function serialHas(page, text, timeout = 15_000) {
  await page.waitForFunction((expected) => document.querySelector('#serial-output').textContent.includes(expected), text, { timeout });
}

async function expectSegmentFrame(page, digit, activeSegments) {
  const canonical = [...activeSegments].sort().join('');
  await page.waitForFunction(({ expectedDigit, expectedSegments }) => {
    const serial = document.querySelector('#serial-output').textContent;
    const artwork = document.querySelector('[data-artwork-key="output-seven-segment-common-cathode"]');
    return serial.includes(`\n${expectedDigit}\n`) && artwork?.dataset.activeSegments === expectedSegments;
  }, { expectedDigit: digit, expectedSegments: canonical }, { timeout: 15_000 });
}

async function exerciseEncoder(page, direction, expectedStates) {
  const before = await page.evaluate(() => ({
    events: window.__M6_STATE__.runtime.eventLog.log.length,
  }));
  await page.click(`[data-control="encoder-1.${direction}"]`);
  await page.waitForFunction((count) => window.__M6_STATE__.runtime.eventLog.log.length >= count + 4,
    before.events, { timeout: 10_000 });
  await page.waitForFunction(({ expected }) => {
    const text = document.querySelector('#serial-output').textContent;
    return text.includes(`${expected.join('\n')}\n`);
  }, { expected: expectedStates }, { timeout: 15_000 });
  return page.evaluate(({ start, expected, expectedDirection }) => {
    const events = window.__M6_STATE__.runtime.eventLog.log.slice(start, start + 4);
    const levels = { 2: true, 3: true };
    const states = events.map((event) => {
      levels[event.pin] = event.level;
      return `${levels[2] ? 1 : 0}${levels[3] ? 1 : 0}`;
    });
    return {
      direction: expectedDirection,
      states,
      expected,
      pins: events.map((event) => event.pin),
      targetCycles: events.map((event) => event.targetCycle),
      phaseDeltas: events.slice(1).map((event, index) => event.targetCycle - events[index].targetCycle),
    };
  }, { start: before.events, expected: expectedStates, expectedDirection: direction });
}

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 1100 } });
  const page = await context.newPage();
  const errors = []; const outside = []; const builds = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (request.method() === 'POST' && url.pathname === '/api/build') builds.push(request.postDataBuffer()?.length ?? 0);
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  assert(await page.locator('.starter-card').count() === 22, 'expected 22 starter cards');
  assert(await page.locator('.starter-learning-grid').count() === 22, 'all cards must expose Learn/Try/Observe/Limits');

  await load(page, 'avr-ground-reference-input', 'Ground reference input');
  assert(await page.locator('[data-component-id="ground-reference-1"] [data-terminal-pin="REF"]').count() === 1, 'ground reference terminal missing');
  await buildRun(page, 'ground'); await serialHas(page, 'OPEN');

  await load(page, 'avr-toggle-input', 'SPST toggle input'); await buildRun(page, 'toggle'); await serialHas(page, 'TOGGLE OPEN');
  await page.click('[data-control="toggle-switch-1.closed"]'); await serialHas(page, 'TOGGLE CLOSED');

  await load(page, 'avr-spdt-selector', 'SPDT input selector'); await buildRun(page, 'spdt'); await serialHas(page, 'THROW A LOW');
  await page.click('[data-control="selector-1.selectedThrow"]'); await serialHas(page, 'THROW B HIGH');
  assert((await page.textContent('#project-message')).includes('through BREAK'), 'SPDT transition did not report BREAK');

  await load(page, 'avr-light-analogue', 'Analogue light level'); await buildRun(page, 'light analogue');
  const light = page.locator('[data-control="light-sensor-1.lightLevel"]'); await light.fill('80'); await serialHas(page, '819');

  await load(page, 'avr-light-threshold', 'Digital light threshold'); await buildRun(page, 'light threshold');
  const thresholdLight = page.locator('[data-control="light-threshold-1.lightLevelPercent"]');
  await serialHas(page, 'LIGHT');
  await thresholdLight.fill('50'); await serialHas(page, 'DARK');
  await thresholdLight.fill('45');
  await page.waitForFunction(() => (document.querySelector('#serial-output').textContent.match(/LIGHT/gu) ?? []).length >= 2, null, { timeout: 10_000 });

  await load(page, 'avr-active-buzzer', 'Logical active buzzer'); await buildRun(page, 'buzzer');
  await serialHas(page, 'BUZZER ON'); await serialHas(page, 'BUZZER OFF');
  assert(await page.locator('audio').count() === 0, 'buzzer added an audio element');
  assert((await page.textContent('.starter-card[data-example="avr-active-buzzer"]')).includes('silent logical indicator'), 'buzzer limitation missing');

  // The public compiler intentionally accepts at most six builds per client
  // address per minute. Respect that production boundary instead of widening it.
  await page.waitForTimeout(61_000);

  await load(page, 'avr-seven-segment', 'Seven-segment digits'); await buildRun(page, 'seven segment');
  const segmentFrames = [['0', 'abcdef'], ['1', 'bc'], ['2', 'abdeg'], ['8', 'abcdefg']];
  for (const [digit, mask] of segmentFrames) await expectSegmentFrame(page, digit, mask);

  await load(page, 'avr-rotary-encoder', 'Quadrature encoder'); await buildRun(page, 'rotary');
  const cw = await exerciseEncoder(page, 'cw', ['01', '00', '10', '11']);
  const ccw = await exerciseEncoder(page, 'ccw', ['10', '00', '01', '11']);
  for (const result of [cw, ccw]) {
    assert(JSON.stringify(result.states) === JSON.stringify(result.expected), `${result.direction} event order: ${JSON.stringify(result)}`);
    assert(result.phaseDeltas.every((cycles) => cycles === 16_000), `${result.direction} phase timing: ${JSON.stringify(result)}`);
  }

  const final = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    generation: window.__M6_STATE__.projectGeneration,
    project: window.__M6_PROJECT__().project.metadata.name,
  }));
  assert(final.overflow <= 1, `horizontal overflow ${final.overflow}`);
  assert(builds.length === 8 && builds.every((bytes) => bytes > 0), `expected eight compiler posts: ${JSON.stringify(builds)}`);
  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `outside requests: ${JSON.stringify(outside)}`);
  if (screenshotPath) {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.locator('#starter-gallery').scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
  console.log(JSON.stringify({ ok: true, starters: 8, builds: builds.length, outsideRequests: 0,
    sevenSegmentFrames: segmentFrames, encoder: { cw, ccw, phaseMilliseconds: 1 }, final }));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
