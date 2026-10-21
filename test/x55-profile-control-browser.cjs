// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X55_URL || 'http://host.docker.internal:18895';
const output = process.env.X55_OUTPUT || '/tmp/x55-profile-control';
const AVR = 'board.atmega328p-16mhz-v1';
const sources = [
  'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1',
  'board.stm32f429zi-nucleo144-v1',
];

function expectedAvrControls() {
  return {
    profile: AVR,
    build: { text: 'Build', title: '', disabled: false },
    run: { text: 'Run', title: '', disabled: true },
    pause: { text: 'Pause', title: '', disabled: true },
    reset: { text: 'Reset', title: '', disabled: true },
    stop: {
      text: 'Stop unavailable',
      title: 'Stop is unavailable for the AVR browser runtime; use Pause or Reset.',
      disabled: true,
    },
  };
}

async function controlState(page) {
  return page.evaluate(() => {
    const record = (id) => {
      const node = document.querySelector(id);
      return { text: node.textContent, title: node.title, disabled: node.disabled };
    };
    return {
      profile: document.querySelector('#board-select').value,
      build: record('#quick-build'), run: record('#quick-run'),
      pause: record('#quick-pause'), reset: record('#quick-reset'), stop: record('#quick-stop'),
    };
  });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { schema: 'intent-mcu-x55-profile-control-browser@1',
    producerRequests: [], mutatingRequests: [], thirdPartyRequests: [], workers: [], errors: [], cases: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__X55_CONTROL_WORKERS__ = [];
      window.Worker = new Proxy(NativeWorker, { construct(Target, args) {
        window.__X55_CONTROL_WORKERS__.push(String(args[0]));
        return Reflect.construct(Target, args);
      } });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      const item = { method: request.method(), path: url.pathname };
      if (/\/(?:api|compile|run|scenario)(?:\/|$)/u.test(url.pathname)) report.producerRequests.push(item);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) report.mutatingRequests.push(item);
      if (url.origin !== new URL(base).origin) report.thirdPartyRequests.push(item);
    });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true);
    if (await page.locator('#walkthrough').getAttribute('open') !== null) {
      await page.locator('#walkthrough button').last().click();
    }
    await page.click('#project-files-open');
    await page.click('#project-demo');
    await page.locator('.starter-card[data-example="blink"]').click();
    if (await page.locator('#unsaved-change-dialog').isVisible()) await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.length > 0);

    for (const fromProfile of sources) {
      await page.selectOption('#board-select', fromProfile);
      await page.waitForFunction((profile) => document.querySelector('#board-select').value === profile, fromProfile);
      await page.selectOption('#board-select', AVR);
      await page.waitForFunction((profile) => document.querySelector('#board-select').value === profile, AVR);
      const controls = await controlState(page);
      assert.deepEqual(controls, expectedAvrControls());
      const dispatch = await page.evaluate(() => {
        const calls = { pause: 0, reset: 0 };
        document.querySelector('#pause').click = () => { calls.pause += 1; };
        document.querySelector('#reset').click = () => { calls.reset += 1; };
        const quickPause = document.querySelector('#quick-pause');
        const quickReset = document.querySelector('#quick-reset');
        quickPause.disabled = false; quickReset.disabled = false;
        quickPause.click(); quickReset.click();
        return calls;
      });
      assert.deepEqual(dispatch, { pause: 1, reset: 1 });
      report.cases.push({ fromProfile, controls, dispatch });
    }
    report.workers = await page.evaluate(() => window.__X55_CONTROL_WORKERS__);
    report.runtimeWorkerCreations = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
    report.cookies = await context.cookies();
    await page.screenshot({ path: path.join(output, 'x55-profile-controls-1440x900.png'), animations: 'disabled' });
    assert.deepEqual(report.producerRequests, []);
    assert.deepEqual(report.mutatingRequests, []);
    assert.deepEqual(report.thirdPartyRequests, []);
    assert.deepEqual(report.workers, []);
    assert.equal(report.runtimeWorkerCreations, 0);
    assert.deepEqual(report.cookies, []);
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'x55-profile-controls.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ ok: true, cases: report.cases.length })}\n`);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
