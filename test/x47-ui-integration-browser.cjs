// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X47_URL || 'http://127.0.0.1:18883';
const evidenceDir = process.env.X47_EVIDENCE_DIR || '';
const viewports = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }];

async function loadButtonExample(page) {
  await page.locator('#project-files-open').click();
  await page.locator('#project-demo').click();
  await page.locator('.starter-card[data-example="button"]').click();
  if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) {
    await page.locator('#unsaved-discard').click();
  }
  await page.waitForFunction(() => window.__M6_STATE__.graph?.components?.some(
    (component) => component.type === 'button.momentary-v1',
  ));
}

async function armDigestGate(page, pass = 0) {
  await page.evaluate((allowed) => { void window.__X47_DIGEST_GATE__.holdNextAfter(allowed); }, pass);
}

async function waitDigestHeld(page) {
  await page.waitForFunction(() => window.__X47_DIGEST_GATE__.state()?.held === true);
}

async function releaseDigestGate(page) {
  await page.evaluate(() => window.__X47_DIGEST_GATE__.release());
}

async function waitSyntheticPaused(page) {
  await page.waitForFunction(() => document.querySelector('#worker-state')?.textContent.includes('Paused'));
}

async function syntheticBuild(page) {
  await page.locator('#quick-build').click();
  await waitSyntheticPaused(page);
}

async function appendSyntheticSource(page, text) {
  await page.evaluate((suffix) => {
    const source = document.querySelector('#source');
    source.value += `\n// ${suffix}`;
    source.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

function fakeWorkerInstaller() {
  window.__X47_FAKE_STALL_DISPOSE__ = false;
  window.__X47_SYNTHETIC_WORKERS__ = 0;
  window.__X47_SYNTHETIC_COMMANDS__ = [];
  const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
  let digestGate = null;
  Object.defineProperty(crypto.subtle, 'digest', { configurable: true, value: async (...args) => {
    if (digestGate) {
      digestGate.calls += 1;
      if (!digestGate.held && digestGate.calls === digestGate.pass + 1) {
        digestGate.held = true;
        digestGate.signal();
        await digestGate.promise;
      }
    }
    return nativeDigest(...args);
  } });
  window.__X47_DIGEST_GATE__ = {
    holdNextAfter(pass = 0) {
      let release; let signal;
      const promise = new Promise((resolve) => { release = resolve; });
      const held = new Promise((resolve) => { signal = resolve; });
      digestGate = { pass, calls: 0, held: false, promise, release, signal, heldPromise: held };
      return held;
    },
    release() { digestGate?.release(); digestGate = null; },
    state() { return digestGate ? { calls: digestGate.calls, held: digestGate.held } : null; },
  };
  const clone = (value) => structuredClone(value);
  class SyntheticX47Worker extends EventTarget {
    constructor() { super(); this.identity = null; this.init = null; this.queue = null;
      this.execution = null; this.terminated = false; window.__X47_SYNTHETIC_WORKERS__ += 1; }
    emit(data) {
      if (!this.terminated) this.dispatchEvent(new MessageEvent('message', { data: clone(data) }));
    }
    snapshot(kind, paused, cycle, extra = {}) {
      return { kind, paused, cycle, instructions: cycle, speed: 1, trace: [],
        circuit: { leds: [] }, instruments: { serial: { records: [], dropped: 0 },
          logic: { transitions: [], dropped: 0, channels: ['D13', 'D2'] }, pin: null },
        eventLog: { log: [], pending: [], applied: [], dropped: 0 },
        pins: [], retentionDrops: {},
        runtimeIdentity: clone(this.identity),
        modelExecutionContextSha256: this.identity.modelExecutionContextSha256, ...extra };
    }
    postMessage(data) {
      window.__X47_SYNTHETIC_COMMANDS__.push(data.command);
      if (data.command === 'init') {
        this.init = clone(data);
        this.identity = { schema: 'intent-mcu-worker-runtime-identity@2',
          projectGeneration: data.runtimeBinding.projectGeneration,
          runtimeGeneration: data.runtimeBinding.runtimeGeneration,
          artifactIdentity: data.runtimeBinding.artifactIdentity,
          modelImplementationSha256: data.runtimeBinding.modelImplementationSha256,
          modelExecutionContextSha256: data.runtimeBinding.modelExecutionContextSha256,
          workerInitialization: 1, workerInstanceNonce: '1'.repeat(32) };
        setTimeout(() => this.emit(this.snapshot('ready', true, 0)), 0); return;
      }
      if (data.command === 'run') {
        const cycle = this.execution ? this.execution.events.at(-1).targetCycle : 1;
        if (this.execution) {
          this.execution = { ...this.execution, complete: true,
            events: this.execution.events.map((event) => ({ ...event,
              drainAppliedCycle: event.targetCycle, adapterAppliedCycle: event.targetCycle,
              transitionCycle: event.targetCycle, transitioned: true })),
            retention: { requested: { expected: 2, retained: 2, dropped: 0 },
              drained: { expected: 2, retained: 2, dropped: 0 },
              adapter: { expected: 2, retained: 2, dropped: 0 }, discontinuities: 0 } };
        }
        setTimeout(() => this.emit(this.snapshot('status', false, cycle, this.queue ? { x47: {
          transactions: [{ queueReceipt: clone(this.queue), executionReceipt: clone(this.execution),
            cancelReceipt: null }] } } : {})), 0); return;
      }
      if (data.command === 'pause') {
        setTimeout(() => this.emit(this.snapshot('paused', true, 10)), 0); return;
      }
      if (data.command === 'x47-apply') {
        const request = clone(data.request);
        this.queue = { schema: 'intent-mcu-x47-queue-receipt@2',
          transactionId: request.transactionId, canonicalPulseSha256: request.canonicalPulseSha256,
          binding: clone(request.binding), baseCycle: request.expectedBaseCycle,
          events: request.events.map((event, eventIndex) => ({ eventIndex, ...event,
            targetCycle: request.expectedBaseCycle + event.offsetCycles, queueSequence: eventIndex + 1 })),
          retention: { limit: 10000, beforeRequestedRetained: 0, beforeRequestedDropped: 0,
            afterRequestedRetained: 2, afterRequestedDropped: 0 } };
        this.execution = { schema: 'intent-mcu-x47-execution-receipt@2',
          transactionId: request.transactionId, canonicalPulseSha256: request.canonicalPulseSha256,
          binding: clone(request.binding), baseCycle: request.expectedBaseCycle, complete: false,
          events: this.queue.events.map((event) => ({ ...event, drainAppliedCycle: null,
            adapterAppliedCycle: null, transitionCycle: null, transitioned: null })),
          retention: { requested: { expected: 2, retained: 2, dropped: 0 },
            drained: { expected: 2, retained: 0, dropped: 0 },
            adapter: { expected: 2, retained: 0, dropped: 0 }, discontinuities: 0 } };
        setTimeout(() => this.emit({ kind: 'x47-accepted', receipt: clone(this.queue),
          executionReceipt: clone(this.execution), runtimeIdentity: clone(this.identity),
          modelExecutionContextSha256: this.identity.modelExecutionContextSha256 }), 0); return;
      }
      if (data.command === 'dispose') {
        if (window.__X47_FAKE_STALL_DISPOSE__) return;
        const receipt = { schema: 'intent-mcu-x47-cancel-receipt@2',
          transactionId: this.queue.transactionId, canonicalPulseSha256: this.queue.canonicalPulseSha256,
          binding: clone(this.queue.binding), baseCycle: this.queue.baseCycle, reason: 'DISPOSE',
          cancelCycle: this.queue.events.at(-1).targetCycle, state: 'cancelled', evidenceComplete: true,
          queuePending: [], adapterScheduled: [],
          adapterApplied: this.queue.events.map((event) => ({ eventIndex: event.eventIndex,
            targetCycle: event.targetCycle, appliedCycle: event.targetCycle,
            transitioned: true, transitionCycle: event.targetCycle })),
          retention: { requested: { expected: 2, retained: 2, dropped: 0 },
            drained: { expected: 2, retained: 2, dropped: 0 },
            adapter: { expected: 2, retained: 2, dropped: 0 }, discontinuities: 0 } };
        setTimeout(() => {
          this.emit({ kind: 'x47-cancelled', reason: 'DISPOSE', disposeToken: data.disposeToken,
            receipts: [receipt], runtimeIdentity: clone(this.identity),
            modelExecutionContextSha256: this.identity.modelExecutionContextSha256 });
          this.emit({ kind: 'disposed', profile: 'board.atmega328p-16mhz-v1', paused: true,
            cycle: 0, instructions: 0, disposeToken: data.disposeToken,
            x47CancellationReceipts: [receipt], runtimeIdentity: clone(this.identity),
            modelExecutionContextSha256: this.identity.modelExecutionContextSha256 });
        }, 0);
        return;
      }
      if (data.command === 'reset') {
        if (this.queue) {
          const receipt = { schema: 'intent-mcu-x47-cancel-receipt@2',
            transactionId: this.queue.transactionId,
            canonicalPulseSha256: this.queue.canonicalPulseSha256,
            binding: clone(this.queue.binding), baseCycle: this.queue.baseCycle, reason: 'RESET',
            cancelCycle: this.queue.baseCycle, state: 'cancelled', evidenceComplete: false,
            queuePending: this.queue.events.map((event) => ({ eventIndex: event.eventIndex,
              queueSequence: event.queueSequence, targetCycle: event.targetCycle })),
            adapterScheduled: this.queue.events.map((event) => ({ eventIndex: event.eventIndex,
              targetCycle: event.targetCycle })), adapterApplied: [],
            retention: { requested: { expected: 2, retained: 2, dropped: 0 },
              drained: { expected: 2, retained: 0, dropped: 0 },
              adapter: { expected: 2, retained: 0, dropped: 0 }, discontinuities: 0 } };
          setTimeout(() => this.emit({ kind: 'x47-cancelled', reason: 'RESET', receipts: [receipt],
            runtimeIdentity: clone(this.identity),
            modelExecutionContextSha256: this.identity.modelExecutionContextSha256 }), 0);
        }
        setTimeout(() => this.emit(this.snapshot('reset', true, 0)), 0);
      }
    }
    terminate() { this.terminated = true; }
  }
  window.Worker = SyntheticX47Worker;
}

(async () => {
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const failures = []; const outside = []; const buildRequests = [];
      page.on('pageerror', (error) => failures.push(error.stack || error.message));
      page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== new URL(base).origin) outside.push(request.url());
        if (url.pathname.startsWith('/api/build')) buildRequests.push(`${request.method()} ${url.pathname}`);
      });
      await page.addInitScript(fakeWorkerInstaller);
      await page.route((url) => url.pathname.startsWith('/api/build'), async (route) => {
        const request = route.request(); const url = new URL(request.url());
        if (request.method() === 'POST') {
          await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
            jobId: 'synthetic-x47-build', capability: 'synthetic-capability',
          }) }); return;
        }
        if (request.method() === 'DELETE') {
          await route.fulfill({ status: 204, body: '' }); return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          status: 'succeeded', cacheHit: false, result: {
            artifactIdentity: 'a'.repeat(64), inputIdentity: 'b'.repeat(64),
            artifact: { hex: ':00000001FF' }, diagnostics: [],
          },
        }) });
      });
      await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__M11_READY__ && window.__X47_PULSE_PREVIEW__);
      if (await page.locator('#walkthrough').getAttribute('open') !== null) {
        await page.locator('#walkthrough button').last().click();
      }
      await loadButtonExample(page);
      const raceResults = [];
      if (viewport.width === 1366) {
        for (const action of ['source', 'open', 'new-build']) {
          const workersBefore = await page.evaluate(() => window.__X47_SYNTHETIC_WORKERS__);
          await armDigestGate(page, 1);
          await page.locator('#quick-build').click();
          await waitDigestHeld(page);
          if (action === 'source') {
            await appendSyntheticSource(page, 'async load retirement');
          } else if (action === 'open') await loadButtonExample(page);
          else {
            await page.locator('#quick-build').click();
            await waitSyntheticPaused(page);
          }
          await releaseDigestGate(page);
          await page.waitForTimeout(80);
          const workersAfter = await page.evaluate(() => window.__X47_SYNTHETIC_WORKERS__);
          assert.equal(workersAfter, workersBefore + (action === 'new-build' ? 1 : 0),
            `stale ${action} load created a worker`);
          raceResults.push(`load-vs-${action}`);
          await loadButtonExample(page);
        }

        // A held Pause hash cannot bind after authored source replacement.
        await syntheticBuild(page);
        await page.locator('#quick-run').click();
        await page.waitForFunction(() => document.querySelector('#worker-state')?.textContent.includes('Running'));
        await page.locator('#quick-pause').click();
        await waitSyntheticPaused(page);
        await page.locator('#instruments-open').click();
        let racePanel = page.locator('#workbench-instruments-dialog [data-x47-pulse-preview]');
        await armDigestGate(page, 1);
        await racePanel.locator('[data-x47-preview]').click();
        await waitDigestHeld(page);
        await appendSyntheticSource(page, 'retire held pause');
        await releaseDigestGate(page);
        await page.waitForTimeout(80);
        assert.equal(await page.evaluate(() => window.__M6_STATE__.x47Integration?.phase), 'retired');
        raceResults.push('pause-hash-vs-source');
        await page.keyboard.press('Escape');
        await loadButtonExample(page);

        // Stop invalidates a held Apply hash; two concurrent Apply requests still send exactly one.
        await syntheticBuild(page);
        await page.locator('#quick-run').click();
        await page.waitForFunction(() => document.querySelector('#worker-state')?.textContent.includes('Running'));
        await page.locator('#quick-pause').click();
        await waitSyntheticPaused(page);
        await page.locator('#instruments-open').click();
        racePanel = page.locator('#workbench-instruments-dialog [data-x47-pulse-preview]');
        await racePanel.locator('[data-x47-preview]').click();
        await page.waitForFunction(() => !document.querySelector('[data-x47-apply]').disabled);
        let applies = await page.evaluate(() => window.__X47_SYNTHETIC_COMMANDS__
          .filter((command) => command === 'x47-apply').length);
        await armDigestGate(page, 0);
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('x47-apply-request')));
        await waitDigestHeld(page);
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('x47-stop-request')));
        await releaseDigestGate(page);
        await page.waitForTimeout(80);
        assert.equal(await page.evaluate(() => window.__X47_SYNTHETIC_COMMANDS__
          .filter((command) => command === 'x47-apply').length), applies);
        raceResults.push('apply-hash-vs-stop');

        await armDigestGate(page, 0);
        await page.evaluate(() => {
          document.dispatchEvent(new CustomEvent('x47-apply-request'));
          document.dispatchEvent(new CustomEvent('x47-apply-request'));
        });
        await waitDigestHeld(page);
        await page.waitForFunction((before) => window.__X47_SYNTHETIC_COMMANDS__
          .filter((command) => command === 'x47-apply').length === before + 1, applies);
        await releaseDigestGate(page);
        await page.waitForFunction(() => window.__M6_STATE__.x47Integration?.phase === 'resume-required');
        assert.equal(await page.evaluate(() => window.__X47_SYNTHETIC_COMMANDS__
          .filter((command) => command === 'x47-apply').length), applies + 1);
        raceResults.push('two-apply-one-send');

        await page.keyboard.press('Escape');
        const workersBeforeReset = await page.evaluate(() => window.__X47_SYNTHETIC_WORKERS__);
        await page.locator('#quick-reset').click();
        await page.waitForFunction(() => window.__M6_STATE__.x47Integration?.reason
          ?.includes('Reset cancellation acknowledged'));
        await waitSyntheticPaused(page);
        assert.equal(await page.evaluate(() => window.__X47_SYNTHETIC_WORKERS__), workersBeforeReset);
        raceResults.push('reset-cancellation-separated');
        await loadButtonExample(page);
      }
      await page.locator('#instruments-open').click();
      let panel = page.locator('#workbench-instruments-dialog [data-x47-pulse-preview]');
      await panel.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');

      await page.locator('#quick-build').click();
      await page.waitForTimeout(800);
      const buildDebug = await page.evaluate(() => ({ state: window.__M6_STATE__.buildState,
        worker: document.querySelector('#worker-state')?.textContent,
        message: document.querySelector('#project-message')?.textContent,
        detail: document.querySelector('#technical-error-detail')?.textContent }));
      if (!buildDebug.worker?.includes('Paused')) throw new Error(`SYNTHETIC_BUILD_DEBUG:${JSON.stringify({ buildDebug, failures })}`);
      await page.waitForFunction(() => document.querySelector('#worker-state')?.textContent.includes('Paused'));
      await page.locator('#quick-run').click();
      await page.waitForFunction(() => document.querySelector('#worker-state')?.textContent.includes('Running'));
      await page.locator('#quick-pause').click();
      await page.waitForFunction(() => document.querySelector('#worker-state')?.textContent.includes('Paused'));
      await page.locator('#instruments-open').click();
      panel = page.locator('#workbench-instruments-dialog [data-x47-pulse-preview]');
      await panel.locator('[data-x47-preview]').focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('[data-x47-apply]').disabled);
      await panel.locator('[data-x47-apply]').focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('[data-x47-resume]').disabled);
      assert.equal(await panel.locator('[data-x47-apply]').isDisabled(), true, 'duplicate Apply stayed enabled');
      assert.match(await panel.locator('[data-x47-fact="target"]').textContent(), /event 1: [\d,]+.*event 2: [\d,]+/u);
      await panel.locator('[data-x47-resume]').focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-x47-fact="transition"]')
        ?.textContent.includes('cycle'));

      if (viewport.width === 1440) await page.evaluate(() => { window.__X47_FAKE_STALL_DISPOSE__ = true; });
      await panel.locator('[data-x47-stop]').focus(); await page.keyboard.press('Enter');
      if (viewport.width === 1440) {
        await page.waitForFunction(() => window.__M6_STATE__.x47Integration?.phase === 'timeout', null,
          { timeout: 3000 });
        assert.match(await panel.locator('[data-x47-fact="cancel"]').textContent(), /Not completed/u);
      } else {
        await page.waitForFunction(() => window.__M6_STATE__.x47Integration?.phase === 'stopped');
        assert.match(await panel.locator('[data-x47-fact="cancel"]').textContent(), /Complete evidence/u);
      }

      const readability = await panel.evaluate((root) => ({
        overflow: root.scrollWidth - root.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
        minimumFontPixels: Math.min(...[...root.querySelectorAll('button,dt,dd,p,label,input')]
          .map((node) => parseFloat(getComputedStyle(node).fontSize))),
      }));
      assert(readability.overflow <= 1, JSON.stringify(readability));
      assert(readability.pageOverflow <= 1, JSON.stringify(readability));
      assert(readability.minimumFontPixels >= 10.7, JSON.stringify(readability));
      assert.deepEqual(outside, []); assert.deepEqual(failures, []);
      assert(buildRequests.length >= 2 && buildRequests.length % 2 === 0,
        JSON.stringify(buildRequests));
      assert(buildRequests.every((request, index) => request === (index % 2 === 0
        ? 'POST /api/build' : 'GET /api/build/synthetic-x47-build')));
      if (evidenceDir) await panel.screenshot({ path: path.join(evidenceDir,
        `x47-private-ui-${viewport.width}x${viewport.height}.png`) });
      reports.push({ viewport, outcome: viewport.width === 1440 ? 'timeout-not-completed' : 'stopped-complete',
        syntheticBuildRequests: buildRequests.length, syntheticWorkers: await page.evaluate(() => window.__X47_SYNTHETIC_WORKERS__),
        raceResults, readability });
      await context.close();
    }
  } finally { await browser.close(); }
  process.stdout.write(`${JSON.stringify({ ok: true, fixture: 'synthetic-browser-worker-not-native', reports }, null, 2)}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
