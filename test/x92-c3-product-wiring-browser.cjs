// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const root = path.resolve(__dirname, '..', 'dist');
const output = process.env.X92_C3_PRODUCT_OUTPUT || '/tmp/x92-c3-product-wiring';
const profile = 'board.esp32-c3-devmodule-v1';
const hashes = { source: 'd936fc50b2c874d6af660ece56abbb024c86e7b30462c403542b8d2166b85480',
  flash: '18ccc529ca488522055589654814c233d490ad9a19951d238eb7ec2fdc44e3e8' };

function staticServer() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname.replace(/^\//u, ''));
    if (!file.startsWith(root) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8'
      : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function runtime() {
  const epoch = { marker: 'C3_PUBLIC', mode: 'DIO' };
  return { engine: { actualExecution: true, provider: 'Espressif' }, uart: {
    exactApplicationText: 'C3_PUBLIC', markerCount: 2, serialBytes: 494,
    sha256: 'ac17974791ce3ec74ab3b026830b316bfa30be78bf6c358786ef5b410ea9cb66',
    bootEpochs: [epoch, epoch], finalLf: true,
  }, gpio: { qemuPinStateObserved: false }, modeledCircuit: {
    validation: { accepted: true }, qemuPinStateObserved: false,
    epochs: [{ led: { on: true, code: 'LED_ON' } }],
  } };
}

function installFakeC3(page, mode = 'positive') {
  const calls = { sessions: 0, builds: 0, runs: 0, quiesce: 0, dispose: 0 };
  let operation = 0; let releaseHeld = null;
  let held = null;
  page.route('**/api/c3/**', async (route) => {
    const request = route.request(); const pathname = new URL(request.url()).pathname;
    const fulfill = (status, value) => route.fulfill({ status, contentType: 'application/json',
      body: `${JSON.stringify(value)}\n` });
    if (pathname === '/api/c3/session' && request.method() === 'POST') {
      calls.sessions += 1; return fulfill(201, { sessionId: 'C3ProductMock001', capability: 'x'.repeat(32), generation: 0 });
    }
    if (/\/build$/u.test(pathname) && request.method() === 'POST') {
      calls.builds += 1; return fulfill(202, { buildJobId: 'BuildJobMock001', generation: 1 });
    }
    if (/\/build\/BuildJobMock001$/u.test(pathname)) return fulfill(200, { status: 'succeeded', value: {
      generation: 1, artifact: { sourceSha256: hashes.source, flashSha256: hashes.flash,
        applicationSha256: '1'.repeat(64), flashBytes: 4194304, marker: 'C3_PUBLIC' }, diagnostics: [],
    } });
    if (/\/command$/u.test(pathname)) {
      const command = JSON.parse(request.postData() || '{}').command;
      operation += 1;
      if (command === 'run') { calls.runs += 1; return fulfill(200, { generation: 1, runtime: runtime() }); }
      if (command === 'dispose') { calls.dispose += 1; return fulfill(200, {
        schema: 'intent-mcu-c3-retirement@1', sessionId: 'C3ProductMock001', generation: 1,
        sourceSha256: hashes.source, artifactSha256: hashes.flash, state: 'disposed', retainedBytes: 0,
        processExited: true, operationRetired: true,
      }); }
      if (command === 'quiesce') {
        calls.quiesce += 1;
        if (mode === 'overlap' && calls.quiesce === 1) {
          held = new Promise((resolve) => { releaseHeld = resolve; }); await held;
        }
        if (mode === 'deadline') await page.evaluate(() => { window.__x92FakeClock = 30020; });
        return fulfill(200, {
          schema: 'intent-mcu-c3-quiescence@1', sessionId: 'C3ProductMock001', generation: 1,
          sourceSha256: mode === 'identity' ? 'f'.repeat(64) : hashes.source,
          artifactSha256: hashes.flash, operationId: `c3-operation-${operation}`, state: 'quiescent',
          retainedBytes: 4194304, artifactPreserved: true, processExited: true,
          operationRetired: mode !== 'cleanup',
        });
      }
    }
    return fulfill(404, { code: 'FAKE_ROUTE_UNHANDLED' });
  });
  return { calls, release: () => releaseHeld?.() };
}

async function readyPage(browser, base, mode, { startBudget = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  if (mode === 'deadline') await page.addInitScript(() => {
    window.__x92FakeClock = 10;
    Object.defineProperty(performance, 'now', { configurable: true, value: () => window.__x92FakeClock });
  });
  const fake = installFakeC3(page, mode);
  assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
  await page.waitForFunction(() => window.__M11_READY__ && window.__AGENT_ACTIONS__);
  await page.selectOption('#board-select', profile);
  await page.waitForFunction(() => window.__ESP32C3_PUBLIC_WORKBENCH__?.state().active === true);
  await page.click('#quick-build');
  await page.waitForFunction(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().phase === 'built');
  if (startBudget) {
    await page.click('#brief-tests-open'); await page.waitForSelector('#workbench-brief-dialog[open]');
    await page.click('#x92-budget-start');
    await page.waitForFunction(() => window.__X92_EXPERIMENT_BUDGET__.active());
  }
  return { page, fake };
}

async function executeRun(page, requestId, generationOffset = 0) {
  return page.evaluate(async ({ requestId: id, generationOffset: offset }) => {
    const context = window.__AGENT_ACTIONS__.context();
    const source = window.__AGENT_ACTIONS__.request('runtime.run', {}, {
      requestId: id, ttlMs: 30000,
    });
    const value = JSON.parse(source); value.expectedGeneration = context.generation + offset;
    return window.__AGENT_ACTIONS__.execute(JSON.stringify(value));
  }, { requestId, generationOffset });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await staticServer(); const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true });
  const report = { schema: 'intent-mcu-x92-c3-product-wiring-browser@1', classification: 'full-rendered-product-fake-process-only', scenarios: {} };
  try {
    {
      const { page, fake } = await readyPage(browser, base, 'positive', { startBudget: false });
      await page.click('#quick-run');
      await page.waitForFunction(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().phase === 'complete');
      const state = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state());
      assert.equal(state.runtime.uart.finalLf, true);
      assert.deepEqual(fake.calls, { sessions: 1, builds: 1, runs: 1, quiesce: 0, dispose: 0 });
      report.scenarios.manualQuickRun = { code: 'OK', calls: fake.calls }; await page.close();
    }
    {
      const { page, fake } = await readyPage(browser, base, 'positive', { startBudget: false });
      const result = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.run());
      assert.equal(result.ok, true); assert.equal(result.code, 'OK'); assert.equal(result.runtime.uart.finalLf, true);
      assert.equal(result.schema, undefined); assert.equal(result.quiescence, undefined);
      assert.deepEqual(fake.calls, { sessions: 1, builds: 1, runs: 1, quiesce: 0, dispose: 0 });
      report.scenarios.manualWorkbenchRun = { code: result.code, calls: fake.calls }; await page.close();
    }
    {
      const { page, fake } = await readyPage(browser, base, 'positive', { startBudget: false });
      const result = await executeRun(page, 'x92-c3-product-manual-agent');
      assert.equal(result.ok, true); assert.equal(result.schema, 'intent-mcu-bounded-action-result@1');
      assert.equal(result.result.code, 'OK');
      assert.equal(result.result.runtime.uart.finalLf, true);
      assert.equal(result.result.quiescence, undefined);
      assert.deepEqual(fake.calls, { sessions: 1, builds: 1, runs: 1, quiesce: 0, dispose: 0 });
      report.scenarios.manualAgentRun = { code: result.code, calls: fake.calls }; await page.close();
    }
    {
      const { page, fake } = await readyPage(browser, base, 'positive');
      const result = await executeRun(page, 'x92-c3-product-positive');
      assert.equal(result.ok, true); assert.equal(result.privatePermitAccepted, true);
      assert.equal(result.schema, 'intent-mcu-bounded-action-result@1');
      assert.equal(result.result.schema, 'intent-mcu-x92-c3-private-result@1');
      assert.equal(result.uart.finalLf, true); assert.equal(result.experimentBudget.charged.runs, 1);
      assert.deepEqual(fake.calls, { sessions: 1, builds: 1, runs: 1, quiesce: 2, dispose: 0 });
      await page.screenshot({ path: path.join(output, 'positive-main.png'), fullPage: true });
      report.scenarios.positive = { code: result.code, finalLf: true, calls: fake.calls };
      await page.close();
    }
    {
      const { page, fake } = await readyPage(browser, base, 'overlap');
      const pending = executeRun(page, 'x92-c3-product-overlap');
      while (fake.calls.quiesce < 1) await new Promise((resolve) => setTimeout(resolve, 5));
      const blocked = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.run());
      assert.equal(blocked.code, 'X92_C3_SHARED_GATE_BLOCKED'); assert.equal(fake.calls.runs, 0);
      fake.release(); const result = await pending; assert.equal(result.ok, true); assert.equal(fake.calls.runs, 1);
      report.scenarios.manualOverlap = { blocked: blocked.code, calls: fake.calls }; await page.close();
    }
    {
      const { page, fake } = await readyPage(browser, base, 'positive');
      const stale = await executeRun(page, 'x92-c3-product-stale', 1);
      assert.equal(stale.code, 'ACTION_STALE_GENERATION'); assert.equal(fake.calls.quiesce, 0); assert.equal(fake.calls.runs, 0);
      report.scenarios.stale = { code: stale.code, calls: fake.calls }; await page.close();
    }
    for (const mode of ['identity', 'cleanup', 'deadline']) {
      const { page, fake } = await readyPage(browser, base, mode);
      const result = await executeRun(page, `x92-c3-product-${mode}`);
      const expected = mode === 'deadline' ? 'X92_DEADLINE_EXCEEDED' : 'X92_C3_RETIREMENT_UNPROVEN';
      assert.equal(result.code, expected); assert.equal(fake.calls.runs, 0);
      assert.equal(result.experimentBudget.charged.wallClockMs, 30000);
      report.scenarios[mode] = { code: result.code, fullCharge: 30000, calls: fake.calls };
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ status: 'pass', output, scenarios: Object.keys(report.scenarios) })}\n`);
  } finally {
    await browser.close(); await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
