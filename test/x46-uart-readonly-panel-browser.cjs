// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const repository = path.resolve(__dirname, '..');
const evidenceDir = process.env.X46_EVIDENCE_DIR || '';
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

const fixtureHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"><title>X46 synthetic UI review fixture</title></head><body><main style="max-width:1180px;margin:24px auto;padding:12px"><section id="fixture-panel" class="x46-uart-panel" aria-label="Read-only UART transmit byte-event analysis"></section></main><script type="module">
import { assessX46UartReadonlyPanel } from '/src/x46-uart-readonly-panel.mjs';
import { renderX46UartReadonlyPanel } from '/src/x46-uart-readonly-panel-view.mjs';
const root = document.querySelector('#fixture-panel');
window.__X46_FIXTURE__ = Object.freeze({ render(input) { const value = assessX46UartReadonlyPanel(input); renderX46UartReadonlyPanel(root, value, { evidenceKind: 'synthetic-review-fixture' }); return value; } });
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

function server() {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
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
    await app.page.close();

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
    process.stdout.write(`${JSON.stringify({ status: 'pass', appWorkers: 0, producerRequests: 0, states: 7, viewports: [1440, 390] })}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => http.close(resolve));
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
