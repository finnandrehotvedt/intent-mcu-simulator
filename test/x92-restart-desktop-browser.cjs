// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const root = path.resolve(__dirname, '../dist');
const output = process.env.X92_RESTART_OUTPUT || path.join(os.tmpdir(), 'x92-restart-desktop');

function contentType(file) {
  if (file.endsWith('.js') || file.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.json')) return 'application/json';
  return 'text/html; charset=utf-8';
}

if (process.argv.includes('--serve')) {
  const port = Number(process.env.X92_RESTART_PORT); let views = 0;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://local').pathname;
    if (pathname === '/api/page-views') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      const snapshot = () => ({ status: 'available', schema: 'intent-mcu-aggregate-page-views@1',
        startedAt: '2026-10-23T00:00:00.000Z', dayEuropeOslo: '2026-10-23', displayDay: '23 Oct 2026',
        timeZone: 'Europe/Oslo', today: views, total: views, uniqueVisitors: false });
      if (request.method === 'GET') return response.end(JSON.stringify(snapshot()));
      if (request.method === 'POST') {
        views += 1;
        return response.end(JSON.stringify(snapshot()));
      }
      response.writeHead(405); return response.end();
    }
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404); return response.end('not found');
    }
    response.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
    return response.end(fs.readFileSync(file));
  });
  server.listen(port, '127.0.0.1', () => process.stdout.write('READY\n'));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
} else {
  const freePort = () => new Promise((resolve, reject) => {
    const probe = net.createServer(); probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
  const startServer = (port) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, '--serve'], {
      env: { ...process.env, X92_RESTART_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('exit', (code) => reject(new Error(`fixture server exited ${code}: ${stderr}`)));
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('READY')) resolve(child); });
  });
  const stopServer = (child) => new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGTERM'); });
  const waitForApp = async (page, url) => {
    assert.equal((await page.goto(url, { waitUntil: 'networkidle' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X92_EXPERIMENT_BUDGET__);
  };
  const startSession = async (page) => {
    await page.click('#brief-tests-open'); await page.waitForSelector('#workbench-brief-dialog[open]');
    await page.click('#x92-budget-start');
    await page.waitForFunction(() => window.__X92_EXPERIMENT_BUDGET__.active() === true);
    return page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot());
  };

  (async () => {
    fs.mkdirSync(output, { recursive: true });
    const module = await import('../src/x92-experiment-budget.mjs');
    let sequence = 0;
    const owner = module.createX92ExperimentBudget({ measurementSource: 'test.monotonic-wall-clock',
      randomId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` });
    const identity = { schema: 'intent-mcu-experiment-budget-identity@1', profile: 'board.atmega328p-16mhz-v1',
      projectGeneration: 1, sourceIdentity: `sha256:${'a'.repeat(64)}`, graphIdentity: `sha256:${'b'.repeat(64)}` };
    owner.start(identity, { humanInitiated: true });
    owner.reserve({ schema: 'intent-mcu-bounded-action-request@1', action: 'firmware.build',
      requestId: 'x92-browser-inert-pending-build', profile: identity.profile, expectedGeneration: 1,
      issuedAtMs: 1_000, expiresAtMs: 31_000, payload: {} }, identity);
    const inertPendingReview = owner.reviewText();

    const port = await freePort(); let server = await startServer(port);
    const base = `http://127.0.0.1:${port}/`; const browser = await chromium.launch({ headless: true });
    const producerRequests = []; const failedResponses = []; const pageViewRequests = [];
    const observe = (page) => {
      page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (/^\/api\/(build|run|scenario|worker)/u.test(pathname)) producerRequests.push(`${request.method()} ${pathname}`);
        if (pathname === '/api/page-views') pageViewRequests.push(`${request.method()} ${pathname}`);
      });
      page.on('response', (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });
    };
    try {
      const firstContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      const first = await firstContext.newPage(); observe(first); await waitForApp(first, base);
      const firstSession = await startSession(first);
      await first.reload({ waitUntil: 'networkidle' });
      await first.waitForFunction(() => window.__M11_READY__ === true && window.__X92_EXPERIMENT_BUDGET__);
      assert.equal(await first.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.active()), false);
      assert.equal(await first.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot()), null);
      await first.setInputFiles('#x92-budget-open-input', { name: 'pending-review.json', mimeType: 'application/json',
        buffer: Buffer.from(inertPendingReview) });
      await first.waitForFunction(() => /Inert review opened/u.test(document.querySelector('#x92-budget-imported').textContent));
      assert.equal(await first.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.active()), false);
      assert.equal(await first.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot()), null);

      await first.click('#project-files-open'); await first.click('#project-demo');
      await first.click('.starter-card[data-example="blink"]');
      await startSession(first); await first.keyboard.press('Escape');
      await first.click('#project-files-open');
      const projectDownload = first.waitForEvent('download'); await first.click('#project-save');
      const savedProject = await projectDownload;
      await first.setInputFiles('#project-open-input', await savedProject.path());
      if (await first.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await first.click('#unsaved-discard');
      await first.waitForFunction(() => window.__X92_EXPERIMENT_BUDGET__.active() === false);
      assert.equal(await first.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot()?.active), false);

      const beforeProcessRestart = await startSession(first);
      await stopServer(server); server = await startServer(port);
      await first.reload({ waitUntil: 'networkidle' });
      await first.waitForFunction(() => window.__M11_READY__ === true && window.__X92_EXPERIMENT_BUDGET__);
      assert.equal(await first.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.active()), false);
      assert.equal(await first.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot()), null);
      assert.match(await first.locator('#page-view-count').textContent(), /Page views today: 1 · total since 23 Oct 2026: 1/u);
      await firstContext.close();

      const secondContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      const page = await secondContext.newPage(); observe(page); await waitForApp(page, base);
      assert.equal(await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.active()), false);
      assert.equal(await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot()), null);
      await page.setInputFiles('#x92-budget-open-input', { name: 'pending-review-after-process-restart.json',
        mimeType: 'application/json', buffer: Buffer.from(inertPendingReview) });
      await page.waitForFunction(() => /Inert review opened/u.test(document.querySelector('#x92-budget-imported').textContent));
      assert.equal(await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot()), null);

      const current = await startSession(page);
      assert.notEqual(current.sessionId, firstSession.sessionId);
      assert.notEqual(current.sessionId, beforeProcessRestart.sessionId);
      await page.focus('#x92-budget-start'); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'x92-budget-download');
      const accountingLabels = await page.evaluate(() => Object.fromEntries(
        ['builds', 'runs', 'scenarios', 'wallClockMs'].map((dimension) => [dimension,
          [...document.querySelectorAll(`[data-dimension="${dimension}"] [data-kind]`)].map((node) => node.textContent)]),
      ));
      assert.deepEqual(accountingLabels, {
        builds: ['Finalized: 0', 'Reserved: 0', 'Remaining: 2', 'Limit: 2'],
        runs: ['Finalized: 0', 'Reserved: 0', 'Remaining: 4', 'Limit: 4'],
        scenarios: ['Finalized: 0', 'Reserved: 0', 'Remaining: 8', 'Limit: 8'],
        wallClockMs: ['Finalized: 0 ms', 'Reserved: 0 ms', 'Remaining: 120000 ms', 'Limit: 120000 ms'],
      });
      const screenshots = [];
      for (const [width, height] of [[1366, 768], [1440, 900], [1905, 1050]]) {
        await page.setViewportSize({ width, height }); await page.locator('.x92-budget').scrollIntoViewIfNeeded();
        assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
        assert.deepEqual(await page.locator('[data-dimension="builds"] [data-kind]').allTextContents(),
          ['Finalized: 0', 'Reserved: 0', 'Remaining: 2', 'Limit: 2']);
        const target = path.join(output, `x92-current-desktop-${width}x${height}.png`);
        await page.screenshot({ path: target, fullPage: true }); screenshots.push(target);
      }
      assert.deepEqual(producerRequests, []); assert.deepEqual(failedResponses, []);
      assert(pageViewRequests.length >= 4); // GET+POST before and after the real server-process restart.
      const pageViewLabel = await page.locator('#page-view-count').textContent();
      assert.match(pageViewLabel, /Page views today: 2 · total since 23 Oct 2026: 2/u);
      const report = { status: 'pass', source: process.env.X92_SOURCE_SHA || null,
        browserReloadRetired: true, projectOpenRetired: true, sameContextProcessRestartRetired: true,
        freshContextRetired: true,
        importedPendingAuthorityRestored: false, producerRequests, failedResponses,
        counterFixture: { classification: 'stub-not-production-proof', truthfulPerProcess: true,
          schema: 'intent-mcu-aggregate-page-views@1', requests: pageViewRequests.length, finalLabel: pageViewLabel },
        accountingLabels, screenshots };
      fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(report)}\n`); await secondContext.close();
    } finally {
      await browser.close(); if (server && server.exitCode === null) await stopServer(server);
    }
  })().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
}
