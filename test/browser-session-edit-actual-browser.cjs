// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');
const { createServer } = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES
  || '/root/.npm/_npx/fd3bca3c548369c0/node_modules', 'playwright'));

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const post = async (origin, operation, value = {}, capability = null) => {
  const response = await fetch(`${origin}/api/session/v1`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(capability
      ? { Authorization: `Bearer ${capability}` } : {}) },
    body: JSON.stringify({ operation, ...value }) });
  return response.json();
};
const resultFor = async (origin, claim, requestId) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await post(origin, 'result.read', { sessionId: claim.sessionId,
      requestId }, claim.clientCapability);
    if (result.code !== 'API_RESULT_PENDING') return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('API_RESULT_TIMEOUT');
};
const runEditor = (origin, secret) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['tools/browser-session-edit-client.mjs', origin], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, API03_PAUSE_BEFORE_UNDO_MS: '1500' },
  });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (value) => { stdout += value; });
  child.stderr.on('data', (value) => { stderr += value; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(JSON.parse(stdout))
    : reject(new Error(`${stderr}\nexit ${code}`)));
  child.stdin.end(`${secret}\n`);
});

(async () => {
  const { createBrowserSessionRelay } = await import('../src/browser-session-relay.mjs');
  const { createBrowserSessionHttpHandler } = await import('../src/browser-session-http.mjs');
  let relayOffset = 0; const relay = createBrowserSessionRelay({ now: () => Date.now() + relayOffset }); let origin;
  const server = createServer(async (request, response) => {
    if (await createBrowserSessionHttpHandler(relay, { publicOrigin: origin })(request, response)) return;
    const pathname = new URL(request.url, origin).pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (relative.includes('..')) { response.writeHead(400); response.end(); return; }
    const file = path.join(process.cwd(), 'dist', relative);
    try { if (!(await stat(file)).isFile()) throw new Error('not-file');
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store' }); createReadStream(file).pipe(response);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); const browserErrors = []; const buildRequests = [];
    let holdPull = false; let releasePull = null; let observedPull = null;
    await page.route('**/api/session/v1', async (route) => {
      const body = route.request().postDataJSON?.();
      if (holdPull && body?.operation === 'owner.pull') {
        const response = await route.fetch();
        observedPull?.();
        await new Promise((resolve) => { releasePull = resolve; });
        await route.fulfill({ response }); return;
      }
      await route.continue();
    });
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('request', (request) => { if (/\/api\/build/u.test(request.url())) buildRequests.push(request.url()); });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true
      && window.__BROWSER_SESSION_CANONICAL_OWNER__?.snapshot?.().ok === true);
    const before = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const workersBefore = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
    await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
      .find((button) => button.textContent === 'API access').click());
    await page.locator('#browser-session-api-dialog [data-edit-scope]').check();
    await page.locator('#browser-session-api-dialog [data-enable]').click();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
    const secret = await page.locator('#browser-session-api-dialog [data-secret]').inputValue();
    const editing = runEditor(origin, secret);
    await page.waitForSelector('[data-component-id="api-led-1"]');
    await page.waitForFunction(() => document.querySelectorAll('.circuit-wire[data-net^="api-net-"]').length >= 3);
    const visible = await page.evaluate(() => ({
      components: [...document.querySelectorAll('.circuit-component[data-component-id^="api-"]')]
        .map((node) => node.dataset.componentId).sort(),
      wires: [...new Set([...document.querySelectorAll('.circuit-wire[data-net^="api-net-"]')]
        .map((node) => node.dataset.net))].sort(),
      revision: window.__BROWSER_SESSION_CANONICAL_OWNER__.snapshot().revision,
      buildStatus: window.__M6_PROJECT__().build.status,
      artifactIdentity: window.__M6_STATE__.artifactIdentity,
    }));
    assert.deepEqual(visible.components, ['api-board-1', 'api-led-1', 'api-resistor-1']);
    assert.deepEqual(visible.wires, ['api-net-drive', 'api-net-ground', 'api-net-series']);
    assert.equal(visible.buildStatus, 'dirty'); assert.equal(visible.artifactIdentity, null);
    if (process.env.API03_SCREENSHOT) await page.screenshot({ path: process.env.API03_SCREENSHOT, fullPage: false });
    const output = await editing;
    assert.equal(output.status, 'pass'); assert.equal(output.undo, 'API_TRANSACTION_UNDONE');
    assert.match(output.transaction_id, /^api-tx:session-/u);
    assert.deepEqual(output.changes.map((change) => change.component_id ?? change.net_id).sort(),
      ['api-board-1', 'api-led-1', 'api-net-drive', 'api-net-ground', 'api-net-series', 'api-resistor-1',
        'board-1', 'led-1', 'resistor-1'].sort());
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), before);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore);
    assert.deepEqual(buildRequests, []); assert.deepEqual(browserErrors, []);

    // Edit scope is never inferred from a read-only pairing.
    await page.locator('#browser-session-api-dialog [data-revoke]').click();
    await page.locator('#browser-session-api-dialog [data-edit-scope]').uncheck();
    await page.locator('#browser-session-api-dialog [data-enable]').click();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
    const readSecret = await page.locator('#browser-session-api-dialog [data-secret]').inputValue();
    const denied = await post(origin, 'pairing.claim', { pairingSecret: readSecret,
      scopes: ['discover', 'read_project', 'edit_circuit'] });
    assert.equal(denied.code, 'API_SCOPE_REQUIRED');

    // Invalid batch and a stale manual/API race preserve canonical bytes.
    await page.locator('#browser-session-api-dialog [data-revoke]').click();
    await page.locator('#browser-session-api-dialog [data-edit-scope]').check();
    await page.locator('#browser-session-api-dialog [data-enable]').click();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
    const editSecret = await page.locator('#browser-session-api-dialog [data-secret]').inputValue();
    const claim = await post(origin, 'pairing.claim', { pairingSecret: editSecret,
      scopes: ['discover', 'read_project', 'edit_circuit'] });
    const stableBeforeInvalid = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const invalidId = 'invalid-batch-0001';
    const invalidRequest = { schema: 'intent-mcu-browser-session-request@1', request_id: invalidId,
      session_id: claim.sessionId, project_id: claim.projectId, expected_revision: claim.revision,
      sequence: 1, command: 'edit.batch', arguments: {
        commands: [{ command: 'component.remove', component_id: 'board-1' }] } };
    assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId,
      request: invalidRequest }, claim.clientCapability)).code, 'API_REQUEST_QUEUED');
    assert.equal((await resultFor(origin, claim, invalidId)).status, 'rejected');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), stableBeforeInvalid);

    await page.evaluate(() => { const name = document.querySelector('#project-name');
      name.value = 'Manual race winner'; name.dispatchEvent(new Event('change', { bubbles: true })); });
    const manualWinner = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const staleId = 'stale-edit-0001';
    const staleRequest = { ...invalidRequest, request_id: staleId, sequence: 2,
      arguments: { transaction_id: 'transaction-stale-0001', commands: [] } };
    assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId,
      request: staleRequest }, claim.clientCapability)).code, 'API_REQUEST_QUEUED');
    assert.equal((await resultFor(origin, claim, staleId)).code, 'API_STALE_REVISION');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), manualWinner);

    // A pulled command cannot cross actual same-revision replacement, revoke, or re-enable.
    await page.locator('#browser-session-api-dialog [data-revoke]').click();
    await page.locator('#browser-session-api-dialog [data-close]').click();
    await page.evaluate(() => document.querySelector('#project-new').click());
    await page.locator('#unsaved-discard').click();
    await page.waitForFunction(() => window.__BROWSER_SESSION_CANONICAL_OWNER__.snapshot().revision === 0);
    await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
      .find((button) => button.textContent === 'API access').click());
    await page.locator('#browser-session-api-dialog [data-enable]').click();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
    const raceSecret = await page.locator('#browser-session-api-dialog [data-secret]').inputValue();
    const raceClaim = await post(origin, 'pairing.claim', { pairingSecret: raceSecret,
      scopes: ['discover', 'read_project', 'edit_circuit'] });
    const pullSeen = new Promise((resolve) => { observedPull = resolve; }); holdPull = true;
    const raceId = 'delayed-pull-race-0001';
    const raceRequest = { schema: 'intent-mcu-browser-session-request@1', request_id: raceId,
      session_id: raceClaim.sessionId, project_id: raceClaim.projectId, expected_revision: 0,
      sequence: 1, command: 'edit.batch', arguments: { commands: [{ command: 'component.add',
        id: 'race-led-1', type: 'led.basic-v1', position: { x: 0.5, y: 0.5, rotation: 0 } }] } };
    assert.equal((await post(origin, 'request.submit', { sessionId: raceClaim.sessionId,
      request: raceRequest }, raceClaim.clientCapability)).code, 'API_REQUEST_QUEUED');
    await pullSeen;
    relayOffset += 30_001; holdPull = false; releasePull();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-status]')
      ?.textContent.startsWith('Command expired or was revoked:'));
    assert.equal(await page.locator('[data-component-id="race-led-1"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__BROWSER_SESSION_CANONICAL_OWNER__.snapshot().revision), 0);

    // A second pulled command cannot cross actual same-revision replacement, revoke, or re-enable.
    await page.locator('#browser-session-api-dialog [data-enable]').click();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
    const replaceSecret = await page.locator('#browser-session-api-dialog [data-secret]').inputValue();
    const replaceClaim = await post(origin, 'pairing.claim', { pairingSecret: replaceSecret,
      scopes: ['discover', 'read_project', 'edit_circuit'] });
    const replacementPullSeen = new Promise((resolve) => { observedPull = resolve; }); holdPull = true;
    const replacementId = 'replacement-pull-race-0001';
    const replacementRequest = { ...raceRequest, request_id: replacementId,
      session_id: replaceClaim.sessionId, project_id: replaceClaim.projectId };
    assert.equal((await post(origin, 'request.submit', { sessionId: replaceClaim.sessionId,
      request: replacementRequest }, replaceClaim.clientCapability)).code, 'API_REQUEST_QUEUED');
    await replacementPullSeen;
    await page.locator('#browser-session-api-dialog [data-close]').click();
    await page.evaluate(() => document.querySelector('#project-new').click());
    if (await page.locator('#unsaved-discard').isVisible()) await page.locator('#unsaved-discard').click();
    const replacement = await page.evaluate(() => ({ bytes: JSON.stringify(window.__M6_PROJECT__()),
      snapshot: window.__BROWSER_SESSION_CANONICAL_OWNER__.snapshot() }));
    assert.equal(replacement.snapshot.revision, 0); assert.notEqual(replacement.snapshot.projectId, replaceClaim.projectId);
    await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
      .find((button) => button.textContent === 'API access').click());
    await page.locator('#browser-session-api-dialog [data-revoke]').click();
    await page.locator('#browser-session-api-dialog [data-enable]').click();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
    const successorSecret = await page.locator('#browser-session-api-dialog [data-secret]').inputValue();
    const successor = await post(origin, 'pairing.claim', { pairingSecret: successorSecret,
      scopes: ['discover', 'read_project', 'edit_circuit'] });
    holdPull = false; releasePull(); await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), replacement.bytes);
    assert.equal(await page.locator('[data-component-id="race-led-1"]').count(), 0);
    const successorId = 'successor-read-0001';
    const successorRequest = { ...raceRequest, request_id: successorId, session_id: successor.sessionId,
      project_id: successor.projectId, sequence: 1, command: 'components.list', arguments: {} };
    assert.equal((await post(origin, 'request.submit', { sessionId: successor.sessionId,
      request: successorRequest }, successor.clientCapability)).code, 'API_REQUEST_QUEUED');
    assert.deepEqual((await resultFor(origin, successor, successorId)).components, []);
    await context.close();
    process.stdout.write(`${JSON.stringify({ status: 'pass', visible, restoredExactBytes: true,
      editScopeExplicit: true, invalidAtomic: true, manualRaceStale: true,
      expiredAfterPullContained: true, delayedPullContained: true, replacementSameRevision: true,
      buildRequests: 0, runtimeWorkers: workersBefore })}\n`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
