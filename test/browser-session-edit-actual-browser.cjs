// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createReadStream } = require('node:fs');
const { copyFile, mkdtemp, rm, stat, writeFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { createInterface } = require('node:readline');
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
let standaloneClientPath = null;
const runEditor = (origin, secret, plan = 'test/fixtures/api-client-add-led-plan.json') => {
  const child = spawn(process.execPath, [standaloneClientPath, origin,
    plan], {
    stdio: ['pipe', 'pipe', 'pipe'], env: process.env,
  });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (value) => { stdout += value; });
  child.stderr.on('data', (value) => { stderr += value; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout.trim().split('\n').map(JSON.parse))
      : reject(new Error(`${stderr}\nexit ${code}`)));
  });
  done.catch(() => {});
  child.stdin.write(`${secret}\n`);
  return { done, undo: () => child.stdin.end('UNDO\n') };
};
const runSessionEditor = (ticketPath) => {
  const child = spawn(process.execPath, [standaloneClientPath, '--session', ticketPath], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' },
  });
  let stderr = ''; const lines = []; const waiters = [];
  child.stderr.on('data', (value) => { stderr += value; });
  createInterface({ input: child.stdout }).on('line', (line) => {
    const value = JSON.parse(line); const waiter = waiters.shift();
    if (waiter) waiter.resolve(value); else lines.push(value);
  });
  const next = () => lines.length ? Promise.resolve(lines.shift()) : new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  const done = new Promise((resolve, reject) => child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${stderr}\nexit ${code}`))));
  done.catch(() => {});
  return { child, next, done, send: (value) => child.stdin.write(`${JSON.stringify(value)}\n`) };
};

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
  const standaloneDirectory = await mkdtemp(path.join(tmpdir(), 'intent-mcu-client-'));
  standaloneClientPath = path.join(standaloneDirectory, 'client.mjs');
  const servedClient = await fetch(`${origin}/api/session/v1/client.mjs`);
  assert.equal(servedClient.status, 200);
  await writeFile(standaloneClientPath, Buffer.from(await servedClient.arrayBuffer()), { mode: 0o700 });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); const browserErrors = []; const buildRequests = [];
    let holdPull = false; let releasePull = null; let observedPull = null;
    let holdAuthorize = false; let releaseAuthorize = null; let observedAuthorize = null;
    await page.route('**/api/session/v1', async (route) => {
      const body = route.request().postDataJSON?.();
      if (holdPull && body?.operation === 'owner.pull') {
        const response = await route.fetch();
        observedPull?.();
        await new Promise((resolve) => { releasePull = resolve; });
        await route.fulfill({ response }); return;
      }
      if (holdAuthorize && body?.operation === 'owner.authorize') {
        const response = await route.fetch(); observedAuthorize?.();
        await new Promise((resolve) => { releaseAuthorize = resolve; });
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
    assert.deepEqual(visible.components, ['api-led-1', 'api-resistor-1']);
    assert.deepEqual(visible.wires, ['api-net-drive', 'api-net-ground', 'api-net-series']);
    assert.equal(visible.buildStatus, 'dirty'); assert.equal(visible.artifactIdentity, null);
    const assembledExact = await page.evaluate(() => structuredClone(window.__M6_PROJECT__()));
    await page.locator('#browser-session-api-dialog [data-close]').click();
    const downloadReady = page.waitForEvent('download');
    await page.evaluate(() => document.querySelector('#project-save').click());
    const download = await downloadReady; const savedPath = await download.path();
    if (process.env.API03_PORTABLE_PROJECT) {
      await copyFile(savedPath, process.env.API03_PORTABLE_PROJECT);
    }
    if (process.env.API03_SCREENSHOT) await page.screenshot({ path: process.env.API03_SCREENSHOT, fullPage: false });
    editing.undo(); const output = await editing.done;
    assert.equal(output[0].mode, 'edited'); assert.equal(output[1].undo, 'API_TRANSACTION_UNDONE');
    assert.match(output[0].transaction_id, /^api-tx:session-/u);
    assert.deepEqual(output[0].changes.map((change) => change.component_id ?? change.net_id).sort(),
      ['api-led-1', 'api-net-drive', 'api-net-ground', 'api-net-series', 'api-resistor-1'].sort());
    assert.ok(output[0].discovery.components.length > 0);
    assert.deepEqual(output[0].discovery.components.map((item) => item.id).sort(),
      output[0].project.circuit.components.filter((item) => !item.id.startsWith('api-')).map((item) => item.id).sort());
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), before);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore);
    assert.deepEqual(buildRequests, []); assert.deepEqual(browserErrors, []);

    await page.locator('#project-open-input').setInputFiles(savedPath);
    await page.waitForFunction((expected) => JSON.stringify(window.__M6_PROJECT__()) === expected,
      JSON.stringify(assembledExact));
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-status]')
      ?.textContent.includes('Pair again.'));
    const reopened = await page.evaluate(() => window.__M6_PROJECT__());
    assert.deepEqual(reopened, assembledExact);

    // Edit scope is never inferred from a read-only pairing; file Open revoked the prior scope.
    await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
      .find((button) => button.textContent === 'API access').click());
    if (await page.locator('#browser-session-api-dialog [data-revoke]').isEnabled()) {
      await page.locator('#browser-session-api-dialog [data-revoke]').click();
    }
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
    await page.evaluate(() => {
      window.__API04_STORAGE_SET__ = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException('quota denied', 'QuotaExceededError'); };
    });
    const storageId = 'storage-denial-edit-0001';
    const storageRequest = { schema: 'intent-mcu-browser-session-request@1', request_id: storageId,
      session_id: claim.sessionId, project_id: claim.projectId, expected_revision: claim.revision,
      sequence: 1, command: 'edit.batch', arguments: { commands: [{ command: 'component.property.set',
        component_id: 'api-resistor-1', key: 'ohms', value: 330 }] } };
    assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId,
      request: storageRequest }, claim.clientCapability)).code, 'API_REQUEST_QUEUED');
    const storageResult = await resultFor(origin, claim, storageId);
    assert.equal(storageResult.status, 'accepted');
    assert.equal(await page.evaluate(() => window.__M6_PROJECT__().circuit.components
      .find((component) => component.id === 'api-resistor-1').properties.ohms), 330);
    assert.match(await page.locator('#project-message').textContent(), /local save failed/u);
    await page.evaluate(() => { Storage.prototype.setItem = window.__API04_STORAGE_SET__;
      delete window.__API04_STORAGE_SET__; });
    const stableBeforeInvalid = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const invalidId = 'invalid-batch-0001';
    const invalidRequest = { schema: 'intent-mcu-browser-session-request@1', request_id: invalidId,
      session_id: claim.sessionId, project_id: claim.projectId, expected_revision: storageResult.revision_after,
      sequence: 2, command: 'edit.batch', arguments: {
        commands: [{ command: 'component.remove', component_id: 'board-1' }] } };
    assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId,
      request: invalidRequest }, claim.clientCapability)).code, 'API_REQUEST_QUEUED');
    assert.equal((await resultFor(origin, claim, invalidId)).status, 'rejected');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), stableBeforeInvalid);

    await page.evaluate(() => { const name = document.querySelector('#project-name');
      name.value = 'Manual race winner'; name.dispatchEvent(new Event('change', { bubbles: true })); });
    const manualWinner = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const staleId = 'stale-edit-0001';
    const staleRequest = { ...invalidRequest, request_id: staleId, sequence: 3,
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
    const authorizeSeen = new Promise((resolve) => { observedAuthorize = resolve; }); holdAuthorize = true;
    const raceId = 'delayed-pull-race-0001';
    const raceRequest = { schema: 'intent-mcu-browser-session-request@1', request_id: raceId,
      session_id: raceClaim.sessionId, project_id: raceClaim.projectId, expected_revision: 0,
      sequence: 1, command: 'edit.batch', arguments: { commands: [{ command: 'component.add',
        id: 'race-led-1', type: 'led.basic-v1', position: { x: 0.5, y: 0.5, rotation: 0 } }] } };
    assert.equal((await post(origin, 'request.submit', { sessionId: raceClaim.sessionId,
      request: raceRequest }, raceClaim.clientCapability)).code, 'API_REQUEST_QUEUED');
    await authorizeSeen;
    relayOffset += 121_001;
    await page.evaluate(() => { window.__API04_REAL_NOW__ = Date.now;
      Date.now = () => window.__API04_REAL_NOW__() + 121_001; });
    holdAuthorize = false; releaseAuthorize();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-status]')
      ?.textContent.startsWith('Command expired or was revoked:'));
    await page.evaluate(() => { Date.now = window.__API04_REAL_NOW__; delete window.__API04_REAL_NOW__; });
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

    const independentBrowser = await chromium.launch({ headless: true });
    try {
      const independentPage = await independentBrowser.newPage();
      await independentPage.goto(origin, { waitUntil: 'domcontentloaded' });
      await independentPage.waitForFunction(() => window.__BROWSER_SESSION_CANONICAL_OWNER__?.snapshot?.().ok === true);
      await independentPage.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
        .find((button) => button.textContent === 'API access').click());
      await independentPage.locator('#browser-session-api-dialog [data-enable]').click();
      await independentPage.waitForFunction(() => document.querySelector(
        '#browser-session-api-dialog [data-secret]').value.length > 20);
      const independentSecret = await independentPage.locator(
        '#browser-session-api-dialog [data-secret]').inputValue();
      const independentClaim = await post(origin, 'pairing.claim', { pairingSecret: independentSecret,
        scopes: ['discover', 'read_project'] });
      assert.notEqual(independentClaim.sessionId, successor.sessionId);
      assert.equal((await post(origin, 'request.submit', { sessionId: successor.sessionId,
        request: successorRequest }, independentClaim.clientCapability)).code, 'API_AUTH_REQUIRED');
    } finally { await independentBrowser.close(); }
    const mixedProfiles = [
      ['board.rp2040-pico-v1', '__RP2040_PUBLIC_WORKBENCH__'],
      ['board.esp32-c3-devmodule-v1', '__ESP32C3_PUBLIC_WORKBENCH__'],
      ['board.stm32f429zi-nucleo144-v1', '__STM32_PUBLIC_WORKBENCH__'],
    ];
    for (const [profile, ownerKey] of mixedProfiles) {
      const mixedPage = await context.newPage();
      await mixedPage.goto(origin, { waitUntil: 'domcontentloaded' });
      await mixedPage.selectOption('#board-select', profile);
      await mixedPage.waitForFunction((key) => window[key]?.state?.().active === true, ownerKey);
      const mixedBefore = await mixedPage.evaluate((key) => {
        const state = window[key].state(); const project = state.project ?? { source: state.source, circuit: state.circuit };
        return JSON.stringify({ source: project.source, components: project.circuit.components, nets: project.circuit.nets });
      }, ownerKey);
      await mixedPage.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
        .find((button) => button.textContent === 'API access').click());
      await mixedPage.locator('#browser-session-api-dialog [data-edit-scope]').check();
      await mixedPage.locator('#browser-session-api-dialog [data-enable]').click();
      await mixedPage.waitForFunction(() => document.querySelector(
        '#browser-session-api-dialog [data-secret]').value.length > 20);
      const mixedSecret = await mixedPage.locator('#browser-session-api-dialog [data-secret]').inputValue();
      const mixedEdit = runEditor(origin, mixedSecret,
        'test/fixtures/api-client-mixed-authoring-plan.json');
      await mixedPage.waitForFunction((key) => {
        const state = window[key].state(); return (state.project?.circuit ?? state.circuit).components
          .some(({ id }) => id === 'button-2');
      }, ownerKey);
      const mixedState = await mixedPage.evaluate((key) => {
        const state = window[key].state();
        return { authoringAccepted: state.authoringAccepted,
          circuitAccepted: state.circuitAccepted ?? state.circuitValid,
          circuitCode: state.circuitCode, text: state.circuitEditor.validation,
          duplicatePosition: (state.project?.circuit ?? state.circuit).layout.positions['button-2'] };
      }, ownerKey);
      assert.equal(mixedState.authoringAccepted, true);
      assert.notEqual(mixedState.circuitAccepted, true);
      assert.equal(mixedState.circuitCode, 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE');
      assert.deepEqual(mixedState.duplicatePosition, { x: 0.82, y: 0.7, rotation: 0 });
      mixedEdit.undo(); const mixedOutput = await mixedEdit.done;
      assert.equal(mixedOutput[0].mode, 'edited');
      assert.equal(mixedOutput[1].undo, 'API_TRANSACTION_UNDONE');
      assert.deepEqual(mixedOutput[0].changes.map(({ operation }) => operation),
        ['component.add', 'component.duplicate', 'wire.branch.connect', 'wire.disconnect']);
      const mixedRestored = await mixedPage.evaluate((key) => {
        const state = window[key].state(); const project = state.project ?? { source: state.source, circuit: state.circuit };
        return { semantic: JSON.stringify({ source: project.source, components: project.circuit.components,
          nets: project.circuit.nets }), buttonCounter: project.circuit.layout.idCounters.button };
      }, ownerKey);
      assert.equal(mixedRestored.semantic, mixedBefore);
      assert.equal(mixedRestored.buttonCounter, 2);
      await mixedPage.close();
    }
    const multiPinProfiles = [
      { profile: 'board.rp2040-pico-v1', ownerKey: '__RP2040_PUBLIC_WORKBENCH__',
        fixture: 'test/fixtures/api-client-pico-multipin-plan.json', layer: '#pico-editor-wires',
        net: 'net-gp1-resistor-2-drive', invalidPin: 'GP2' },
      { profile: 'board.esp32-c3-devmodule-v1', ownerKey: '__ESP32C3_PUBLIC_WORKBENCH__',
        fixture: 'test/fixtures/api-client-c3-multipin-plan.json', layer: '#c3-editor-wires',
        net: 'net-gpio3-resistor-2-drive', invalidPin: 'GPIO0' },
      { profile: 'board.stm32f429zi-nucleo144-v1', ownerKey: '__STM32_PUBLIC_WORKBENCH__',
        fixture: 'test/fixtures/api-client-stm32-multipin-plan.json', layer: '#stm32-editor-wires',
        net: 'net-pb1-resistor-2-drive', invalidPin: 'PB7' },
    ];
    for (const profile of multiPinProfiles) {
      process.stdout.write(`multipin-profile-start:${profile.profile}\n`);
      const apiPage = await context.newPage();
      const apiErrors = []; apiPage.on('pageerror', (error) => apiErrors.push(error.message));
      await apiPage.goto(origin, { waitUntil: 'domcontentloaded' });
      await apiPage.selectOption('#board-select', profile.profile);
      await apiPage.waitForFunction((key) => window[key]?.state?.().active === true, profile.ownerKey);
      const before = await apiPage.evaluate((key) => { const state = window[key].state();
        const graph = state.project?.circuit ?? state.circuit;
        return JSON.stringify({ components: graph.components, nets: graph.nets }); }, profile.ownerKey);
      await apiPage.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
        .find((button) => button.textContent === 'API access').click());
      await apiPage.locator('#browser-session-api-dialog [data-edit-scope]').check();
      await apiPage.locator('#browser-session-api-dialog [data-enable]').click();
      await apiPage.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
      const secret = await apiPage.locator('#browser-session-api-dialog [data-secret]').inputValue();
      const client = runEditor(origin, secret, profile.fixture);
      try {
        await apiPage.waitForFunction((key) => { const state = window[key].state();
          return (state.project?.circuit ?? state.circuit).components.some(({ id }) => id === 'led-2');
        }, profile.ownerKey, { timeout: 15_000 });
      } catch (error) {
        throw new Error(`MULTIPIN_WAIT:${profile.profile}:${JSON.stringify(apiErrors)}:${error.message}`);
      }
      await apiPage.waitForFunction(({ layer, net }) => document.querySelector(layer)
        ?.querySelector(`[data-net="${net}"]`), profile);
      const rendered = await apiPage.evaluate(({ ownerKey, layer, net }) => {
        const state = window[ownerKey].state();
        const graph = state.project?.circuit ?? state.circuit;
        const svg = document.querySelector(layer);
        return { components: graph.components.length, nets: graph.nets.length,
          namedNet: graph.nets.some(({ id }) => id === net),
          wirePaths: [...(svg?.querySelectorAll(`path[data-net="${net}"]`) ?? [])].map((path) => path.getAttribute('d')) };
      }, profile);
      assert.deepEqual(rendered.components, 5); assert.equal(rendered.nets, 6);
      assert.equal(rendered.namedNet, true); assert.ok(rendered.wirePaths.length > 0);
      assert.ok(rendered.wirePaths.every((value) => typeof value === 'string' && value.length > 3));
      client.undo(); const output = await client.done;
      assert.equal(output[0].mode, 'edited'); assert.equal(output[1].undo, 'API_TRANSACTION_UNDONE');
      if (profile.profile === 'board.stm32f429zi-nucleo144-v1') {
        assert.equal(output[0].discovery.validation.model.groundPhysicalPin, 19);
      }
      assert.equal(await apiPage.evaluate((key) => { const state = window[key].state();
        const graph = state.project?.circuit ?? state.circuit;
        return JSON.stringify({ components: graph.components, nets: graph.nets }); }, profile.ownerKey), before);
      const redone = await apiPage.evaluate(({ ownerKey, transactionId }) => window[ownerKey].apiRedo(transactionId),
        { ownerKey: profile.ownerKey, transactionId: output[0].transaction_id });
      assert.equal(redone.ok, true); assert.equal(redone.draft.components.length, 5); assert.equal(redone.draft.nets.length, 6);
      const undone = await apiPage.evaluate(({ ownerKey, transactionId }) => window[ownerKey].apiUndo(transactionId),
        { ownerKey: profile.ownerKey, transactionId: output[0].transaction_id });
      assert.equal(undone.ok, true);
      const stable = await apiPage.evaluate((key) => { const state = window[key].state();
        return JSON.stringify(state.project?.circuit ?? state.circuit); }, profile.ownerKey);
      const rejected = await apiPage.evaluate(({ ownerKey, invalidPin }) => window[ownerKey].apiBatch([
        { command: 'wire.connect', net_id: 'net-invalid',
          from: { component: (window[ownerKey].state().project?.circuit
            ?? window[ownerKey].state().circuit).components.find(({ type }) => type.startsWith('board.')).id, pin: invalidPin },
          to: { component: 'resistor-1', pin: 'A' } },
      ], 'negative-atomic'), profile);
      assert.equal(rejected.ok, false);
      assert.equal(await apiPage.evaluate((key) => { const state = window[key].state();
        return JSON.stringify(state.project?.circuit ?? state.circuit); }, profile.ownerKey), stable);
      assert.deepEqual(apiErrors, []);
      await apiPage.close();
    }
    const sessionContext = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
    const sessionPage = await sessionContext.newPage(); const sessionErrors = [];
    sessionPage.on('pageerror', (error) => sessionErrors.push(error.message));
    await sessionPage.goto(origin, { waitUntil: 'domcontentloaded' });
    await sessionPage.selectOption('#board-select', 'board.stm32f429zi-nucleo144-v1');
    await sessionPage.waitForFunction(() => window.__STM32_PUBLIC_WORKBENCH__?.state?.().active === true);
    const sessionBefore = await sessionPage.evaluate(() => { const state = window.__STM32_PUBLIC_WORKBENCH__.state();
      const graph = state.project?.circuit ?? state.circuit;
      return JSON.stringify({ components: graph.components, nets: graph.nets }); });
    await sessionPage.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
      .find((button) => button.textContent === 'API access').click());
    await sessionPage.locator('#browser-session-api-dialog [data-edit-scope]').check();
    await sessionPage.locator('#browser-session-api-dialog [data-enable]').click();
    await sessionPage.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-download-ticket]').disabled === false);
    const ticketDownload = sessionPage.waitForEvent('download');
    await sessionPage.locator('#browser-session-api-dialog [data-download-ticket]').click();
    const downloadedTicket = await ticketDownload; const ticketPath = path.join(standaloneDirectory, 'pairing.intentpair');
    await copyFile(await downloadedTicket.path(), ticketPath);
    const persistent = runSessionEditor(ticketPath);
    assert.equal((await persistent.next()).mode, 'session');
    persistent.send({ command: 'inspect' }); const inspected = await persistent.next();
    assert.equal(inspected.mode, 'inspected'); const revisionBefore = inspected.discovery.revision;
    persistent.send({ command: 'apply', plan: { schema: 'intent-mcu-browser-session-plan@1', commands: [
      { command: 'wire.connect', net_id: 'net-invalid', from: { component: 'stm32-1', pin: 'PB7' },
        to: { component: 'resistor-1', pin: 'A' } },
    ] } });
    assert.equal((await persistent.next()).code, 'STM32_API_WIRE_CONNECT_INVALID');
    persistent.send({ command: 'inspect' }); const afterRejected = await persistent.next();
    assert.equal(afterRejected.mode, 'inspected'); assert.equal(afterRejected.discovery.revision, revisionBefore);
    const validPlan = JSON.parse(require('node:fs').readFileSync('test/fixtures/api-client-stm32-multipin-plan.json', 'utf8'));
    persistent.send({ command: 'apply', plan: validPlan }); const sessionApplied = await persistent.next();
    assert.equal(sessionApplied.mode, 'edited');
    persistent.send({ command: 'undo', transaction_id: sessionApplied.transaction_id });
    assert.equal((await persistent.next()).mode, 'undone');
    persistent.send({ command: 'inspect' }); assert.equal((await persistent.next()).mode, 'inspected');
    assert.equal(await sessionPage.evaluate(() => { const state = window.__STM32_PUBLIC_WORKBENCH__.state();
      const graph = state.project?.circuit ?? state.circuit;
      return JSON.stringify({ components: graph.components, nets: graph.nets }); }), sessionBefore);
    persistent.send({ command: 'close' }); assert.equal((await persistent.next()).status, 'closed'); await persistent.done;
    assert.deepEqual(sessionErrors, []); await sessionContext.close();
    await context.close();
    process.stdout.write(`${JSON.stringify({ status: 'pass', visible, restoredExactBytes: true,
      editScopeExplicit: true, invalidAtomic: true, manualRaceStale: true,
      actualFileRoundTrip: true, openRevokedPriorScope: true, storageDenialPreserved: true,
      expiredAfterPullContained: true, delayedPullContained: true, replacementSameRevision: true,
      independentBrowserProcesses: 2, mixedReferenceClientProfiles: 3, multiPinReferenceClientProfiles: 3,
      persistentStandaloneSessionRejectionAndUndo: true,
      buildRequests: 0, runtimeWorkers: workersBefore })}\n`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve));
    await rm(standaloneDirectory, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
