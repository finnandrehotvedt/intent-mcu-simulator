// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X55_SPLIT_URL || 'http://host.docker.internal:18895';
const output = process.env.X55_SPLIT_OUTPUT || '/tmp/x55-split-editor';
const profiles = [
  { id: 'avr', option: 'board.atmega328p-16mhz-v1', global: null,
    layer: '#component-layer', properties: '#component-editor', modelInput: '[data-property]',
    modelApply: '[data-model-property-apply]', modelCancel: '[data-component-editor-cancel="model"]',
    modelTab: '#component-editor-model-tab', drawingTab: '#component-editor-drawing-tab',
    appearance: '#appearance-preset', drawingApply: '#appearance-apply', drawingCancel: '#appearance-cancel' },
  { id: 'pico', option: 'board.rp2040-pico-v1', global: '__RP2040_PUBLIC_WORKBENCH__',
    layer: '#pico-editor-components', properties: '#pico-part-properties' },
  { id: 'c3', option: 'board.esp32-c3-devmodule-v1', global: '__ESP32C3_PUBLIC_WORKBENCH__',
    layer: '#c3-editor-components', properties: '#c3-part-properties' },
  { id: 'stm32', option: 'board.stm32f429zi-nucleo144-v1', global: '__STM32_PUBLIC_WORKBENCH__',
    layer: '#stm32-editor-components', properties: '#stm32-part-properties' },
];

function selectors(profile) {
  if (profile.id === 'avr') return profile;
  return {
    ...profile,
    modelInput: '[data-bounded-property]', modelApply: '[data-bounded-model-apply]',
    modelCancel: '[data-component-editor-cancel="model"]',
    modelTab: '[data-component-editor-mode="model"]', drawingTab: '[data-component-editor-mode="drawing"]',
    appearance: '[data-bounded-appearance]', drawingApply: '[data-bounded-appearance-apply]',
    drawingCancel: '[data-component-editor-cancel="drawing"]',
  };
}

async function projectSnapshot(page, profile) {
  return page.evaluate((item) => {
    if (!item.global) {
      const project = window.__M6_PROJECT__();
      return { source: project.source, circuit: project.circuit, layout: project.layout };
    }
    const state = window[item.global].state();
    const circuit = state.circuitEditor.draft;
    return { source: state.project?.source ?? state.source, circuit: {
      components: circuit.components, nets: circuit.nets, junctions: circuit.junctions,
    }, layout: circuit.layout };
  }, profile);
}

async function selectPart(page, profile, id) {
  if (await page.locator('#workbench-inspector-dialog').getAttribute('open') !== null) {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#workbench-inspector-dialog').open);
  }
  await page.locator(`${profile.layer} [data-component-id="${id}"]`).click();
  await page.click('#toggle-inspector');
  await page.waitForSelector('#workbench-inspector-dialog[open]');
}

async function undo(page, profile) {
  if (profile.id === 'avr') await page.keyboard.press('Control+z');
  else await page.evaluate((name) => window[name].undoCircuit(), profile.global);
}

async function redo(page, profile) {
  if (profile.id === 'avr') await page.keyboard.press('Control+Shift+z');
  else await page.evaluate((name) => window[name].redoCircuit(), profile.global);
}

async function componentProperty(page, profile, id, key) {
  return page.evaluate(({ item, componentId, property }) => {
    const components = item.global
      ? window[item.global].state().circuitEditor.draft.components
      : window.__M6_PROJECT__().circuit.components;
    return components.find((component) => component.id === componentId).properties[property];
  }, { item: profile, componentId: id, property: key });
}

async function appearancePreset(page, profile, id) {
  return page.evaluate(({ item, componentId }) => {
    const layout = item.global ? window[item.global].state().circuitEditor.draft.layout
      : window.__M6_PROJECT__().layout;
    return layout.componentAppearance?.components?.[componentId]?.preset ?? null;
  }, { item: profile, componentId: id });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    const NativeWorker = window.Worker; window.__X55_SPLIT_WORKERS__ = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args) { window.__X55_SPLIT_WORKERS__ += 1; super(...args); }
    };
  });
  const page = await context.newPage();
  const producerRequests = [];
  page.on('request', (request) => {
    if (/\/(?:api|compile|run|scenario)(?:\/|$)/u.test(new URL(request.url()).pathname)) {
      producerRequests.push({ method: request.method(), url: request.url() });
    }
  });
  try {
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#project-files-open'); await page.click('#project-demo');
    await page.click('.starter-card[data-example="blink"]');
    const report = [];
    for (const rawProfile of profiles) {
      const profile = selectors(rawProfile);
      await page.selectOption('#board-select', profile.option);
      if (profile.global) await page.waitForFunction((name) => window[name]?.state().active === true, profile.global);
      await selectPart(page, profile, 'resistor-1');
      const root = page.locator(profile.properties);
      const modelTab = root.locator(profile.modelTab); const drawingTab = root.locator(profile.drawingTab);
      const modelInput = root.locator(`${profile.modelInput}[data-property="ohms"], ${profile.modelInput}[data-bounded-property="ohms"]`).first();
      const modelApply = root.locator(profile.modelApply).first(); const modelCancel = root.locator(profile.modelCancel).first();
      assert.equal(await modelTab.getAttribute('aria-selected'), 'true', `${profile.id}: model tab not initial`);
      assert.equal(await modelApply.isEnabled(), false, `${profile.id}: unchanged model Apply enabled`);
      await modelTab.focus(); await page.keyboard.press('ArrowRight');
      assert.equal(await drawingTab.getAttribute('aria-selected'), 'true', `${profile.id}: keyboard Drawing failed`);
      await page.keyboard.press('ArrowLeft');
      assert.equal(await modelTab.getAttribute('aria-selected'), 'true', `${profile.id}: keyboard Model failed`);

      const originalOhms = await componentProperty(page, profile, 'resistor-1', 'ohms');
      await modelInput.fill('0');
      assert.equal(await modelApply.isEnabled(), false, `${profile.id}: invalid model Apply enabled`);
      assert.equal(await componentProperty(page, profile, 'resistor-1', 'ohms'), originalOhms,
        `${profile.id}: invalid model preview mutated data`);
      assert.match(await root.locator('.component-editor-invariant').first().textContent(), /rejected/iu,
        `${profile.id}: model rejection was not explicit`);
      await modelCancel.click();

      // A revision change invalidates the captured preview. Even a detached
      // old Apply control cannot commit its stale model value.
      await modelInput.fill('325');
      const staleApply = await modelApply.elementHandle();
      if (profile.id === 'avr') await page.click('#rotate-component');
      else await page.evaluate((name) => {
        const api = window[name]; const state = api.state();
        const position = state.circuitEditor.draft.layout.positions['resistor-1'];
        api.moveCircuitComponent('resistor-1', Math.min(0.9, position.x + 0.02), position.y);
      }, profile.global);
      await staleApply.evaluate((button) => button.click());
      assert.notEqual(await componentProperty(page, profile, 'resistor-1', 'ohms'), 325,
        `${profile.id}: stale model preview committed`);
      await undo(page, profile);
      await selectPart(page, profile, 'resistor-1');

      const before = await projectSnapshot(page, profile);
      const freshInput = root.locator(`${profile.modelInput}[data-property="ohms"], ${profile.modelInput}[data-bounded-property="ohms"]`).first();
      const freshApply = root.locator(profile.modelApply).first();
      await freshInput.fill('330');
      assert.equal(await freshApply.isEnabled(), true, `${profile.id}: changed model Apply disabled`);
      assert.deepEqual(await projectSnapshot(page, profile), before, `${profile.id}: model preview mutated project`);
      await drawingTab.click();
      const drawingSelect = root.locator(profile.appearance).first();
      const drawingApply = root.locator(profile.drawingApply).first(); const drawingCancel = root.locator(profile.drawingCancel).first();
      await drawingSelect.selectOption('cool-blue');
      assert.equal(await drawingApply.isEnabled(), true, `${profile.id}: drawing preview unavailable`);
      await modelTab.click();
      assert.equal(await freshInput.inputValue(), '330', `${profile.id}: model preview lost across mode switch`);
      await modelCancel.click();
      assert.equal(await modelApply.isEnabled(), false, `${profile.id}: model Cancel left dirty state`);
      await drawingTab.click();
      assert.equal(await drawingSelect.inputValue(), 'cool-blue', `${profile.id}: drawing preview lost across mode switch`);
      await drawingCancel.click();
      assert.equal(await drawingApply.isEnabled(), false, `${profile.id}: drawing Cancel left dirty state`);

      await drawingSelect.selectOption('cool-blue');
      const staleDrawingApply = await drawingApply.elementHandle();
      const committedDrawing = await appearancePreset(page, profile, 'resistor-1');
      if (profile.id === 'avr') await page.click('#rotate-component');
      else await page.evaluate((name) => window[name].rotateCircuitComponent('resistor-1'), profile.global);
      await staleDrawingApply.evaluate((button) => button.click());
      assert.equal(await appearancePreset(page, profile, 'resistor-1'), committedDrawing,
        `${profile.id}: stale drawing preview committed`);
      await undo(page, profile);
      await selectPart(page, profile, 'resistor-1');

      await modelTab.click(); await modelInput.fill('330');
      await page.keyboard.press('Escape');
      await selectPart(page, profile, 'resistor-1');
      assert.equal(await root.locator(profile.modelApply).first().isEnabled(), false,
        `${profile.id}: close/reopen retained dirty model preview`);
      const reopenedInput = root.locator(`${profile.modelInput}[data-property="ohms"], ${profile.modelInput}[data-bounded-property="ohms"]`).first();
      assert.notEqual(await reopenedInput.inputValue(), '330', `${profile.id}: close committed model preview`);
      await reopenedInput.fill('330'); await root.locator(profile.modelApply).first().click();
      await page.waitForFunction(async ({ item }) => {
        const components = item.global ? window[item.global].state().circuitEditor.draft.components
          : window.__M6_PROJECT__().circuit.components;
        return components.find((component) => component.id === 'resistor-1').properties.ohms === 330;
      }, { item: profile });
      assert.equal(await root.locator(profile.modelApply).first().isEnabled(), false,
        `${profile.id}: model Apply stayed enabled after commit`);
      const after = await projectSnapshot(page, profile);
      const normalized = structuredClone(after);
      const normalizedResistor = normalized.circuit.components.find((component) => component.id === 'resistor-1');
      const beforeResistor = before.circuit.components.find((component) => component.id === 'resistor-1');
      normalizedResistor.properties.ohms = beforeResistor.properties.ohms;
      normalizedResistor.label = beforeResistor.label;
      assert.deepEqual(normalized, before, `${profile.id}: model Apply changed more than resistor ohms`);
      await undo(page, profile);
      assert.equal(await componentProperty(page, profile, 'resistor-1', 'ohms'),
        before.circuit.components.find((component) => component.id === 'resistor-1').properties.ohms,
        `${profile.id}: one Undo did not reverse model transaction`);
      await redo(page, profile);
      assert.equal(await componentProperty(page, profile, 'resistor-1', 'ohms'), 330,
        `${profile.id}: Redo did not restore model transaction`);

      await selectPart(page, profile, 'resistor-1');
      await root.locator(profile.drawingTab).click();
      await root.screenshot({ path: path.join(output, `${profile.id}-drawing-workspace.png`) });
      await root.locator(profile.modelTab).click();
      await root.screenshot({ path: path.join(output, `${profile.id}-model-workspace.png`) });

      await selectPart(page, profile, 'led-1');
      const ledRoot = page.locator(profile.properties);
      const ledInput = ledRoot.locator(`${profile.modelInput}[data-property="color"], ${profile.modelInput}[data-bounded-property="color"]`).first();
      const ledApply = ledRoot.locator(profile.modelApply).first();
      const originalColor = await componentProperty(page, profile, 'led-1', 'color');
      const nextColor = originalColor === 'green' ? 'yellow' : 'green';
      await ledInput.selectOption(nextColor);
      assert.equal(await ledApply.isEnabled(), true, `${profile.id}: LED model preview unavailable`);
      await ledApply.click();
      assert.equal(await componentProperty(page, profile, 'led-1', 'color'), nextColor,
        `${profile.id}: LED model property not applied`);
      await undo(page, profile);
      assert.equal(await componentProperty(page, profile, 'led-1', 'color'), originalColor,
        `${profile.id}: LED model Undo failed`);
      await redo(page, profile);
      assert.equal(await componentProperty(page, profile, 'led-1', 'color'), nextColor,
        `${profile.id}: LED model Redo failed`);
      await selectPart(page, profile, 'led-1');
      await ledRoot.locator(`${profile.modelInput}[data-property="color"], ${profile.modelInput}[data-bounded-property="color"]`).first().selectOption(originalColor);
      await page.keyboard.press('Escape');
      await selectPart(page, profile, 'led-1');
      assert.equal(await ledRoot.locator(`${profile.modelInput}[data-property="color"], ${profile.modelInput}[data-bounded-property="color"]`).first().inputValue(), nextColor,
        `${profile.id}: close/reopen retained LED preview`);
      report.push({ profile: profile.option, modelPreview: 'atomic', drawingPreview: 'independent',
        validation: 'pass', stalePreviewRejected: 'pass', closeDiscard: 'pass',
        resistorUndoRedo: 'one transaction', ledUndoRedo: 'one transaction' });
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(producerRequests, []);
    assert.equal(await page.evaluate(() => window.__X55_SPLIT_WORKERS__), 0);
    const result = { result: 'pass', profiles: report, keyboardTabs: 'pass', closeDiscard: 'pass',
      firmwareBuilds: 0, runtimeRuns: 0, scenarios: 0, workers: 0, producerRequests };
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ result: 'pass', profiles: report.length, screenshots: report.length * 2,
      firmwareBuilds: 0, runtimeRuns: 0, workers: 0 }));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
