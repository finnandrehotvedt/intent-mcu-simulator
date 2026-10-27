// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createReadStream } = require('node:fs');
const { createServer } = require('node:http');
const { stat } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const post = async (origin, operation, value = {}, capability = null) => (await fetch(`${origin}/api/session/v1`, {
  method: 'POST', headers: { 'Content-Type': 'application/json',
    ...(capability ? { Authorization: `Bearer ${capability}` } : {}) },
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
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(response);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(60_000);
    const errors = []; const outside = []; let buildRequests = 0;
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/page-views', (route) => route.fulfill({ status: 200,
      contentType: 'application/json', body: '{"status":"disabled"}' }));
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { const url = new URL(request.url());
      if (url.origin !== new URL(origin).origin) outside.push(request.url());
      if (/\/api\/(?:build|compile)/u.test(url.pathname)) buildRequests += 1; });
    await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true); await page.click('#workbench-view-advanced');
    await page.setInputFiles('#project-open-input', { name: 'avr-contact-sensors.intent-mcu.json',
      mimeType: 'application/json', buffer: fs.readFileSync('examples/contact-sensors/avr-contact-sensors.intent-mcu.json') });
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForSelector('[data-component-id="float-switch-1"]');
    if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
      await page.click('#workbench-project-dialog .workbench-popup-close');
    }
    const expected = [
      ['float-switch-1', 'sensor-float-switch-no', 'liquidHigh', 'Liquid high · closed'],
      ['tilt-switch-1', 'sensor-tilt-switch-no', 'tilted', 'Tilted · closed'],
      ['vibration-switch-1', 'sensor-ball-vibration-switch-no', 'vibrationDetected', 'Vibration detected · closed'],
    ];
    for (const [id, renderer, key, after] of expected) {
      assert.equal(await page.locator(`.circuit-component[data-component-id="${id}"] [data-artwork-key="${renderer}"]`).count(), 1);
      assert.equal(await page.locator(`.circuit-component[data-component-id="${id}"] [data-terminal-pin]`).count(), 2);
      if (await page.locator('#workbench-inspector-dialog').evaluate((node) => node.open)) {
        await page.click('#workbench-inspector-dialog .workbench-popup-close');
      }
      await page.locator(`.circuit-component[data-component-id="${id}"]`).click({ force: true }); await page.click('#toggle-inspector');
      await page.evaluate(({ id: componentId, key: controlKey }) =>
        document.querySelector(`[data-control="${componentId}.${controlKey}"]`).click(), { id, key });
      assert.equal(await page.locator(`[data-control="${id}.${key}"]`).textContent(), after);
    }
    if (await page.locator('#workbench-inspector-dialog').evaluate((node) => node.open)) {
      await page.click('#workbench-inspector-dialog .workbench-popup-close');
    }
    const saved = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())); await page.click('#project-files-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    await page.setInputFiles('#project-open-input', await download.path());
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction((value) => JSON.stringify(window.__M6_PROJECT__()) === value, saved);
    await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
      .find((button) => button.textContent === 'API access').click());
    const dialog = page.locator('#browser-session-api-dialog'); await dialog.locator('[data-edit-scope]').check();
    await dialog.locator('[data-enable]').click(); await page.waitForFunction(() =>
      document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
    const claim = await post(origin, 'pairing.claim', { pairingSecret: await dialog.locator('[data-secret]').inputValue(),
      scopes: ['discover', 'read_project', 'edit_circuit'] }); assert.equal(claim.ok, true); let sequence = 0;
    const command = async (requestId, name, args = {}, revision = claim.revision) => {
      const request = { schema: 'intent-mcu-browser-session-request@1', request_id: requestId,
        session_id: claim.sessionId, project_id: claim.projectId, expected_revision: revision,
        sequence: ++sequence, command: name, arguments: args };
      assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId, request }, claim.clientCapability)).ok, true);
      return resultFor(origin, claim, requestId);
    };
    const catalog = await command('contacts-catalog-1', 'components.catalog');
    for (const [, , type] of [['', '', 'switch.float-no-v1'], ['', '', 'sensor.tilt-switch-no-v1'],
      ['', '', 'sensor.ball-vibration-switch-no-v1']]) assert.ok(catalog.components[type], type);
    const added = await command('contacts-add-1', 'edit.batch', { commands: [
      { command: 'component.add', id: 'float-switch-api', type: 'switch.float-no-v1', position: { x: 0.84, y: 0.28, rotation: 0 } },
      { command: 'wire.connect', net_id: 'net-float-api-input', from: { component: 'float-switch-api', pin: 'A' }, to: { component: 'board-1', pin: 'D7' } },
      { command: 'wire.branch.connect', net_id: 'net-float-switch-1-ground', endpoint: { component: 'float-switch-api', pin: 'B' } },
    ] }); assert.equal(added.status, 'accepted', added.code); await page.waitForSelector('[data-component-id="float-switch-api"]');
    const disconnected = await command('contacts-disconnect-1', 'edit.batch', { commands: [
      { command: 'wire.disconnect', net_id: 'net-float-api-input' },
    ] }, added.revision_after); assert.equal(disconnected.status, 'accepted', disconnected.code);
    const undone = await command('contacts-undo-1', 'edit.undo', { transaction_id: disconnected.transaction_id }, disconnected.revision_after);
    assert.equal(undone.status, 'accepted', undone.code);
    const redone = await command('contacts-redo-1', 'edit.redo', { transaction_id: disconnected.transaction_id }, undone.revision_after);
    assert.equal(redone.status, 'accepted', redone.code);
    const beforeInvalid = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const invalid = await command('contacts-invalid-1', 'edit.batch', { commands: [
      { command: 'component.property.set', component_id: 'float-switch-api', key: 'normallyOpen', value: false },
    ] }, redone.revision_after); assert.equal(invalid.status, 'rejected');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), beforeInvalid);
    await dialog.locator('[data-revoke]').click(); assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.equal(buildRequests, 0);
    process.stdout.write(`${JSON.stringify({ ok: true, rendered: 3, controls: 3, fileRoundtrip: true,
      apiAddAndWire: true, disconnectUndoRedo: true, invalidAtomic: true, buildRequests })}\n`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
