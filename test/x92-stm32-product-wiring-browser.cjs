// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const root = path.resolve(__dirname, '..', 'dist');
const output = process.env.X92_STM32_PRODUCT_OUTPUT || '/tmp/x92-stm32-product-wiring';
const profile = 'board.stm32f429zi-nucleo144-v1';
const elf = Buffer.alloc(64, 0x42);
const elfSha256 = crypto.createHash('sha256').update(elf).digest('hex');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

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
function installFakeStm32(page, mode = 'positive') {
  const calls = { builds: 0, runs: 0, quiescence: 0 };
  let releaseHeld = null; let operation = 0;
  page.route('**/api/stm32/**', async (route) => {
    const request = route.request(); const pathname = new URL(request.url()).pathname;
    const body = JSON.parse(request.postData() || '{}');
    const fulfill = (status, value) => route.fulfill({ status, contentType: 'application/json',
      body: `${JSON.stringify(value)}\n` });
    if (pathname.endsWith('/build')) {
      calls.builds += 1; const sourceSha = sha256(body.source);
      return fulfill(200, { schema: 'intent-mcu-stm32-public-build-response@1', profile,
        sourceRevision: body.sourceRevision, sourceSha256: sourceSha,
        behavior: { pb0: true, marker: 'STM32 PUBLIC', uartText: 'STM32 PUBLIC\n' },
        artifact: { format: 'elf32', bytes: elf.length, sha256: elfSha256, base64: elf.toString('base64') },
        compiler: { id: 'arm-none-eabi-gcc', version: '14.3.1', compilerInvoked: true },
        diagnostics: [], retainedServerBytes: 0, durableServerProject: false,
        boundedPublicSupport: true });
    }
    if (pathname.endsWith('/run')) {
      calls.runs += 1; operation += 1;
      if (mode === 'overlap') await new Promise((resolve) => { releaseHeld = resolve; });
      if (mode === 'disconnect') return route.abort('connectionfailed');
      if (mode === 'deadline') await page.evaluate(() => { window.__x92Stm32Clock = 30020; });
      const completion = { schema: 'intent-mcu-x92-stm32-completion@1',
        operationId: `stm32-operation-${operation}`, binding: body.x92Binding,
        state: 'quiescent', processExited: true, daemonContainerAbsent: true,
        artifactPreserved: true, completedNaturally: true, signature: 'a'.repeat(64) };
      return fulfill(200, { schema: 'intent-mcu-stm32-public-run-response@1', profile,
        sourceRevision: body.sourceRevision, sourceSha256: body.sourceSha256,
        elfSha256: body.artifact.sha256,
        engine: { id: 'renode', version: '1.17.0', actualExecution: true },
        observed: { pb0: true, uartText: 'STM32 PUBLIC\n' }, resetReplay: true, bootEpochs: 2,
        instructionOrdinalsNotPhysicalCycles: true, retainedServerBytes: 0,
        durableServerProject: false, boundedPublicSupport: true, fullStm32Support: false,
        completion });
    }
    if (pathname.endsWith('/quiescence')) {
      calls.quiescence += 1;
      const completion = structuredClone(body.completion);
      if (mode === 'cleanup') completion.daemonContainerAbsent = false;
      return fulfill(200, { schema: 'intent-mcu-x92-stm32-quiescence-response@1', completion });
    }
    return fulfill(404, { code: 'FAKE_ROUTE_UNHANDLED' });
  });
  return { calls, release: () => releaseHeld?.() };
}
async function ready(browser, base, mode, startBudget = true) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  if (mode === 'deadline') await page.addInitScript(() => {
    window.__x92Stm32Clock = 10;
    Object.defineProperty(performance, 'now', { configurable: true,
      value: () => window.__x92Stm32Clock });
  });
  const fake = installFakeStm32(page, mode);
  assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
  await page.waitForFunction(() => window.__M11_READY__ && window.__AGENT_ACTIONS__);
  await page.selectOption('#board-select', profile);
  await page.waitForFunction(() => window.__STM32_PUBLIC_WORKBENCH__?.state().active === true);
  await page.click('#quick-build');
  await page.waitForFunction(() => window.__STM32_PUBLIC_WORKBENCH__.state().phase === 'built');
  if (startBudget) {
    await page.click('#brief-tests-open'); await page.waitForSelector('#workbench-brief-dialog[open]');
    await page.click('#x92-budget-start');
    if (startBudget !== 'immediate') {
      await page.waitForFunction(() => window.__X92_EXPERIMENT_BUDGET__.active());
    }
  }
  return { page, fake };
}
async function executeRun(page, id, generationOffset = 0) {
  return page.evaluate(async ({ id: requestId, generationOffset: offset }) => {
    const context = window.__AGENT_ACTIONS__.context();
    const source = window.__AGENT_ACTIONS__.request('runtime.run', {}, { requestId, ttlMs: 30000 });
    const value = JSON.parse(source); value.expectedGeneration = context.generation + offset;
    return window.__AGENT_ACTIONS__.execute(JSON.stringify(value));
  }, { id, generationOffset });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await staticServer(); const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true });
  const report = { schema: 'intent-mcu-x92-stm32-product-wiring-browser@1',
    classification: 'full-rendered-product-fake-process-only', scenarios: {} };
  try {
    {
      const { page, fake } = await ready(browser, base, 'positive', false);
      await page.click('#quick-run');
      await page.waitForFunction(() => window.__STM32_PUBLIC_WORKBENCH__.state().phase === 'completed');
      assert.deepEqual(fake.calls, { builds: 1, runs: 1, quiescence: 0 });
      report.scenarios.manualQuick = { calls: fake.calls }; await page.close();
    }
    {
      const { page, fake } = await ready(browser, base, 'positive', 'immediate');
      const result = await executeRun(page, 'x92-stm32-product-immediate-admission');
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.privatePermitAccepted, true);
      assert.notEqual(result.code, 'X92_RUNTIME_QUIESCENCE_UNPROVEN_PROFILE');
      assert.deepEqual(fake.calls, { builds: 1, runs: 1, quiescence: 1 });
      report.scenarios.immediateAdmission = { calls: fake.calls }; await page.close();
    }
    {
      const { page, fake } = await ready(browser, base, 'positive');
      const result = await executeRun(page, 'x92-stm32-product-positive');
      assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.privatePermitAccepted, true);
      assert.equal(result.result.schema, 'intent-mcu-x92-stm32-private-result@1');
      assert.equal(result.completion.daemonContainerAbsent, true);
      assert.equal(result.experimentBudget.charged.runs, 1);
      assert.deepEqual(fake.calls, { builds: 1, runs: 1, quiescence: 1 });
      const completedState = await page.evaluate(() => window.__STM32_PUBLIC_WORKBENCH__.state());
      assert.equal(completedState.phase, 'completed');
      assert.equal(completedState.artifact.sha256, elfSha256);
      assert.equal(completedState.runtime.engine.actualExecution, true);
      await page.screenshot({ path: path.join(output, 'positive-main.png'), fullPage: true });
      report.scenarios.positive = { calls: fake.calls }; await page.close();
    }
    {
      const { page, fake } = await ready(browser, base, 'overlap');
      const pending = executeRun(page, 'x92-stm32-product-overlap');
      while (fake.calls.runs < 1) await new Promise((resolve) => setTimeout(resolve, 5));
      const blocked = await page.evaluate(() => window.__STM32_PUBLIC_WORKBENCH__.run());
      assert.equal(blocked.code, 'X92_STM32_SHARED_GATE_BLOCKED');
      fake.release(); assert.equal((await pending).ok, true);
      report.scenarios.overlap = { blocked: blocked.code, calls: fake.calls }; await page.close();
    }
    {
      const { page, fake } = await ready(browser, base, 'positive');
      const stale = await executeRun(page, 'x92-stm32-product-stale', 1);
      assert.equal(stale.code, 'ACTION_STALE_GENERATION'); assert.equal(fake.calls.runs, 0);
      report.scenarios.stale = { code: stale.code, calls: fake.calls }; await page.close();
    }
    for (const mode of ['cleanup', 'disconnect', 'deadline']) {
      const { page, fake } = await ready(browser, base, mode);
      const result = await executeRun(page, `x92-stm32-product-${mode}`);
      assert.equal(result.ok, false);
      assert.equal(result.experimentBudget.charged.wallClockMs, 30000);
      report.scenarios[mode] = { code: result.code, fullCharge: 30000, calls: fake.calls };
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ status: 'pass', output,
      scenarios: Object.keys(report.scenarios) })}\n`);
  } finally {
    await browser.close(); await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
