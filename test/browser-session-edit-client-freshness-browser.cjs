// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');
const { createServer } = require('node:http');
const { createInterface } = require('node:readline');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES
  || '/root/.npm/_npx/fd3bca3c548369c0/node_modules', 'playwright'));

const rateLimitWaitMs = Number(process.env.API_SESSION_RATE_LIMIT_WAIT_MS ?? 10_100);
if (!Number.isInteger(rateLimitWaitMs) || rateLimitWaitMs < 0 || rateLimitWaitMs > 180_000) {
  throw new Error('API_SESSION_RATE_LIMIT_WAIT_INVALID');
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8' };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function sessionClient(ticketPath) {
  const child = spawn(process.execPath, ['dist/api/session/v1/client.mjs', '--session', ticketPath], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' },
  });
  const queued = []; const waiting = []; let stderr = '';
  createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
    const value = JSON.parse(line); const resolve = waiting.shift();
    if (resolve) resolve(value); else queued.push(value);
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const next = () => queued.length ? Promise.resolve(queued.shift())
    : new Promise((resolve) => waiting.push(resolve));
  const send = (value) => { child.stdin.write(`${JSON.stringify(value)}\n`); return next(); };
  const done = new Promise((resolve, reject) => child.on('close', (code) => code === 0
    ? resolve() : reject(new Error(`${stderr}\nexit ${code}`))));
  return { send, next, done, stderr: () => stderr };
}

(async () => {
  const { createBrowserSessionRelay } = await import('../src/browser-session-relay.mjs');
  const { createBrowserSessionHttpHandler } = await import('../src/browser-session-http.mjs');
  const relay = createBrowserSessionRelay(); let origin;
  const server = createServer(async (request, response) => {
    if (await createBrowserSessionHttpHandler(relay, { publicOrigin: origin })(request, response)) return;
    const pathname = new URL(request.url, origin).pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (relative.includes('..')) { response.writeHead(400); response.end(); return; }
    const file = path.join(process.cwd(), 'dist', relative);
    try {
      if (!(await stat(file)).isFile()) throw new Error('not-file');
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store' }); createReadStream(file).pipe(response);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true,
      viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); const pageErrors = []; const outside = []; const buildRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== origin && !['blob:', 'data:'].includes(url.protocol)) outside.push(request.url());
      if (/\/api\/build/u.test(url.pathname)) buildRequests.push(request.url());
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true
      && window.__BROWSER_SESSION_CANONICAL_OWNER__?.snapshot?.().ok === true);
    const workersBefore = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
    const graphBefore = await page.evaluate(() => { const circuit = window.__M6_PROJECT__().circuit;
      return JSON.stringify({ components: circuit.components, nets: circuit.nets }); });
    await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
      .find((button) => button.textContent === 'API access').click());
    const dialog = page.locator('#browser-session-api-dialog');
    await dialog.locator('[data-edit-scope]').check(); await dialog.locator('[data-enable]').click();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-download-ticket]')
      .disabled === false);
    const downloadEvent = page.waitForEvent('download'); await dialog.locator('[data-download-ticket]').click();
    const ticketPath = await (await downloadEvent).path();
    const client = sessionClient(ticketPath); assert.equal((await client.next()).mode, 'session');
    const send = async (value) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await client.send(value);
        if (result.code !== 'API_RATE_LIMIT') return result;
        await wait(rateLimitWaitMs);
      }
      throw new Error('API_RATE_LIMIT_PERSISTED');
    };
    const inspect = () => send({ command: 'inspect' });
    const apply = (commands, allowRemoval = false) => send({ command: 'apply', plan: {
      schema: 'intent-mcu-browser-session-plan@1', commands,
      ...(allowRemoval ? { allow_component_removal: true } : {}),
    } });
    const pin = (result, component, id) => result.discovery.pins[component]
      .find((item) => item.id === id);

    const initial = await inspect(); const initialRevision = initial.discovery.revision;
    assert.equal(pin(initial, 'board-1', 'D4').connected, false);
    const branchCommands = [
      { command: 'component.add', id: 'api-fresh-resistor', type: 'resistor.fixed-v1',
        position: { x: 0.5, y: 0.2, rotation: 0 } },
      { command: 'component.add', id: 'api-fresh-led', type: 'led.basic-v1',
        position: { x: 0.72, y: 0.3, rotation: 0 } },
      { command: 'wire.connect', net_id: 'api-fresh-drive', from: { component: 'board-1', pin: 'D4' },
        to: { component: 'api-fresh-resistor', pin: 'A' } },
      { command: 'wire.connect', net_id: 'api-fresh-series',
        from: { component: 'api-fresh-resistor', pin: 'B' },
        to: { component: 'api-fresh-led', pin: 'ANODE' } },
      { command: 'wire.connect', net_id: 'api-fresh-ground',
        from: { component: 'api-fresh-led', pin: 'CATHODE' },
        to: { component: 'board-1', pin: 'GND2' } },
    ];
    const branch = await apply(branchCommands); assert.equal(branch.mode, 'edited', JSON.stringify(branch));
    const connected = await inspect();
    assert.equal(pin(connected, 'board-1', 'D4').connected, true);
    assert.equal(pin(connected, 'api-fresh-resistor', 'A').connected, true);
    assert.equal(pin(connected, 'api-fresh-led', 'CATHODE').connected, true);

    const undone = await send({ command: 'undo', transaction_id: branch.transaction_id });
    assert.equal(undone.mode, 'undone', JSON.stringify(undone));
    const afterUndo = await inspect(); assert.equal(pin(afterUndo, 'board-1', 'D4').connected, false);
    await page.waitForFunction(() => document.querySelector('#redo').disabled === false);
    await page.evaluate(() => document.querySelector('#redo').click());
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components
      .some(({ id }) => id === 'api-fresh-resistor'));
    const afterGuiRedo = await inspect();
    assert.equal(pin(afterGuiRedo, 'board-1', 'D4').connected, true);
    assert(afterGuiRedo.discovery.revision > afterUndo.discovery.revision);

    const cleaned = await apply([
      { command: 'wire.disconnect', net_id: 'api-fresh-drive' },
      { command: 'wire.disconnect', net_id: 'api-fresh-series' },
      { command: 'wire.disconnect', net_id: 'api-fresh-ground' },
      { command: 'component.remove', component_id: 'api-fresh-resistor' },
      { command: 'component.remove', component_id: 'api-fresh-led' },
    ], true);
    assert.equal(cleaned.mode, 'edited', JSON.stringify(cleaned));
    const afterCleanup = await inspect();
    assert.equal(pin(afterCleanup, 'board-1', 'D4').connected, false);
    assert.equal(Object.hasOwn(afterCleanup.discovery.pins, 'api-fresh-resistor'), false);

    const firstReuse = await apply([
      { command: 'component.add', id: 'api-reused-part', type: 'resistor.fixed-v1',
        position: { x: 0.48, y: 0.62, rotation: 0 } },
      { command: 'component.add', id: 'api-reuse-led', type: 'led.basic-v1',
        position: { x: 0.76, y: 0.62, rotation: 0 } },
      { command: 'wire.connect', net_id: 'api-reuse-drive-1', from: { component: 'board-1', pin: 'D4' },
        to: { component: 'api-reused-part', pin: 'A' } },
      { command: 'wire.connect', net_id: 'api-reuse-series-1',
        from: { component: 'api-reused-part', pin: 'B' },
        to: { component: 'api-reuse-led', pin: 'ANODE' } },
      { command: 'wire.connect', net_id: 'api-reuse-ground-1',
        from: { component: 'api-reuse-led', pin: 'CATHODE' },
        to: { component: 'board-1', pin: 'GND2' } },
    ]);
    assert.equal(firstReuse.mode, 'edited', JSON.stringify(firstReuse));
    assert.deepEqual((await inspect()).discovery.pins['api-reused-part'].map(({ id }) => id), ['A', 'B']);
    assert.equal((await apply([
      { command: 'wire.disconnect', net_id: 'api-reuse-drive-1' },
      { command: 'wire.disconnect', net_id: 'api-reuse-series-1' },
      { command: 'wire.disconnect', net_id: 'api-reuse-ground-1' },
      { command: 'component.remove', component_id: 'api-reused-part' },
      { command: 'component.remove', component_id: 'api-reuse-led' },
    ], true)).mode, 'edited');
    assert.equal(Object.hasOwn((await inspect()).discovery.pins, 'api-reused-part'), false);
    assert.equal((await apply([
      { command: 'component.add', id: 'api-reuse-resistor', type: 'resistor.fixed-v1',
        position: { x: 0.48, y: 0.62, rotation: 0 } },
      { command: 'component.add', id: 'api-reused-part', type: 'led.basic-v1',
        position: { x: 0.76, y: 0.62, rotation: 0 } },
      { command: 'wire.connect', net_id: 'api-reuse-drive-2', from: { component: 'board-1', pin: 'D4' },
        to: { component: 'api-reuse-resistor', pin: 'A' } },
      { command: 'wire.connect', net_id: 'api-reuse-series-2',
        from: { component: 'api-reuse-resistor', pin: 'B' },
        to: { component: 'api-reused-part', pin: 'ANODE' } },
      { command: 'wire.connect', net_id: 'api-reuse-ground-2',
        from: { component: 'api-reused-part', pin: 'CATHODE' },
        to: { component: 'board-1', pin: 'GND2' } },
    ])).mode, 'edited');
    const reused = await inspect();
    assert.deepEqual(reused.discovery.pins['api-reused-part'].map(({ id }) => id), ['ANODE', 'CATHODE']);

    const guiBefore = new Set(reused.discovery.components.map(({ id }) => id));
    const guiAdd = await page.evaluate(() => window.__M6_ADD__('resistor.fixed-v1'));
    assert.equal(guiAdd.ok, true, JSON.stringify(guiAdd));
    const afterGuiAdd = await inspect();
    const guiAdded = afterGuiAdd.discovery.components.find(({ id }) => !guiBefore.has(id));
    assert.equal(guiAdded.type, 'resistor.fixed-v1');
    assert.deepEqual(afterGuiAdd.discovery.pins[guiAdded.id].map(({ id }) => id), ['A', 'B']);
    await page.evaluate(() => document.querySelector('#undo').click());
    await page.waitForFunction((id) => !window.__M6_PROJECT__().circuit.components.some((item) => item.id === id),
      guiAdded.id);
    assert.equal(Object.hasOwn((await inspect()).discovery.pins, guiAdded.id), false);

    const beforeInvalid = (await inspect()).discovery.revision;
    const invalid = await apply([{ command: 'component.property.set', component_id: 'api-reuse-resistor',
      key: 'ohms', value: -1 }]);
    assert.deepEqual(invalid, { status: 'rejected', code: 'INVALID_COMPONENT_PROPERTIES' });
    assert.equal((await inspect()).discovery.revision, beforeInvalid);

    assert.equal((await apply([
      { command: 'wire.disconnect', net_id: 'api-reuse-drive-2' },
      { command: 'wire.disconnect', net_id: 'api-reuse-series-2' },
      { command: 'wire.disconnect', net_id: 'api-reuse-ground-2' },
      { command: 'component.remove', component_id: 'api-reuse-resistor' },
      { command: 'component.remove', component_id: 'api-reused-part' },
    ], true)).mode, 'edited');
    const finalInspect = await inspect();
    assert.equal(pin(finalInspect, 'board-1', 'D4').connected, false);
    assert.deepEqual(new Set(Object.keys(finalInspect.discovery.pins)),
      new Set(finalInspect.discovery.components.map(({ id }) => id)));
    assert.equal(await page.evaluate(() => { const circuit = window.__M6_PROJECT__().circuit;
      return JSON.stringify({ components: circuit.components, nets: circuit.nets }); }), graphBefore);
    assert(finalInspect.discovery.revision > initialRevision);

    assert.equal((await client.send({ command: 'close' })).code, 'API_SESSION_LOCAL_CLOSED');
    await client.done; await dialog.locator('[data-revoke]').click();
    assert.equal(client.stderr().includes('pairing_secret'), false);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore);
    assert.deepEqual(pageErrors, []); assert.deepEqual(outside, []); assert.deepEqual(buildRequests, []);
    await assert.rejects(stat(ticketPath));
    process.stdout.write(`${JSON.stringify({ status: 'pass', ownerEvidence: true, onePersistentClient: true,
      initialD4Connected: false, branchD4Connected: true, cleanupD4Connected: false,
      apiUndo: true, guiRedo: true, guiChangeBeforeInspect: true, removedIdDropped: true,
      reusedIdTypePinsFresh: true, exactInvalidComponentProperties: true,
      revisionBefore: initialRevision, revisionAfter: finalInspect.discovery.revision,
      ticketDeleted: true, revoked: true, buildRequests: 0, runtimeWorkers: 0 })}\n`);
    await context.close();
  } finally {
    await browser.close(); await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
