// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const repository = path.resolve(__dirname, '..');
const dist = path.join(repository, 'dist');
const execute = process.env.FINAL_UX_RUNTIME_EXECUTE === '1';
const compilerBase = process.env.FINAL_UX_COMPILER_BASE || '';
const evidencePath = process.env.FINAL_UX_RUNTIME_EVIDENCE || '';
const retainedHexPath = process.env.FINAL_UX_RETAINED_HEX || '';
const retainedHex = !execute && retainedHexPath ? fs.readFileSync(retainedHexPath, 'utf8') : ':00000001FF';
const expectedCommit = '544fac449bac5f9b070d4baf8f8a2fa84c068f2e';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json' };

function staticServer() {
  return http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(dist, relative);
    if (!file.startsWith(`${dist}${path.sep}`) || !fs.existsSync(file)) {
      response.writeHead(404); response.end('not found'); return;
    }
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
}

function writeEvidence(value) {
  if (!evidencePath) return;
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  const temporary = `${evidencePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, evidencePath);
  fs.chmodSync(evidencePath, 0o600);
}

function fakeWorkerInstaller() {
  const NativeWorker = window.Worker;
  window.__FINAL_WORKERS__ = 0;
  window.__FINAL_TERMINATIONS__ = Number(sessionStorage.getItem('final-ux-terminations') || 0);
  const clone = (value) => structuredClone(value);
  class AcceptanceWorker extends EventTarget {
    constructor(...args) {
      if (window.__FINAL_WORKERS__ >= 1) throw new Error('FINAL_WORKER_BUDGET_EXHAUSTED');
      super(...args); window.__FINAL_WORKERS__ += 1; this.identity = null; this.cycle = 0; this.timer = null;
    }
    snapshot(kind, paused) {
      const level = Math.floor(this.cycle / 1000) % 2 === 1;
      const usartConfiguration = { schema: 'intent-mcu-usart-config@1', profile: 'board.atmega328p-16mhz-v1',
        channel: 'USART0', clockHertz: 16000000, runtimeIdentity: clone(this.identity), resetEpoch: 1,
        records: [{ epoch: 1, cycle: 42, resetEpoch: 1, trigger: { register: 'UBRRL', value: 103 },
          registers: { UCSRA: 0, UCSRB: 24, UCSRC: 6, UBRRL: 103, UBRRH: 0 },
          configuration: { dataBits: 8, parity: 'none', stopBits: 1, mode: 'asynchronous', doubleSpeed: false,
            baud: 9615, frameCycles: 16640, receiverEnabled: true, transmitterEnabled: true, supported: true } }],
        retention: { limit: 256, retained: 1, dropped: 0, truncated: false } };
      return { kind, paused, cycle: this.cycle, instructions: this.cycle, speed: 1, trace: [], retentionDrops: {},
        runtimeIdentity: clone(this.identity), modelExecutionContextSha256: this.identity.modelExecutionContextSha256,
        usartConfiguration,
        pins: [{ pin: 'D13', mode: 'OUTPUT', level, externalDrive: 'RELEASED', diagnostic: 'OK', pwm: null }],
        circuit: { leds: [{ componentId: 'led-1', on: level, currentAmps: level ? 0.0136 : 0,
          brightness: level ? 0.68 : 0, color: 'red' }] },
        instruments: { serial: { records: [], dropped: 0 }, logic: { channels: ['D13'], transitions: [], dropped: 0 }, pin: null },
        eventLog: { log: [], pending: [], applied: [], dropped: 0 } };
    }
    emit(value, delay = 0) { setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: clone(value) })), delay); }
    emitNow(value) { this.dispatchEvent(new MessageEvent('message', { data: clone(value) })); }
    postMessage(data) {
      if (data.command === 'init') {
        this.identity = { ...clone(data.runtimeBinding), schema: 'intent-mcu-worker-runtime-identity@2',
          workerInitialization: 1, workerInstanceNonce: 'e'.repeat(32) };
        this.emit(this.snapshot('ready', true));
      } else if (data.command === 'run') {
        clearInterval(this.timer); this.timer = setInterval(() => { this.cycle += 1000; this.emit(this.snapshot('running', false)); }, 30);
      } else if (data.command === 'pause') {
        clearInterval(this.timer); this.timer = null; this.emitNow(this.snapshot('paused', true));
      } else if (data.command === 'reset') {
        clearInterval(this.timer); this.timer = null; this.cycle = 0; this.emitNow(this.snapshot('reset', true));
      } else if (data.command === 'dispose') {
        clearInterval(this.timer); this.timer = null;
        this.emit({ ...this.snapshot('disposed', true), disposeToken: data.disposeToken });
      }
    }
    terminate() {
      clearInterval(this.timer); this.timer = null; window.__FINAL_TERMINATIONS__ += 1;
      sessionStorage.setItem('final-ux-terminations', String(window.__FINAL_TERMINATIONS__));
    }
  }
  if (window.__FINAL_NATIVE__) {
    window.Worker = class CountedNativeWorker extends NativeWorker {
      constructor(...args) { if (window.__FINAL_WORKERS__ >= 1) throw new Error('FINAL_WORKER_BUDGET_EXHAUSTED');
        window.__FINAL_WORKERS__ += 1; super(...args); }
      terminate() { window.__FINAL_TERMINATIONS__ += 1;
        sessionStorage.setItem('final-ux-terminations', String(window.__FINAL_TERMINATIONS__)); super.terminate(); }
    };
  } else window.Worker = AcceptanceWorker;
}

(async () => {
  assert(!execute || compilerBase, 'FINAL_UX_COMPILER_BASE is required for the authorized execution');
  const app = staticServer(); await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await context.addInitScript((native) => { window.__FINAL_NATIVE__ = native; }, execute);
  await context.addInitScript(fakeWorkerInstaller);
  let buildPosts = 0; const requests = []; const responses = []; const errors = [];
  await context.route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname === '/api/page-views') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"disabled"}' });
    if (url.pathname.startsWith('/api/build')) {
      requests.push({ method: request.method(), path: url.pathname });
      if (request.method() === 'POST') {
        buildPosts += 1; if (buildPosts > 1) return route.abort('blockedbyclient');
      }
      if (!execute) {
        if (request.method() === 'POST') return route.fulfill({ status: 202, contentType: 'application/json',
          body: '{"jobId":"final-ux-preflight","capability":"source-only"}' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'succeeded',
          cacheHit: false, result: { artifactIdentity: 'a'.repeat(64), inputIdentity: 'c'.repeat(64),
            artifact: { hex: retainedHex }, diagnostics: [] } }) });
      }
      const upstream = `${compilerBase.replace(/\/$/u, '')}${url.pathname}`;
      const upstreamResponse = await fetch(upstream, { method: request.method(), headers: { 'content-type': 'application/json' },
        body: request.method() === 'POST' ? request.postData() : undefined });
      const body = await upstreamResponse.text(); responses.push({ path: url.pathname, status: upstreamResponse.status, body });
      writeEvidence({ schema: 'intent-mcu-final-ux-runtime-raw@1', status: 'capturing', stage: 'compiler-response',
        commit: expectedCommit, limits: { builds: 1, workers: 1, sessions: 1, retries: 0 }, requests, responses });
      return route.fulfill({ status: upstreamResponse.status, contentType: upstreamResponse.headers.get('content-type') || 'application/json', body });
    }
    return route.continue();
  });
  const pageA = await context.newPage(); const pageB = await context.newPage();
  for (const page of [pageA, pageB]) {
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  }
  let evidence;
  try {
    await Promise.all([pageA.goto(base), pageB.goto(base)]);
    await Promise.all([pageA.waitForFunction(() => window.__M11_READY__), pageB.waitForFunction(() => window.__M11_READY__)]);
    const before = await pageA.evaluate(() => { const { build: _build, ...authored } = window.__M6_PROJECT__(); return {
      authored: JSON.stringify(authored), source: authored.source.files[0].content, graph: JSON.stringify(authored.circuit) }; });
    const tabB = await pageB.evaluate(() => { const { build: _build, ...authored } = window.__M6_PROJECT__(); return { authored: JSON.stringify(authored), workers: window.__M6_STATE__.runtimeWorkerCreations,
      runtime: window.__M6_STATE__.runtime }; });
    assert.equal(tabB.workers, 0); assert.equal(tabB.runtime, null);
    await pageA.click('#beginner-run');
    await pageA.waitForFunction(() => window.__M6_STATE__.runtime?.paused === false
      && window.__M6_STATE__.runtimeWorkerCreations === 1, null, { timeout: execute ? 60_000 : 10_000 });
    const running = await pageA.evaluate(() => ({ runtime: structuredClone(window.__M6_STATE__.runtime),
      artifact: window.__M6_STATE__.artifactIdentity, workers: window.__M6_STATE__.runtimeWorkerCreations,
      led: document.querySelector('#component-layer [data-led-id="led-1"]')?.getAttribute('aria-label'),
      serial: document.querySelector('#serial-output')?.textContent,
      authored: (() => { const { build: _build, ...authored } = window.__M6_PROJECT__(); return JSON.stringify(authored); })() }));
    assert.equal(running.workers, 1); assert.match(running.artifact, /^[a-f0-9]{64}$/u); assert.match(running.led, /LED|percent|on|off/iu);
    assert.equal(running.authored, before.authored); assert.equal(await pageA.locator('#beginner-runtime-toggle').innerText(), 'Pause');
    await pageA.click('#beginner-runtime-toggle');
    await pageA.waitForFunction(() => window.__M6_STATE__.runtime?.paused === true);
    const paused = await pageA.evaluate(() => structuredClone(window.__M6_STATE__.runtime));
    await pageA.waitForTimeout(250); assert.equal((await pageA.evaluate(() => window.__M6_STATE__.runtime.cycle)), paused.cycle);
    assert.equal(await pageA.locator('#beginner-runtime-toggle').innerText(), 'Resume');
    await pageA.click('#beginner-runtime-toggle');
    await pageA.waitForFunction((cycle) => window.__M6_STATE__.runtime?.paused === false && window.__M6_STATE__.runtime.cycle > cycle, paused.cycle);
    const resumed = await pageA.evaluate(() => structuredClone(window.__M6_STATE__.runtime));
    assert.equal(resumed.runtimeIdentity.workerInstanceNonce, paused.runtimeIdentity.workerInstanceNonce);
    assert.equal(resumed.runtimeIdentity.artifactIdentity, paused.runtimeIdentity.artifactIdentity);
    await pageA.waitForFunction(() => document.querySelector('#beginner-runtime-toggle')?.textContent === 'Pause');
    await pageA.click('#beginner-runtime-toggle'); await pageA.waitForFunction(() => window.__M6_STATE__.runtime?.paused === true);
    if (!await pageA.locator('#workbench-more').evaluate((node) => node.open)) await pageA.click('#workbench-more > summary');
    await pageA.click('#quick-reset');
    await pageA.waitForFunction(() => window.__M6_STATE__.runtime?.kind === 'reset' && window.__M6_STATE__.runtime?.cycle === 0);
    const reset = await pageA.evaluate(() => ({ runtime: structuredClone(window.__M6_STATE__.runtime), workers: window.__M6_STATE__.runtimeWorkerCreations }));
    assert.equal(reset.workers, 1); assert.equal(reset.runtime.runtimeIdentity.workerInstanceNonce, paused.runtimeIdentity.workerInstanceNonce);
    assert.equal(await pageB.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);
    assert.equal(await pageB.evaluate(() => { const { build: _build, ...authored } = window.__M6_PROJECT__(); return JSON.stringify(authored); }), tabB.authored);
    const exactAuthored = await pageA.evaluate(() => { const { build: _build, ...authored } = window.__M6_PROJECT__(); return JSON.stringify(authored); });
    await pageA.reload(); await pageA.waitForFunction(() => window.__M11_READY__);
    const refreshed = await pageA.evaluate(() => { const { build: _build, ...authored } = window.__M6_PROJECT__(); return { authored: JSON.stringify(authored), runtime: window.__M6_STATE__.runtime,
      workers: window.__M6_STATE__.runtimeWorkerCreations, runDisabled: document.querySelector('#quick-run').disabled,
      terminations: Number(sessionStorage.getItem('final-ux-terminations') || 0) }; });
    assert.equal(refreshed.authored, exactAuthored); assert.equal(refreshed.runtime, null); assert.equal(refreshed.workers, 0);
    assert.equal(refreshed.runDisabled, true);
    assert.equal(buildPosts, 1); assert.deepEqual(errors, []);
    evidence = { schema: 'intent-mcu-final-ux-runtime-acceptance@1', status: 'pass', mode: execute ? 'native' : 'source-only-preflight',
      commit: expectedCommit, identities: { sourceSha256: sha256(before.source), graphSha256: sha256(before.graph),
        projectSha256: sha256(before.authored), artifactIdentity: running.artifact,
        workerInstanceNonce: paused.runtimeIdentity.workerInstanceNonce },
      limits: { maximumBuilds: 1, maximumWorkers: 1, maximumSessions: 1, retries: 0, nonAvrProducers: 0, images: 0, deploys: 0 },
      observed: { builds: buildPosts, workers: 1, pauseCycle: paused.cycle, resumeCycle: resumed.cycle,
        resetCycle: reset.runtime.cycle, resetSameWorker: true, tabBInert: true, refreshInert: true,
        authoredBytesExact: true, led: running.led, serial: running.serial,
        cleanup: 'refresh replaced the page realm; post-refresh worker count and executable authority are zero' },
      requests, responses };
    writeEvidence(evidence);
  } catch (error) {
    const browserState = await pageA.evaluate(() => ({ state: window.__M6_STATE__, projectMessage: document.querySelector('#project-message')?.textContent,
      beginnerStatus: document.querySelector('#beginner-status')?.textContent, workerState: document.querySelector('#worker-state')?.textContent })).catch(() => null);
    evidence = { schema: 'intent-mcu-final-ux-runtime-acceptance@1', status: 'failed', mode: execute ? 'native' : 'source-only-preflight',
      commit: expectedCommit, error: { message: error.message, stack: error.stack }, browserState, requests, responses };
    writeEvidence(evidence); throw error;
  } finally { await context.close(); await browser.close(); await new Promise((resolve) => app.close(resolve)); }
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
