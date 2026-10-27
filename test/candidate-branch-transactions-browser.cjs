// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.CANDIDATE_BRANCH_URL || 'http://127.0.0.1:18789';

async function preparedProject() {
  const [{ CandidateEditorSession }, { createGroundReferenceComponent }, { createContactPersistenceExample }] = await Promise.all([
    import('../src/candidate-project-session.mjs'),
    import('../expansion-drafts/ground-reference-integration-v1.mjs'),
    import('../expansion-drafts/contact-persistence-fixture-v1.mjs'),
  ]);
  const session = new CandidateEditorSession(createContactPersistenceExample().project);
  const apply = (command) => {
    const result = session.apply({ ...command, revision: session.revision });
    assert.equal(result.ok, true, `${command.type}: ${result.code}`);
  };
  apply({ type: 'component.add', component: createGroundReferenceComponent('ground-reference-branch'), position: { x: 0.88, y: 0.72 } });
  apply({ type: 'component.add', component: createGroundReferenceComponent('ground-reference-target'), position: { x: 0.88, y: 0.86 } });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'ground-reference-branch', pin: 'REF' }, junctionId: 'junction-ground-extra' });
  return session.saveText();
}

async function openProject(page, text, name = 'branch-transactions.intent-mcu.json') {
  await page.setInputFiles('#project-open-input', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.waitForFunction(() => window.__M6_PROJECT__()?.candidateCircuit?.components
    .some((component) => component.id === 'ground-reference-target'));
}

async function endpointGeometry(page) {
  return page.evaluate(() => {
    const graph = window.__M6_PROJECT__().candidateCircuit;
    const expected = new Set(graph.nets.flatMap((net) => net.endpoints.map((endpoint) => `${endpoint.component}.${endpoint.pin}`)));
    const routes = [...document.querySelectorAll('#circuit-wires .circuit-wire')].map((route) => {
      const endpoint = route.dataset.endpoint;
      const anchor = document.querySelector(`.pin-anchor[data-endpoint="${endpoint}"]`);
      if (!anchor) return { endpoint, missing: true };
      const point = route.getPointAtLength(0);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(route.getScreenCTM());
      const box = anchor.getBoundingClientRect();
      return { endpoint, missing: false, distance: Math.hypot(screen.x - box.left - box.width / 2, screen.y - box.top - box.height / 2) };
    });
    return {
      expected: expected.size,
      routes,
      junction: Boolean(document.querySelector('.junction-dot[data-net="net-ground-branch"]')),
      crossingCopy: document.querySelector('.bounded-crossing-key')?.textContent ?? '',
      width: [document.documentElement.clientWidth, document.documentElement.scrollWidth],
    };
  });
}

(async () => {
  const fixture = await preparedProject();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(120_000);
    await page.route('**/api/page-views', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
    }));
    const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await openProject(page, fixture);

    await page.click('#workbench-project-dialog .workbench-popup-close');
    await page.locator('#workbench-more > summary').click();
    await page.click('#toggle-inspector');
    await page.waitForFunction(() => document.querySelector('#workbench-inspector-dialog').open === true);
    await page.selectOption('#selected-net', 'net-ground-branch');
    const guardedJunction = await page.evaluate(() => ({
      disabled: document.querySelector('#remove-junction').disabled,
      title: document.querySelector('#remove-junction').title,
      explanation: document.querySelector('#net-members').textContent,
      project: JSON.stringify(window.__M6_PROJECT__()),
    }));
    assert.equal(guardedJunction.disabled, true);
    assert.match(guardedJunction.title, /required.*multi-pin.*named branch/i);
    assert.match(guardedJunction.explanation, /removal unavailable.*requires.*explicit junction/i);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), guardedJunction.project);
    await page.click('#workbench-inspector-dialog .workbench-popup-close');

    const before = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    await page.locator('.wire-segment-hit[data-net="net-ground-branch"][data-endpoint="ground-reference-branch.REF"]').first().click({ force: true });
    await page.click('#toggle-inspector');
    await page.click('#reconnect-mode');
    await page.click('#workbench-inspector-dialog .workbench-popup-close');
    await page.locator('.pin-anchor[data-endpoint="ground-reference-target.REF"]').click({ force: true });
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.nets
      .find((net) => net.id === 'net-ground-branch').endpoints
      .some((endpoint) => endpoint.component === 'ground-reference-target'));
    const reconnected = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    assert.notEqual(reconnected, before);

    let geometry = await endpointGeometry(page);
    assert.equal(geometry.routes.length, geometry.expected);
    assert(geometry.routes.every((route) => !route.missing && route.distance <= 0.75), JSON.stringify(geometry.routes.filter((route) => route.missing || route.distance > 0.75)));
    assert.equal(geometry.junction, true);
    assert.match(geometry.crossingCopy, /crossing.*separate/i);
    assert.equal(geometry.width[0], geometry.width[1]);

    await page.locator('.wire-segment-hit[data-net="net-ground-branch"][data-endpoint="ground-reference-target.REF"]').first().click({ force: true });
    await page.click('#toggle-inspector');
    await page.click('#delete-branch');
    await page.click('#workbench-inspector-dialog .workbench-popup-close');
    await page.waitForFunction(() => !window.__M6_PROJECT__().candidateCircuit.nets
      .find((net) => net.id === 'net-ground-branch').endpoints
      .some((endpoint) => endpoint.component === 'ground-reference-target'));
    const branchDeleted = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    await page.click('#project-files-open');
    await page.click('#undo');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.nets
      .find((net) => net.id === 'net-ground-branch').endpoints
      .some((endpoint) => endpoint.component === 'ground-reference-target'));
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), reconnected);
    await page.click('#redo');
    await page.waitForFunction(() => !window.__M6_PROJECT__().candidateCircuit.nets
      .find((net) => net.id === 'net-ground-branch').endpoints
      .some((endpoint) => endpoint.component === 'ground-reference-target'));
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), branchDeleted);
    await page.click('#undo');
    await page.click('#workbench-project-dialog .workbench-popup-close');

    await page.click('#toggle-inspector');
    await page.selectOption('#selected-net', 'net-selector-com');
    await page.click('#delete-wire');
    await page.click('#workbench-inspector-dialog .workbench-popup-close');
    await page.waitForFunction(() => !window.__M6_PROJECT__().candidateCircuit.nets.some((net) => net.id === 'net-selector-com'));
    const netDeleted = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    await page.click('#project-files-open');
    await page.click('#undo');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.nets.some((net) => net.id === 'net-selector-com'));
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), reconnected);
    await page.click('#redo');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), netDeleted);
    await page.click('#undo');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    const downloadedText = fs.readFileSync(await download.path(), 'utf8');
    await openProject(page, downloadedText, download.suggestedFilename());
    await page.waitForFunction(() => document.querySelector('#run').disabled === true);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), reconnected);
    geometry = await endpointGeometry(page);
    assert.equal(geometry.routes.length, geometry.expected);
    assert(geometry.routes.every((route) => !route.missing && route.distance <= 0.75));
    assert.equal(geometry.junction, true);
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, requirements: ['W06', 'W07'], candidateReconnect: true,
      branchDeleteUndoRedo: true, wholeNetDeleteUndoRedo: true, saveOpen: true,
      exactPinAttachment: true, junctionDistinct: true, junctionRemovalGuard: true, overflow: false })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
