// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.RC139_AUTHORING_URL || 'http://host.docker.internal:18789';
const profiles = [
  { id: 'board.rp2040-pico-v1', api: '__RP2040_PUBLIC_WORKBENCH__', button: '#pico-new-circuit',
    layer: '#pico-editor-components', board: 'pico-1', sourcePin: 'GP0', groundPin: 'GND3', sourceLead: 'B', ledLead: 'A' },
  { id: 'board.esp32-c3-devmodule-v1', api: '__ESP32C3_PUBLIC_WORKBENCH__', button: '#c3-new-circuit',
    layer: '#c3-editor-components', board: 'c3-1', sourcePin: 'GPIO2', groundPin: 'GND', sourceLead: 'A', ledLead: 'B' },
  { id: 'board.stm32f429zi-nucleo144-v1', api: '__STM32_PUBLIC_WORKBENCH__', button: '#stm32-new-circuit',
    layer: '#stm32-editor-components', board: 'stm32-1', sourcePin: 'PB0', groundPin: 'GND', sourceLead: 'A', ledLead: 'B' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10_000);
    page.on('pageerror', (error) => process.stderr.write(`pageerror: ${error.message}\n`));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 10_000 });
    await page.waitForFunction(() => Boolean(window.__RP2040_PUBLIC_WORKBENCH__), null, { timeout: 10_000 });
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile.id);
      await page.waitForFunction(({ api }) => Boolean(window[api]?.state().active), profile);
      await page.evaluate((selector) => document.querySelector(selector).click(), profile.button);
      await page.waitForFunction(({ api }) => {
        const state = window[api].state();
        const graph = state.circuit ?? state.project.circuit;
        return graph.components.length === 1 && graph.nets.length === 0;
      }, profile);
      const result = await page.evaluate(({ api, board, sourcePin, groundPin, sourceLead, ledLead }) => {
        const owner = window[api];
        owner.addComponent('resistor.fixed-v1', { x: 0.44, y: 0.28 });
        owner.addComponent('resistor.fixed-v1', { x: 0.62, y: 0.28 });
        owner.addComponent('led.basic-v1', { x: 0.48, y: 0.68 });
        owner.addComponent('led.basic-v1', { x: 0.7, y: 0.68 });
        owner.setComponentProperty('resistor-2', 'ohms', 470);
        owner.moveCircuitComponent('led-2', 0.79, 0.72);
        owner.activateEndpoint({ component: board, pin: sourcePin });
        owner.activateEndpoint({ component: 'resistor-2', pin: sourceLead });
        owner.activateEndpoint({ component: 'resistor-2', pin: ledLead });
        owner.activateEndpoint({ component: 'led-2', pin: 'ANODE' });
        owner.activateEndpoint({ component: 'led-2', pin: 'CATHODE' });
        owner.activateEndpoint({ component: board, pin: groundPin });
        const edited = owner.state();
        const editedGraph = (edited.circuit ?? edited.project.circuit);
        const middleNet = editedGraph.nets.find((net) => net.endpoints.some((point) => point.component === 'resistor-2')
          && net.endpoints.some((point) => point.component === 'led-2')).id;
        owner.selectCircuit({ kind: 'net', id: middleNet });
        owner.deleteSelected();
        const disconnected = owner.state();
        owner.undoCircuit();
        const undone = owner.state();
        owner.redoCircuit();
        const redone = owner.state();
        const graph = (state) => state.circuit ?? state.project.circuit;
        return { edited: graph(edited), disconnected: graph(disconnected), undone: graph(undone), redone: graph(redone), middleNet };
      }, profile);
      assert.equal(result.edited.components.length, 5);
      assert.equal(result.edited.components.find(({ id }) => id === 'resistor-2').properties.ohms, 470);
      assert.equal(result.edited.nets.length, 3);
      assert.equal(result.disconnected.nets.some(({ id }) => id === result.middleNet), false);
      assert.deepEqual(result.undone, result.edited);
      assert.deepEqual(result.redone, result.disconnected);
      assert.equal(await page.locator(`${profile.layer} [data-component-id="resistor-2"]`).count(), 1);
      assert.equal(await page.locator(`${profile.layer} [data-component-id="led-2"]`).count(), 1);
      assert.equal(result.redone.components.some(({ id }) => id === profile.board), true);
    }
    process.stdout.write('RC139 three-profile browser authoring PASS\n');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
