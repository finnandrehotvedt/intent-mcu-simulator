// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createReadStream } = require('node:fs');
const { createServer } = require('node:http');
const { stat } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const parts = [
  ['diode-1', 'diode-silicon'],
  ['schottky-1', 'diode-schottky'],
  ['zener-1', 'diode-zener'],
];
const profiles = [
  { id: 'board.rp2040-pico-v1', api: '__RP2040_PUBLIC_WORKBENCH__', input: '#pico-open-input',
    file: 'pico-diode-components.intent-mcu.json', layer: '#pico-editor-components' },
  { id: 'board.esp32-c3-devmodule-v1', api: '__ESP32C3_PUBLIC_WORKBENCH__', input: '#c3-open-input',
    file: 'esp32-c3-diode-components.intent-mcu.json', layer: '#c3-editor-components' },
  { id: 'board.stm32f429zi-nucleo144-v1', api: '__STM32_PUBLIC_WORKBENCH__', input: '#stm32-open-input',
    file: 'stm32-diode-components.intent-mcu.json', layer: '#stm32-editor-components' },
];

async function discardIfRequired(page) {
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
}

async function assertArtwork(page, layer = '#component-layer') {
  for (const [id, renderer] of parts) {
    assert.equal(await page.locator(
      `${layer} .circuit-component[data-component-id="${id}"] [data-artwork-key="${renderer}"]`,
    ).count(), 1, `${id}:${renderer}`);
    assert.equal(await page.locator(
      `${layer} .circuit-component[data-component-id="${id}"] [data-terminal-pin]`,
    ).count(), 2, `${id}:terminals`);
  }
}

(async () => {
  let origin;
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, origin).pathname;
    const file = path.join(process.cwd(), 'dist', pathname === '/' ? 'index.html' : pathname.slice(1));
    try {
      if (!(await stat(file)).isFile()) throw new Error('missing');
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(response);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    page.setDefaultTimeout(60_000);
    const errors = []; const outside = []; let buildRequests = 0;
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/page-views', (route) => route.fulfill({ status: 200,
      contentType: 'application/json', body: '{"status":"disabled"}' }));
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(origin).origin) outside.push(request.url());
      if (/\/api\/(?:build|compile)/u.test(url.pathname)) buildRequests += 1;
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#workbench-view-advanced');

    await page.setInputFiles('#project-open-input', {
      name: 'avr-diode-components.intent-mcu.json', mimeType: 'application/json',
      buffer: fs.readFileSync('examples/diode-components/avr-diode-components.intent-mcu.json'),
    });
    await discardIfRequired(page);
    await page.waitForFunction(() => window.__M6_PROJECT__()?.candidateCircuit?.components
      .some(({ id }) => id === 'zener-1'));
    if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
      await page.click('#workbench-project-dialog .workbench-popup-close');
    }
    await assertArtwork(page);
    assert.match(await page.locator('#circuit-diagnostics').textContent(),
      /Build\/Run blocked: DIODE_NONLINEAR_MODEL_UNAVAILABLE/u);
    assert.equal(await page.evaluate(() => window.__M6_PROJECT__().candidateCircuit.nets.length), 4);

    await page.evaluate(() => {
      const select = document.querySelector('#catalog-status'); select.value = 'all';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (const type of ['diode.rectifier-v1', 'diode.schottky-v1', 'diode.zener-v1']) {
      assert.equal(await page.locator(`#catalog-list .catalog-item[data-type="${type}"]`).count(), 1, type);
    }
    if (await page.locator('#workbench-parts-dialog').evaluate((node) => node.open)) {
      await page.click('#workbench-parts-dialog .workbench-popup-close');
    }

    await page.locator('.circuit-component[data-component-id="diode-1"]').click({ force: true });
    await page.click('#toggle-inspector');
    const forwardVoltage = page.locator('#property-editor [data-property="nominalForwardVoltageVolts"]');
    await forwardVoltage.waitFor();
    await forwardVoltage.evaluate((node) => {
      node.value = '0.65'; node.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components
      .find(({ id }) => id === 'diode-1')?.properties.nominalForwardVoltageVolts === 0.65);
    if (await page.locator('#workbench-inspector-dialog').evaluate((node) => node.open)) {
      await page.click('#workbench-inspector-dialog .workbench-popup-close');
    }
    await page.click('#project-files-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    const savedPath = await download.path();
    assert.ok(savedPath && fs.statSync(savedPath).size > 1000);
    await page.setInputFiles('#project-open-input', savedPath);
    await discardIfRequired(page);
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components
      .find(({ id }) => id === 'diode-1')?.properties.nominalForwardVoltageVolts === 0.65);

    for (const profile of profiles) {
      await page.selectOption('#board-select', profile.id);
      await page.waitForFunction(({ api }) => Boolean(window[api]?.state().active), profile);
      await page.setInputFiles(profile.input, {
        name: profile.file, mimeType: 'application/json',
        buffer: fs.readFileSync(`examples/diode-components/${profile.file}`),
      });
      await discardIfRequired(page);
      await page.waitForFunction(({ api }) => {
        const state = window[api].state(); const graph = state.circuit ?? state.project.circuit;
        return graph.components.some(({ id }) => id === 'zener-1');
      }, profile);
      const list = profile.id === 'board.rp2040-pico-v1' ? '#pico-parts-list'
        : profile.id === 'board.esp32-c3-devmodule-v1' ? '#c3-parts-list' : '#stm32-parts-list';
      assert.equal(await page.locator(`${list} .bounded-part-card`).count(), 20);
      await assertArtwork(page, profile.layer);
      const state = await page.evaluate(({ api }) => {
        const value = window[api].state(); const graph = value.circuit ?? value.project.circuit;
        return { validation: value.circuitEditor.validation,
          components: graph.components.length, nets: graph.nets.length };
      }, profile);
      assert.equal(state.validation.ok, false, profile.id);
      assert.match(state.validation.code, /MODEL_LIBRARY_COMPONENT_UNAVAILABLE/u, profile.id);
      assert.equal(state.components, 6, profile.id);
      assert.equal(state.nets, 7, profile.id);
    }

    assert.equal(buildRequests, 0);
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ ok: true, profiles: 4, parts: 3, buildRequests })}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
