// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const { createReadStream } = require('node:fs');
const { createServer } = require('node:http');
const { stat } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES
  || '/root/.npm/_npx/fd3bca3c548369c0/node_modules', 'playwright'));

const profiles = ['board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1'];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8' };
const post = async (origin, operation, value = {}, capability = null) => (await fetch(`${origin}/api/session/v1`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(capability ? { Authorization: `Bearer ${capability}` } : {}) },
  body: JSON.stringify({ operation, ...value }),
})).json();
const resultFor = async (origin, claim, requestId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = await post(origin, 'result.read', { sessionId: claim.sessionId, requestId }, claim.clientCapability);
    if (value.code !== 'API_RESULT_PENDING') return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('RESULT_TIMEOUT');
};

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
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const buildRequests = []; page.on('request', (request) => { if (/\/api\/build/u.test(request.url())) buildRequests.push(request.url()); });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    const results = [];
    for (const [index, profile] of profiles.entries()) {
      await page.selectOption('#board-select', profile);
      await page.waitForFunction((expected) => document.querySelector('#board-select').value === expected, profile);
      await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
        .find((button) => button.textContent === 'API access').click());
      const dialog = page.locator('#browser-session-api-dialog');
      if (await dialog.locator('[data-revoke]').isEnabled()) await dialog.locator('[data-revoke]').click();
      await dialog.locator('[data-edit-scope]').check();
      await dialog.locator('[data-enable]').click();
      await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
      const secret = await dialog.locator('[data-secret]').inputValue();
      const claim = await post(origin, 'pairing.claim', { pairingSecret: secret,
        scopes: ['discover', 'read_project', 'edit_circuit'] });
      assert.equal(claim.ok, true, `${profile} claim`);
      const beforeLabels = await page.evaluate((selected) => {
        const components = selected === 'board.atmega328p-16mhz-v1'
          ? window.__M6_PROJECT__().circuit.components
          : window[selected === 'board.rp2040-pico-v1' ? '__RP2040_PUBLIC_WORKBENCH__'
            : selected === 'board.esp32-c3-devmodule-v1' ? '__ESP32C3_PUBLIC_WORKBENCH__'
              : '__STM32_PUBLIC_WORKBENCH__'].state().circuitEditor.draft.components;
        return Object.fromEntries(components.filter((item) => ['resistor-1', 'led-1'].includes(item.id))
          .map((item) => [item.id, item.label]));
      }, profile);
      const editId = `four-profile-edit-${index}`;
      const edit = { schema: 'intent-mcu-browser-session-request@1', request_id: editId,
        session_id: claim.sessionId, project_id: claim.projectId, expected_revision: claim.revision,
        sequence: 1, command: 'edit.batch', arguments: { commands: [{ command: 'component.property.set',
          component_id: 'resistor-1', key: 'ohms', value: 330 }, { command: 'component.property.set',
          component_id: 'led-1', key: 'color', value: 'blue' }] } };
      assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId, request: edit }, claim.clientCapability)).ok, true);
      const edited = await resultFor(origin, claim, editId);
      assert.equal(edited.status, 'accepted', `${profile} edit`);
      const ohms = await page.evaluate((selected) => {
        if (selected === 'board.atmega328p-16mhz-v1') return window.__M6_PROJECT__().circuit.components
          .find((item) => item.id === 'resistor-1').properties.ohms;
        const key = selected === 'board.rp2040-pico-v1' ? '__RP2040_PUBLIC_WORKBENCH__'
          : selected === 'board.esp32-c3-devmodule-v1' ? '__ESP32C3_PUBLIC_WORKBENCH__' : '__STM32_PUBLIC_WORKBENCH__';
        return window[key].state().circuitEditor.draft.components.find((item) => item.id === 'resistor-1').properties.ohms;
      }, profile);
      assert.equal(ohms, 330);
      const labels = await page.evaluate((selected) => {
        const key = selected === 'board.atmega328p-16mhz-v1' ? null
          : selected === 'board.rp2040-pico-v1' ? '__RP2040_PUBLIC_WORKBENCH__'
            : selected === 'board.esp32-c3-devmodule-v1' ? '__ESP32C3_PUBLIC_WORKBENCH__' : '__STM32_PUBLIC_WORKBENCH__';
        const components = key ? window[key].state().circuitEditor.draft.components
          : window.__M6_PROJECT__().circuit.components;
        const values = Object.fromEntries(components.filter((item) => ['resistor-1', 'led-1'].includes(item.id))
          .map((item) => [item.id, item.label]));
        const root = key ? document.querySelector(selected === 'board.rp2040-pico-v1' ? '#pico-editor-components'
          : selected === 'board.esp32-c3-devmodule-v1' ? '#c3-editor-components' : '#stm32-editor-components')
          : document.querySelector('#component-layer');
        return { values, resistorText: root.querySelector('[data-component-id="resistor-1"]')?.textContent ?? '',
          resistorAria: root.querySelector('[data-component-id="resistor-1"]')?.getAttribute('aria-label') ?? '' };
      }, profile);
      if (profile === 'board.atmega328p-16mhz-v1') assert.deepEqual(labels.values, beforeLabels);
      else {
        assert.equal(labels.values['resistor-1'], '330 Ω series resistor');
        assert.equal(labels.values['led-1'], 'External blue LED');
        assert.match(labels.resistorText, /330 Ω series resistor/u);
        assert.match(labels.resistorAria, /330 Ω series resistor/u);
      }
      const undoId = `four-profile-undo-${index}`;
      const undo = { ...edit, request_id: undoId, expected_revision: edited.revision_after, sequence: 2,
        command: 'edit.undo', arguments: { transaction_id: edited.transaction_id } };
      assert.equal((await post(origin, 'request.submit', { sessionId: claim.sessionId, request: undo }, claim.clientCapability)).ok, true);
      assert.equal((await resultFor(origin, claim, undoId)).status, 'accepted', `${profile} undo`);
      const restoredLabels = await page.evaluate((selected) => {
        const components = selected === 'board.atmega328p-16mhz-v1'
          ? window.__M6_PROJECT__().circuit.components
          : window[selected === 'board.rp2040-pico-v1' ? '__RP2040_PUBLIC_WORKBENCH__'
            : selected === 'board.esp32-c3-devmodule-v1' ? '__ESP32C3_PUBLIC_WORKBENCH__'
              : '__STM32_PUBLIC_WORKBENCH__'].state().circuitEditor.draft.components;
        return Object.fromEntries(components.filter((item) => ['resistor-1', 'led-1'].includes(item.id))
          .map((item) => [item.id, item.label]));
      }, profile);
      assert.deepEqual(restoredLabels, beforeLabels, `${profile} label undo`);
      await dialog.locator('[data-revoke]').click(); await dialog.locator('[data-close]').click();
      results.push(profile);
    }
    assert.deepEqual(buildRequests, []);
    process.stdout.write(`${JSON.stringify({ status: 'pass', profiles: results, buildRequests: 0 })}\n`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
