// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.W08_URL || 'http://127.0.0.1:18789';
const stage = (value) => process.stdout.write(`W08_STAGE ${value}\n`);

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
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'ground-reference-branch', pin: 'REF' }, junctionId: 'junction-ground-extra' });
  return session.saveText();
}

async function openProject(page, text, name = 'w08-placement.intent-mcu.json') {
  await page.setInputFiles('#project-open-input', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.waitForFunction(() => window.__M6_PROJECT__()?.candidateCircuit?.components
    .some((component) => component.id === 'ground-reference-branch'));
}

function componentSnapshot(page, id) {
  return page.evaluate((componentId) => {
    const project = window.__M6_PROJECT__();
    const circuit = project.candidateCircuit ?? project.circuit;
    const layout = project.candidateLayout ?? project.layout;
    return {
      component: circuit.components.find((item) => item.id === componentId),
      position: layout.positions[componentId],
      references: circuit.nets.filter((net) => net.endpoints.some(
        (endpoint) => endpoint.component === componentId,
      )).map((net) => net.id),
    };
  }, id);
}

async function exactGeometry(page) {
  return page.evaluate(() => [...document.querySelectorAll('#circuit-wires .circuit-wire')].map((route) => {
    const anchor = document.querySelector(`.pin-anchor[data-endpoint="${route.dataset.endpoint}"]`);
    if (!anchor) return { endpoint: route.dataset.endpoint, missing: true };
    const point = route.getPointAtLength(0);
    const screen = new DOMPoint(point.x, point.y).matrixTransform(route.getScreenCTM());
    const box = anchor.getBoundingClientRect();
    return { endpoint: route.dataset.endpoint, distance: Math.hypot(screen.x - box.left - box.width / 2, screen.y - box.top - box.height / 2) };
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    page.setDefaultTimeout(120_000);
    const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await openProject(page, await preparedProject());
    stage('opened');

    const existingBefore = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__().candidateCircuit.nets));
    await page.locator('.catalog-item[data-type="sensor.temperature-analogue-v1"]').click();
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components.some(
      (component) => component.id === 'temperature-sensor-1',
    ));
    const clicked = await componentSnapshot(page, 'temperature-sensor-1');
    assert.deepEqual(clicked.references, []);
    stage('click-add');

    const canvas = page.locator('#circuit-canvas');
    const canvasBox = await canvas.boundingBox();
    await page.evaluate(() => {
      window.__W08_DRAG_EVENTS__ = [];
      document.querySelector('.catalog-item[data-type="reference.ground-v1"]')
        .addEventListener('dragstart', () => window.__W08_DRAG_EVENTS__.push('dragstart'));
      for (const name of ['dragenter', 'dragover', 'drop']) document.querySelector('#circuit-canvas')
        .addEventListener(name, () => window.__W08_DRAG_EVENTS__.push(name), true);
    });
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    const sourceRow = page.locator('.catalog-item[data-type="reference.ground-v1"]');
    await sourceRow.dispatchEvent('dragstart', { dataTransfer });
    const dropPoint = { clientX: canvasBox.x + canvasBox.width * 0.9, clientY: canvasBox.y + canvasBox.height * 0.4 };
    await canvas.dispatchEvent('dragenter', { dataTransfer, ...dropPoint });
    await canvas.dispatchEvent('dragover', { dataTransfer, ...dropPoint });
    await canvas.dispatchEvent('drop', { dataTransfer, ...dropPoint });
    await sourceRow.dispatchEvent('dragend', { dataTransfer, ...dropPoint });
    await page.waitForTimeout(300);
    const dropState = await page.evaluate(() => ({
      ids: window.__M6_PROJECT__().candidateCircuit.components.map((component) => component.id),
      message: document.querySelector('#project-message')?.textContent,
      events: window.__W08_DRAG_EVENTS__,
    }));
    assert(dropState.ids.includes('ground-reference-2'), JSON.stringify(dropState));
    assert(dropState.events.includes('dragstart') && dropState.events.includes('drop'), JSON.stringify(dropState));
    const dropped = await componentSnapshot(page, 'ground-reference-2');
    assert(Math.abs(dropped.position.x - 0.9) <= 0.02, JSON.stringify(dropped.position));
    assert(Math.abs(dropped.position.y - 0.4) <= 0.02, JSON.stringify(dropped.position));
    stage('drag-add');

    await page.locator('.circuit-component[data-component-id="temperature-sensor-1"]').click();
    await page.click('#duplicate-component');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components.some(
      (component) => component.id === 'temperature-sensor-2',
    ));
    const copy = await componentSnapshot(page, 'temperature-sensor-2');
    assert.equal(copy.component.type, clicked.component.type);
    assert.deepEqual(copy.component.properties, clicked.component.properties);
    assert.deepEqual(copy.component.controls, clicked.component.controls);
    assert.deepEqual(copy.references, []);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__().candidateCircuit.nets)), existingBefore);
    stage('duplicate');

    const card = page.locator('.circuit-component[data-component-id="temperature-sensor-2"]');
    const cardBox = await card.boundingBox();
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cardBox.x + cardBox.width / 2 - 70, cardBox.y + cardBox.height / 2 + 50, { steps: 8 });
    await page.mouse.up();
    const pointerMoved = await componentSnapshot(page, 'temperature-sensor-2');
    assert.notDeepEqual(pointerMoved.position, copy.position);
    stage('pointer-move');

    await card.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('r');
    const keyboardMoved = await componentSnapshot(page, 'temperature-sensor-2');
    assert.equal(keyboardMoved.position.rotation, 90);
    assert(keyboardMoved.position.x > pointerMoved.position.x);
    stage('keyboard-move-rotate');

    await page.keyboard.press('Delete');
    await page.waitForFunction(() => !window.__M6_PROJECT__().candidateCircuit.components.some(
      (component) => component.id === 'temperature-sensor-2',
    ));
    await page.click('#undo');
    stage('delete-undo-redo');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components.some(
      (component) => component.id === 'temperature-sensor-2',
    ));
    assert.deepEqual(await componentSnapshot(page, 'temperature-sensor-2'), keyboardMoved);
    await page.click('#redo');
    await page.waitForFunction(() => !window.__M6_PROJECT__().candidateCircuit.components.some(
      (component) => component.id === 'temperature-sensor-2',
    ));
    await page.click('#undo');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    const downloadedText = fs.readFileSync(await download.path(), 'utf8');
    await openProject(page, downloadedText);
    assert.deepEqual(await componentSnapshot(page, 'temperature-sensor-2'), keyboardMoved);
    assert.equal(await page.locator('#run').isDisabled(), true);
    stage('save-open');

    await page.selectOption('#selected-net', 'net-ground-branch');
    const branchButton = page.locator('#wire-bends button', { hasText: 'ground-reference-branch.REF' }).first();
    await branchButton.click();
    await page.waitForFunction(() => document.querySelector('#net-members')?.textContent
      .includes('Selected branch: ground-reference-branch.REF'));
    assert.equal(await page.locator('.wire-segment-hit.selected[data-endpoint="ground-reference-branch.REF"]').count() > 0, true);
    assert.equal(await page.locator('.junction-dot[data-net="net-ground-branch"]').count(), 1);
    const screenshot = process.env.W08_SCREENSHOT;
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });
    stage('branch-recipe');

    const geometry = await exactGeometry(page);
    assert(geometry.every((route) => !route.missing && route.distance <= 0.75), JSON.stringify(geometry.filter((route) => route.missing || route.distance > 0.75)));
    const width = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
    assert.equal(width[0], width[1]);
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, requirement: 'W08', clickAdd: true, dragAdd: true,
      duplicate: true, pointerMove: true, keyboardMoveRotateDelete: true, undoRedo: true,
      saveOpen: true, branchRecipe: true, exactPinAttachment: true, overflow: false })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
