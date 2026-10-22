// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X48_URL || 'http://host.docker.internal:18896';

function fakeWorkerInstaller() {
  window.__X48_AUTHORITY_TEST__ = { commands: [], workers: [], lateMessages: 0 };
  const clone = (value) => structuredClone(value);
  class SyntheticX48Worker extends EventTarget {
    constructor() {
      super(); this.identity = null; this.runningResult = null; this.terminated = false;
      window.__X48_AUTHORITY_TEST__.workers.push(this);
    }
    dispatch(data) { this.dispatchEvent(new MessageEvent('message', { data: clone(data) })); }
    snapshot(kind, paused = true, cycle = 0) {
      return { kind, paused, cycle, instructions: cycle, speed: 1, trace: [],
        circuit: { leds: [] }, instruments: { serial: { records: [], dropped: 0 },
          logic: { transitions: [], dropped: 0, channels: ['D13', 'D2'] }, pin: null },
        eventLog: { log: [], pending: [], applied: [], dropped: 0 }, pins: [], retentionDrops: {},
        runtimeIdentity: clone(this.identity),
        modelExecutionContextSha256: this.identity.modelExecutionContextSha256 };
    }
    postMessage(data) {
      window.__X48_AUTHORITY_TEST__.commands.push(data.command);
      if (data.command === 'init') {
        this.identity = { ...clone(data.runtimeBinding),
          schema: 'intent-mcu-worker-runtime-identity@2', workerInitialization: 1,
          workerInstanceNonce: '4'.repeat(32) };
        setTimeout(() => this.dispatch(this.snapshot('ready')), 0);
      } else if (data.command === 'x48-run') {
        this.runningResult = { schema: 'intent-mcu-x48-ideal-room-plant@2',
          plantId: 'x48-avr-ideal-room-instruction-boundary-v1', binding: clone(data.binding),
          status: 'running', reason: null, currentMilliC: 20000, rows: [], mismatches: 0,
          retention: { inputDrops: 0, logicDrops: 0, serialDrops: 0, adcDrops: 0,
            unsupportedDrops: 0 } };
        setTimeout(() => this.dispatch({ ...this.snapshot('x48-started'),
          result: this.runningResult, runtimeIdentity: this.identity }), 0);
      }
    }
    emitHeldOldTerminal() {
      window.__X48_AUTHORITY_TEST__.lateMessages += 1;
      this.dispatch({ ...this.snapshot('x48-complete'), result: { ...clone(this.runningResult),
        status: 'indeterminate', reason: 'X48_USER_CANCELLED' }, runtimeIdentity: this.identity });
    }
    terminate() { this.terminated = true; }
  }
  window.Worker = SyntheticX48Worker;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage(); const failures = []; const outside = [];
  page.on('pageerror', (error) => failures.push(error.stack || error.message));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
  });
  await page.addInitScript(fakeWorkerInstaller);
  await page.route((url) => url.pathname.startsWith('/api/build'), async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
        jobId: 'synthetic-x48-build', capability: 'synthetic-capability',
      }) }); return;
    }
    if (request.method() === 'DELETE') { await route.fulfill({ status: 204, body: '' }); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'succeeded', cacheHit: false, result: {
        artifactIdentity: 'a'.repeat(64), inputIdentity: 'b'.repeat(64),
        artifact: { hex: ':00000001FF' }, diagnostics: [],
      },
    }) });
  });
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
  try {
    assert.equal((await page.goto(base, { waitUntil: 'commit' })).status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ && window.__X48_RUNTIME_BRIDGE__);
    if (await page.locator('#walkthrough').getAttribute('open') !== null) {
      await page.locator('#walkthrough button').last().click();
    }
    await page.locator('#project-files-open').click();
    await page.locator('#project-demo').click();
    await page.locator('.starter-card[data-example="avr-thermostat-boundary-v1"]').click();
    await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);
    await page.locator('#quick-build').click();
    try {
      await page.waitForFunction(() => window.__X48_RUNTIME_BRIDGE__.eligibility().eligible === true,
        null, { timeout: 5000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({ eligibility: window.__X48_RUNTIME_BRIDGE__.eligibility(),
        state: window.__M6_STATE__, commands: window.__X48_AUTHORITY_TEST__.commands,
        projectMessage: document.querySelector('#project-message')?.textContent,
        technicalError: document.querySelector('#technical-error-detail')?.textContent }));
      throw new Error(`X48_AUTHORITY_BROWSER_BUILD:${JSON.stringify({ debug, failures })}`, { cause: error });
    }
    const started = await page.evaluate(() => window.__X48_RUNTIME_BRIDGE__.start());
    assert.equal(started.code, 'X48_START_POSTED');
    try {
      await page.waitForFunction(() => window.__X48_RUNTIME_BRIDGE__.active()
        && window.__X48_AUTHORITY_TEST__.commands.includes('x48-run')
        && window.__M6_STATE__.runtime?.kind === 'x48-started', null, { timeout: 3000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({ active: window.__X48_RUNTIME_BRIDGE__.active(),
        commands: window.__X48_AUTHORITY_TEST__.commands, runtime: window.__M6_STATE__.runtime,
        projectMessage: document.querySelector('#project-message')?.textContent,
        technicalError: document.querySelector('#technical-error-detail')?.textContent }));
      throw new Error(`X48_AUTHORITY_BROWSER_START:${JSON.stringify({ debug, failures })}`, { cause: error });
    }
    assert.equal(await page.locator('#quick-build').isDisabled(), true);
    assert.equal(await page.locator('#quick-run').isDisabled(), true);
    assert.equal((await page.evaluate(() => window.__M3_COMMAND__('run'))).code,
      'X48_OPERATION_ACTIVE');

    await page.evaluate(() => {
      const source = document.querySelector('#source'); source.value += '\n// retire X48 authority';
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    try {
      await page.waitForFunction(() => !window.__X48_RUNTIME_BRIDGE__.active()
        && window.__X48_AUTHORITY_TEST__.commands.includes('x48-cancel'), null, { timeout: 3000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({ active: window.__X48_RUNTIME_BRIDGE__.active(),
        commands: window.__X48_AUTHORITY_TEST__.commands, state: window.__M6_STATE__,
        sourceTail: document.querySelector('#source').value.slice(-80),
        projectMessage: document.querySelector('#project-message')?.textContent,
        technicalError: document.querySelector('#technical-error-detail')?.textContent }));
      throw new Error(`X48_AUTHORITY_BROWSER_RETIRE:${JSON.stringify({ debug, failures })}`, { cause: error });
    }
    const beforeLate = await page.evaluate(() => ({
      buildState: window.__M6_STATE__.buildState,
      runDisabled: document.querySelector('#quick-run').disabled,
      panelState: document.querySelector('[data-x48-room-loop]').dataset.state,
      panelText: document.querySelector('[data-x48-room-loop]').textContent,
    }));
    await page.evaluate(() => window.__X48_AUTHORITY_TEST__.workers.at(-1).emitHeldOldTerminal());
    await page.waitForTimeout(80);
    const afterLate = await page.evaluate(() => ({
      active: window.__X48_RUNTIME_BRIDGE__.active(),
      buildState: window.__M6_STATE__.buildState,
      runDisabled: document.querySelector('#quick-run').disabled,
      panelState: document.querySelector('[data-x48-room-loop]').dataset.state,
      panelText: document.querySelector('[data-x48-room-loop]').textContent,
      lateMessages: window.__X48_AUTHORITY_TEST__.lateMessages,
    }));
    assert.equal(beforeLate.buildState, 'dirty');
    assert.equal(afterLate.active, false);
    assert.equal(afterLate.buildState, 'dirty');
    assert.equal(beforeLate.runDisabled, true); assert.equal(afterLate.runDisabled, true);
    assert.equal(afterLate.panelState, beforeLate.panelState);
    assert.equal(afterLate.panelText, beforeLate.panelText);
    assert.equal(afterLate.lateMessages, 1);
    assert.deepEqual(outside, []); assert.deepEqual(failures, []);
    process.stdout.write(`${JSON.stringify({ ok: true, race: 'source-edit-vs-held-terminal',
      commands: await page.evaluate(() => window.__X48_AUTHORITY_TEST__.commands) })}\n`);
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
