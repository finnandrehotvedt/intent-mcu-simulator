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

const profiles = [
  'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const runCli = (origin, componentId, pairingSecret) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['tools/browser-session-readonly-client.mjs', origin, componentId],
    { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (value) => { stdout += value; });
  child.stderr.on('data', (value) => { stderr += value; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(JSON.parse(stdout))
    : reject(new Error(`${stderr}\nexit ${code}`)));
  child.stdin.end(`${pairingSecret}\n`);
});
const post = async (origin, operation, value = {}, capability = null) => {
  const response = await fetch(`${origin}/api/session/v1`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(capability
      ? { Authorization: `Bearer ${capability}` } : {}) },
    body: JSON.stringify({ operation, ...value }) });
  return response.json();
};

(async () => {
  const { createBrowserSessionRelay } = await import('../src/browser-session-relay.mjs');
  const { createBrowserSessionHttpHandler } = await import('../src/browser-session-http.mjs');
  const relay = createBrowserSessionRelay(); let origin;
  const server = createServer(async (request, response) => {
    const api = createBrowserSessionHttpHandler(relay, { publicOrigin: origin });
    if (await api(request, response)) return;
    const pathname = new URL(request.url, origin).pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (relative.includes('..')) { response.writeHead(400); response.end(); return; }
    const file = path.join(process.cwd(), 'dist', relative);
    try {
      const metadata = await stat(file); if (!metadata.isFile()) throw new Error('not-file');
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store' }); createReadStream(file).pipe(response);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const browserErrors = [];
  const project = (page) => page.evaluate(() => window.__M6_PROJECT__());
  const open = async (profile) => {
    const context = await browser.newContext({ serviceWorkers: 'block' }); const page = await context.newPage();
    page.on('pageerror', (error) => browserErrors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.selectOption('#board-select', profile); await page.waitForTimeout(100);
    await page.waitForTimeout(500);
    const apiButton = page.locator('#workbench-popup-controls button', { hasText: 'API access' });
    assert.equal(await apiButton.count(), 1,
      `${profile}: API owner missing: ${browserErrors.join(' | ')}`);
    await page.locator('#workbench-more > summary').click(); await apiButton.click();
    await page.locator('#browser-session-api-dialog [data-enable]').click();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
    const pairingSecret = await page.locator('#browser-session-api-dialog [data-secret]').inputValue();
    return { context, page, pairingSecret };
  };
  try {
    const observed = [];
    for (const profile of profiles) {
      const active = await open(profile);
      const component = await active.page.evaluate((selected) => {
        if (selected === 'board.atmega328p-16mhz-v1') {
          let project = window.__M6_PROJECT__();
          if (!project.circuit.components.some((item) => item.type === 'led.basic-v1')) {
            window.__M6_ADD__('led.basic-v1'); project = window.__M6_PROJECT__();
          }
          return project.circuit.components.find((item) => item.type === 'led.basic-v1');
        }
        const state = selected === 'board.rp2040-pico-v1' ? window.__RP2040_PUBLIC_WORKBENCH__.state()
          : selected === 'board.esp32-c3-devmodule-v1' ? window.__ESP32C3_PUBLIC_WORKBENCH__.state()
            : window.__STM32_PUBLIC_WORKBENCH__.state();
        const circuit = state.circuit ?? state.project.circuit;
        return circuit.components.find((item) => item.type === 'led.basic-v1');
      }, profile);
      assert(component?.id, `${profile}: placed LED missing`);
      const output = await runCli(origin, component.id, active.pairingSecret);
      assert.deepEqual(output.pins.map((pin) => pin.id), ['ANODE', 'CATHODE']);
      assert(output.pins.every((pin) => Array.isArray(pin.capabilities) && pin.constraints));
      observed.push({ profile, componentId: component.id, pins: output.pins });
      if (observed.length === 1 && process.env.API02_SCREENSHOT) {
        await active.page.waitForFunction(() => document.querySelector(
          '#browser-session-api-dialog [data-secret]').value === '');
        await active.page.screenshot({ path: process.env.API02_SCREENSHOT, fullPage: false });
      }
      await active.page.locator('#browser-session-api-dialog [data-revoke]').click();
      await active.context.close();
    }

    const first = await open(profiles[0]); const second = await open(profiles[0]);
    const firstBefore = await project(first.page); const secondBefore = await project(second.page);
    assert.notEqual(first.pairingSecret, second.pairingSecret);
    const claimA = await post(origin, 'pairing.claim', { pairingSecret: first.pairingSecret,
      scopes: ['discover', 'read_project'] });
    const claimB = await post(origin, 'pairing.claim', { pairingSecret: second.pairingSecret,
      scopes: ['discover', 'read_project'] });
    const cross = await post(origin, 'request.submit', { sessionId: claimB.sessionId, request: {
      schema: 'intent-mcu-browser-session-request@1', request_id: 'cross-read-0001',
      session_id: claimB.sessionId, project_id: claimB.projectId, expected_revision: claimB.revision,
      sequence: 1, command: 'project.inspect', arguments: {} } }, claimA.clientCapability);
    assert.equal(cross.code, 'API_AUTH_REQUIRED');
    assert.deepEqual(await project(first.page), firstBefore);
    assert.deepEqual(await project(second.page), secondBefore);
    await first.page.evaluate(() => {
      const source = document.querySelector('#source'); source.value += '\n// replacement guard';
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await first.page.waitForTimeout(500);
    const afterReplacement = await post(origin, 'request.submit', { sessionId: claimA.sessionId, request: {
      schema: 'intent-mcu-browser-session-request@1', request_id: 'replacement-read-0001',
      session_id: claimA.sessionId, project_id: claimA.projectId, expected_revision: claimA.revision,
      sequence: 1, command: 'project.inspect', arguments: {} } }, claimA.clientCapability);
    assert.equal(afterReplacement.code, 'API_AUTH_REQUIRED');

    const third = await open(profiles[0]);
    const thirdBefore = await project(third.page);
    const claimC = await post(origin, 'pairing.claim', { pairingSecret: third.pairingSecret,
      scopes: ['discover', 'read_project'] });
    await third.page.reload({ waitUntil: 'domcontentloaded' }); await third.page.waitForTimeout(500);
    const afterRefresh = await post(origin, 'request.submit', { sessionId: claimC.sessionId, request: {
      schema: 'intent-mcu-browser-session-request@1', request_id: 'refresh-read-0001',
      session_id: claimC.sessionId, project_id: claimC.projectId, expected_revision: claimC.revision,
      sequence: 1, command: 'project.inspect', arguments: {} } }, claimC.clientCapability);
    assert.equal(afterRefresh.code, 'API_AUTH_REQUIRED');
    assert.deepEqual(await project(third.page), thirdBefore);
    await second.page.locator('#browser-session-api-dialog [data-revoke]').click();
    const afterRevoke = await post(origin, 'request.submit', { sessionId: claimB.sessionId, request: {
      schema: 'intent-mcu-browser-session-request@1', request_id: 'revoke-read-0001',
      session_id: claimB.sessionId, project_id: claimB.projectId, expected_revision: claimB.revision,
      sequence: 1, command: 'project.inspect', arguments: {} } }, claimB.clientCapability);
    assert.equal(afterRevoke.code, 'API_AUTH_REQUIRED');
    assert.deepEqual(await project(second.page), secondBefore);
    await first.context.close(); await second.context.close(); await third.context.close();
    assert.deepEqual(browserErrors, []);
    process.stdout.write(`${JSON.stringify({ status: 'pass', profiles: observed,
      isolation: true, projectReplacementRevoked: true, refreshRevoked: true,
      explicitRevoke: true })}\n`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
