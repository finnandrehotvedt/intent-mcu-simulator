// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.NAMED_WIRE_URL || 'http://127.0.0.1:18781';
const screenshotDirectory = process.env.NAMED_WIRE_SCREENSHOT_DIR || null;

const profiles = [
  {
    name: 'RP2040 Pico', option: 'board.rp2040-pico-v1', global: '__RP2040_PUBLIC_WORKBENCH__',
    section: '#pico-public-workbench', endpointAttribute: 'data-pico-endpoint', diagram: '#pico-diagram',
    wireLayer: '#pico-editor-wires', componentLayer: '#pico-editor-components', delete: '#pico-delete',
    reconnect: '#pico-reconnect', cancel: '#pico-wire-cancel', status: '#pico-wire-state', build: '#pico-build',
    run: '#pico-run', undo: '#pico-undo', redo: '#pico-redo', rotate: '#pico-rotate', fit: '#pico-fit',
    save: '#pico-save', openInput: '#pico-open-input', sourceNet: 'net-gpio0', boardComponent: 'pico-1',
    boardSourcePin: 'GP0', boardGroundPin: 'GND3', sourceLead: 'B', otherLead: 'A', circuitPath: 'circuit',
    validKey: 'circuitValid', expectedProgressCode: 'RP2040_WIRING_IN_PROGRESS',
  },
  {
    name: 'ESP32-C3', option: 'board.esp32-c3-devmodule-v1', global: '__ESP32C3_PUBLIC_WORKBENCH__',
    section: '#c3-public-workbench', endpointAttribute: 'data-c3-endpoint', diagram: '#c3-diagram',
    wireLayer: '#c3-editor-wires', componentLayer: '#c3-editor-components', delete: '#c3-delete',
    reconnect: '#c3-reconnect', cancel: '#c3-wire-cancel', status: '#c3-wire-state', build: '#c3-build',
    run: '#c3-run', undo: '#c3-undo', redo: '#c3-redo', rotate: '#c3-rotate', fit: '#c3-fit',
    save: '#c3-save', openInput: '#c3-open-input', sourceNet: 'net-gpio2', boardComponent: 'c3-1',
    boardSourcePin: 'GPIO2', boardGroundPin: 'GND', sourceLead: 'A', otherLead: 'B', circuitPath: 'project.circuit',
    validKey: 'circuitAccepted', expectedProgressCode: 'C3_WIRING_IN_PROGRESS',
  },
  {
    name: 'STM32F429ZI', option: 'board.stm32f429zi-nucleo144-v1', global: '__STM32_PUBLIC_WORKBENCH__',
    section: '#stm32-public-workbench', endpointAttribute: 'data-stm32-endpoint', diagram: '#stm32-diagram',
    wireLayer: '#stm32-editor-wires', componentLayer: '#stm32-editor-components', delete: '#stm32-delete',
    reconnect: '#stm32-reconnect', cancel: '#stm32-wire-cancel', status: '#stm32-wire-state', build: '#stm32-build',
    run: '#stm32-run', undo: '#stm32-undo', redo: '#stm32-redo', rotate: '#stm32-rotate', fit: '#stm32-fit',
    save: '#stm32-save', openInput: '#stm32-open-input', sourceNet: 'net-pb0', boardComponent: 'stm32-1',
    boardSourcePin: 'PB0', boardGroundPin: 'GND', sourceLead: 'A', otherLead: 'B', circuitPath: 'project.circuit',
    validKey: 'circuitAccepted', expectedProgressCode: 'STM32_WIRING_IN_PROGRESS',
  },
];

function endpoint(profile, component, pin) {
  return `[${profile.endpointAttribute}="${component}.${pin}"]`;
}

async function state(page, profile) {
  return page.evaluate(({ global }) => structuredClone(window[global].state()), profile);
}

function circuitFromState(value, profile) {
  return profile.circuitPath === 'circuit' ? value.circuit : value.project.circuit;
}

async function selectCable(page, profile, netId) {
  await page.locator(profile.diagram).scrollIntoViewIfNeeded();
  const point = await page.evaluate(({ wireLayer, netId }) => {
    const wire = document.querySelector(`${wireLayer} .pico-editor-wire-hit[data-net="${netId}"]`);
    const length = wire.getTotalLength();
    for (const fraction of [0.18, 0.3, 0.5, 0.7, 0.82]) {
      const local = wire.getPointAtLength(length * fraction);
      const screen = new DOMPoint(local.x, local.y).matrixTransform(wire.getScreenCTM());
      if (document.elementsFromPoint(screen.x, screen.y).includes(wire)) return { x: screen.x, y: screen.y };
    }
    throw new Error(`No clickable route segment for ${netId}`);
  }, { wireLayer: profile.wireLayer, netId });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(({ global, netId }) => {
    const selection = window[global].state().circuitEditor.selection;
    return selection.kind === 'net' && selection.id === netId;
  }, { global: profile.global, netId });
}

async function activatePin(page, profile, component, pin, key = null) {
  const anchor = page.locator(endpoint(profile, component, pin));
  if (key) {
    await anchor.focus();
    await page.keyboard.press(key);
  } else await anchor.click();
}

async function geometry(page, profile) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(
    () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ))));
  return page.evaluate((profile) => {
    const canvas = document.querySelector(profile.diagram).getBoundingClientRect();
    const current = window[profile.global].state();
    const circuit = profile.circuitPath === 'circuit' ? current.circuit : current.project.circuit;
    const anchors = Object.fromEntries([...document.querySelectorAll(`[${profile.endpointAttribute}]`)].map((node) => {
      const key = node.getAttribute(profile.endpointAttribute);
      const pin = key.slice(key.lastIndexOf('.') + 1);
      const box = node.getBoundingClientRect();
      const terminal = node.closest('.pico-editor-part').querySelector(`[data-terminal-pin="${pin}"]`).getBoundingClientRect();
      return [key, {
        x: box.left - canvas.left + box.width / 2, y: box.top - canvas.top + box.height / 2,
        terminalX: terminal.left - canvas.left + terminal.width / 2,
        terminalY: terminal.top - canvas.top + terminal.height / 2,
      }];
    }));
    const bodies = [...document.querySelectorAll(`${profile.componentLayer} .pico-editor-part`)].map((node) => {
      const box = node.getBoundingClientRect();
      return { id: node.dataset.componentId, left: box.left - canvas.left, right: box.right - canvas.left,
        top: box.top - canvas.top, bottom: box.bottom - canvas.top };
    });
    const routes = [...document.querySelectorAll(`${profile.wireLayer} .pico-editor-wire`)].map((node) => {
      const points = JSON.parse(node.dataset.points);
      const net = circuit.nets.find((candidate) => candidate.id === node.dataset.net);
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

function assertGeometry(value, profile) {
  assert.equal(value.routes.length, 3, `${profile.name}: ${JSON.stringify(value)}`);
  assert(value.routes.every((route) => route.attached && route.anchorsMatchTerminals
    && route.orthogonal && !route.crossesBody), `${profile.name}: ${JSON.stringify(value)}`);
  assert(value.overflow <= 1, `${profile.name}: horizontal overflow ${value.overflow}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
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
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.selectOption('#board-select', profile.option);
    await page.waitForFunction(({ global, section, wireLayer }) => window[global]?.state().active
      && !document.querySelector(section).hidden
      && document.querySelectorAll(`${wireLayer} .pico-editor-wire`).length === 3, profile);

    await selectCable(page, profile, 'net-series');
    await page.click(profile.delete);
    let current = await state(page, profile);
    assert.equal(current[profile.validKey], false, `${profile.name}: invalid topology stayed accepted`);
    assert.equal(current.artifact, null, `${profile.name}: invalid topology retained executable`);
    assert.equal(current.runtime, null, `${profile.name}: invalid topology retained runtime`);
    await page.click(profile.build);
    current = await state(page, profile);
    assert.equal(current.phase, 'blocked', `${profile.name}: invalid topology did not block Build`);

    const beforeCancel = current.circuitEditor;
    await activatePin(page, profile, 'resistor-1', profile.otherLead, 'Enter');
    current = await state(page, profile);
    assert.equal(current.circuitEditor.wireDraft.mode, 'connect-target', `${profile.name}: no pending wire state`);
    assert.equal(current.circuitCode, profile.expectedProgressCode, `${profile.name}: pending wire stayed accepted`);
    assert.equal(await page.locator(profile.build).isDisabled(), true, `${profile.name}: Build enabled during wire draft`);
    assert.equal(await page.locator(profile.cancel).isDisabled(), false, `${profile.name}: no visible cancel action`);
    await page.keyboard.press('Escape');
    current = await state(page, profile);
    assert.equal(current.circuitEditor.wireDraft.mode, 'none', `${profile.name}: Escape did not cancel`);
    assert.equal(current.circuitEditor.revision, beforeCancel.revision, `${profile.name}: Escape mutated circuit history`);
    assert.deepEqual(current.circuitEditor.draft, beforeCancel.draft, `${profile.name}: Escape mutated topology`);

    await activatePin(page, profile, 'resistor-1', profile.otherLead);
    await activatePin(page, profile, 'led-1', 'ANODE', 'Space');
    current = await state(page, profile);
    assert.equal(current[profile.validKey], true, `${profile.name}: named-pin cable did not validate`);
    assert(circuitFromState(current, profile).nets.some((net) => net.id === 'net-series'),
      `${profile.name}: stable net-series ID missing`);
    assert.match(await page.textContent(profile.status), /Created cable net-series/);
    assertGeometry(await geometry(page, profile), profile);

    await page.click(profile.undo);
    assert.equal((await state(page, profile))[profile.validKey], false, `${profile.name}: Undo did not remove authored cable`);
    await page.click(profile.redo);
    assert.equal((await state(page, profile))[profile.validKey], true, `${profile.name}: Redo did not restore authored cable`);

    await selectCable(page, profile, 'net-series');
    await page.click(profile.delete);
    await selectCable(page, profile, profile.sourceNet);
    await page.click(profile.reconnect);
    await activatePin(page, profile, 'resistor-1', profile.sourceLead);
    await activatePin(page, profile, 'resistor-1', profile.otherLead);
    current = await state(page, profile);
    assert.equal(current[profile.validKey], false, `${profile.name}: open circuit accepted after reconnect`);
    const source = circuitFromState(current, profile).nets.find((net) => net.id === profile.sourceNet);
    assert(source.endpoints.some((item) => item.component === 'resistor-1' && item.pin === profile.otherLead),
      `${profile.name}: selected endpoint did not move`);
    await activatePin(page, profile, 'resistor-1', profile.sourceLead);
    await activatePin(page, profile, 'led-1', 'ANODE');
    current = await state(page, profile);
    assert.equal(current[profile.validKey], true, `${profile.name}: reconnected topology did not validate`);
    assert.deepEqual(circuitFromState(current, profile).nets.map((net) => net.id).sort(),
      [profile.sourceNet, 'net-ground', 'net-series'].sort(), `${profile.name}: stable net IDs changed`);

    const beforeOccupied = current.circuitEditor;
    await activatePin(page, profile, profile.boardComponent, profile.boardSourcePin);
    current = await state(page, profile);
    assert.equal(current.circuitEditor.revision, beforeOccupied.revision, `${profile.name}: occupied pin changed history`);
    assert.deepEqual(current.circuitEditor.draft, beforeOccupied.draft, `${profile.name}: occupied pin changed topology`);
    assert.match(await page.textContent(profile.status), /rejected/i);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click(profile.save)]);
    const savedPath = await download.path();
    const savedText = fs.readFileSync(savedPath, 'utf8');
    const saved = JSON.parse(savedText);
    const savedCircuit = saved.project.circuit;
    const savedSourceNet = savedCircuit.nets.find((net) => net.id === profile.sourceNet);
    assert(savedSourceNet.endpoints.some((item) => item.component === 'resistor-1' && item.pin === profile.otherLead),
      `${profile.name}: Save lost reconnected topology`);
    assert(!Object.hasOwn(saved, 'artifact') && !Object.hasOwn(saved, 'runtime'), `${profile.name}: Save retained execution state`);

    await selectCable(page, profile, 'net-series');
    await page.click(profile.delete);
    await page.setInputFiles(profile.openInput, {
      name: `${profile.option}.json`, mimeType: 'application/json', buffer: Buffer.from(savedText),
    });
    await page.waitForSelector('#unsaved-change-dialog[open]'); await page.click('#unsaved-discard');
    await page.waitForFunction(({ global, sourceNet, otherLead }) => {
      const value = window[global].state();
      const circuit = value.circuit ?? value.project.circuit;
      return circuit.nets.length === 3 && circuit.nets.find((net) => net.id === sourceNet)?.endpoints
        .some((item) => item.component === 'resistor-1' && item.pin === otherLead);
    }, profile);
    current = await state(page, profile);
    assert.equal(current[profile.validKey], true, `${profile.name}: Open did not revalidate authored topology`);
    assert.equal(current.runnable, false, `${profile.name}: Open retained runnable authority`);
    assert.equal(current.artifact, null, `${profile.name}: Open retained executable`);
    assert.equal(current.runtime, null, `${profile.name}: Open retained runtime`);
    assert.equal(await page.locator(profile.run).isDisabled(), true, `${profile.name}: Run enabled without fresh Build`);

    const resistor = page.locator(`${profile.componentLayer} [data-component-id="resistor-1"]`);
    await resistor.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.click(profile.rotate);
    await page.click(profile.fit);
    assertGeometry(await geometry(page, profile), profile);
    await page.setViewportSize({ width: 390, height: 844 });
    assertGeometry(await geometry(page, profile), profile);

    if (screenshotDirectory && profile === profiles[0]) {
      fs.mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDirectory, 'named-pin-wire-authoring-mobile.png'), fullPage: true });
    }
  }

  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
  assert.deepEqual(external, [], `third-party requests: ${JSON.stringify(external)}`);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'passed', profiles: profiles.map((profile) => profile.name) })}\n`);
})().catch((error) => { console.error(error); process.exit(1); });
