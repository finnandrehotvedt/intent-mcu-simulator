// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const repository = path.resolve(__dirname, '..');
const evidenceDir = process.env.X46_EVIDENCE_DIR || '';
const actualRawBytes = readFileSync(path.join(
  repository, 'test/fixtures/x46-worker-004-paused-raw.json',
));
const actualPausedRaw = JSON.parse(actualRawBytes);
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

const fixtureHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"><title>X46 synthetic UI review fixture</title></head><body><main style="max-width:1180px;margin:24px auto;padding:12px"><section id="fixture-panel" class="x46-uart-panel" aria-label="Read-only UART transmit byte-event analysis"></section></main><script type="module">
import { assessX46UartReadonlyPanel } from '/src/x46-uart-readonly-panel.mjs';
import { renderX46UartReadonlyPanel } from '/src/x46-uart-readonly-panel-view.mjs';
const root = document.querySelector('#fixture-panel');
window.__X46_FIXTURE__ = Object.freeze({ render(input, evidenceKind = 'synthetic-review-fixture') { const value = assessX46UartReadonlyPanel(input); renderX46UartReadonlyPanel(root, value, { evidenceKind }); return value; } });
window.__X46_FIXTURE_READY__ = true;
</script></body></html>`;

function fixture() {
  const h = (character) => character.repeat(64);
  const identity = {
    schema: 'intent-mcu-worker-runtime-identity@2', projectGeneration: 3,
    runtimeGeneration: 7, artifactIdentity: h('a'), modelImplementationSha256: h('b'),
    modelExecutionContextSha256: h('c'), workerInitialization: 1,
    workerInstanceNonce: 'd'.repeat(32),
  };
  const record = (cycle, value) => ({ direction: 'tx', cycle, value,
    baud: 9_615.384615384615, frameCycles: 16_640,
    virtualMilliseconds: cycle / 16_000,
    text: value === 10 ? '\n' : String.fromCharCode(value) });
  const records = [record(0, 65), record(16_640, 10)];
  return {
    schema: 'intent-mcu-x46-uart-panel-input@1', profile: 'board.atmega328p-16mhz-v1',
    lifecyclePhase: 'paused', buildArtifactIdentity: identity.artifactIdentity,
    lifecycleRuntimeBinding: { projectGeneration: 3, runtimeGeneration: 7,
      artifactIdentity: identity.artifactIdentity },
    trustedCurrentWorker: true, currentWorkerIdentity: structuredClone(identity),
    runtimeSnapshot: { paused: true, runtimeIdentity: structuredClone(identity),
      modelExecutionContextSha256: identity.modelExecutionContextSha256,
      instruments: { serial: { records, retained: records.length, dropped: 0 } } },
  };
}

function framingFixture() {
  const value = fixture();
  const current = value.currentWorkerIdentity;
  const records = [{ direction: 'tx', cycle: 20_000, value: 0x41,
    baud: 9_615, frameCycles: 16_640, virtualMilliseconds: 1.25, text: 'A' }];
  value.runtimeSnapshot = {
    kind: 'paused', paused: true, cycle: 40_000,
    runtimeIdentity: structuredClone(current),
    modelExecutionContextSha256: current.modelExecutionContextSha256,
    serial: records.map(({ direction, cycle, value: byte, baud, frameCycles }) =>
      ({ direction, cycle, value: byte, baud, frameCycles })),
    retentionDrops: { serial: 0 },
    instruments: { serial: { records, retained: 1, dropped: 0 } },
    usartConfiguration: {
      schema: 'intent-mcu-usart-config@1', profile: 'board.atmega328p-16mhz-v1',
      channel: 'USART0', clockHertz: 16_000_000,
      runtimeIdentity: structuredClone(current), resetEpoch: 1,
      records: [{ epoch: 1, cycle: 10, resetEpoch: 1,
        trigger: { register: 'UBRRL', value: 103 },
        registers: { UCSRA: 0, UCSRB: 0x18, UCSRC: 0x06, UBRRL: 103, UBRRH: 0 },
        configuration: { dataBits: 8, parity: 'none', stopBits: 1,
          mode: 'asynchronous', doubleSpeed: false, baud: 9_615,
          frameCycles: 16_640, receiverEnabled: true, transmitterEnabled: true,
          supported: true } }],
      retention: { limit: 256, retained: 1, dropped: 0, truncated: false },
    },
  };
  return value;
}

function historicalReplayFixture() {
  const current = actualPausedRaw.runtimeIdentity;
  return {
    schema: 'intent-mcu-x46-uart-panel-input@1',
    profile: 'board.atmega328p-16mhz-v1',
    lifecyclePhase: 'paused',
    buildArtifactIdentity: current.artifactIdentity,
    lifecycleRuntimeBinding: {
      projectGeneration: current.projectGeneration,
      runtimeGeneration: current.runtimeGeneration,
      artifactIdentity: current.artifactIdentity,
    },
    trustedCurrentWorker: true,
    currentWorkerIdentity: structuredClone(current),
    runtimeSnapshot: structuredClone(actualPausedRaw),
  };
}

function server() {
  const counterStub = { get: 0, post: 0 };
  const app = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      if (pathname === '/api/page-views' && ['GET', 'POST'].includes(request.method)) {
        counterStub[request.method.toLowerCase()] += 1;
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store', 'x-intent-fixture': 'page-view-stub-not-public-proof' });
        response.end(`${JSON.stringify({ status: 'available',
          schema: 'intent-mcu-aggregate-page-views@1', dayEuropeOslo: '2026-10-23',
          displayDay: '23 Oct 2026', timeZone: 'Europe/Oslo', today: 0, total: 0,
          startedAt: '2026-10-23T00:00:00.000Z', uniqueVisitors: false })}\n`);
        return;
      }
      if (pathname === '/fixture') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end(fixtureHtml); return;
      }
      const relative = pathname === '/' ? 'dist/index.html'
        : pathname === '/styles.css' ? 'staging/styles.css'
          : pathname.startsWith('/src/') ? pathname.slice(1)
            : `dist/${pathname.slice(1)}`;
      const resolved = path.resolve(repository, relative);
      if (!resolved.startsWith(`${repository}${path.sep}`)) throw new Error('PATH');
      const bytes = await readFile(resolved);
      response.writeHead(200, { 'content-type': `${mime[path.extname(resolved)] || 'application/octet-stream'}; charset=utf-8`, 'cache-control': 'no-store' });
      response.end(bytes);
    } catch {
      response.writeHead(404); response.end('not found');
    }
  });
  app.counterStub = counterStub;
  return app;
}

async function activityPage(browser, url, viewport) {
  const page = await browser.newPage({ viewport });
  const requests = []; const errors = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/build')) requests.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    window.__X46_ACTIVITY__ = { workers: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class CountedWorker extends NativeWorker {
      constructor(...args) { window.__X46_ACTIVITY__.workers += 1; super(...args); }
    };
  });
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  return { page, requests, errors };
}

(async () => {
  assert.equal(createHash('sha256').update(actualRawBytes).digest('hex'),
    '547ea71d3f1ecf5d887880e2ed3bebec7c958ee1d259b3586e03d0ac09b06058');
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const http = server();
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${http.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const app = await activityPage(browser, base, { width: 1440, height: 900 });
    await app.page.waitForFunction(() => window.__M11_READY__ === true && window.__X46_UART_READONLY_PANEL__);
    await app.page.click('#instruments-open');
    const live = app.page.locator('#workbench-instruments-dialog #x46-uart-panel');
    await live.waitFor({ state: 'visible' });
    assert.equal(await live.getAttribute('data-state'), 'unavailable');
    assert.equal(await live.getAttribute('data-evidence-kind'), 'current-worker');
    assert.match(await live.textContent(), /No current validated AVR worker snapshot/u);
    assert.equal(await live.locator('button,input,select').count(), 0);
    assert.deepEqual(await app.page.evaluate(() => window.__X46_UART_READONLY_PANEL__.authority),
      { apply: false, build: false, run: false, verdict: false });
    assert.equal(await app.page.evaluate(() => window.__X46_ACTIVITY__.workers), 0);
    assert.equal(app.requests.length, 0);
    assert.equal(app.errors.length, 0);

    const historical = historicalReplayFixture();
    const shellBeforeRows = await app.page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      controller: document.querySelector('#top-controller-controls').getBoundingClientRect().toJSON(),
      primary: document.querySelector('#top-primary-controls').getBoundingClientRect().toJSON(),
    }));
    const replay = await app.page.evaluate(async (input) => {
      const [{ assessX46UartReadonlyPanel }, { renderX46UartReadonlyPanel }] =
        await Promise.all([
          import('/src/x46-uart-readonly-panel.mjs'),
          import('/src/x46-uart-readonly-panel-view.mjs'),
        ]);
      const assessment = assessX46UartReadonlyPanel(input);
      renderX46UartReadonlyPanel(document.querySelector('#x46-uart-panel'), assessment,
        { evidenceKind: 'historical-replay-fixture' });
      return assessment;
    }, historical);
    assert.equal(replay.state, 'current');
    assert.equal(replay.reason, 'current-paused-worker-complete');
    assert.equal(replay.frames.length, 23);
    assert.equal(replay.identity.artifactIdentity,
      actualPausedRaw.runtimeIdentity.artifactIdentity);
    assert.equal(await live.getAttribute('data-evidence-kind'), 'historical-replay-fixture');
    assert.match(await live.locator('.shared-instrument-tool-heading span').textContent(),
      /Accepted historical replay/u);
    assert.match(await live.locator('.x46-uart-boundary').textContent(),
      /Historical raw-evidence replay.*not a fresh current worker/u);
    assert.equal(await live.locator('[data-x46-rows] tr').count(), 23);
    assert.deepEqual(await live.locator('[data-x46-rows] tr').first().locator('td').allTextContents(),
      ['1', '6,279', '—', '0x54', 'T', '9,615', '16,640']);
    assert.deepEqual(await live.locator('[data-x46-rows] tr').last().locator('td').allTextContents(),
      ['23', '373,840', '16,706', '0x53', 'S', '9,615', '16,640']);
    assert.deepEqual(replay.authority,
      { apply: false, build: false, run: false, verdict: false });
    const framed = framingFixture();
    const framingAssessment = await app.page.evaluate(async (input) => {
      const [{ assessX46UartReadonlyPanel }, { renderX46UartReadonlyPanel }] =
        await Promise.all([
          import('/src/x46-uart-readonly-panel.mjs'),
          import('/src/x46-uart-readonly-panel-view.mjs'),
        ]);
      const assessment = assessX46UartReadonlyPanel(input);
      renderX46UartReadonlyPanel(document.querySelector('#x46-uart-panel'), assessment,
        { evidenceKind: 'synthetic-review-fixture' });
      return assessment;
    }, framed);
    assert.deepEqual({ state: framingAssessment.framing.state,
      completed: framingAssessment.framing.completed,
      inFlight: framingAssessment.framing.inFlight },
    { state: 'current', completed: 1, inFlight: 0 });
    const disclosure = live.locator('.x46-framing-details');
    assert.equal(await disclosure.getAttribute('open'), null);
    assert.match(await disclosure.locator('summary').textContent(),
      /Model-derived framing · 1 completed · 0 in flight/u);
    await disclosure.locator('summary').focus();
    await app.page.keyboard.press('Enter');
    assert.equal(await disclosure.getAttribute('open'), '');
    assert.match(await disclosure.textContent(), /start 0 · data LSB 1 0 0 0 0 0 1 0 · stop 1/u);
    assert.match(framingAssessment.support.framing, /^bounded model-derived/u);

    for (const [name, mutate] of [
      ['Run', (value) => { value.lifecyclePhase = 'running'; value.runtimeSnapshot.paused = false; }],
      ['Reset', (value) => { value.trustedCurrentWorker = false; }],
      ['Edit', (value) => { value.lifecycleRuntimeBinding.runtimeGeneration += 1; }],
      ['Open', (value) => { value.trustedCurrentWorker = false; value.runtimeSnapshot = null; }],
      ['profile', (value) => { value.profile = 'architecture.rp2040-v1'; }],
    ]) {
      const retired = structuredClone(framed); mutate(retired);
      const state = await app.page.evaluate(async (input) => {
        const [{ assessX46UartReadonlyPanel }, { renderX46UartReadonlyPanel }] =
          await Promise.all([
            import('/src/x46-uart-readonly-panel.mjs'),
            import('/src/x46-uart-readonly-panel-view.mjs'),
          ]);
        const assessment = assessX46UartReadonlyPanel(input);
        renderX46UartReadonlyPanel(document.querySelector('#x46-uart-panel'), assessment,
          { evidenceKind: 'synthetic-review-fixture' });
        return { panel: assessment.state, framing: assessment.framing.state,
          frames: assessment.framing.frames.length, run: assessment.authority.run };
      }, retired);
      assert.equal(state.framing, 'unavailable', name);
      assert.equal(state.frames, 0, name);
      assert.equal(state.run, false, name);
    }
    await app.page.click('#workbench-instruments-dialog .workbench-popup-close');
    await app.page.waitForFunction(() => !document.querySelector('#workbench-instruments-dialog').open);
    assert.equal(await app.page.evaluate(() => document.activeElement === document.querySelector('#instruments-open')), true);
    await app.page.locator('#instruments-open').focus();
    await app.page.keyboard.press('Enter');
    await app.page.waitForFunction(() => document.querySelector('#workbench-instruments-dialog').open);
    assert.equal(await app.page.evaluate(() => window.__X46_UART_READONLY_PANEL__.state),
      'unavailable');
    assert.equal(await app.page.evaluate(() => window.__X46_ACTIVITY__.workers), 0);
    const shellAfterRows = await app.page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      controller: document.querySelector('#top-controller-controls').getBoundingClientRect().toJSON(),
      primary: document.querySelector('#top-primary-controls').getBoundingClientRect().toJSON(),
    }));
    assert.deepEqual(shellAfterRows, shellBeforeRows);
    assert.equal(app.requests.length, 0);
    assert.equal(app.errors.length, 0);
    await app.page.close();

    const constrained = await activityPage(browser, base, { width: 780, height: 900 });
    await constrained.page.waitForFunction(() =>
      window.__M11_READY__ === true && window.__X46_UART_READONLY_PANEL__);
    await constrained.page.click('#instruments-open');
    const constrainedPanel = constrained.page.locator(
      '#workbench-instruments-dialog #x46-uart-panel',
    );
    await constrainedPanel.waitFor({ state: 'visible' });
    assert.equal(await constrained.page.evaluate(async (input) => {
      const [{ assessX46UartReadonlyPanel }, { renderX46UartReadonlyPanel }] =
        await Promise.all([
          import('/src/x46-uart-readonly-panel.mjs'),
          import('/src/x46-uart-readonly-panel-view.mjs'),
        ]);
      const assessment = assessX46UartReadonlyPanel(input);
      renderX46UartReadonlyPanel(document.querySelector('#x46-uart-panel'), assessment,
        { evidenceKind: 'historical-replay-fixture' });
      return assessment.frames.length;
    }, historical), 23);
    const constrainedLayout = await constrained.page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth
        - document.documentElement.clientWidth,
      tableOwnScroll: document.querySelector('.x46-uart-table-wrap').scrollWidth
        > document.querySelector('.x46-uart-table-wrap').clientWidth,
      panelWidth: document.querySelector('#x46-uart-panel').getBoundingClientRect().width,
      popupWidth: document.querySelector(
        '#workbench-instruments-dialog [data-workbench-popup-mount="instruments"]',
      ).getBoundingClientRect().width,
      controllerRight: document.querySelector('#top-controller-controls')
        .getBoundingClientRect().right,
      primaryRight: document.querySelector('#top-primary-controls')
        .getBoundingClientRect().right,
    }));
    assert(constrainedLayout.pageOverflow <= 1,
      `integrated page overflow ${constrainedLayout.pageOverflow}`);
    assert.equal(constrainedLayout.tableOwnScroll, true);
    assert(constrainedLayout.panelWidth <= constrainedLayout.popupWidth + 1);
    assert(constrainedLayout.controllerRight <= 781);
    assert(constrainedLayout.primaryRight <= 781);
    assert.equal(await constrained.page.evaluate(() => window.__X46_ACTIVITY__.workers), 0);
    assert.equal(constrained.requests.length, 0);
    assert.equal(constrained.errors.length, 0);
    await constrained.page.close();

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const review = await activityPage(browser, `${base}/fixture`, viewport);
      await review.page.waitForFunction(() => window.__X46_FIXTURE_READY__ === true);
      const valid = fixture();
      assert.equal(await review.page.evaluate((input) => window.__X46_FIXTURE__.render(input).state, valid), 'current');
      const panel = review.page.locator('#fixture-panel');
      assert.equal(await panel.getAttribute('data-evidence-kind'), 'synthetic-review-fixture');
      assert.match(await panel.locator('.x46-uart-boundary').textContent(), /Synthetic review fixture/u);
      assert.equal(await panel.locator('[data-x46-rows] tr').count(), 2);
      assert.equal(await panel.locator('[data-x46-rows] tr').first().getAttribute('data-ordinal'), '1');
      assert.deepEqual(await panel.locator('[data-x46-rows] tr').first().locator('td').allTextContents(),
        ['1', '0', '—', '0x41', 'A', '9,615.38', '16,640']);
      assert.deepEqual(await panel.locator('[data-x46-rows] tr').nth(1).locator('td').allTextContents(),
        ['2', '16,640', '16,640', '0x0A', '\\n', '9,615.38', '16,640']);
      assert.match(await panel.textContent(), /Apply false · Build false · Run false · verdict false/u);
      assert.match(await panel.locator('[data-x46-limits]').textContent(), /Framing configuration.*I2C and SPI are unavailable/u);

      const cases = [
        ['empty', (value) => { value.runtimeSnapshot.instruments.serial.records = []; value.runtimeSnapshot.instruments.serial.retained = 0; }],
        ['unavailable', (value) => { value.profile = 'architecture.rp2040-v1'; }],
        ['partial', (value) => { value.runtimeSnapshot.instruments.serial.dropped = 1; }],
        ['stale', (value) => { value.runtimeSnapshot.runtimeIdentity.workerInstanceNonce = 'e'.repeat(32); }],
        ['stale', (value) => { value.lifecycleRuntimeBinding.runtimeGeneration += 1; }],
        ['unavailable', (value) => { value.lifecyclePhase = 'running'; value.runtimeSnapshot.paused = false; }],
        ['invalid', (value) => { delete value.runtimeSnapshot.instruments.serial.records[0].frameCycles; }],
      ];
      for (const [expected, mutate] of cases) {
        const value = fixture(); mutate(value);
        assert.equal(await review.page.evaluate((input) => window.__X46_FIXTURE__.render(input).state, value), expected);
        assert.equal(await panel.getAttribute('data-state'), expected);
        assert.equal(await panel.locator('[data-x46-rows] tr').count(), 1);
        assert.equal(await panel.locator('[data-x46-rows] tr td').textContent(), 'No accepted TX byte-event rows.');
      }
      await review.page.evaluate((input) => window.__X46_FIXTURE__.render(input), valid);
      assert.equal(await panel.locator('[data-x46-rows] tr').count(), 2);
      const layout = await review.page.evaluate(() => ({
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tableOverflow: document.querySelector('.x46-uart-table-wrap').scrollWidth > document.querySelector('.x46-uart-table-wrap').clientWidth,
        workers: window.__X46_ACTIVITY__.workers,
      }));
      assert(layout.pageOverflow <= 1, `page overflow ${layout.pageOverflow}`);
      if (viewport.width === 390) assert.equal(layout.tableOverflow, true);
      assert.equal(layout.workers, 0);
      assert.equal(review.requests.length, 0);
      assert.equal(review.errors.length, 0);
      if (evidenceDir && viewport.width === 1440) await panel.screenshot({ path: path.join(evidenceDir, 'x46-readonly-uart-panel-synthetic-review.png') });
      await review.page.close();
    }
    process.stdout.write(`${JSON.stringify({ status: 'pass', appWorkers: 0,
      producerRequests: 0, historicalReplayRows: 23, states: 7,
      counterStub: http.counterStub, viewports: [1440, 780, 390] })}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => http.close(resolve));
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
