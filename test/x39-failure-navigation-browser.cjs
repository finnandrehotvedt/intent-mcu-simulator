// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X39_UI_URL || 'http://127.0.0.1:18821';
const evidenceDirectory = process.env.X39_EVIDENCE_DIR || '/tmp';
const action = '[data-scenario="THERM-SCENARIO-EQUALITY-ENABLED"] button';

async function loadKnownBad(page) {
  await page.selectOption('#example-select', 'avr-thermostat-boundary-v1');
  await page.click('#project-demo');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);
  await page.click('#thermostat-load-bad');
}

async function buildAndFail(page) {
  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 60_000 });
  await page.click('#thermostat-run-tests');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.knownBadCaught && window.__M6_STATE__.x39FailureLocator;
  }, null, { timeout: 40_000 });
  await page.waitForSelector(action);
}

async function restoreKnownBadAndRun(page) {
  const variant = await page.evaluate(() => window.__M6_STATE__.thermostatExperiment?.variant);
  if (variant !== 'known-bad-equality') {
    if (variant === 'modified') await page.click('#thermostat-restore');
    await page.click('#thermostat-load-bad');
  }
  await buildAndFail(page);
}

async function assertCleared(page, label) {
  assert.equal(await page.evaluate(() => window.__M6_STATE__.x39FailureLocator), null, `${label}: locator survived`);
  assert.equal(await page.locator(action).count(), 0, `${label}: action survived`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await loadKnownBad(page);
    await buildAndFail(page);

    const initial = await page.evaluate(() => structuredClone(window.__M6_STATE__.x39FailureLocator));
    assert.equal(initial.schema, 'intent-mcu-x39-failure-navigation@1');
    assert.equal(initial.source.file, 'main.ino');
    assert.equal(initial.source.startLine, 18);
    assert.equal(initial.pin.id, 'D13');
    assert.equal(initial.pin.actualLevel, true);
    assert.equal(initial.net.id, 'net-thermostat-heater-drive');
    assert.deepEqual(initial.net.endpoints, ['board-1.D13', 'heater-resistor-1.A']);
    assert(initial.observation.actualMilliseconds >= 160 && initial.observation.actualMilliseconds <= 350);
    assert.equal(initial.completeness.inputDrops, 0);
    assert.equal(initial.completeness.serialDrops, 0);

    await page.locator(action).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__M6_STATE__.x39FailureNavigation?.source === 'main.ino:18');
    const opened = await page.evaluate(() => {
      const source = document.querySelector('#source');
      return {
        active: document.activeElement?.id,
        selected: source.value.slice(source.selectionStart, source.selectionEnd),
        line: source.value.slice(0, source.selectionStart).split('\n').length,
        net: window.__M6_STATE__.selectedNetId,
        pinSelect: document.querySelector('#pin-select').value,
        pinCurrent: document.querySelector('#pin-level').textContent,
        summaryHidden: document.querySelector('#x39-failure-location').hidden,
        summary: document.querySelector('#x39-failure-location').textContent,
      };
    });
    assert.equal(opened.active, 'source');
    assert.equal(opened.line, 18);
    assert.equal(opened.selected.trim(), 'bool heating = enabled && temperatureC <= SETPOINT_C;');
    assert.equal(opened.net, 'net-thermostat-heater-drive');
    assert.equal(opened.pinSelect, 'D13');
    assert.match(opened.pinCurrent, /LOW/u, 'historical HIGH overwrote the current final-scenario pin value');
    assert.equal(opened.summaryHidden, false);
    assert.match(opened.summary, /Historical observation/u);
    assert.match(opened.summary, /210|ms inside 160–350 ms/u);
    await page.locator('#thermostat-experiment').screenshot({
      path: path.join(evidenceDirectory, 'x39-private-desktop.png'), animations: 'disabled', timeout: 15_000,
    });

    const [evidenceDownload] = await Promise.all([
      page.waitForEvent('download'), page.click('#x39-failure-export'),
    ]);
    const evidencePath = path.join(evidenceDirectory, 'x39-browser-export.json');
    await evidenceDownload.saveAs(evidencePath);
    const exported = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    assert.deepEqual(exported, initial);

    const beforeMove = initial.semanticSha256;
    await page.locator('[data-component-id="heater-resistor-1"]').click({ force: true });
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.__M6_STATE__.x39FailureLocator?.semanticSha256), beforeMove,
      'pure visual movement cleared or changed exact electrical evidence');

    await page.click('#reset');
    await assertCleared(page, 'Reset');

    await restoreKnownBadAndRun(page);
    await page.locator('#source').evaluate((node) => { node.value += '\n// edit'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await assertCleared(page, 'source edit');

    await restoreKnownBadAndRun(page);
    await page.selectOption('#selected-net', 'net-thermostat-heater-drive');
    await page.click('#delete-wire');
    await assertCleared(page, 'electrical edit');

    await loadKnownBad(page);
    await buildAndFail(page);
    await page.selectOption('#board-select', 'board.rp2040-pico-v1');
    await page.locator('#board-select').dispatchEvent('change');
    await assertCleared(page, 'profile switch');

    await page.selectOption('#board-select', 'board.atmega328p-16mhz-v1');
    await page.locator('#board-select').dispatchEvent('change');
    await restoreKnownBadAndRun(page);
    await page.click('#project-reload');
    await assertCleared(page, 'browser recovery reload');

    await restoreKnownBadAndRun(page);
    const [projectDownload] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    const projectPath = path.join(evidenceDirectory, 'x39-project-save.intent-mcu.json');
    await projectDownload.saveAs(projectPath);
    assert.doesNotMatch(fs.readFileSync(projectPath, 'utf8'), /intent-mcu-x39-failure-navigation|x39FailureLocator/u);
    await page.setInputFiles('#project-open-input', projectPath);
    await page.waitForFunction(() => document.querySelector('#unsaved-change-dialog').open
      || window.__M6_STATE__.x39FailureLocator === null);
    if (await page.locator('#unsaved-change-dialog[open]').count()) await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__M6_STATE__.x39FailureLocator === null);
    await assertCleared(page, 'Open');

    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cookies: document.cookie,
    }));
    assert(metrics.overflow <= 1, `desktop horizontal overflow ${metrics.overflow}`);
    assert.equal(metrics.cookies, '');
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ status: 'pass', browser: 'chromium',
      locator: initial, opened, lifecycleClears: ['Reset', 'source edit', 'electrical edit', 'profile switch', 'reload', 'Open'],
      visualMovementRetained: true, exportInert: true, overflow: metrics.overflow,
      cookies: 0, thirdPartyRequests: outside.length, browserErrors: errors.length })}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
