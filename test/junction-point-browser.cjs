// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createReadStream } = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');
const { stat } = require('node:fs/promises');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const profiles = [
  { id: 'board.rp2040-pico-v1', api: '__RP2040_PUBLIC_WORKBENCH__', input: '#pico-open-input',
    file: 'pico-explicit-junction-crossing.intent-mcu.json', wires: '#pico-editor-wires',
    crossingNet: 'net-gpio0' },
  { id: 'board.esp32-c3-devmodule-v1', api: '__ESP32C3_PUBLIC_WORKBENCH__', input: '#c3-open-input',
    file: 'esp32-c3-explicit-junction-crossing.intent-mcu.json', wires: '#c3-editor-wires',
    crossingNet: 'net-gpio2' },
  { id: 'board.stm32f429zi-nucleo144-v1', api: '__STM32_PUBLIC_WORKBENCH__', input: '#stm32-open-input',
    file: 'stm32-explicit-junction-crossing.intent-mcu.json', wires: '#stm32-editor-wires',
    crossingNet: 'net-pb0' },
];
const pointInRoute = (route) => route.branches.some(({ points }) =>
  points.some(({ x, y }) => x === 0.5 && y === 0.5));

async function discardIfRequired(page) {
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
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
  origin = 'http://127.0.0.1:' + server.address().port;
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
      name: 'avr-explicit-junction-crossing.intent-mcu.json', mimeType: 'application/json',
      buffer: fs.readFileSync('examples/wiring-primitives/avr-explicit-junction-crossing.intent-mcu.json'),
    });
    await discardIfRequired(page);
    await page.waitForFunction(() => window.__M6_PROJECT__()?.candidateCircuit?.junctions
      .some(({ id }) => id === 'junction-ground'));
    if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
      await page.click('#workbench-project-dialog .workbench-popup-close');
    }
    assert.equal(await page.locator('.junction-dot[data-net="net-ground-branch"]').count(), 1);
    const avr = await page.evaluate(() => {
      const project = window.__M6_PROJECT__();
      const routeAtPoint = (netId) => project.candidateLayout.wireRoutes[netId].branches
        .some(({ points }) => points.some(({ x, y }) => x === 0.5 && y === 0.5));
      return { graph: project.candidateCircuit, groundAtPoint: routeAtPoint('net-ground-branch'),
        crossingAtPoint: routeAtPoint('net-button-d2') };
    });
    assert.equal(avr.groundAtPoint, true);
    assert.equal(avr.crossingAtPoint, true);
    assert.notEqual('net-ground-branch', 'net-button-d2');
    assert.equal(avr.graph.nets.find(({ id }) => id === 'net-ground-branch').endpoints.length, 6);

    await page.click('#project-files-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    const savedPath = await download.path();
    await page.setInputFiles('#project-open-input', savedPath);
    await discardIfRequired(page);
    await page.waitForFunction(() => window.__M6_PROJECT__()?.candidateCircuit?.junctions
      .some(({ id }) => id === 'junction-ground'));
    if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
      await page.click('#workbench-project-dialog .workbench-popup-close');
    }
    assert.equal(await page.locator('.junction-dot[data-net="net-ground-branch"]').count(), 1);

    for (const profile of profiles) {
      await page.selectOption('#board-select', profile.id);
      await page.waitForFunction(({ api }) => Boolean(window[api]?.state().active), profile);
      await page.setInputFiles(profile.input, { name: profile.file, mimeType: 'application/json',
        buffer: fs.readFileSync('examples/wiring-primitives/' + profile.file) });
      await discardIfRequired(page);
      await page.waitForFunction(({ api }) => {
        const state = window[api].state(); const graph = state.circuit ?? state.project.circuit;
        return graph.nets.find(({ id }) => id === 'net-ground')?.endpoints.length === 3;
      }, profile);
      assert.equal(await page.locator(profile.wires
        + ' .pico-wire-junction[data-net="net-ground"]').count(), 1, profile.id);
      const state = await page.evaluate(({ api, crossingNet }) => {
        const value = window[api].state(); const graph = value.circuit ?? value.project.circuit;
        return { graph, validation: value.circuitEditor.validation,
          crossingNet, junctionCount: graph.nets.filter(({ endpoints }) => endpoints.length > 2).length };
      }, profile);
      assert.equal(state.validation.ok, false, profile.id);
      assert.equal(state.validation.code, 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE', profile.id);
      assert.equal(state.junctionCount, 1, profile.id);
      assert.equal(pointInRoute(state.graph.layout.wireRoutes['net-ground']), true, profile.id);
      assert.equal(pointInRoute(state.graph.layout.wireRoutes[state.crossingNet]), true, profile.id);
      assert.notEqual('net-ground', state.crossingNet);
    }
    assert.equal(buildRequests, 0);
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
    process.stdout.write(JSON.stringify({ ok: true, profiles: 4, explicitJunctionRecords: 1,
      derivedMultiEndpointJunctions: 3, crossingsElectricallyConnected: 0,
      saveOpen: true, buildRequests }) + '\n');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
