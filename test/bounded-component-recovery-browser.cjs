// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.BOUNDED_RECOVERY_URL || 'http://127.0.0.1:18781';
const screenshotDirectory = process.env.BOUNDED_RECOVERY_SCREENSHOT_DIR || null;
const RESISTOR = 'resistor.fixed-v1';
const LED = 'led.basic-v1';

const allProfiles = [
  {
    name: 'RP2040 Pico', option: 'board.rp2040-pico-v1', boardType: 'board.rp2040-pico-v1',
    global: '__RP2040_PUBLIC_WORKBENCH__', section: '#pico-public-workbench', list: '#pico-parts-list',
    properties: '#pico-part-properties', componentLayer: '#pico-editor-components', wireLayer: '#pico-editor-wires',
    diagram: '#pico-diagram', endpointAttribute: 'data-pico-endpoint', delete: '#pico-delete', undo: '#pico-undo',
    redo: '#pico-redo', save: '#pico-save', openInput: '#pico-open-input', build: '#pico-build', run: '#pico-run',
    stop: '#pico-stop', message: '#pico-message', board: 'pico-1', sourcePin: 'GP0', groundPin: 'GND3',
    resistorSourceLead: 'B', resistorLedLead: 'A', circuitPath: 'circuit', validKey: 'circuitValid',
    terminalBuildPhases: ['built', 'failed', 'blocked'], runTimeout: 20_000,
  },
  {
    name: 'ESP32-C3', option: 'board.esp32-c3-devmodule-v1', boardType: 'board.esp32-c3-devmodule-v1',
    global: '__ESP32C3_PUBLIC_WORKBENCH__', section: '#c3-public-workbench', list: '#c3-parts-list',
    properties: '#c3-part-properties', componentLayer: '#c3-editor-components', wireLayer: '#c3-editor-wires',
    diagram: '#c3-diagram', endpointAttribute: 'data-c3-endpoint', delete: '#c3-delete', undo: '#c3-undo',
    redo: '#c3-redo', save: '#c3-save', openInput: '#c3-open-input', build: '#c3-build', run: '#c3-run',
    stop: '#c3-stop', message: '#c3-message', board: 'c3-1', sourcePin: 'GPIO2', groundPin: 'GND',
    resistorSourceLead: 'A', resistorLedLead: 'B', circuitPath: 'project.circuit', validKey: 'circuitAccepted',
    terminalBuildPhases: ['built', 'failed', 'blocked'], runTimeout: 55_000,
  },
  {
    name: 'STM32F429ZI', option: 'board.stm32f429zi-nucleo144-v1', boardType: 'board.stm32f429zi-nucleo144-v1',
    global: '__STM32_PUBLIC_WORKBENCH__', section: '#stm32-public-workbench', list: '#stm32-parts-list',
    properties: '#stm32-part-properties', componentLayer: '#stm32-editor-components', wireLayer: '#stm32-editor-wires',
    diagram: '#stm32-diagram', endpointAttribute: 'data-stm32-endpoint', delete: '#stm32-delete', undo: '#stm32-undo',
    redo: '#stm32-redo', save: '#stm32-save', openInput: '#stm32-open-input', build: '#stm32-build', run: '#stm32-run',
    stop: '#stm32-stop', message: '#stm32-message', board: 'stm32-1', sourcePin: 'PB0', groundPin: 'GND',
    resistorSourceLead: 'A', resistorLedLead: 'B', circuitPath: 'project.circuit', validKey: 'circuitAccepted',
    terminalBuildPhases: ['built', 'failed', 'blocked'], runTimeout: 130_000,
  },
];
const requestedProfile = process.env.BOUNDED_RECOVERY_PROFILE || null;
const profiles = requestedProfile
  ? allProfiles.filter((profile) => profile.option === requestedProfile || profile.name === requestedProfile)
  : allProfiles;
if (!profiles.length) throw new Error(`Unknown BOUNDED_RECOVERY_PROFILE: ${requestedProfile}`);

function endpoint(profile, component, pin) {
  return `[${profile.endpointAttribute}="${component}.${pin}"]`;
}

async function state(page, profile) {
  return page.evaluate(({ global }) => structuredClone(window[global].state()), profile);
}

function circuit(current, profile) {
  return profile.circuitPath === 'circuit' ? current.circuit : current.project.circuit;
}

async function chooseProfile(page, profile) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.selectOption('#board-select', profile.option);
  await page.waitForFunction(({ global, section, list }) => window[global]?.state().active === true
    && !document.querySelector(section).hidden && document.querySelectorAll(`${list} [role="listitem"]`).length === 3,
  profile);
}

async function saveAndOpen(page, profile) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(profile.save)]);
  const savedPath = await download.path();
  const text = fs.readFileSync(savedPath, 'utf8');
  const saved = JSON.parse(text);
  assert(!Object.hasOwn(saved, 'artifact') && !Object.hasOwn(saved, 'runtime'),
    `${profile.name}: Save retained executable authority`);
  await page.setInputFiles(profile.openInput, {
    name: `${profile.option}-missing.json`, mimeType: 'application/json', buffer: Buffer.from(text),
  });
  await page.waitForFunction(({ global }) => window[global].state().circuitEditor.canUndo === false, profile);
  return saved;
}

async function activate(page, profile, component, pin) {
  await page.locator(endpoint(profile, component, pin)).click();
}

async function reconnectRecovered(page, profile, id) {
  if (id === 'resistor-1') {
    await activate(page, profile, profile.board, profile.sourcePin);
    await activate(page, profile, id, profile.resistorSourceLead);
    await activate(page, profile, id, profile.resistorLedLead);
    await activate(page, profile, 'led-1', 'ANODE');
  } else {
    await activate(page, profile, 'resistor-1', profile.resistorLedLead);
    await activate(page, profile, id, 'ANODE');
    await activate(page, profile, id, 'CATHODE');
    await activate(page, profile, profile.board, profile.groundPin);
  }
  await page.waitForFunction(({ global, validKey }) => window[global].state()[validKey] === true,
    { global: profile.global, validKey: profile.validKey });
}

async function geometry(page, profile) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(
    () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ))));
  return page.evaluate((profile) => {
    const canvas = document.querySelector(profile.diagram).getBoundingClientRect();
    const current = window[profile.global].state();
    const model = profile.circuitPath === 'circuit' ? current.circuit : current.project.circuit;
    const anchors = Object.fromEntries([...document.querySelectorAll(`[${profile.endpointAttribute}]`)].map((node) => {
      const key = node.getAttribute(profile.endpointAttribute);
      const pin = key.slice(key.lastIndexOf('.') + 1);
      const box = node.getBoundingClientRect();
      const terminal = node.closest('.pico-editor-part').querySelector(`[data-terminal-pin="${pin}"]`).getBoundingClientRect();
      return [key, { x: box.left - canvas.left + box.width / 2, y: box.top - canvas.top + box.height / 2,
        terminalX: terminal.left - canvas.left + terminal.width / 2,
        terminalY: terminal.top - canvas.top + terminal.height / 2 }];
    }));
    const bodies = [...document.querySelectorAll(`${profile.componentLayer} .pico-editor-part`)].map((node) => {
      const box = node.getBoundingClientRect();
      return { id: node.dataset.componentId, left: box.left - canvas.left, right: box.right - canvas.left,
        top: box.top - canvas.top, bottom: box.bottom - canvas.top };
    });
    const routes = [...document.querySelectorAll(`${profile.wireLayer} .pico-editor-wire`)].map((node) => {
      const points = JSON.parse(node.dataset.points);
      const net = model.nets.find((candidate) => candidate.id === node.dataset.net);
      const endpointKeys = net.endpoints.map((item) => `${item.component}.${item.pin}`);
      const attached = endpointKeys.every((key) => points.some((point) => Math.hypot(
        point.x - anchors[key].terminalX, point.y - anchors[key].terminalY,
      ) < 1));
      const anchorsMatchTerminals = endpointKeys.every((key) => Math.hypot(
        anchors[key].x - anchors[key].terminalX, anchors[key].y - anchors[key].terminalY,
      ) < 1);
      const crossesBody = points.slice(1).some((end, index) => {
        const start = points[index];
        return bodies.some((body) => {
          const endpointEscape = index === 0 && body.id === net.endpoints[0].component
            || index === points.length - 2 && body.id === net.endpoints[1].component;
          if (endpointEscape) return false;
          if (Math.abs(start.y - end.y) < 0.5) return start.y > body.top && start.y < body.bottom
            && Math.max(start.x, end.x) > body.left && Math.min(start.x, end.x) < body.right;
          if (Math.abs(start.x - end.x) < 0.5) return start.x > body.left && start.x < body.right
            && Math.max(start.y, end.y) > body.top && Math.min(start.y, end.y) < body.bottom;
          return true;
        });
      });
      return { id: net.id, attached, anchorsMatchTerminals, crossesBody, points,
        orthogonal: points.slice(1).every((point, index) => point.x === points[index].x || point.y === points[index].y) };
    });
    return { routes, bodies, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  }, profile);
}

function assertGeometry(value, profile, viewport) {
  assert.equal(value.routes.length, 3, `${profile.name}/${viewport}: ${JSON.stringify(value)}`);
  assert(value.routes.every((route) => route.attached && route.anchorsMatchTerminals
    && route.orthogonal && !route.crossesBody), `${profile.name}/${viewport}: ${JSON.stringify(value)}`);
  assert(value.overflow <= 1, `${profile.name}/${viewport}: horizontal overflow ${value.overflow}`);
}

async function assertAllRotations(page, profile, id, viewport) {
  for (const expected of [90, 180, 270, 0]) {
    await page.evaluate(({ global, id }) => window[global].rotateCircuitComponent(id), { global: profile.global, id });
    await page.waitForFunction(({ global, circuitPath, id, expected }) => {
      const current = window[global].state();
      const model = circuitPath === 'circuit' ? current.circuit : current.project.circuit;
      return model.layout.positions[id].rotation === expected;
    }, { global: profile.global, circuitPath: profile.circuitPath, id, expected });
    assertGeometry(await geometry(page, profile), profile, viewport);
  }
}

async function addFromCatalog(page, profile, type) {
  const selector = `${profile.list} [data-bounded-add="${type}"]`;
  await page.locator(selector).click();
  await page.waitForFunction(({ global, type }) => window[global].state().circuitEditor.catalog.parts
    .find((part) => part.type === type)?.present === true, { global: profile.global, type });
}

async function setNumberProperty(page, profile, value) {
  const input = page.locator(`${profile.properties} [data-bounded-property="ohms"]`);
  await input.fill(String(value));
  await input.dispatchEvent('change');
}

async function buildFresh(page, profile) {
  assert.equal(await page.locator(profile.run).isDisabled(), true, `${profile.name}: Run enabled before fresh Build`);
  await page.click(profile.build);
  await page.waitForFunction(({ global, phases }) => phases.includes(window[global].state().phase),
    { global: profile.global, phases: profile.terminalBuildPhases }, { timeout: 200_000 });
  const built = await state(page, profile);
  assert.equal(built.phase, 'built', `${profile.name}: ${built.message}`);
  assert.equal(built.runnable, true, `${profile.name}: fresh Build did not become runnable`);
  assert(built.artifact, `${profile.name}: fresh Build has no artifact`);
  return built;
}

async function runActual(page, profile) {
  await page.click(profile.run);
  if (profile.global === '__RP2040_PUBLIC_WORKBENCH__') {
    await page.waitForFunction(({ global }) => Boolean(window[global].state().runtime?.instruments?.serial?.text),
      { global: profile.global }, { timeout: profile.runTimeout });
    const current = await state(page, profile);
    assert(!['failed', 'blocked'].includes(current.phase), `${profile.name}: ${current.message}`);
  } else {
    const completePhase = profile.global === '__ESP32C3_PUBLIC_WORKBENCH__' ? 'complete' : 'completed';
    await page.waitForFunction(({ global, completePhase }) => ['failed', 'blocked', completePhase]
      .includes(window[global].state().phase), { global: profile.global, completePhase }, { timeout: profile.runTimeout });
    const current = await state(page, profile);
    assert.equal(current.phase, completePhase, `${profile.name}: ${current.message}`);
    assert.equal(current.runtime?.engine?.actualExecution, true, `${profile.name}: actual execution evidence missing`);
  }
  await page.click(profile.stop);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(210_000);
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url());
  });
  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);

  for (const profile of profiles) {
    await chooseProfile(page, profile);
    let current = await state(page, profile);
    assert.deepEqual(current.circuitEditor.catalog.parts.map((part) => part.type), [profile.boardType, RESISTOR, LED]);
    assert.equal(await page.locator(`${profile.list} [role="listitem"]`).count(), 3);
    assert.equal(await page.locator(`${profile.list} [data-bounded-add="${profile.boardType}"]`).isDisabled(), true);

    const protection = await page.evaluate(({ global, board, boardType }) => {
      const api = window[global];
      api.selectCircuit({ kind: 'component', id: board });
      return {
        board: api.deleteSelected(), duplicate: api.addMissingComponent('resistor.fixed-v1'),
        unsupported: api.addMissingComponent('button.momentary-v1'),
        crossProfile: api.addMissingComponent(boardType === 'board.rp2040-pico-v1'
          ? 'board.esp32-c3-devmodule-v1' : 'board.rp2040-pico-v1'),
      };
    }, { global: profile.global, board: profile.board, boardType: profile.boardType });
    assert.equal(protection.board.ok, false); assert.match(protection.board.code, /BOARD_FIXED$/u);
    assert.equal(protection.duplicate.ok, false); assert.match(protection.duplicate.code, /COMPONENT_EXISTS$/u);
    assert.equal(protection.unsupported.ok, false); assert.match(protection.unsupported.code, /COMPONENT_UNSUPPORTED$/u);
    assert.equal(protection.crossProfile.ok, false); assert.match(protection.crossProfile.code, /COMPONENT_UNSUPPORTED$/u);
    assert.equal(await page.locator(profile.delete).isDisabled(), true, `${profile.name}: fixed board Delete enabled`);

    await page.locator(`${profile.componentLayer} [data-component-id="resistor-1"]`).click();
    await page.click(profile.delete);
    current = await state(page, profile);
    assert.equal(circuit(current, profile).components.some((part) => part.id === 'resistor-1'), false);
    await saveAndOpen(page, profile);
    current = await state(page, profile);
    assert.equal(current.circuitEditor.canUndo, false, `${profile.name}: Open retained old history`);
    assert.equal(current.artifact, null); assert.equal(current.runtime, null);
    assert.equal(circuit(current, profile).nets.some((net) => net.endpoints
      .some((item) => item.component === 'resistor-1')), false);
    await addFromCatalog(page, profile, RESISTOR);
    current = await state(page, profile);
    assert.equal(circuit(current, profile).components.filter((part) => part.id === 'resistor-1').length, 1);
    assert.equal(circuit(current, profile).nets.some((net) => net.endpoints
      .some((item) => item.component === 'resistor-1')), false, `${profile.name}: Add inferred resistor cables`);
    await page.click(profile.undo);
    assert.equal(circuit(await state(page, profile), profile).components.some((part) => part.id === 'resistor-1'), false);
    await page.click(profile.redo);
    assert.equal(circuit(await state(page, profile), profile).components.some((part) => part.id === 'resistor-1'), true);
    await reconnectRecovered(page, profile, 'resistor-1');

    await page.locator(`${profile.componentLayer} [data-component-id="resistor-1"]`).click();
    await setNumberProperty(page, profile, 108);
    current = await state(page, profile);
    assert.equal(circuit(current, profile).components.find((part) => part.id === 'resistor-1').properties.ohms, 220);
    assert.match(current.message, /COMPONENT_PROPERTY_ELECTRICAL_LIMIT/u);
    await setNumberProperty(page, profile, 109);
    assert.equal(circuit(await state(page, profile), profile).components
      .find((part) => part.id === 'resistor-1').properties.ohms, 109);
    await page.locator(`${profile.componentLayer} [data-component-id="led-1"]`).click();
    await page.selectOption(`${profile.properties} [data-bounded-property="color"]`, 'blue');
    await page.locator(`${profile.componentLayer} [data-component-id="resistor-1"]`).click();
    await setNumberProperty(page, profile, 30);
    current = await state(page, profile);
    assert.equal(current[profile.validKey], true, `${profile.name}: bounded blue/30 Ω pair rejected`);
    await buildFresh(page, profile);

    await page.locator(`${profile.componentLayer} [data-component-id="led-1"]`).click();
    await page.click(profile.delete);
    current = await state(page, profile);
    assert.equal(current.artifact, null, `${profile.name}: delete retained artifact`);
    assert.equal(current.runtime, null, `${profile.name}: delete retained runtime`);
    assert.equal(current.runnable, false, `${profile.name}: delete retained runnable authority`);
    await saveAndOpen(page, profile);
    current = await state(page, profile);
    assert.equal(current.circuitEditor.canUndo, false, `${profile.name}: LED Open retained old history`);
    const ledAdd = `${profile.list} [data-bounded-add="${LED}"]`;
    await page.click(ledAdd);
    current = await state(page, profile);
    assert.equal(circuit(current, profile).components.some((part) => part.id === 'led-1'), false,
      `${profile.name}: unsafe red LED recovery was accepted beside 30 Ω`);
    assert.match(current.message, /COMPONENT_PROPERTY_ELECTRICAL_LIMIT/u);

    await page.locator(`${profile.componentLayer} [data-component-id="resistor-1"]`).click();
    await setNumberProperty(page, profile, 109);
    await addFromCatalog(page, profile, LED);
    current = await state(page, profile);
    assert.equal(circuit(current, profile).components.filter((part) => part.id === 'led-1').length, 1);
    assert.equal(circuit(current, profile).nets.some((net) => net.endpoints
      .some((item) => item.component === 'led-1')), false, `${profile.name}: Add inferred LED cables`);
    await page.click(profile.undo);
    assert.equal(circuit(await state(page, profile), profile).components.some((part) => part.id === 'led-1'), false);
    await page.click(profile.redo);
    await reconnectRecovered(page, profile, 'led-1');

    assertGeometry(await geometry(page, profile), profile, 'desktop');
    await assertAllRotations(page, profile, 'resistor-1', 'desktop');
    await assertAllRotations(page, profile, 'led-1', 'desktop');
    if (screenshotDirectory) {
      fs.mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDirectory, `${profile.option}-recovered-desktop.png`),
        fullPage: true, animations: 'disabled' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assertGeometry(await geometry(page, profile), profile, 'mobile');
    await assertAllRotations(page, profile, 'resistor-1', 'mobile');
    await assertAllRotations(page, profile, 'led-1', 'mobile');
    if (screenshotDirectory) {
      await page.screenshot({ path: path.join(screenshotDirectory, `${profile.option}-recovered-mobile.png`),
        fullPage: true, animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    await buildFresh(page, profile);
    await runActual(page, profile);
  }

  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
  assert.deepEqual(external, [], `third-party requests: ${JSON.stringify(external)}`);
  assert.equal((await context.cookies()).length, 0, 'browser set cookies');
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'passed', profiles: profiles.map((profile) => profile.name),
    screenshots: screenshotDirectory })}\n`);
})().catch((error) => { console.error(error); process.exit(1); });
