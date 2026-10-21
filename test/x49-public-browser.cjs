// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X49_URL || 'http://127.0.0.1:18884';
const evidenceDir = process.env.X49_EVIDENCE_DIR || '';
const viewports = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function buildInputIdentity(request) {
  const files = request.files.map(({ name, content }) => ({
    name, content: content.normalize('NFC').replace(/\r\n?/g, '\n'),
  }));
  const sourceDigest = sha256(JSON.stringify({ schema: request.schema, board: request.board, files }));
  return sha256(JSON.stringify({ sourceDigest, board: request.board,
    toolchainManifestSha256: '098e57cc2da7f46f0abea657a33473ef7c2a3c2f556152640fb4862ad4de53d2',
    toolchainImageId: 'sha256:62e4324594b63e88b17052a17eb9edf52593aff7d907647bc1e9c2fd809fbc74',
    fixedBuildFlags: ['--fqbn=arduino:avr:uno', '--warnings=all', '--no-color'] }));
}

async function artifact(inputIdentity) {
  const target = 'intent_x49_probe_v1'; const encoder = new TextEncoder();
  const strings = encoder.encode(`\0${target}\0`); const sectionStart = 52;
  const stringStart = sectionStart + 4 * 40; const symbolStart = stringStart + strings.length;
  const bytes = new Uint8Array(symbolStart + 32); const view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1]); view.setUint16(18, 83, true);
  view.setUint32(32, sectionStart, true); view.setUint16(46, 40, true); view.setUint16(48, 4, true);
  const section = (index, type, address, offset, size, link = 0, entryBytes = 0) => {
    const at = sectionStart + index * 40; view.setUint32(at + 4, type, true);
    view.setUint32(at + 12, address, true); view.setUint32(at + 16, offset, true);
    view.setUint32(at + 20, size, true); view.setUint32(at + 24, link, true);
    view.setUint32(at + 36, entryBytes, true);
  };
  section(1, 1, 0x800000, 0, 0x2000); section(2, 3, 0, stringStart, strings.length);
  section(3, 2, 0, symbolStart, 32, 2, 16); bytes.set(strings, stringStart);
  const symbol = symbolStart + 16; view.setUint32(symbol, 1, true); view.setUint32(symbol + 4, 0x800100, true);
  view.setUint32(symbol + 8, 4, true); view.setUint8(symbol + 12, 0x11); view.setUint16(symbol + 14, 1, true);
  const hex = ':00000001FF';
  const value = { hex, hexSha256: sha256(hex), elfBase64: Buffer.from(bytes).toString('base64'),
    elfSha256: sha256(bytes) };
  return { code: 'BUILD_OK', inputIdentity,
    artifactIdentity: sha256(JSON.stringify({ inputIdentity, hexSha256: value.hexSha256,
      elfSha256: value.elfSha256 })), artifact: value,
    toolchainImageId: 'sha256:62e4324594b63e88b17052a17eb9edf52593aff7d907647bc1e9c2fd809fbc74',
    toolchainIdentitySha256: '098e57cc2da7f46f0abea657a33473ef7c2a3c2f556152640fb4862ad4de53d2' };
}

(async () => {
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport }); const page = await context.newPage();
      const requests = []; const outside = []; const errors = []; let buildResult = null;
      let swapRequestIdentity = false;
      await page.route('**/*', async (route) => {
        const request = route.request(); const url = new URL(request.url());
        if (!url.pathname.startsWith('/api/build')) return route.continue();
        requests.push(`${request.method()} ${url.pathname}`);
        if (request.method() === 'POST') {
          const inputIdentity = swapRequestIdentity
            ? 'b'.repeat(64) : buildInputIdentity(request.postDataJSON());
          buildResult = await artifact(inputIdentity);
          return route.fulfill({ status: 202, contentType: 'application/json',
            body: JSON.stringify({ jobId: 'x49-browser-job', capability: 'memory-only-browser-capability',
              inputIdentity }) });
        }
        if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ status: 'succeeded', result: buildResult }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      });
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== new URL(base).origin) outside.push(request.url());
      });
      page.on('pageerror', (error) => errors.push(error.stack || error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.addInitScript(() => {
        window.__X49_PUBLIC_ACTIVITY__ = { storageWrites: 0, workers: 0, terminated: 0, serviceWorkers: 0 };
        for (const name of ['setItem', 'removeItem', 'clear']) {
          const original = Storage.prototype[name];
          Storage.prototype[name] = function wrapped(...args) {
            window.__X49_PUBLIC_ACTIVITY__.storageWrites += 1; return original.apply(this, args);
          };
        }
        if (navigator.serviceWorker?.register) {
          const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
          navigator.serviceWorker.register = (...args) => {
            window.__X49_PUBLIC_ACTIVITY__.serviceWorkers += 1; return register(...args);
          };
        }
        window.Worker = class X49BrowserWorker extends EventTarget {
          constructor(url) {
            super(); this.url = String(url); this.index = ++window.__X49_PUBLIC_ACTIVITY__.workers;
            this.init = null; this.closed = false;
          }
          postMessage(value) {
            if (value.command === 'init') {
              this.init = structuredClone(value);
              setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: {
                kind: 'ready', receiptNonce: value.receiptNonce, caseId: value.caseId,
                inputIdentity: value.caseId === 'baseline-offset-0'
                  ? '4300d360967677c0cd653cb7bf4cd93ab6d8e8235cb76a38d86ae5b43f25679b'
                  : 'ac42be30971461c12d66abda86f45ed28263006e0d85ca3dad6a6c0ed08dff2a',
              } })), 0); return;
            }
            if (value.command === 'observe-first') {
              const baseline = this.init.caseId === 'baseline-offset-0';
              const adc = baseline ? 409 : 414; const temperatureC = baseline ? 29 : 30;
              const level = baseline; const inputIdentity = baseline
                ? '4300d360967677c0cd653cb7bf4cd93ab6d8e8235cb76a38d86ae5b43f25679b'
                : 'ac42be30971461c12d66abda86f45ed28263006e0d85ca3dad6a6c0ed08dff2a';
              const runtimeIdentity = { ...this.init.runtimeBinding,
                schema: 'intent-mcu-worker-runtime-identity@2', workerInitialization: 1,
                workerInstanceNonce: String(this.index).repeat(32) };
              const terminal = {
                schema: 'intent-mcu-x49-private-terminal@1', protocol: 'intent-mcu-x49-private-worker@1',
                receiptNonce: this.init.receiptNonce, runtimeIdentity,
                experimentBinding: this.init.experimentBinding, state: 'complete', reason: null,
                evidence: { caseId: this.init.caseId, inputIdentity, inputAppliedCycle: 0,
                  inputRetainedThroughCycle: 2_560_000,
                  adc: { schema: 'intent-mcu-x49-adc-observation@1', channel: 1, value: adc,
                    startCycle: 2_500_000, completionCycle: 2_520_000 },
                  firmwareTransaction: { schema: 'intent-mcu-x34-firmware-producer@1',
                    fixtureClass: 'instrumented-avr-mailbox-fixture-required',
                    sourceSha256: this.init.probe.sourceSha256,
                    artifactIdentity: this.init.probe.artifactIdentity, commit: 2, temperatureC,
                    d13Level: level ? 1 : 0, adcChannel: 1, adcValue: adc,
                    adcCompletionCycle: 2_520_000, beginCycle: 2_530_000, commitCycle: 2_540_000 },
                  pin: { schema: 'intent-mcu-x49-pin-observation@1', pin: 'D13', mode: 'OUTPUT',
                    level, observedCycle: 2_550_000 },
                  time: { cpuCycles: 2_560_000, virtualMilliseconds: 160 },
                  retention: { completeThroughCycle: 2_560_000, droppedTraceRows: 0,
                    droppedAdcCompletions: 0, droppedMailboxTransactions: 0,
                    retainedMailboxWrites: 5, mailboxWriteLimit: 8 } },
              };
              setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { kind: 'terminal', terminal } })), 500);
            }
          }
          terminate() { if (!this.closed) { this.closed = true; window.__X49_PUBLIC_ACTIVITY__.terminated += 1; } }
        };
      });
      const response = await page.goto(base, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true && window.__X49_OFFSET_COMPARISON__);
      if (await page.locator('#walkthrough').getAttribute('open') !== null) await page.locator('#walkthrough button').last().click();
      await page.locator('#instruments-open').click();
      const initialPanel = page.locator('#workbench-instruments-dialog [data-x49-offset-comparison]');
      await initialPanel.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector(
        '#workbench-instruments-dialog [data-x49-native]')?.disabled === true);
      assert.match(await initialPanel.locator('[data-x49-message]').textContent(),
        /exact AVR thermostat|exact unedited AVR thermostat|only for the AVR thermostat profile/u);
      await page.locator('#workbench-instruments-dialog .workbench-popup-close').click();
      await page.click('#project-files-open'); await page.waitForSelector('#workbench-project-dialog[open]');
      await page.click('#project-demo'); await page.waitForSelector('#example-picker-dialog[open]');
      await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
      await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);
      if (await page.locator('#workbench-project-dialog').getAttribute('open') !== null) {
        await page.locator('#workbench-project-dialog .workbench-popup-close').click();
      }
      const before = await page.evaluate(() => structuredClone(window.__X49_PUBLIC_ACTIVITY__));
      await page.locator('#instruments-open').click();
      const panel = page.locator('#workbench-instruments-dialog [data-x49-offset-comparison]');
      await panel.waitFor({ state: 'visible' });
      await panel.locator('[data-x49-offset]').selectOption('-2');
      assert.deepEqual(await page.locator('[data-x49-offset]').evaluateAll(
        (items) => items.map((item) => item.value)), ['-2', '-2', '-2', '-2']);
      await panel.locator('[data-x49-preview]').click();
      assert.match(await panel.textContent(), /offset -2 °C/u);
      assert.equal((await page.evaluate(() => window.__X49_PUBLIC_ACTIVITY__.workers)), before.workers);
      assert.equal(await panel.locator('[data-x49-native]').isDisabled(), true);
      await panel.locator('[data-x49-offset]').selectOption('1');
      await page.waitForFunction(() => document.querySelector(
        '#workbench-instruments-dialog [data-x49-native]')?.disabled === false);
      await panel.locator('[data-x49-native]').click();
      await page.waitForFunction(() => !['ready', 'preview-only'].includes(
        window.__X49_OFFSET_COMPARISON__.runner().phase));
      const startedPhase = await page.evaluate(() => window.__X49_OFFSET_COMPARISON__.runner());
      assert(!['failed', 'indeterminate', 'retired', 'cancelled'].includes(startedPhase.phase),
        JSON.stringify(startedPhase));
      assert.equal(await page.locator('#quick-build').isDisabled(), true);
      const blocked = await page.evaluate(async () => {
        const request = window.__AGENT_ACTIONS__.request('firmware.build');
        return window.__AGENT_ACTIONS__.execute(request);
      });
      assert.equal(blocked.code, 'X49_PUBLIC_OPERATION_ACTIVE');
      await page.waitForFunction(() => ['passed', 'failed', 'indeterminate', 'retired', 'cancelled'].includes(
        window.__X49_OFFSET_COMPARISON__.runner().phase));
      const completed = await page.evaluate(() => window.__X49_OFFSET_COMPARISON__.runner());
      assert.equal(completed.phase, 'passed', JSON.stringify(completed));
      const text = await panel.textContent();
      for (const expected of ['Native academic pass', 'Browser-native pass', 'ADC 409', 'ADC 414',
        'D13 HIGH', 'D13 LOW', 'five writes', 'zero drops', 'Physical observation', 'Absent']) {
        assert.equal(text.includes(expected), true, expected);
      }
      const after = await page.evaluate(() => structuredClone(window.__X49_PUBLIC_ACTIVITY__));
      assert.deepEqual({ workers: after.workers - before.workers,
        terminated: after.terminated - before.terminated,
        storageWrites: after.storageWrites - before.storageWrites,
        serviceWorkers: after.serviceWorkers - before.serviceWorkers },
      { workers: 2, terminated: 2, storageWrites: 0, serviceWorkers: 0 });
      assert.deepEqual(requests, ['POST /api/build', 'GET /api/build/x49-browser-job']);
      const readability = await panel.evaluate((root) => ({
        minimumFontPixels: Math.min(...[...root.querySelectorAll('strong,span,p,button,select,th,td')]
          .map((node) => parseFloat(getComputedStyle(node).fontSize))),
        panelOverflow: root.scrollWidth - root.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
      }));
      assert(readability.minimumFontPixels >= 11, JSON.stringify(readability));
      assert(readability.panelOverflow <= 1, JSON.stringify(readability));
      assert(readability.pageOverflow <= 1, JSON.stringify(readability));
      if (evidenceDir) await panel.screenshot({
        path: path.join(evidenceDir, `x49-public-candidate-${viewport.width}x${viewport.height}.png`),
        animations: 'disabled',
      });
      const beforeRetainedDrift = { requests: requests.length, workers: after.workers };
      const retiredPass = await page.evaluate(() => {
        window.__M6_STATE__.revision += 1;
        return window.__X49_OFFSET_COMPARISON__.runner();
      });
      assert.equal(retiredPass.phase, 'retired'); assert.equal(retiredPass.projection, null);
      assert.deepEqual({ requests: requests.length,
        workers: await page.evaluate(() => window.__X49_PUBLIC_ACTIVITY__.workers) }, beforeRetainedDrift);
      swapRequestIdentity = true;
      const workersBeforeSwap = after.workers;
      const swapped = await page.evaluate(async () => {
        try { await window.__X49_OFFSET_COMPARISON__.startNative(); return null; }
        catch (error) { return error.code ?? error.message; }
      });
      assert.equal(swapped, 'X49_PUBLIC_BUILD_INPUT_IDENTITY_INVALID');
      await page.waitForFunction(() => !window.__X49_OFFSET_COMPARISON__.runner().phase.startsWith('building'));
      assert.equal((await page.evaluate(() => window.__X49_PUBLIC_ACTIVITY__.workers)), workersBeforeSwap);
      assert.equal((await page.evaluate(() => window.__X49_OFFSET_COMPARISON__.runner().phase)), 'failed');
      assert.deepEqual(requests.slice(-2), ['POST /api/build', 'DELETE /api/build/x49-browser-job']);
      await panel.locator('[data-x49-offset]').selectOption('0');
      const requestCountBeforeOffsetReject = requests.length;
      const offsetReject = await page.evaluate(async () => {
        try { await window.__X49_OFFSET_COMPARISON__.startNative(); return null; }
        catch (error) { return error.code ?? error.message; }
      });
      assert.equal(offsetReject, 'X49_PUBLIC_AUTHORING_NOT_NATIVE');
      assert.equal(requests.length, requestCountBeforeOffsetReject);
      assert.deepEqual(outside, []); assert.deepEqual(errors, []);
      results.push({ viewport, requests: requests.length, outsideRequests: outside.length,
        workers: after.workers - before.workers, storageWrites: after.storageWrites - before.storageWrites,
        physicalStatus: 'absent', readability });
      await context.close();
    }
    if (evidenceDir) await writeFile(path.join(evidenceDir, 'X49-PUBLIC-CANDIDATE-BROWSER.json'),
      `${JSON.stringify(results, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(results)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
