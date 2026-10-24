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
const plan = require('./fixtures/api-client-add-led-plan.json');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8' };
function sessionClient(ticketPath) {
  const child = spawn(process.execPath, ['dist/api/session/v1/client.mjs', '--session', ticketPath], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, INTENT_MCU_ALLOW_LOOPBACK_TICKET: '1' },
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const waiting = []; const queued = []; let stderr = '';
  lines.on('line', (line) => { const value = JSON.parse(line); const waiter = waiting.shift();
    if (waiter) waiter(value); else queued.push(value); });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const next = () => queued.length ? Promise.resolve(queued.shift())
    : new Promise((resolve) => waiting.push(resolve));
  const send = (value) => { child.stdin.write(`${JSON.stringify(value)}\n`); return next(); };
  const done = new Promise((resolve, reject) => child.on('close', (code) => code === 0
    ? resolve() : reject(new Error(`${stderr}\nexit ${code}`))));
  return { child, next, send, done, stderr: () => stderr };
}

(async () => {
  const { createBrowserSessionRelay } = await import('../src/browser-session-relay.mjs');
  const { createBrowserSessionHttpHandler } = await import('../src/browser-session-http.mjs');
  const relay = createBrowserSessionRelay();
  let origin;
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
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
    const page = await context.newPage(); const buildRequests = [];
    page.on('request', (request) => { if (/\/api\/build/u.test(request.url())) buildRequests.push(request.url()); });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true
      && window.__BROWSER_SESSION_CANONICAL_OWNER__?.snapshot?.().ok === true);
    const before = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const workersBefore = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
    await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
      .find((button) => button.textContent === 'API access').click());
    await page.locator('[data-edit-scope]').check(); await page.locator('[data-enable]').click();
    await page.waitForFunction(() => !document.querySelector('[data-download-ticket]').disabled);
    const downloadEvent = page.waitForEvent('download'); await page.locator('[data-download-ticket]').click();
    const ticketPath = await (await downloadEvent).path();
    const client = sessionClient(ticketPath); const ready = await client.next();
    assert.equal(ready.mode, 'session');
    const inspected = await client.send({ command: 'inspect' });
    assert.equal(inspected.mode, 'inspected'); assert.equal(inspected.discovery.components.length, 3);
    assert.equal(inspected.discovery.nets.length, 3);
    const first = await client.send({ command: 'apply', plan }); assert.equal(first.mode, 'edited', JSON.stringify(first));
    const afterFirst = await client.send({ command: 'inspect' });
    assert.deepEqual(afterFirst.discovery.nets.filter((net) => net.id.startsWith('api-net-')).map((net) => net.id).sort(),
      ['api-net-drive', 'api-net-ground', 'api-net-series']);
    assert.equal(afterFirst.discovery.components.filter((item) => !item.id.startsWith('api-')).length, 3);
    const undoneFirst = await client.send({ command: 'undo', transaction_id: first.transaction_id });
    assert.equal(undoneFirst.mode, 'undone');
    await new Promise((resolve) => setTimeout(resolve, 10_100));
    const restoredFirst = await client.send({ command: 'inspect' });
    assert.equal(restoredFirst.discovery.components.length, 3); assert.equal(restoredFirst.discovery.nets.length, 3);
    const second = await client.send({ command: 'apply', plan }); assert.equal(second.mode, 'edited');
    assert.notEqual(second.transaction_id, first.transaction_id);
    const afterSecond = await client.send({ command: 'inspect' }); assert.equal(afterSecond.discovery.nets.length, 6);
    const undoneSecond = await client.send({ command: 'undo', transaction_id: second.transaction_id });
    assert.equal(undoneSecond.mode, 'undone');
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const restoredSecond = await client.send({ command: 'inspect' });
    assert.equal(restoredSecond.discovery.components.length, 3); assert.equal(restoredSecond.discovery.nets.length, 3);
    assert.equal(second.transaction_id.split(':').slice(0, 2).join(':'),
      first.transaction_id.split(':').slice(0, 2).join(':'));
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), before);
    await page.locator('[data-revoke]').click();
    const revoked = await client.send({ command: 'inspect' });
    assert.equal(revoked.status, 'rejected'); assert.match(revoked.code, /API_(AUTH_REQUIRED|OWNER_GONE)/u);
    await client.done;
    assert.equal(client.stderr().includes('pairing_secret'), false);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore);
    assert.deepEqual(buildRequests, []);
    await assert.rejects(stat(ticketPath));
    process.stdout.write(`${JSON.stringify({ status: 'pass', pairingClaims: 1, initialComponents: 3, initialNets: 3,
      firstTransaction: first.transaction_id, secondTransaction: second.transaction_id,
      revoked: revoked.code, ticketDeleted: true, buildRequests: 0, workerCreations: 0 })}\n`);
    await context.close();
  } finally {
    await browser.close(); await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
