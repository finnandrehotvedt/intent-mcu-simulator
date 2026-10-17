// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.BOUNDED_ROUTE_URL || 'http://127.0.0.1:18781';
const screenshotDirectory = process.env.BOUNDED_ROUTE_SCREENSHOT_DIR || null;
const profiles = [
  { name: 'RP2040 Pico', family: 'architecture.rp2040-v1', option: 'board.rp2040-pico-v1', root: '#pico-public-workbench', global: '__RP2040_PUBLIC_WORKBENCH__',
    wire: '#pico-editor-wires', bend: '#pico-add-bend', nudge: '#pico-route-forward',
    canvas: '#pico-diagram', colour: '#pico-wire-color', status: '#pico-wire-state', save: '#pico-save', open: '#pico-open-input', undo: '#pico-undo' },
  { name: 'ESP32-C3', family: 'architecture.esp32-v1', option: 'board.esp32-c3-devmodule-v1', root: '#c3-public-workbench', global: '__ESP32C3_PUBLIC_WORKBENCH__',
    wire: '#c3-editor-wires', bend: '#c3-add-bend', nudge: '#c3-route-back',
    canvas: '#c3-diagram', colour: '#c3-wire-color', status: '#c3-wire-state', save: '#c3-save', open: '#c3-open-input' },
  { name: 'STM32F429ZI', family: 'architecture.stm32-v1', option: 'board.stm32f429zi-nucleo144-v1', root: '#stm32-public-workbench', global: '__STM32_PUBLIC_WORKBENCH__',
    wire: '#stm32-editor-wires', bend: '#stm32-add-bend', nudge: '#stm32-route-forward',
    canvas: '#stm32-diagram', colour: '#stm32-wire-color', status: '#stm32-wire-state', save: '#stm32-save', open: '#stm32-open-input' },
];

function circuit(state) { return state.circuit ?? state.project.circuit; }
function source(state) { return state.source ?? state.project.source; }
function authority(state) {
  return { source: source(state), artifact: state.artifact, revision: state.revision,
    circuitCode: state.circuitCode, accepted: state.circuitValid ?? state.circuitAccepted };
}

async function state(page, profile) {
  return page.evaluate((global) => structuredClone(window[global].state()), profile.global);
}

async function openSaved(page, profile, savedText) {
  await page.setInputFiles(profile.open, {
    name: `${profile.option}.json`, mimeType: 'application/json', buffer: Buffer.from(savedText),
  });
  const dialog = page.locator('#unsaved-change-dialog[open]');
  if (await dialog.isVisible().catch(() => false)) await page.click('#unsaved-discard');
  await page.waitForFunction(({ global }) =>
    Boolean((window[global].state().circuitEditor.draft.layout.wireRoutes || {})['net-series']),
  { global: profile.global });
}

function positiveCollinearOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  const leftHorizontal = leftStart.y === leftEnd.y;
  const rightHorizontal = rightStart.y === rightEnd.y;
  if (leftHorizontal !== rightHorizontal) return 0;
  const fixed = leftHorizontal ? 'y' : 'x';
  const moving = leftHorizontal ? 'x' : 'y';
  if (Math.abs(leftStart[fixed] - rightStart[fixed]) > 1e-7) return 0;
  return Math.max(0, Math.min(Math.max(leftStart[moving], leftEnd[moving]),
    Math.max(rightStart[moving], rightEnd[moving]))
    - Math.max(Math.min(leftStart[moving], leftEnd[moving]),
      Math.min(rightStart[moving], rightEnd[moving])));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url());
  });
  assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);

  await page.selectOption('#example-select', 'blink');
  await page.click('#project-demo');
  await page.waitForFunction(() => document.querySelectorAll('#circuit-wires .circuit-wire').length === 6);
  const avrCanvasTheme = await page.locator('#circuit-canvas').evaluate((node) => {
    const style = getComputedStyle(node);
    return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage,
      backgroundSize: style.backgroundSize };
  });
  assert.equal(avrCanvasTheme.backgroundColor, 'rgb(8, 20, 31)');
  const avrRoutes = await page.$$eval('#circuit-wires .circuit-wire', (nodes) => nodes.map((node) => ({
    netId: node.dataset.net, points: JSON.parse(node.dataset.points),
  })));
  for (let left = 0; left < avrRoutes.length; left += 1) {
    for (let right = left + 1; right < avrRoutes.length; right += 1) {
      if (avrRoutes[left].netId === avrRoutes[right].netId) continue;
      for (let a = 0; a < avrRoutes[left].points.length - 1; a += 1) {
        for (let b = 0; b < avrRoutes[right].points.length - 1; b += 1) {
          assert.equal(positiveCollinearOverlap(avrRoutes[left].points[a], avrRoutes[left].points[a + 1],
            avrRoutes[right].points[b], avrRoutes[right].points[b + 1]), 0,
          `AVR Blink: distinct nets share a positive-length lane (${avrRoutes[left].netId}/${avrRoutes[right].netId})`);
        }
      }
    }
  }

  for (const profile of profiles) {
    await page.selectOption('#family-select', profile.family);
    await page.selectOption('#board-select', profile.option);
    await page.waitForFunction(({ global, root, wire }) => window[global]?.state().active
      && !document.querySelector(root).hidden
      && document.querySelectorAll(`${wire} .pico-editor-wire`).length === 3, profile);
    const profileCanvasTheme = await page.locator(profile.canvas).evaluate((node) => {
      const style = getComputedStyle(node);
      return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage,
        backgroundSize: style.backgroundSize };
    });
    assert.deepEqual(profileCanvasTheme, avrCanvasTheme,
      `${profile.name}: circuit canvas does not use the shared AVR workbench theme`);
    if (profile.name === 'RP2040 Pico') {
      await page.locator('#pico-diagram').scrollIntoViewIfNeeded();
      const point = await page.locator(`${profile.wire} .pico-editor-wire-hit[data-net="net-gpio0"]`)
        .evaluate((wire) => {
          const local = wire.getPointAtLength(wire.getTotalLength() * 0.5);
          const screen = new DOMPoint(local.x, local.y).matrixTransform(wire.getScreenCTM());
          return { x: screen.x, y: screen.y };
        });
      await page.mouse.click(point.x, point.y);
      assert.deepEqual((await state(page, profile)).circuitEditor.selection, { kind: 'net', id: 'net-gpio0' },
        'Pico: direct pointer click did not select the common default cable');
      const defaultColour = (await state(page, profile)).circuitEditor.draft.layout.wireStyles['net-gpio0'];
      await page.selectOption(profile.colour, '#5f8cff');
      await page.click(profile.undo);
      assert.equal((await state(page, profile)).circuitEditor.draft.layout.wireStyles['net-gpio0'], defaultColour);
      const gpioHit = page.locator(`${profile.wire} .pico-editor-wire-hit[data-net="net-gpio0"]`);
      await gpioHit.focus(); await page.keyboard.press('Enter');
      await page.click(profile.bend);
      assert.match(await page.textContent(profile.status), /Added one orthogonal bend on net-gpio0/);
      assert.equal((await state(page, profile)).circuitEditor.draft.layout.wireRoutes['net-gpio0'].schema,
        'intent-mcu-route@1');
      await page.click(profile.undo);
    }
    const before = await state(page, profile);
    const beforeAuthority = authority(before);
    await page.evaluate(({ global }) => window[global].selectCircuit({ kind: 'net', id: 'net-series' }), profile);
    assert.equal(await page.locator(profile.bend).isVisible(), true,
      `${profile.name}: Add bend is not visible after cable selection`);
    await page.click(profile.bend);
    assert.match(await page.textContent(profile.status), /Added one orthogonal bend/);
    await page.click(profile.nudge);
    assert.match(await page.textContent(profile.status), /Moved one eligible segment/);
    await page.selectOption(profile.colour, '#5f8cff');
    let current = await state(page, profile);
    assert.deepEqual(authority(current), beforeAuthority, `${profile.name}: layout edit changed execution authority`);
    assert.equal(current.circuitEditor.draft.layout.wireStyles['net-series'], '#5f8cff');
    assert.equal(current.circuitEditor.draft.layout.wireRoutes['net-series'].schema, 'intent-mcu-route@1');
    assert.deepEqual(circuit(current).nets, circuit(before).nets, `${profile.name}: layout edit changed topology`);
    assert.equal(await page.locator(`${profile.wire} .pico-editor-wire[data-net="net-series"]`)
      .evaluate((node) => node.dataset.laneConflicts), '0');
    assert.match(await page.locator(`${profile.wire} .pico-editor-wire[data-net="net-series"]`)
      .evaluate((node) => node.getAttribute('style')), /#5f8cff/);

    const exactBeforeBad = current.circuitEditor;
    const net = circuit(current).nets.find((item) => item.id === 'net-series');
    const diagonal = { schema: 'intent-mcu-route@1', branches: net.endpoints.map((endpoint, index) => ({
      endpoint, points: index
        ? [{ x: 0.8, y: 0.8 }, { x: 0.5, y: 0.5 }]
        : [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 }],
    })) };
    const bad = await page.evaluate(({ global, diagonal }) =>
      window[global].setWireRoute('net-series', diagonal), { global: profile.global, diagonal });
    assert.equal(bad.ok, false, `${profile.name}: diagonal route accepted`);
    assert.deepEqual((await state(page, profile)).circuitEditor, exactBeforeBad,
      `${profile.name}: rejected route changed draft or history`);

    const segment = page.locator(`${profile.wire} .pico-editor-segment-hit`).first();
    await segment.focus(); await page.keyboard.press('Enter');
    const beforeEscape = (await state(page, profile)).circuitEditor;
    await page.keyboard.press('Escape');
    assert.deepEqual((await state(page, profile)).circuitEditor, beforeEscape,
      `${profile.name}: Escape changed draft or history`);
    await page.waitForFunction((wire) =>
      document.querySelectorAll(`${wire} .pico-editor-segment-hit.selected`).length === 0, profile.wire);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click(profile.save)]);
    const savedText = fs.readFileSync(await download.path(), 'utf8');
    const saved = JSON.parse(savedText);
    const savedCircuit = saved.project.circuit;
    assert.equal(savedCircuit.layout.wireStyles['net-series'], '#5f8cff');
    assert.equal(savedCircuit.layout.wireRoutes['net-series'].schema, 'intent-mcu-route@1');
    await page.selectOption(profile.colour, '#f04f5f');
    await openSaved(page, profile, savedText);
    await openSaved(page, profile, savedText);
    current = await state(page, profile);
    assert.equal(current.circuitEditor.draft.layout.wireStyles['net-series'], '#5f8cff');
    assert.equal(current.circuitEditor.draft.layout.wireRoutes['net-series'].schema, 'intent-mcu-route@1');
    assert.equal(await page.locator(`${profile.wire} .pico-editor-wire[data-lane-conflicts]:not([data-lane-conflicts="0"])`).count(), 0);
  }

  assert.match(await page.textContent('.bounded-crossing-key'), /crossing.*separate/i);
  if (screenshotDirectory) {
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.selectOption('#family-select', profiles[0].family);
    await page.selectOption('#board-select', profiles[0].option);
    await page.screenshot({ path: path.join(screenshotDirectory, 'bounded-route-authoring-desktop.png'), fullPage: true });
  }
  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
  assert.deepEqual(external, [], `third-party requests: ${JSON.stringify(external)}`);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'passed', profiles: profiles.map((item) => item.name) })}\n`);
})().catch((error) => { console.error(error); process.exit(1); });
