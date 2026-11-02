// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.PROFILE_PARITY_URL || 'http://127.0.0.1:18891';
const profiles = [
  { id: 'avr', option: 'board.atmega328p-16mhz-v1', layer: '#component-layer', source: '#source',
    canvas: '#circuit-canvas', wireLayer: '#circuit-wires', wireHit: '.wire-segment-hit', endpointAttribute: 'data-endpoint',
    freePin: 'D12', save: '#project-save', open: '#project-open-input', properties: '#property-editor', api: '__M6_PROJECT__' },
  { id: 'pico', option: 'board.rp2040-pico-v1', layer: '#pico-editor-components', source: '#pico-source',
    canvas: '#pico-diagram', wireLayer: '#pico-editor-wires', wireHit: '.pico-editor-wire-hit', endpointAttribute: 'data-pico-endpoint',
    freePin: 'GP1', save: '#pico-save', open: '#pico-open-input', properties: '#pico-part-properties', api: '__RP2040_PUBLIC_WORKBENCH__' },
  { id: 'c3', option: 'board.esp32-c3-devmodule-v1', layer: '#c3-editor-components', source: '#c3-source',
    canvas: '#c3-diagram', wireLayer: '#c3-editor-wires', wireHit: '.pico-editor-wire-hit', endpointAttribute: 'data-c3-endpoint',
    freePin: 'GPIO3', save: '#c3-save', open: '#c3-open-input', properties: '#c3-part-properties', api: '__ESP32C3_PUBLIC_WORKBENCH__' },
  { id: 'stm32', option: 'board.stm32f429zi-nucleo144-v1', layer: '#stm32-editor-components', source: '#stm32-source',
    canvas: '#stm32-diagram', wireLayer: '#stm32-editor-wires', wireHit: '.pico-editor-wire-hit', endpointAttribute: 'data-stm32-endpoint',
    freePin: 'PB1', save: '#stm32-save', open: '#stm32-open-input', properties: '#stm32-part-properties', api: '__STM32_PUBLIC_WORKBENCH__' },
];

async function circuit(page, profile) {
  return page.evaluate((item) => {
    if (item.id === 'avr') {
      const project = window.__M6_PROJECT__(); return { ...project.circuit, layout: project.layout };
    }
    const state = window[item.api].state();
    return item.id === 'pico' ? state.circuit : state.project.circuit;
  }, profile);
}

async function selectProfile(page, profile) {
  await page.selectOption('#board-select', profile.option);
  await page.waitForFunction((option) => document.querySelector('#board-select').value === option, profile.option);
}

async function selectWire(page, profile, netId) {
  const selector = `${profile.wireLayer} ${profile.wireHit}[data-net="${netId}"]`;
  const exact = page.locator(selector).first();
  await exact.waitFor({ state: 'attached' });
  assert.equal(await exact.count(), 1, `${profile.id}: no focusable wire for ${netId}`);
  await exact.focus();
  await page.keyboard.press('Enter');
  const keyboardSelected = await page.evaluate((item) => {
    if (item.id === 'avr') return window.__M6_STATE__.selection.netId;
    const selection = window[item.api].state().circuitEditor.selection;
    return selection.kind === 'net' ? selection.id : null;
  }, profile);
  assert.equal(keyboardSelected, netId, `${profile.id}: focus + Enter selected another wire before Delete`);
}

async function pointerSelectWire(page, profile, netId) {
  const selector = `${profile.wireLayer} ${profile.wireHit}[data-net="${netId}"]`;
  let pointerPoint;
  for (let attempt = 0; attempt < 20 && !Number.isFinite(pointerPoint?.x); attempt += 1) {
    pointerPoint = await page.evaluate(({ selector, netId }) => {
      const diagnostics = [];
      for (const target of document.querySelectorAll(selector)) {
        let x; let y;
        if (target.routeInteraction) [x, y] = target.routeInteraction.midpoint;
        else {
          const length = target.getTotalLength(); const matrix = target.getScreenCTM();
          for (let ratio = 0.05; ratio < 1; ratio += 0.05) {
            const screen = target.getPointAtLength(length * ratio).matrixTransform(matrix);
            const hit = document.elementFromPoint(screen.x, screen.y)?.closest?.('[data-net]');
            if (hit?.dataset.net === netId) return { x: screen.x, y: screen.y };
            if (diagnostics.length < 6) diagnostics.push({ x: screen.x, y: screen.y,
              hit: document.elementFromPoint(screen.x, screen.y)?.className?.baseVal
                ?? document.elementFromPoint(screen.x, screen.y)?.className ?? null });
          }
          continue;
        }
        const hit = document.elementFromPoint(x, y)?.closest?.('[data-net]');
        if (hit?.dataset.net === netId) return { x, y };
      }
      return { diagnostics };
    }, { selector, netId });
    if (!Number.isFinite(pointerPoint.x)) await page.waitForTimeout(50);
  }
  assert(Number.isFinite(pointerPoint.x), `${profile.id}: no ordinary pointer target for ${netId}: ${JSON.stringify(pointerPoint.diagnostics)}`);
  await page.mouse.click(pointerPoint.x, pointerPoint.y);
  const pointerSelected = await page.evaluate((item) => {
    if (item.id === 'avr') return window.__M6_STATE__.selection.netId;
    const selection = window[item.api].state().circuitEditor.selection;
    return selection.kind === 'net' ? selection.id : null;
  }, profile);
  assert.equal(pointerSelected, netId, `${profile.id}: pointer click selected another wire`);
}

async function activateEndpoint(page, profile, endpoint, key = null) {
  const selector = `${profile.id === 'avr' ? '.pin-anchor' : ''}[${profile.endpointAttribute}="${endpoint.component}.${endpoint.pin}"]`;
  const anchor = page.locator(selector);
  assert.equal(await anchor.count(), 1, `${profile.id}: endpoint ${selector} missing`);
  if (key) { await anchor.focus(); await page.keyboard.press(key); } else await anchor.click();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
  });
  const page = await context.newPage();
  const errors = []; const producerRequests = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (request.method() !== 'GET' && /\/api\/(?:build|run)/u.test(new URL(request.url()).pathname)) producerRequests.push(request.url());
  });
  await page.route('**/api/page-views', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"disabled"}' }));
  try {
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    const report = [];

    for (const profile of profiles) {
      await selectProfile(page, profile);
      const beforeAdd = await circuit(page, profile);
      await page.click('#toggle-catalog');
      const picker = page.locator('#simple-parts-mount > [data-component-picker-contract]');
      await picker.locator('.catalog-advanced-filters').evaluate((node) => { node.open = true; });
      await picker.locator('[data-picker-role="status"]').selectOption('all');
      await picker.locator('[data-picker-role="search"]').fill('RES-AXIAL-025W');
      const supportedRow = picker.locator('[data-picker-role="list"] .catalog-item[data-type="resistor.fixed-v1"]');
      assert.equal(await supportedRow.getAttribute('role'), 'button', `${profile.id}: supported resistor was not addable`);
      await supportedRow.click();
      const afterAdd = await circuit(page, profile);
      const added = afterAdd.components.find((component) => !beforeAdd.components.some((old) => old.id === component.id));
      assert.equal(added?.type, 'resistor.fixed-v1', `${profile.id}: visible Add did not add a resistor`);

      await picker.locator('[data-picker-role="search"]').fill('DHT11');
      const unavailable = picker.locator('[data-picker-role="list"] .catalog-item[data-type="sensor.dht11-temperature-humidity-v1"]');
      assert.equal(await unavailable.getAttribute('role'), 'listitem', `${profile.id}: unavailable DHT11 was actionable`);
      assert.equal(await unavailable.getAttribute('data-authoring-available'), 'false', `${profile.id}: unavailable DHT11 claimed authoring`);
      assert((await unavailable.locator('.catalog-profile-limitation').textContent()).trim().length > 20,
        `${profile.id}: unavailable DHT11 had no visible reason`);
      await unavailable.click({ force: true });
      assert.equal((await circuit(page, profile)).components.length, afterAdd.components.length,
        `${profile.id}: unavailable row mutated the circuit`);
      await page.locator('#simple-parts-drawer').press('Escape');

      const addedCard = page.locator(`${profile.layer} [data-component-id="${added.id}"]`);
      assert.equal(await addedCard.count(), 1, `${profile.id}: added resistor was not visible on canvas`);
      const deleteCard = addedCard;
      await deleteCard.click();
      if (profile.id === 'avr') assert.equal(await page.locator('#delete-component').isEnabled(), true,
        `avr: selection missing (${await page.locator('#selection-name').textContent()})`);
      if (profile.id === 'avr') await page.evaluate(() => {
        window.__profileDeleteTrace = [];
        document.addEventListener('keydown', (event) => window.__profileDeleteTrace.push({
          phase: 'capture', key: event.key, target: event.target?.id || event.target?.className,
          selected: window.__M6_STATE__.selection,
        }), { capture: true, once: true });
        window.addEventListener('keydown', (event) => window.__profileDeleteTrace.push({
          phase: 'bubble', key: event.key, target: event.target?.id || event.target?.className,
          selected: window.__M6_STATE__.selection,
        }), { once: true });
      });
      await page.locator(profile.canvas).focus(); await page.keyboard.press('Delete');
      assert.equal((await circuit(page, profile)).components.some((component) => component.id === added.id), false,
        `${profile.id}: Delete failed for ${added.id}; selection=${await page.locator(profile.id === 'avr' ? '#selection-name' : `#${profile.id}-circuit-selection`).textContent()}; state=${JSON.stringify(profile.id === 'avr' ? await page.evaluate(() => ({ selection: window.__M6_STATE__.selection, trace: window.__profileDeleteTrace, active: document.activeElement?.id, wire: document.querySelector('#wire-state')?.textContent, phase: window.__M6_STATE__.buildState })) : null)}`);
      await page.keyboard.press('Control+z');

      assert.equal((await circuit(page, profile)).components.some((component) => component.id === added.id), true,
        `${profile.id}: Ctrl+Z failed`);
      await page.keyboard.press('Control+Shift+z');
      assert.equal((await circuit(page, profile)).components.some((component) => component.id === added.id), false,
        `${profile.id}: redo failed`);
      await page.keyboard.press('Control+z');

      const resistor = page.locator(`${profile.layer} [data-component-id="resistor-1"]`);
      await resistor.click();
      const initialPosition = (await circuit(page, profile)).layout.positions['resistor-1'];
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('r');
      const editedPosition = (await circuit(page, profile)).layout.positions['resistor-1'];
      assert(editedPosition.x > initialPosition.x && editedPosition.rotation === (initialPosition.rotation + 90) % 360,
        `${profile.id}: arrows/R did not move and rotate`);
      await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
      assert.deepEqual((await circuit(page, profile)).layout.positions['resistor-1'], initialPosition,
        `${profile.id}: exact movement undo failed`);
      await page.keyboard.press('Control+Shift+z'); await page.keyboard.press('Control+Shift+z');
      assert.deepEqual((await circuit(page, profile)).layout.positions['resistor-1'], editedPosition,
        `${profile.id}: exact movement redo failed`);

      const beforeDrag = structuredClone((await circuit(page, profile)).layout.positions['resistor-1']);
      const dragBox = await resistor.boundingBox();
      assert(dragBox, `${profile.id}: resistor had no pointer target`);
      await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(dragBox.x + dragBox.width / 2 + 46, dragBox.y + dragBox.height / 2 + 28, { steps: 8 });
      await page.mouse.up();
      const afterDrag = structuredClone((await circuit(page, profile)).layout.positions['resistor-1']);
      assert.notDeepEqual(afterDrag, beforeDrag, `${profile.id}: pointer drag did not move component`);
      await page.keyboard.press('Control+z');
      assert.deepEqual((await circuit(page, profile)).layout.positions['resistor-1'], beforeDrag,
        `${profile.id}: drag Undo was not exact`);
      await page.keyboard.press('Control+Shift+z');
      assert.deepEqual((await circuit(page, profile)).layout.positions['resistor-1'], afterDrag,
        `${profile.id}: drag Redo was not exact`);

      const wired = await circuit(page, profile);
      const series = wired.nets.find((net) => net.endpoints.some((endpoint) => endpoint.component === 'resistor-1')
        && net.endpoints.some((endpoint) => endpoint.component === 'led-1'));
      assert(series && series.endpoints.length === 2, `${profile.id}: supported resistor/LED wire missing`);
      const wireCount = wired.nets.length;
      await selectWire(page, profile, series.id);
      await page.keyboard.press('Delete');
      const disconnected = structuredClone(await circuit(page, profile));
      assert.notDeepEqual(disconnected, wired, `${profile.id}: wire disconnect failed`);
      await page.keyboard.press('Control+z');
      assert.deepEqual(await circuit(page, profile), wired, `${profile.id}: wire disconnect Undo failed`);
      await page.keyboard.press('Control+Shift+z');
      assert.deepEqual(await circuit(page, profile), disconnected, `${profile.id}: wire disconnect Redo failed`);
      await page.keyboard.press('Control+z');
      await selectWire(page, profile, series.id);
      await page.keyboard.press('Delete');
      const disconnectedForConnect = structuredClone(await circuit(page, profile));
      await activateEndpoint(page, profile, series.endpoints[0], 'Space');
      await activateEndpoint(page, profile, series.endpoints[1]);
      const connected = structuredClone(await circuit(page, profile));
      assert(connected.nets.some((net) => series.endpoints.every((endpoint) => net.endpoints.some((candidate) => (
        candidate.component === endpoint.component && candidate.pin === endpoint.pin
      )))), `${profile.id}: Space named-pin connect failed`);
      await page.keyboard.press('Control+z');
      assert.deepEqual(await circuit(page, profile), disconnectedForConnect, `${profile.id}: wire connect Undo failed`);
      await page.keyboard.press('Control+Shift+z');
      assert.deepEqual(await circuit(page, profile), connected, `${profile.id}: wire connect Redo failed`);
      await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
      assert.deepEqual(await circuit(page, profile), wired, `${profile.id}: wire test did not restore original topology`);
      await pointerSelectWire(page, profile, series.id);

      if (!(await page.locator('#workbench-more').evaluate((node) => node.open))) await page.click('#workbench-more > summary');
      await page.click('#firmware-open'); await page.waitForSelector('#workbench-firmware-dialog[open]');
      const sourceBeforeShortcutCheck = await page.locator(profile.source).inputValue();
      await page.locator(profile.source).focus();
      const textFocusPosition = structuredClone((await circuit(page, profile)).layout.positions['resistor-1']);
      await page.keyboard.press('ArrowLeft'); await page.keyboard.press('r'); await page.keyboard.press('Delete');
      assert.deepEqual((await circuit(page, profile)).layout.positions['resistor-1'], textFocusPosition,
        `${profile.id}: text input stole authoring shortcuts`);
      await page.locator(profile.source).fill(sourceBeforeShortcutCheck);
      await page.keyboard.press('Escape');

      await resistor.click(); await page.click('#toggle-inspector');
      await page.waitForSelector('#workbench-inspector-dialog[open]');
      const inspector = page.locator('#workbench-inspector-dialog');
      assert.equal(await inspector.locator('h2').first().textContent(), 'Inspector');
      const input = profile.id === 'avr'
        ? page.locator(`${profile.properties} [data-property="ohms"]`)
        : page.locator(`${profile.properties} [data-bounded-property="ohms"]`);
      const apply = profile.id === 'avr'
        ? page.locator(`${profile.properties} [data-model-property-apply="resistor-1"]`)
        : page.locator(`${profile.properties} [data-bounded-model-apply="resistor-1"]`);
      assert.equal(await input.isVisible(), true, `${profile.id}: resistance field not visible`);
      assert.equal(await inspector.locator('[role="status"]').count() > 0, true, `${profile.id}: Inspector status missing`);
      await input.fill('330'); await apply.click();
      assert.equal((await circuit(page, profile)).components.find((component) => component.id === 'resistor-1').properties.ohms,
        330, `${profile.id}: visible property Apply failed`);
      await page.keyboard.press('Escape');
      if (await page.locator('#workbench-inspector-dialog').evaluate((dialog) => dialog.open)) {
        await page.locator('#workbench-inspector-dialog .workbench-popup-close').click();
      }

      const savedSnapshot = {
        graph: structuredClone(await circuit(page, profile)),
        source: await page.locator(profile.source).inputValue(),
      };
      await page.click('#project-files-open');
      assert.equal(await page.locator(profile.save).isEnabled(), true, `${profile.id}: Save disabled`);
      const downloadPromise = page.waitForEvent('download', { timeout: 8_000 }).catch(() => null);
      await page.click(profile.save);
      const download = await downloadPromise;
      assert(download, `${profile.id}: Save produced no download; status=${await page.locator(profile.id === 'avr' ? '#project-message' : `#${profile.id}-message`).textContent()}`);
      const savedPath = await download.path();
      assert(savedPath && fs.statSync(savedPath).size > 0, `${profile.id}: Save produced no file`);
      await page.keyboard.press('Escape');
      await resistor.click(); await page.keyboard.press('ArrowDown');
      const divergentGraph = structuredClone(await circuit(page, profile));
      assert.notDeepEqual(divergentGraph, savedSnapshot.graph, `${profile.id}: pre-Open state was not observably different`);
      await page.click('#project-files-open'); await page.setInputFiles(profile.open, savedPath);
      if (await page.locator('#unsaved-change-dialog').isVisible()) await page.click('#unsaved-discard');
      await page.waitForFunction(({ item, expectedGraph, expectedSource }) => {
        const project = item.id === 'avr' ? window.__M6_PROJECT__() : window[item.api].state();
        const graph = item.id === 'avr'
          ? { ...project.circuit, layout: project.layout }
          : item.id === 'pico' ? project.circuit : project.project.circuit;
        const source = item.id === 'avr' ? project.source.files[0].content
          : item.id === 'pico' ? project.source : project.project.source;
        return JSON.stringify(graph) === JSON.stringify(expectedGraph) && source === expectedSource;
      }, { item: profile, expectedGraph: savedSnapshot.graph, expectedSource: savedSnapshot.source });
      assert.deepEqual(await circuit(page, profile), savedSnapshot.graph, `${profile.id}: Open did not restore exact saved graph`);
      assert.equal(await page.locator(profile.source).inputValue(), savedSnapshot.source,
        `${profile.id}: Open did not restore exact saved source`);
      assert.equal((await circuit(page, profile)).components.some((component) => component.id === added.id), true,
        `${profile.id}: Open lost the UI-added component`);
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__M11_READY__ === true);
      assert.equal(await page.inputValue('#board-select'), profile.option, `${profile.id}: reload lost active profile`);
      assert.equal((await circuit(page, profile)).components.find((component) => component.id === 'resistor-1').properties.ohms,
        330, `${profile.id}: reload lost saved/opened property`);
      assert.equal((await circuit(page, profile)).components.some((component) => component.id === added.id), true,
        `${profile.id}: reload lost the UI-added component`);
      assert.deepEqual(await circuit(page, profile), savedSnapshot.graph, `${profile.id}: reload lost exact saved graph`);
      assert.equal(await page.locator(profile.source).inputValue(), savedSnapshot.source,
        `${profile.id}: reload lost exact saved source`);
      report.push({ profile: profile.option, addSelect: 'pass', inspector: 'pass', propertyEdit: 'pass',
        moveRotateDeleteUndoRedo: 'pass', pointerDrag: 'pass', namedPinSpaceWireUndoRedo: 'pass',
        keyboardAndTextFocus: 'pass', exactSaveOpenReload: 'pass', unavailableFailClosed: 'pass' });
    }
    await selectProfile(page, profiles[0]);
    await page.click('#beginner-dht11');
    if (await page.locator('#unsaved-change-dialog').isVisible()) await page.click('#unsaved-discard');
    await page.waitForSelector('[data-component-id="dht11-1"]');
    assert.match(await page.locator('#beginner-status').textContent(), /DHT11 loaded/u);
    await page.click('#toggle-catalog');
    const dhtPicker = page.locator('#simple-parts-mount > [data-component-picker-contract]');
    await dhtPicker.locator('[data-picker-role="search"]').fill('DHT11');
    const dhtRow = dhtPicker.locator('.catalog-item[data-type="sensor.dht11-temperature-humidity-v1"]');
    assert.equal(await dhtRow.getAttribute('data-authoring-available'), 'true',
      'AVR DHT11 example did not expose its supported candidate-project row');
    assert.equal(await dhtRow.getAttribute('role'), 'button');
    await page.locator('#simple-parts-drawer').press('Escape');
    assert.deepEqual(producerRequests, [], 'UI parity test unexpectedly called Build/Run');
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ result: 'pass', profiles: report, avrDht11Example: 'pass', producerRequests: 0 })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
