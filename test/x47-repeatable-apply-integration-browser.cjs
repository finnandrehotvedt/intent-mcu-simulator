// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { chromium } = require('/runner/node_modules/playwright');

const base = process.env.X47_URL || 'http://127.0.0.1:18884';

function syntheticWorkerInstaller() {
  window.__X47_REPEATABLE_INTEGRATION_FIXTURE__ = {
    label: 'synthetic-browser-worker-not-native', commands: [],
  };
  const clone = (value) => structuredClone(value);
  class SyntheticRepeatableWorker extends EventTarget {
    constructor() { super(); this.identity = null; this.cycle = 0; }
    emit(data) { this.dispatchEvent(new MessageEvent('message', { data: clone(data) })); }
    snapshot(kind, paused, cycle) {
      return {
        kind, paused, cycle, instructions: cycle, speed: 1, led: false,
        digitalPins: {}, trace: [], serial: [], adcReads: [], unsupported: [], faultEvents: [],
        circuit: { leds: [] }, pins: [], retentionDrops: {},
        instruments: {
          serial: { records: [], dropped: 0 },
          logic: { transitions: [], dropped: 0, channels: ['D2', 'D13'] }, pin: null,
        },
        eventLog: { log: [], pending: [], applied: [], dropped: 0 },
        runtimeIdentity: clone(this.identity),
        modelExecutionContextSha256: this.identity.modelExecutionContextSha256,
      };
    }
    postMessage(data) {
      window.__X47_REPEATABLE_INTEGRATION_FIXTURE__.commands.push(clone(data));
      if (data.command === 'init') {
        this.identity = {
          schema: 'intent-mcu-worker-runtime-identity@2',
          projectGeneration: data.runtimeBinding.projectGeneration,
          runtimeGeneration: data.runtimeBinding.runtimeGeneration,
          artifactIdentity: data.runtimeBinding.artifactIdentity,
          modelImplementationSha256: data.runtimeBinding.modelImplementationSha256,
          modelExecutionContextSha256: data.runtimeBinding.modelExecutionContextSha256,
          workerInitialization: 1, workerInstanceNonce: '3'.repeat(32),
        };
        setTimeout(() => this.emit(this.snapshot('ready', true, 0)), 0);
      } else if (data.command === 'run') {
        this.cycle = 1_359_290;
        setTimeout(() => this.emit(this.snapshot('status', false, this.cycle)), 0);
      } else if (data.command === 'pause') {
        setTimeout(() => this.emit(this.snapshot('paused', true, this.cycle)), 0);
      } else if (data.command === 'x47-repeatable-apply') {
        const request = clone(data.request);
        const events = request.schedule.map((event, eventIndex) => ({
          eventIndex, offsetCycles: event.offsetCycles,
          targetCycle: request.expectedBaseCycle + event.offsetCycles,
          temperatureC: event.temperatureC,
          positionNumerator: event.positionNumerator,
          positionDenominator: event.positionDenominator,
          queueSequence: eventIndex + 1,
        }));
        setTimeout(() => this.emit({
          kind: 'x47-repeatable-accepted',
          schema: 'intent-mcu-x47-repeatable-queue@1',
          transactionId: request.transactionId,
          canonicalScheduleSha256: request.canonicalScheduleSha256,
          binding: clone(request.binding), baseCycle: request.expectedBaseCycle,
          events, retained: events.length, dropped: 0,
          runtimeIdentity: clone(this.identity),
          modelExecutionContextSha256: this.identity.modelExecutionContextSha256,
        }), 0);
      }
    }
    terminate() {}
  }
  window.Worker = SyntheticRepeatableWorker;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = {
    fixture: 'synthetic-browser-worker-not-native',
    interceptedBuildTransport: [], producerRequests: 0,
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(20_000);
    const failures = [];
    page.on('pageerror', (error) => failures.push(error.stack || error.message));
    page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
    await page.addInitScript(syntheticWorkerInstaller);
    await page.route((url) => url.pathname.startsWith('/api/build'), async (route) => {
      const request = route.request();
      report.interceptedBuildTransport.push(`${request.method()} ${new URL(request.url()).pathname}`);
      if (request.method() === 'POST') {
        await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
          jobId: 'synthetic-repeatable-apply', capability: 'synthetic-browser-worker-not-native',
        }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          status: 'succeeded', cacheHit: false, result: {
            artifactIdentity: 'a'.repeat(64), inputIdentity: 'b'.repeat(64),
            artifact: { hex: ':00000001FF' }, diagnostics: [],
          },
        }) });
      }
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ && window.__X47_REPEATABLE_INPUTS__);
    if (await page.locator('#walkthrough').getAttribute('open') !== null) {
      await page.locator('#walkthrough button').last().click();
    }
    await page.locator('#project-files-open').click();
    await page.locator('#project-demo').click();
    await page.locator('.starter-card[data-example="avr-thermostat-boundary-v1"]').click();
    if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) {
      await page.locator('#unsaved-discard').click();
    }
    await page.waitForFunction(() => window.__M6_STATE__.graph?.components?.some(
      (component) => component.id === 'temperature-sensor-1',
    ));

    await page.locator('#instruments-open').click();
    let dialog = page.locator('#workbench-instruments-dialog');
    const repeatable = dialog.locator('[data-x47-repeatable-inputs]');
    assert.equal(await repeatable.locator('[data-x47-repeatable-apply]').isDisabled(), true);
    await dialog.locator('[data-control="temperature-sensor-1.temperatureC"]').fill('20');
    await page.keyboard.press('Escape');
    await page.locator('#instruments-open').click();
    dialog = page.locator('#workbench-instruments-dialog');
    await dialog.locator('[data-control="enable-button-1.pressed"]').click();
    const stateAfterPress = await page.evaluate(() => ({
      graph: window.__M6_STATE__.graph.components.find(
        (component) => component.id === 'enable-button-1').controls.pressed,
      candidate: window.__M6_PROJECT__().candidateCircuit.components.find(
        (component) => component.id === 'enable-button-1').controls.pressed,
      base: window.__M6_PROJECT__().project.circuit.components.find(
        (component) => component.id === 'enable-button-1').controls.pressed,
    }));
    assert.deepEqual(stateAfterPress, { graph: true, candidate: true, base: true });
    await page.keyboard.press('Escape');

    await page.locator('#quick-build').click();
    await page.waitForFunction(() => window.__M6_STATE__.buildState === 'succeeded'
      && document.querySelector('#worker-state')?.textContent.includes('Paused'));
    await page.locator('#quick-run').click();
    await page.waitForFunction(() => document.querySelector('#worker-state')?.textContent.includes('Running'));
    await page.locator('#quick-pause').click();
    await page.waitForFunction(() => document.querySelector('#worker-state')?.textContent.includes('Paused'));

    await page.locator('#instruments-open').click();
    dialog = page.locator('#workbench-instruments-dialog');
    const panel = dialog.locator('[data-x47-repeatable-inputs]');
    await panel.locator('[data-x47-repeatable-parameters]').fill(JSON.stringify({
      startTemperatureC: 20, endTemperatureC: 40, eventCount: 5,
      startOffsetCycles: 16000, stepCycles: 200000,
    }));
    await panel.locator('[data-x47-repeatable-preview]').click();
    await page.waitForFunction(() => window.__X47_REPEATABLE_INPUTS__.snapshot().record?.family === 'ramp');
    const identities = await page.evaluate(() => ({
      context: window.__X47_REPEATABLE_INPUTS__.snapshot().context.graphIdentity,
      authority: window.__M6_STATE__.x47Integration.authority.graphIdentity,
    }));
    assert.equal(identities.context, identities.authority);
    const apply = panel.locator('[data-x47-repeatable-apply]');
    assert.equal(await apply.isDisabled(), false);
    await apply.click();
    await page.waitForFunction(() => window.__X47_REPEATABLE_INTEGRATION_FIXTURE__.commands
      .filter((command) => command.command === 'x47-repeatable-apply').length === 1);
    await page.waitForFunction(() => document.querySelector(
      '#workbench-instruments-dialog [data-x47-repeatable-runtime]',
    )?.textContent.includes('events queued on the current paused worker'));
    const commands = await page.evaluate(() => window.__X47_REPEATABLE_INTEGRATION_FIXTURE__.commands
      .map((command) => command.command));
    assert.equal(commands.filter((command) => command === 'x47-repeatable-apply').length, 1);

    const staleDetail = await page.evaluate(() => {
      const snapshot = window.__X47_REPEATABLE_INPUTS__.snapshot();
      return { context: { ...snapshot.context, graphIdentity: `sha256:${'f'.repeat(64)}` },
        record: snapshot.record, canonicalText: snapshot.canonicalText };
    });
    await page.evaluate((detail) => {
      document.dispatchEvent(new CustomEvent('x47-repeatable-apply-request', { detail }));
    }, staleDetail);
    await page.waitForFunction(() => window.__X47_REPEATABLE_INPUTS__.snapshot().reason
      === 'X47_REPEATABLE_APPLY_NOT_READY');
    assert.match(await panel.locator('[data-x47-repeatable-state]').textContent(),
      /Apply rejected.*X47_REPEATABLE_APPLY_NOT_READY/u);
    assert.equal(await apply.isDisabled(), true);
    assert.equal((await page.evaluate(() => window.__X47_REPEATABLE_INTEGRATION_FIXTURE__.commands
      .filter((command) => command.command === 'x47-repeatable-apply').length)), 1);

    report.graphIdentity = identities.context;
    report.workerApplyCommands = 1;
    report.immediateNegativeReason = 'X47_REPEATABLE_APPLY_NOT_READY';
    report.failures = failures;
    assert.deepEqual(failures, []);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
