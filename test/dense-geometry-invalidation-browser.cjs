// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.DENSE_GEOMETRY_URL || 'http://127.0.0.1:18788';

function graph(project) { return project.candidateCircuit ?? project.circuit; }
function layout(project) { return project.candidateLayout ?? project.layout; }

async function openProject(page, text, name = 'geometry.intent-mcu.json') {
  await page.setInputFiles('#project-open-input', {
    name, mimeType: 'application/json', buffer: Buffer.from(text),
  });
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
}

async function geometry(page) {
  return page.evaluate(() => {
    const documentProject = window.__M6_PROJECT__();
    const currentGraph = documentProject.candidateCircuit ?? documentProject.circuit;
    const endpointKeys = new Set(currentGraph.nets.flatMap((net) => net.endpoints.map(
      (endpoint) => `${endpoint.component}.${endpoint.pin}`,
    )));
    const routes = [...document.querySelectorAll('#circuit-wires .circuit-wire')].map((route) => {
      const endpoint = route.dataset.endpoint;
      const anchor = document.querySelector(`.pin-anchor[data-endpoint="${endpoint}"]`);
      const card = anchor?.closest('.circuit-component');
      const overlay = card?.querySelector(`.component-wire-overlay-path[data-endpoint="${endpoint}"]:not(.proposal)`);
      const terminal = card?.querySelector(`[data-terminal-pin="${endpoint.slice(endpoint.lastIndexOf('.') + 1)}"]`);
      if (!anchor || !card || !terminal) return { endpoint, missing: true };
      const point = route.getPointAtLength(0);
      const routePoint = new DOMPoint(point.x, point.y).matrixTransform(route.getScreenCTM());
      const anchorBox = anchor.getBoundingClientRect();
      const terminalBox = terminal.getBoundingClientRect();
      const anchorPoint = { x: anchorBox.left + anchorBox.width / 2, y: anchorBox.top + anchorBox.height / 2 };
      const terminalPoint = { x: terminalBox.left + terminalBox.width / 2, y: terminalBox.top + terminalBox.height / 2 };
      return {
        endpoint,
        graphEndpoint: endpointKeys.has(endpoint),
        ownOverlay: Boolean(overlay),
        anchorDistance: Math.hypot(routePoint.x - anchorPoint.x, routePoint.y - anchorPoint.y),
        terminalDistance: Math.hypot(routePoint.x - terminalPoint.x, routePoint.y - terminalPoint.y),
        routePoint: { x: routePoint.x, y: routePoint.y },
      };
    });
    return {
      componentCount: currentGraph.components.length,
      netCount: currentGraph.nets.length,
      endpointCount: endpointKeys.size,
      routeCount: routes.length,
      routes,
      project: documentProject,
      browserErrors: window.__DENSE_GEOMETRY_ERRORS__ ?? [],
    };
  });
}

function assertFreshGeometry(value, label) {
  assert.equal(value.routeCount, value.endpointCount, `${label}: route/endpoint count mismatch`);
  assert(value.routes.every((route) => !route.missing && route.graphEndpoint && route.ownOverlay
    && route.anchorDistance <= 0.75 && route.terminalDistance <= 0.75),
  `${label}: ${JSON.stringify(value.routes.filter((route) => route.missing || !route.graphEndpoint
    || !route.ownOverlay || route.anchorDistance > 0.75 || route.terminalDistance > 0.75).slice(0, 5))}`);
  assert.deepEqual(value.browserErrors, [], `${label}: browser errors`);
}

(async () => {
  const { createMaximumSupportedGraphFixture } = await import('./maximum-supported-graph-fixture.mjs');
  const fixture = createMaximumSupportedGraphFixture();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(180_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => { window.__DENSE_GEOMETRY_ERRORS__ = []; });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    await openProject(page, fixture.text, 'maximum.intent-mcu.json');
    await page.waitForFunction(() => (window.__M6_PROJECT__().candidateCircuit?.nets.length) === 128);
    const original = await geometry(page);
    assertFreshGeometry(original, 'initial maximum open');

    const originalPosition = layout(original.project).positions['lcd-1'];
    await page.evaluate(() => {
      document.querySelector('[data-component-id="lcd-1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    await page.waitForFunction((x) => window.__M6_PROJECT__().candidateLayout.positions['lcd-1'].x !== x, originalPosition.x);
    const moved = await geometry(page);
    assertFreshGeometry(moved, 'move');
    assert.notDeepEqual(layout(moved.project).positions['lcd-1'], originalPosition);

    await page.click('#rotate-component');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateLayout.positions['lcd-1'].rotation === 90);
    assertFreshGeometry(await geometry(page), 'rotate');
    await page.click('#undo');
    await page.click('#undo');
    await page.waitForFunction((x) => window.__M6_PROJECT__().candidateLayout.positions['lcd-1'].x === x, originalPosition.x);
    assertFreshGeometry(await geometry(page), 'move/rotate undo');

    const beforeCandidateReconnect = JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__()));
    await page.locator('.wire-segment-hit[data-net="net-0"][data-endpoint="lcd-1.RS"]').first().focus();
    await page.click('#reconnect-mode');
    await page.locator('.pin-anchor[data-endpoint="lcd-63.D7"]').evaluate((anchor) => {
      const box = anchor.getBoundingClientRect();
      anchor.dispatchEvent(new MouseEvent('click', {
        bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
      }));
    });
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.nets
      .find((net) => net.id === 'net-0').endpoints
      .some((endpoint) => endpoint.component === 'lcd-63' && endpoint.pin === 'D7'));
    const reconnectedCandidate = JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__()));
    assert.notEqual(reconnectedCandidate, beforeCandidateReconnect, 'candidate reconnect did not change the project');
    assertFreshGeometry(await geometry(page), 'candidate reconnect');
    await page.click('#undo');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.nets
      .find((net) => net.id === 'net-0').endpoints
      .some((endpoint) => endpoint.component === 'lcd-1' && endpoint.pin === 'RS'));
    assert.equal(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())), beforeCandidateReconnect,
      'candidate reconnect Undo did not restore the exact project');
    assertFreshGeometry(await geometry(page), 'candidate reconnect undo');
    await page.click('#redo');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.nets
      .find((net) => net.id === 'net-0').endpoints
      .some((endpoint) => endpoint.component === 'lcd-63' && endpoint.pin === 'D7'));
    assert.equal(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())), reconnectedCandidate,
      'candidate reconnect Redo did not restore the exact project');
    assertFreshGeometry(await geometry(page), 'candidate reconnect redo');

    await page.evaluate(() => document.querySelector('[data-component-id="lcd-1"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.click('#delete-component');
    await page.waitForFunction(() => !window.__M6_PROJECT__().candidateCircuit.components.some((item) => item.id === 'lcd-1'));
    const deleted = await geometry(page);
    assertFreshGeometry(deleted, 'delete');
    assert(deleted.routes.every((route) => !route.endpoint.startsWith('lcd-1.')), 'delete retained stale lcd-1 route');
    await page.click('#undo');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components.some((item) => item.id === 'lcd-1'));
    assertFreshGeometry(await geometry(page), 'delete undo');

    await openProject(page, fixture.text, 'maximum-reopen.intent-mcu.json');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.nets.length === 128);
    assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__()), fixture.project);
    assertFreshGeometry(await geometry(page), 'reopen');

    const unsafe = structuredClone(fixture.project);
    unsafe.candidateCircuit.nets[1].endpoints[0] = structuredClone(unsafe.candidateCircuit.nets[0].endpoints[0]);
    const beforeUnsafe = JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__()));
    await openProject(page, JSON.stringify(unsafe), 'unsafe.intent-mcu.json');
    await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Open rejected'));
    assert.equal(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())), beforeUnsafe,
      'unsafe open replaced the accepted project');
    assertFreshGeometry(await geometry(page), 'unsafe open rejection');

    await page.click('#project-new');
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.selectOption('#example-select', 'blink');
    await page.click('#project-demo');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.some((item) => item.id === 'resistor-1'));
    await page.click('#component-layer [data-component-id="resistor-1"]');
    await page.locator('[data-property="ohms"]').fill('330');
    await page.locator('[data-property="ohms"]').dispatchEvent('change');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components
      .find((item) => item.id === 'resistor-1').properties.ohms === 330);
    assertFreshGeometry(await geometry(page), 'property change');
    await page.click('#undo');
    assertFreshGeometry(await geometry(page), 'property undo');

    await page.locator('.wire-segment-hit[data-net="net-example-1"][data-endpoint="board-1.D13"]').first().focus();
    await page.click('#reconnect-mode');
    await page.locator('.pin-anchor[data-endpoint="board-1.D12"]').click({ force: true });
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.nets
      .find((net) => net.id === 'net-example-1').endpoints.some((endpoint) => endpoint.component === 'board-1' && endpoint.pin === 'D12'));
    assertFreshGeometry(await geometry(page), 'v2 reconnect');
    await page.click('#undo');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.nets
      .find((net) => net.id === 'net-example-1').endpoints.some((endpoint) => endpoint.component === 'board-1' && endpoint.pin === 'D13'));
    assertFreshGeometry(await geometry(page), 'v2 reconnect undo');

    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ ok: true, maximum: fixture.counts,
      operations: ['move', 'rotate', 'property', 'delete', 'candidate-reconnect', 'candidate-reconnect-undo-redo', 'v2-reconnect', 'undo', 'open', 'unsafe-open'],
      freshGeometry: true, staleAcceptance: false })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
