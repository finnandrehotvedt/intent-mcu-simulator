// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X60_URL || 'http://127.0.0.1:18850';
const screenshots = process.env.X60_SCREENSHOT_DIR || null;

const profiles = [
  {
    name: 'AVR', option: 'board.atmega328p-16mhz-v1', root: '#accessible-connections-root',
    state: '__M6_STATE__', graph: (value) => value.graph, revision: (value) => value.revision,
    seriesNet: 'net-example-2', sourceNet: 'net-example-1', board: 'board-1', sourcePin: 'D13',
    resistor: 'resistor-1', sourceLead: 'A', otherLead: 'B', led: 'led-1',
    wireColor: '#wire-color', save: '#project-save', open: '#project-open-input', canvasPin: '#component-layer .pin-anchor',
  },
  {
    name: 'RP2040 Pico', family: 'architecture.rp2040-v1', option: 'board.rp2040-pico-v1', root: '[data-connection-profile="board.rp2040-pico-v1"]',
    state: '__RP2040_PUBLIC_WORKBENCH__', graph: (value) => value.circuitEditor.draft,
    revision: (value) => value.circuitEditor.revision, seriesNet: 'net-series', sourceNet: 'net-gpio0',
    board: 'pico-1', sourcePin: 'GP0', resistor: 'resistor-1', sourceLead: 'B', otherLead: 'A', led: 'led-1',
    wireColor: '#pico-wire-color', save: '#pico-save', open: '#pico-open-input', canvasPin: '#pico-editor-components .pin-anchor',
  },
  {
    name: 'ESP32-C3', family: 'architecture.esp32-v1', option: 'board.esp32-c3-devmodule-v1', root: '[data-connection-profile="board.esp32-c3-devmodule-v1"]',
    state: '__ESP32C3_PUBLIC_WORKBENCH__', graph: (value) => value.circuitEditor.draft,
    revision: (value) => value.circuitEditor.revision, seriesNet: 'net-series', sourceNet: 'net-gpio2',
    board: 'c3-1', sourcePin: 'GPIO2', resistor: 'resistor-1', sourceLead: 'A', otherLead: 'B', led: 'led-1',
    wireColor: '#c3-wire-color', save: '#c3-save', open: '#c3-open-input', canvasPin: '#c3-editor-components .pin-anchor',
  },
  {
    name: 'STM32F429ZI', family: 'architecture.stm32-v1', option: 'board.stm32f429zi-nucleo144-v1', root: '[data-connection-profile="board.stm32f429zi-nucleo144-v1"]',
    state: '__STM32_PUBLIC_WORKBENCH__', graph: (value) => value.circuitEditor.draft,
    revision: (value) => value.circuitEditor.revision, seriesNet: 'net-series', sourceNet: 'net-pb0',
    board: 'stm32-1', sourcePin: 'PB0', resistor: 'resistor-1', sourceLead: 'A', otherLead: 'B', led: 'led-1',
    wireColor: '#stm32-wire-color', save: '#stm32-save', open: '#stm32-open-input', canvasPin: '#stm32-editor-components .pin-anchor',
  },
];

async function activate(page, selector) {
  const item = page.locator(selector); await item.focus(); await page.keyboard.press('Enter');
}

async function selectValue(page, selector, value) {
  const select = page.locator(selector);
  const index = await select.locator('option').evaluateAll((options, expected) =>
    options.findIndex((option) => option.value === expected), value);
  assert(index >= 0, `missing option ${value} in ${selector}`);
  await select.focus(); await page.keyboard.press('Home');
  for (let offset = 0; offset < index; offset += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
}

async function currentState(page, profile) {
  return page.evaluate((global) => global === '__M6_STATE__'
    ? structuredClone(window[global]) : structuredClone(window[global].state()), profile.state);
}

function netWith(graph, left, right) {
  const keys = new Set([left, right]);
  return graph.nets.find((net) => net.endpoints.length === 2
    && net.endpoints.every((endpoint) => keys.has(`${endpoint.component}.${endpoint.pin}`)));
}

async function openConnections(page, profile) {
  const details = page.locator(`${profile.root} details.accessible-connections`);
  await details.locator('summary').focus();
  if (!await details.evaluate((node) => node.open)) await page.keyboard.press('Enter');
  await details.scrollIntoViewIfNeeded();
  return details;
}

async function deleteNet(page, profile, netId) {
  await activate(page, `${profile.root} [data-net-id="${netId}"] button[aria-label="Delete whole connection ${netId}"]`);
}

async function connectPins(page, profile, from, to) {
  await selectValue(page, `${profile.root} [data-connection-from]`, from);
  await selectValue(page, `${profile.root} [data-connection-to]`, to);
  await activate(page, `${profile.root} [data-connection-focus="connect"]`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; const external = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url()); });
  await page.addInitScript(() => {
    window.__X60_POINTER_EVENTS__ = 0;
    for (const name of ['pointerdown', 'mousedown', 'touchstart']) {
      addEventListener(name, () => { window.__X60_POINTER_EVENTS__ += 1; }, { capture: true });
    }
  });
  assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);

  // Open the AVR Blink starter using focus plus keyboard only.
  await activate(page, '#project-demo');
  await page.keyboard.type('Blink LED');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__M6_STATE__.graph?.nets?.length === 3);

  for (const profile of profiles) {
    if (profile.name !== 'AVR') {
      await selectValue(page, '#family-select', profile.family);
      await page.waitForFunction((global) => window[global]?.state().active, profile.state);
    }
    const details = await openConnections(page, profile);
    let state = await currentState(page, profile); let graph = profile.graph(state);
    const root = page.locator(profile.root);
    assert.equal(await root.locator('.accessible-connection-pin').count(), await page.locator(profile.canvasPin).count(),
      `${profile.name}: named pin list is incomplete`);
    assert.equal(await root.locator('.accessible-connection-net').count(), graph.nets.length, `${profile.name}: incomplete net list`);
    for (const net of graph.nets) for (const endpoint of net.endpoints) {
      assert.equal(await root.locator(`[data-endpoint="${endpoint.component}.${endpoint.pin}"]`).count(), 1,
        `${profile.name}: missing named endpoint`);
    }
    assert.match(await details.getAttribute('data-connection-schema'), /accessible-connection-view@1/u);

    const seriesFrom = `${profile.resistor}.${profile.otherLead}`;
    const seriesTo = `${profile.led}.ANODE`;
    await deleteNet(page, profile, profile.seriesNet);
    state = await currentState(page, profile); graph = profile.graph(state);
    assert.equal(netWith(graph, seriesFrom, seriesTo), undefined, `${profile.name}: delete did not remove selected connection`);
    await page.waitForTimeout(50);
    assert.deepEqual(errors, [], `${profile.name}: browser error interrupted deletion: ${JSON.stringify(errors)}`);
    assert.match(await page.locator(`${profile.root} [data-connection-status]`).textContent(), /Deleted connection/u,
      `${profile.name}: deletion was not announced`);
    assert(['from', 'summary'].includes(await page.evaluate(() => document.activeElement?.dataset.connectionFocus)),
      `${profile.name}: delete did not retain focus in the Connections workflow`);

    await connectPins(page, profile, seriesFrom, seriesTo);
    state = await currentState(page, profile); graph = profile.graph(state);
    assert(netWith(graph, seriesFrom, seriesTo), `${profile.name}: keyboard form did not create the valid connection`);
    assert.match(await page.locator(`${profile.root} [data-connection-status]`).textContent(), /Connected/u);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.connectionFocus), 'connect', `${profile.name}: focus not retained`);

    const beforeOccupied = profile.revision(state);
    await connectPins(page, profile, `${profile.board}.${profile.sourcePin}`, `${profile.resistor}.${profile.sourceLead}`);
    state = await currentState(page, profile);
    assert.equal(profile.revision(state), beforeOccupied, `${profile.name}: occupied endpoints mutated revision`);
    assert.match(await page.locator(`${profile.root} [data-connection-status]`).textContent(), /rejected/i);

    const currentSeries = netWith(profile.graph(state), seriesFrom, seriesTo);
    await deleteNet(page, profile, currentSeries.id);
    await selectValue(page, `${profile.root} [data-connection-from]`, `${profile.resistor}.${profile.sourceLead}`);
    const beforeCancelReconnect = profile.revision(await currentState(page, profile));
    await activate(page, `${profile.root} [data-net-id="${profile.sourceNet}"] button[aria-label="Reconnect one endpoint of ${profile.sourceNet}"]`);
    assert.equal(await page.locator(`${profile.root} [data-connection-focus="connect"]`).textContent(), 'Reconnect exact pins');
    await activate(page, `${profile.root} [data-connection-cancel]`);
    assert.equal(profile.revision(await currentState(page, profile)), beforeCancelReconnect,
      `${profile.name}: cancelling reconnect changed topology`);
    assert.equal(await page.locator(`${profile.root} [data-connection-focus="connect"]`).textContent(), 'Connect exact pins');
    assert.match(await page.locator(`${profile.root} [data-connection-status]`).textContent(), /Reconnect cancelled/u);
    await selectValue(page, `${profile.root} [data-connection-from]`, `${profile.resistor}.${profile.sourceLead}`);
    await activate(page, `${profile.root} [data-net-id="${profile.sourceNet}"] button[aria-label="Reconnect one endpoint of ${profile.sourceNet}"]`);
    await selectValue(page, `${profile.root} [data-connection-to]`, `${profile.resistor}.${profile.otherLead}`);
    await activate(page, `${profile.root} [data-connection-focus="connect"]`);
    assert.equal(await page.locator(`${profile.root} [data-connection-focus="connect"]`).textContent(), 'Connect exact pins',
      `${profile.name}: reconnect mode did not reset after success`);
    state = await currentState(page, profile); graph = profile.graph(state);
    const source = graph.nets.find((net) => net.id === profile.sourceNet);
    assert(source.endpoints.some((endpoint) => `${endpoint.component}.${endpoint.pin}` === `${profile.resistor}.${profile.otherLead}`),
      `${profile.name}: reconnect did not move the exact endpoint`);
    await connectPins(page, profile, `${profile.resistor}.${profile.sourceLead}`, seriesTo);
    state = await currentState(page, profile); graph = profile.graph(state);
    assert(netWith(graph, `${profile.resistor}.${profile.sourceLead}`, seriesTo), `${profile.name}: valid topology not restored`);

    const identityBeforeLayout = await details.getAttribute('data-semantic-identity');
    const staleForm = await page.locator(`${profile.root} form.accessible-connection-form`).elementHandle();
    const selectedSeries = netWith(profile.graph(await currentState(page, profile)), `${profile.resistor}.${profile.sourceLead}`, seriesTo);
    await activate(page, `${profile.root} [data-net-id="${selectedSeries.id}"] button[aria-label="Select connection ${selectedSeries.id}"]`);
    const oldColor = await page.locator(profile.wireColor).inputValue();
    await selectValue(page, profile.wireColor, oldColor === '#5f8cff' ? '#f04f5f' : '#5f8cff');
    const afterLayoutRevision = profile.revision(await currentState(page, profile));
    await staleForm.evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(profile.revision(await currentState(page, profile)), afterLayoutRevision,
      `${profile.name}: stale form mutated the current graph`);
    assert.match(await page.locator(`${profile.root} [data-connection-status]`).textContent(), /stale/u,
      `${profile.name}: stale transaction was not announced`);
    await activate(page, `${profile.root} [data-endpoint="${profile.resistor}.${profile.sourceLead}"]`);
    await page.keyboard.press('r');
    assert.equal(await page.locator(`${profile.root} details`).getAttribute('data-semantic-identity'), identityBeforeLayout,
      `${profile.name}: layout-only change altered semantic graph identity`);

    const [download] = await Promise.all([page.waitForEvent('download'), activate(page, profile.save)]);
    const savedText = fs.readFileSync(await download.path(), 'utf8');
    assert(!savedText.includes('intent-mcu-accessible-connection-view@1'), `${profile.name}: accessibility view was serialized`);
    assert(!savedText.includes('reconnectFrom') && !savedText.includes('connectionFocus'), `${profile.name}: transient focus state was serialized`);
    await page.setInputFiles(profile.open, { name: `${profile.name}.json`, mimeType: 'application/json', buffer: Buffer.from(savedText) });
    const discard = page.locator('#unsaved-discard');
    if (await discard.isVisible().catch(() => false)) await activate(page, '#unsaved-discard');
    await page.waitForTimeout(50);
    await openConnections(page, profile);
    assert.equal(await page.locator(`${profile.root} details`).getAttribute('data-semantic-identity'), identityBeforeLayout,
      `${profile.name}: Save/Open altered semantic graph identity`);

    const finalGraph = profile.graph(await currentState(page, profile));
    const finalSeries = netWith(finalGraph, `${profile.resistor}.${profile.sourceLead}`, seriesTo);
    await activate(page, `${profile.root} [data-net-id="${finalSeries.id}"] button[aria-label="Select connection ${finalSeries.id}"]`);
    await deleteNet(page, profile, finalSeries.id);
    assert.equal(netWith(profile.graph(await currentState(page, profile)), `${profile.resistor}.${profile.sourceLead}`, seriesTo), undefined);
    assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1,
      `${profile.name}: horizontal overflow at supported desktop width`);

    if (screenshots) {
      fs.mkdirSync(screenshots, { recursive: true });
      await openConnections(page, profile);
      await page.screenshot({ path: path.join(screenshots, `${profile.name.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}-connections.png`), fullPage: true });
    }
  }

  assert.equal(await page.evaluate(() => window.__X60_POINTER_EVENTS__), 0, 'a pointer event occurred during keyboard-only journey');
  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
  assert.deepEqual(external, [], `third-party requests: ${JSON.stringify(external)}`);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'passed', profiles: profiles.map(({ name }) => name), pointerEvents: 0 })}\n`);
})().catch((error) => { console.error(error); process.exit(1); });
