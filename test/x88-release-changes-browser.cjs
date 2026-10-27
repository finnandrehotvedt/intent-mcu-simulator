// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X88_URL || 'http://127.0.0.1:18860';
const evidenceDir = process.env.X88_EVIDENCE || null;

const browserState = () => ({
  localStorage: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
  sessionStorage: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])),
  project: window.__COMMON_PROJECT_FILES__?.current?.() ?? null,
  buildState: window.__M6_STATE__?.buildState ?? null,
  artifactIdentity: window.__M6_STATE__?.artifactIdentity ?? null,
  runtimeWorkerCreations: window.__M6_STATE__?.runtimeWorkerCreations ?? null,
  lifecycle: document.querySelector('#lifecycle-state')?.textContent ?? null,
  runDisabled: document.querySelector('#run')?.disabled ?? null,
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const outside = []; const mutations = []; const errors = []; const workers = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('worker', (worker) => workers.push(worker.url()));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    });
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true);
    const alternate = await page.locator('link[rel="alternate"][type="application/json"]').getAttribute('href');
    assert.equal(alternate, '/release-changes.json');
    const before = await page.evaluate(browserState);
    const databasesBefore = await page.evaluate(async () => (await indexedDB.databases()).map(({ name, version }) => ({ name, version })));
    const fetched = await page.evaluate(async () => {
      const result = await fetch('/release-changes.json', { cache: 'no-store', credentials: 'omit' });
      return { status: result.status, type: result.headers.get('content-type'),
        csp: result.headers.get('content-security-policy'), text: await result.text() };
    });
    assert.equal(fetched.status, 200);
    assert.match(fetched.type, /^application\/json;/u);
    assert.match(fetched.csp, /default-src 'none'/u);
    const delta = JSON.parse(fetched.text);
    assert.deepEqual(delta.release, { previous: '1.1.0-rc.139', current: '1.1.0-rc.140' });
    assert.deepEqual(delta.changes.map(({ id, classification }) => ({ id, classification })),
      [{ id: 'X72', classification: 'additive' }]);
    assert.deepEqual(delta.authority, { apply: false, build: false, run: false, replay: false, verdict: false });
    const after = await page.evaluate(browserState);
    const databasesAfter = await page.evaluate(async () => (await indexedDB.databases()).map(({ name, version }) => ({ name, version })));
    assert.deepEqual(after, before);
    assert.deepEqual(databasesAfter, databasesBefore);

    const support = await context.newPage();
    const supportResponse = await support.goto(`${base}/support.html#release-changes`, { waitUntil: 'networkidle' });
    assert.equal(supportResponse?.status(), 200);
    assert.match(await support.locator('#release-changes').textContent(), /cannot Apply, Build, Run, replay firmware, decide a verdict or prove runtime behaviour/iu);
    if (evidenceDir) {
      fs.mkdirSync(evidenceDir, { recursive: true });
      await support.locator('#release-changes').screenshot({ path: path.join(evidenceDir, 'x88-private-release-changes.png') });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    assert.deepEqual(mutations, []);
    assert.deepEqual(workers, []);
    assert.equal((await context.cookies()).length, 0);
    assert.equal(context.serviceWorkers().length, 0);
    console.log(JSON.stringify({ result: 'pass', browser: 'chromium', viewport: '1440x1000',
      release: delta.release, changes: delta.changes.length, stableIds: delta.changes.map(({ id }) => id),
      staticMime: fetched.type, authority: delta.authority, projectStateUnchanged: true,
      storageUnchanged: true, runtimeWorkers: 0, mutations: 0, outsideRequests: 0, cookies: 0 }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
