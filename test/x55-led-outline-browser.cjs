// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X55_LED_URL || 'http://host.docker.internal:18895';
const output = process.env.X55_LED_OUTPUT || '/tmp/x55-led-outline';
const profiles = [
  { option: 'board.rp2040-pico-v1', global: '__RP2040_PUBLIC_WORKBENCH__',
    layer: '#pico-editor-components', properties: '#pico-part-properties' },
  { option: 'board.esp32-c3-devmodule-v1', global: '__ESP32C3_PUBLIC_WORKBENCH__',
    layer: '#c3-editor-components', properties: '#c3-part-properties' },
  { option: 'board.stm32f429zi-nucleo144-v1', global: '__STM32_PUBLIC_WORKBENCH__',
    layer: '#stm32-editor-components', properties: '#stm32-part-properties' },
];

const anchors = (page, selector) => page.evaluate((root) => Object.fromEntries(
  ['ANODE', 'CATHODE'].map((pin) => {
    const box = document.querySelector(`${root} .pin-anchor[data-editor-endpoint="led-1.${pin}"],
      ${root} .pin-anchor[data-endpoint="led-1.${pin}"]`).getBoundingClientRect();
    return [pin, { x: box.x + box.width / 2, y: box.y + box.height / 2 }];
  })), selector);

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block' });
  await context.addInitScript(() => {
    const NativeWorker = window.Worker; window.__X55_LED_WORKERS__ = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args) { window.__X55_LED_WORKERS__ += 1; super(...args); }
    };
  });
  const page = await context.newPage();
  const producerRequests = [];
  page.on('request', (request) => {
    if (/\/(?:api|compile|run|scenario)(?:\/|$)/u.test(new URL(request.url()).pathname)) {
      producerRequests.push(request.url());
    }
  });
  try {
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#project-files-open'); await page.click('#project-demo');
    await page.click('.starter-card[data-example="blink"]');
    const avrCard = page.locator('#component-layer [data-component-id="led-1"]');
    await avrCard.click(); await page.click('#toggle-inspector');
    await page.click('#component-editor-drawing-tab');
    assert.deepEqual(await avrCard.locator('[data-body-contact]').evaluateAll((nodes) =>
      nodes.map((node) => Number(node.getAttribute('y1')))), [55, 57]);
    const avrBefore = await page.evaluate(() => ({
      source: window.__M6_PROJECT__().source,
      circuit: window.__M6_PROJECT__().circuit,
      position: window.__M6_PROJECT__().layout.positions['led-1'],
      build: window.__M6_PROJECT__().build,
    }));
    const avrAnchors = await anchors(page, '#component-layer');
    await page.locator('#appearance-preset').focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('#appearance-preset').value === 'soft-square');
    for (const widthPct of [80, 100]) {
      for (const heightPct of [80, 100]) {
        for (const cornerPct of [0, 100]) {
          await page.locator('#appearance-width').fill(String(widthPct));
          await page.locator('#appearance-height').fill(String(heightPct));
          await page.locator('#appearance-corner').fill(String(cornerPct));
          assert.deepEqual(await page.locator('#appearance-preview [data-body-contact]').evaluateAll(
            (nodes) => nodes.map((node) => Number(node.getAttribute('y1'))),
          ), [54, 54]);
        }
      }
    }
    await page.locator('#appearance-width').fill('80');
    await page.locator('#appearance-height').fill('80');
    await page.locator('#appearance-corner').fill('0');
    await page.locator('#appearance-preview').screenshot({
      path: path.join(output, 'avr-led-lead-continuity-extreme.png'),
    });
    await page.locator('#appearance-width').fill('88');
    await page.locator('#appearance-height').fill('84');
    await page.locator('#appearance-corner').fill('35');
    assert.equal(await avrCard.locator('.component-led.appearance-soft-square').count(), 0);
    assert.equal(await page.locator('#appearance-preview .component-led.appearance-soft-square').count(), 1);
    assert.equal(await page.locator('#appearance-preview [data-body-geometry="88/84/35"]').count(), 1);
    await page.locator('#appearance-preset').focus();
    for (let index = 0; index < 5; index += 1) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'appearance-apply');
    await page.keyboard.press('Enter');
    assert.equal(await avrCard.locator('.component-led.appearance-soft-square').count(), 1);
    assert.deepEqual(await anchors(page, '#component-layer'), avrAnchors);
    assert.deepEqual(await page.evaluate(() => ({
      source: window.__M6_PROJECT__().source,
      circuit: window.__M6_PROJECT__().circuit,
      position: window.__M6_PROJECT__().layout.positions['led-1'],
      build: window.__M6_PROJECT__().build,
    })), avrBefore);
    await page.locator('#top-workbench-shell').screenshot({ path: path.join(output, 'avr-soft-square.png') });

    const report = [{ profile: 'board.atmega328p-16mhz-v1', previewNonmutating: true,
      apply: 'soft-square', anchors: 'equal', electricalRuntime: 'equal',
      leadContinuity: 'historical-default-preserved-and-custom-overlap-1-svg-unit' }];
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile.option);
      await page.waitForFunction(({ global }) => window[global]?.state().active === true, profile);
      const before = await page.evaluate(({ global }) => {
        const state = window[global].state();
        const circuit = structuredClone(state.project?.circuit ?? state.circuit);
        delete circuit.layout.componentAppearance;
        return { source: state.project?.source ?? state.source,
          circuit,
          artifact: state.artifact, runtime: state.runtime, runnable: state.runnable, phase: state.phase };
      }, profile);
      const card = page.locator(`${profile.layer} [data-component-id="led-1"]`);
      await card.click();
      if (await page.locator('#workbench-inspector-dialog').getAttribute('open') === null) {
        await page.click('#toggle-inspector');
      }
      await page.waitForSelector('#workbench-inspector-dialog[open]');
      await page.locator(`${profile.properties} [data-component-editor-mode="drawing"]`).click();
      const control = page.locator(`${profile.properties} select[data-bounded-appearance="led-1"]`);
      const apply = page.locator(`${profile.properties} button[data-bounded-appearance-apply="led-1"]`);
      const body = (key) => page.locator(`${profile.properties} input[data-bounded-body="${key}"]`);
      const anchorBefore = await anchors(page, profile.layer);
      await control.selectOption('soft-square');
      await body('widthPct').fill('88'); await body('heightPct').fill('84'); await body('cornerPct').fill('35');
      assert.equal(await card.locator('.component-led.appearance-soft-square').count(), 0);
      assert.equal(await page.locator(`${profile.properties} .appearance-preview .component-led.appearance-soft-square`).count(), 1);
      assert.equal(await page.locator(`${profile.properties} .appearance-preview [data-body-geometry="88/84/35"]`).count(), 1);
      await apply.click();
      assert.equal(await card.locator('.component-led.appearance-soft-square').count(), 1);
      assert.deepEqual(await card.locator('[data-body-contact]').evaluateAll((nodes) =>
        nodes.map((node) => Number(node.getAttribute('y1')))), [54, 54]);
      assert.deepEqual(await anchors(page, profile.layer), anchorBefore);
      const after = await page.evaluate(({ global }) => {
        const state = window[global].state();
        const circuit = structuredClone(state.project?.circuit ?? state.circuit);
        delete circuit.layout.componentAppearance;
        return { source: state.project?.source ?? state.source,
          circuit,
          artifact: state.artifact, runtime: state.runtime, runnable: state.runnable, phase: state.phase };
      }, profile);
      assert.deepEqual(after, before);
      await page.locator('#top-workbench-shell').screenshot({
        path: path.join(output, `${profile.option.split('.')[1]}-soft-square.png`),
      });
      report.push({ profile: profile.option, previewNonmutating: true, apply: 'soft-square',
        anchors: 'equal', electricalRuntime: 'equal', leadContinuity: 'overlap-1-svg-unit' });
    }
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile.option);
      await page.waitForFunction(({ global }) => window[global]?.state().active === true, profile);
      assert.equal(await page.locator(
        `${profile.layer} [data-component-id="led-1"] .component-led.appearance-soft-square`,
      ).count(), 1, `${profile.option}: parked appearance was lost`);
    }
    assert.deepEqual(producerRequests, []);
    assert.equal(await page.evaluate(() => window.__X55_LED_WORKERS__), 0);
    const result = { result: 'pass', profiles: report, firmwareBuilds: 0, runtimeRuns: 0,
      scenarios: 0, workers: 0, producerRequests, ledExtremeCases: 8 };
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ result: 'pass', profiles: report.length, workers: 0 }));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
