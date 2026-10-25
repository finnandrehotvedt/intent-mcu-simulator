// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
const assert = require('node:assert/strict');
const { createReadStream } = require('node:fs');
const { createServer } = require('node:http');
const { stat } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const post = async (origin, operation, value = {}, capability = null) => (await fetch(`${origin}/api/session/v1`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(capability ? { Authorization: `Bearer ${capability}` } : {}) },
  body: JSON.stringify({ operation, ...value }),
})).json();
async function resultFor(origin, claim, requestId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await post(origin, 'result.read', { sessionId: claim.sessionId, requestId }, claim.clientCapability);
    if (result.code !== 'API_RESULT_PENDING') return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('RESULT_TIMEOUT');
}
(async () => {
  const { createBrowserSessionRelay } = await import('../src/browser-session-relay.mjs');
  const { createBrowserSessionHttpHandler } = await import('../src/browser-session-http.mjs');
  const relay = createBrowserSessionRelay(); let origin;
  const server = createServer(async (request, response) => {
    if (await createBrowserSessionHttpHandler(relay, { publicOrigin: origin })(request, response)) return;
    const pathname = new URL(request.url, origin).pathname;
    const file = path.join(process.cwd(), 'dist', pathname === '/' ? 'index.html' : pathname.slice(1));
    try { if (!(await stat(file)).isFile()) throw new Error('missing');
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(response); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); await page.goto(origin); await page.waitForFunction(() => window.__M11_READY__ === true);
    if (!(await page.locator('#workbench-more').evaluate((node) => node.open))) await page.click('#workbench-more > summary');
    await page.click('#project-files-open'); await page.click('#project-demo');
    await page.evaluate(() => document.querySelector('.starter-card[data-example="avr-pcf8574-lcd-hello"] .starter-action').click());
    await page.waitForSelector('[data-component-id="pcf8574-lcd-1"]');
    if (await page.locator('#workbench-project-dialog').getAttribute('open') !== null) await page.keyboard.press('Escape');
    const before = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
      .find((button) => button.textContent === 'API access').click());
    const dialog = page.locator('#browser-session-api-dialog'); await dialog.locator('[data-edit-scope]').check();
    await dialog.locator('[data-enable]').click();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
    const claim = await post(origin, 'pairing.claim', { pairingSecret: await dialog.locator('[data-secret]').inputValue(),
      scopes: ['discover', 'read_project', 'edit_circuit'] });
    assert.equal(claim.ok, true);
    const requestId = 'lcd-api-browser-edit-1';
    const commands = [
      { command: 'component.remove', component_id: 'pcf8574-lcd-1' },
      { command: 'component.add', id: 'pcf8574-lcd-api', type: 'output.character-lcd-16x2-pcf8574-v1', position: { x: 0.69, y: 0.55, rotation: 0 } },
      { command: 'wire.branch.connect', net_id: 'net-5v', endpoint: { component: 'pcf8574-lcd-api', pin: 'VCC' } },
      { command: 'wire.branch.connect', net_id: 'net-ground-branch', endpoint: { component: 'pcf8574-lcd-api', pin: 'GND' } },
      { command: 'wire.connect', net_id: 'net-api-sda', from: { component: 'pcf8574-lcd-api', pin: 'SDA' }, to: { component: 'board-1', pin: 'A4' } },
      { command: 'wire.connect', net_id: 'net-api-scl', from: { component: 'pcf8574-lcd-api', pin: 'SCL' }, to: { component: 'board-1', pin: 'A5' } },
    ];
    const request = { schema: 'intent-mcu-browser-session-request@1', request_id: requestId,
      session_id: claim.sessionId, project_id: claim.projectId, expected_revision: claim.revision, sequence: 1,
      command: 'edit.batch', arguments: { commands } };
    assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId, request }, claim.clientCapability)).ok, true);
    const edited = await resultFor(origin, claim, requestId); assert.equal(edited.status, 'accepted', edited.code);
    await page.waitForSelector('[data-component-id="pcf8574-lcd-api"]');
    assert.equal(await page.locator('[data-component-id="pcf8574-lcd-api"] .pin-anchor').count(), 4);
    const after = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const undo = { ...request, request_id: 'lcd-api-browser-undo-1', expected_revision: edited.revision_after,
      sequence: 2, command: 'edit.undo', arguments: { transaction_id: edited.transaction_id } };
    assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId, request: undo }, claim.clientCapability)).ok, true);
    const undone = await resultFor(origin, claim, undo.request_id); assert.equal(undone.status, 'accepted');
    await page.waitForSelector('[data-component-id="pcf8574-lcd-1"]');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), before);
    const redo = { ...undo, request_id: 'lcd-api-browser-redo-1', expected_revision: undone.revision_after,
      sequence: 3, command: 'edit.redo' };
    assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId, request: redo }, claim.clientCapability)).ok, true);
    const redone = await resultFor(origin, claim, redo.request_id); assert.equal(redone.status, 'accepted');
    await page.waitForSelector('[data-component-id="pcf8574-lcd-api"]');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), after);
    const invalid = { ...request, request_id: 'lcd-api-browser-invalid-address-1',
      expected_revision: redone.revision_after, sequence: 4,
      arguments: { commands: [{ command: 'component.property.set', component_id: 'pcf8574-lcd-api', key: 'address', value: 0x26 }] } };
    assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId, request: invalid }, claim.clientCapability)).ok, true);
    const rejected = await resultFor(origin, claim, invalid.request_id);
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.revision_after, redone.revision_after);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), after);
    await dialog.locator('[data-revoke]').click();
    const denied = await post(origin, 'client.heartbeat', { sessionId: claim.sessionId }, claim.clientCapability);
    assert.equal(denied.ok, false);
    process.stdout.write(JSON.stringify({ result: 'pass', actualPairingApi: true, candidateAddNamedWire: true,
      exactTransactionUndoRedo: true, invalidAddressAtomic: true, revoke: true }) + '\n');
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
