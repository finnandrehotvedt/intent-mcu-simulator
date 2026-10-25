// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.RC139_AUTHORING_URL || 'http://host.docker.internal:18789';
const profiles = [
  { id: 'board.rp2040-pico-v1', api: '__RP2040_PUBLIC_WORKBENCH__', button: '#pico-new-circuit',
    layer: '#pico-editor-components', name: '#pico-project-name', source: '#pico-source', openInput: '#pico-open-input',
    board: 'pico-1', sourcePin: 'GP0', groundPin: 'GND3', sourceLead: 'B', ledLead: 'A' },
  { id: 'board.esp32-c3-devmodule-v1', api: '__ESP32C3_PUBLIC_WORKBENCH__', button: '#c3-new-circuit',
    layer: '#c3-editor-components', name: '#c3-project-name', source: '#c3-source', openInput: '#c3-open-input',
    board: 'c3-1', sourcePin: 'GPIO2', groundPin: 'GND', sourceLead: 'A', ledLead: 'B' },
  { id: 'board.stm32f429zi-nucleo144-v1', api: '__STM32_PUBLIC_WORKBENCH__', button: '#stm32-new-circuit',
    layer: '#stm32-editor-components', name: '#stm32-project-name', source: '#stm32-source', openInput: '#stm32-open-input',
    board: 'stm32-1', sourcePin: 'PB0', groundPin: 'GND', sourceLead: 'A', ledLead: 'B' },
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

      await page.evaluate(({ api }) => {
        const owner = window[api];
        owner.addComponent('ground.reference-3v3-v1', { x: 0.2, y: 0.78 });
        owner.addComponent('button.momentary-3v3-v1', { x: 0.42, y: 0.78 });
        owner.addComponent('switch.toggle-3v3-v1', { x: 0.64, y: 0.78 });
      }, profile);

      const protectedName = `RC139 protected ${profile.id}`;
      await page.evaluate(({ name, protectedName }) => {
        const input = document.querySelector(name); input.value = protectedName;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, { ...profile, protectedName });
      await page.waitForTimeout(0);
      const beforeNew = await page.evaluate(({ api, id, name, source }) => {
        const state = window[api].state();
        const draftId = sessionStorage.getItem('intent-mcu.active-draft-id.v1');
        const key = `intent-mcu.profile-draft.v1.${id}.tab.${draftId}`;
        return { graph: state.circuit ?? state.project.circuit,
          authoredName: document.querySelector(name).value,
          authoredSource: document.querySelector(source).value,
          draftId, key, raw: localStorage.getItem(key) };
      }, profile);
      assert.ok(beforeNew.raw, `${profile.id} has a durable pre-New recovery entry`);

      await page.evaluate((selector) => document.querySelector(selector).click(), profile.button);
      await page.locator('#unsaved-change-dialog[open]').waitFor();
      await page.locator('#unsaved-keep').click();
      const kept = await page.evaluate(({ api, name, source }) => {
        const state = window[api].state();
        return { graph: state.circuit ?? state.project.circuit,
          authoredName: document.querySelector(name).value,
          authoredSource: document.querySelector(source).value,
          draftId: sessionStorage.getItem('intent-mcu.active-draft-id.v1') };
      }, profile);
      assert.deepEqual(kept, { graph: beforeNew.graph, authoredName: beforeNew.authoredName,
        authoredSource: beforeNew.authoredSource, draftId: beforeNew.draftId });

      await page.evaluate((selector) => document.querySelector(selector).click(), profile.button);
      await page.locator('#unsaved-change-dialog[open]').waitFor();
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#unsaved-download').click();
      const download = await downloadPromise;
      const downloaded = JSON.parse(await require('node:fs/promises').readFile(await download.path(), 'utf8'));
      assert.equal(downloaded.project.name, beforeNew.authoredName);
      assert.deepEqual(downloaded.project.circuit, beforeNew.graph);
      assert.equal(downloaded.project.circuit.components.length, 8);
      assert.equal(downloaded.project.circuit.components.some(({ type }) => type === 'ground.reference-3v3-v1'), true);
      assert.equal(downloaded.project.circuit.components.some(({ type }) => type === 'button.momentary-3v3-v1'), true);
      assert.equal(downloaded.project.circuit.components.some(({ type }) => type === 'switch.toggle-3v3-v1'), true);
      const downloadedSource = downloaded.project.source.files?.[0]?.content ?? downloaded.project.source;
      assert.equal(downloadedSource, beforeNew.authoredSource);
      await page.locator('#unsaved-change-dialog[open]').waitFor();

      await page.locator('#unsaved-discard').click();
      await page.waitForFunction(({ api }) => {
        const state = window[api].state(); const graph = state.circuit ?? state.project.circuit;
        return graph.components.length === 1 && graph.nets.length === 0;
      }, profile);
      const afterNew = await page.evaluate(({ api, key }) => {
        const state = window[api].state();
        return { graph: state.circuit ?? state.project.circuit,
          draftId: sessionStorage.getItem('intent-mcu.active-draft-id.v1'), oldRaw: localStorage.getItem(key) };
      }, { ...profile, key: beforeNew.key });
      assert.notEqual(afterNew.draftId, beforeNew.draftId);
      const preserved = JSON.parse(afterNew.oldRaw);
      assert.equal(preserved.authoredName, beforeNew.authoredName);
      assert.equal(preserved.authoredSource, beforeNew.authoredSource);
      assert.deepEqual(preserved.circuit, beforeNew.graph);

      await page.evaluate(({ api }) => window[api].undoCircuit(), profile);
      assert.deepEqual(await page.evaluate(({ api }) => {
        const state = window[api].state(); return state.circuit ?? state.project.circuit;
      }, profile), beforeNew.graph);
      await page.evaluate(({ api }) => window[api].redoCircuit(), profile);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.selectOption('#board-select', profile.id);
      await page.waitForFunction(({ api }) => Boolean(window[api]?.state().active), profile);
      assert.equal(await page.evaluate(({ api }) => {
        const state = window[api].state(); return (state.circuit ?? state.project.circuit).components.length;
      }, profile), 1);
      await page.evaluate((key) => {
        const select = document.querySelector('#project-draft-recovery'); select.value = key;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, beforeNew.key);
      await page.evaluate(() => document.querySelector('#project-draft-recover').click());
      await page.waitForFunction(({ api }) => {
        const state = window[api].state(); return (state.circuit ?? state.project.circuit).components.length === 8;
      }, profile);
      const recovered = await page.evaluate(({ api, name, source, key }) => {
        const state = window[api].state();
        return { graph: state.circuit ?? state.project.circuit,
          authoredName: document.querySelector(name).value,
          authoredSource: document.querySelector(source).value,
          originalRaw: localStorage.getItem(key) };
      }, { ...profile, key: beforeNew.key });
      assert.deepEqual(recovered.graph, beforeNew.graph);
      assert.equal(recovered.authoredName, beforeNew.authoredName);
      assert.equal(recovered.authoredSource, beforeNew.authoredSource);
      assert.equal(recovered.originalRaw, afterNew.oldRaw);

      await page.evaluate((selector) => document.querySelector(selector).click(), profile.button);
      if (await page.locator('#unsaved-change-dialog[open]').isVisible()) {
        await page.locator('#unsaved-discard').click();
      }
      await page.waitForFunction(({ api }) => {
        const state = window[api].state(); return (state.circuit ?? state.project.circuit).components.length === 1;
      }, profile);
      await page.locator(profile.openInput).setInputFiles(await download.path());
      await page.waitForFunction(({ api }) => {
        const state = window[api].state(); return (state.circuit ?? state.project.circuit).components.length === 8;
      }, profile);
      assert.deepEqual(await page.evaluate(({ api }) => {
        const state = window[api].state(); return state.circuit ?? state.project.circuit;
      }, profile), beforeNew.graph);

      await page.evaluate(({ api }) => window[api].selectCircuit({ kind: 'net', id: 'net-led-2-ground' }), profile);
      const branchSelector = profile.id === 'board.rp2040-pico-v1' ? '#pico-branch'
        : profile.id === 'board.esp32-c3-devmodule-v1' ? '#c3-branch' : '#stm32-branch';
      await page.evaluate((selector) => document.querySelector(selector).click(), branchSelector);
      await page.evaluate(({ layer }) => document.querySelector(`${layer} [data-editor-endpoint="resistor-1.A"]`).click(), profile);
      const branch = await page.evaluate(({ api }) => {
        const state = window[api].state(); const graph = state.circuit ?? state.project.circuit;
        return { endpoints: graph.nets.find(({ id }) => id === 'net-led-2-ground').endpoints.length,
          validation: state.circuitEditor.validation };
      }, profile);
      assert.equal(branch.endpoints, 3);
      assert.equal(branch.validation.ok, false);
      const endpointSelect = profile.id === 'board.rp2040-pico-v1' ? '#pico-branch-endpoint'
        : profile.id === 'board.esp32-c3-devmodule-v1' ? '#c3-branch-endpoint' : '#stm32-branch-endpoint';
      const removeBranch = profile.id === 'board.rp2040-pico-v1' ? '#pico-remove-branch'
        : profile.id === 'board.esp32-c3-devmodule-v1' ? '#c3-remove-branch' : '#stm32-remove-branch';
      await page.selectOption(endpointSelect, { label: 'resistor-1.A' });
      await page.evaluate((selector) => document.querySelector(selector).click(), removeBranch);
      assert.equal(await page.evaluate(({ api }) => {
        const state = window[api].state(); const graph = state.circuit ?? state.project.circuit;
        return graph.nets.find(({ id }) => id === 'net-led-2-ground').endpoints.length;
      }, profile), 2);
      await page.evaluate(({ api }) => window[api].undoCircuit(), profile);
      assert.equal(await page.evaluate(({ api }) => {
        const state = window[api].state(); const graph = state.circuit ?? state.project.circuit;
        return graph.nets.find(({ id }) => id === 'net-led-2-ground').endpoints.length;
      }, profile), 3);
      await page.evaluate(({ api }) => window[api].undoCircuit(), profile);

      await page.evaluate(({ api }) => window[api].selectCircuit({ kind: 'component', id: 'resistor-1' }), profile);
      await page.waitForSelector('[data-bounded-duplicate="resistor-1"]', { state: 'attached' });
      await page.evaluate(() => document.querySelector('[data-bounded-duplicate="resistor-1"]').click());
      assert.equal(await page.evaluate(({ api }) => {
        const state = window[api].state();
        return (state.circuit ?? state.project.circuit).components.some(({ id }) => id === 'resistor-3');
      }, profile), true);
      await page.evaluate(({ api }) => window[api].undoCircuit(), profile);
      assert.equal(await page.evaluate(({ api }) => {
        const state = window[api].state();
        return (state.circuit ?? state.project.circuit).components.some(({ id }) => id === 'resistor-3');
      }, profile), false);
      await page.evaluate(() => document.querySelector('[data-bounded-add="button.momentary-3v3-v1"]').click());
      assert.equal(await page.evaluate(({ api, layer }) => {
        const state = window[api].state(); const graph = state.circuit ?? state.project.circuit;
        return graph.components.some(({ id, type }) => id === 'button-2' && type === 'button.momentary-3v3-v1')
          && Boolean(document.querySelector(`${layer} [data-editor-endpoint="button-2.A"]`));
      }, profile), true);

      await page.evaluate(({ api }) => window[api].newCircuit(), profile);
      await page.evaluate(() => document.querySelector('[data-bounded-add="ground.reference-3v3-v1"]').click());
      const unsafeBefore = await page.evaluate(({ api }) => {
        const state = window[api].state(); return JSON.stringify(state.circuit ?? state.project.circuit);
      }, profile);
      await page.evaluate(({ layer, board, sourcePin }) => {
        document.querySelector(`${layer} [data-editor-endpoint="${board}.${sourcePin}"]`).click();
        document.querySelector(`${layer} [data-editor-endpoint="ground-1.GND"]`).click();
      }, profile);
      assert.equal(await page.evaluate(({ api }) => {
        const state = window[api].state(); return JSON.stringify(state.circuit ?? state.project.circuit);
      }, profile), unsafeBefore);
    }
    process.stdout.write('RC139 three-profile browser authoring PASS\n');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
