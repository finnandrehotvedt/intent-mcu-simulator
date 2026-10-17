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
  { name: 'RP2040 Pico', option: 'board.rp2040-pico-v1', global: '__RP2040_PUBLIC_WORKBENCH__',
    wire: '#pico-editor-wires', bend: '#pico-add-bend', nudge: '#pico-route-forward',
    colour: '#pico-wire-color', status: '#pico-wire-state', save: '#pico-save', open: '#pico-open-input' },
  { name: 'ESP32-C3', option: 'board.esp32-c3-devmodule-v1', global: '__ESP32C3_PUBLIC_WORKBENCH__',
    wire: '#c3-editor-wires', bend: '#c3-add-bend', nudge: '#c3-route-back',
    colour: '#c3-wire-color', status: '#c3-wire-state', save: '#c3-save', open: '#c3-open-input' },
  { name: 'STM32F429ZI', option: 'board.stm32f429zi-nucleo144-v1', global: '__STM32_PUBLIC_WORKBENCH__',
    wire: '#stm32-editor-wires', bend: '#stm32-add-bend', nudge: '#stm32-route-forward',
    colour: '#stm32-wire-color', status: '#stm32-wire-state', save: '#stm32-save', open: '#stm32-open-input' },
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

  for (const profile of profiles) {
    await page.selectOption('#board-select', profile.option);
    await page.waitForFunction(({ global, wire }) => window[global]?.state().active
      && document.querySelectorAll(`${wire} .pico-editor-wire`).length === 3, profile);
    const before = await state(page, profile);
    const beforeAuthority = authority(before);
    await page.evaluate(({ global }) => window[global].selectCircuit({ kind: 'net', id: 'net-series' }), profile);
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
    await page.selectOption('#board-select', profiles[0].option);
    await page.screenshot({ path: path.join(screenshotDirectory, 'bounded-route-authoring-desktop.png'), fullPage: true });
  }
  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
  assert.deepEqual(external, [], `third-party requests: ${JSON.stringify(external)}`);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'passed', profiles: profiles.map((item) => item.name) })}\n`);
})().catch((error) => { console.error(error); process.exit(1); });
