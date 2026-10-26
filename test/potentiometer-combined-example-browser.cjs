// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.POT_EXAMPLE_URL || 'http://host.docker.internal:18789';
const profiles = [
  { id: 'board.rp2040-pico-v1', api: '__RP2040_PUBLIC_WORKBENCH__', input: '#pico-open-input',
    layer: '#pico-editor-components', file: 'pico-potentiometer-combined.intent-mcu.json' },
  { id: 'board.esp32-c3-devmodule-v1', api: '__ESP32C3_PUBLIC_WORKBENCH__', input: '#c3-open-input',
    layer: '#c3-editor-components', file: 'esp32-c3-potentiometer-combined.intent-mcu.json' },
  { id: 'board.stm32f429zi-nucleo144-v1', api: '__STM32_PUBLIC_WORKBENCH__', input: '#stm32-open-input',
    layer: '#stm32-editor-components', file: 'stm32-potentiometer-combined.intent-mcu.json' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile.id);
      await page.locator(profile.input).setInputFiles(path.resolve('examples/basic-components', profile.file));
      await page.waitForFunction(({ api }) => {
        const state = window[api]?.state(); const graph = state?.circuit ?? state?.project?.circuit;
        return graph?.components.some(({ id }) => id === 'potentiometer-1');
      }, profile);
      const before = await page.evaluate(({ api }) => {
        const state = window[api].state(); const graph = state.circuit ?? state.project.circuit;
        return { components: graph.components, nets: graph.nets,
          pot: graph.components.find(({ id }) => id === 'potentiometer-1') };
      }, profile);
      assert.deepEqual(before.pot.properties, { ohms: 10000, taper: 'linear' });
      for (const pin of ['HIGH', 'WIPER', 'LOW']) assert(before.nets.some(({ endpoints }) => endpoints.some(
        ({ component, pin: actual }) => component === 'potentiometer-1' && actual === pin)));
      assert.equal(await page.locator(`${profile.layer} [data-component-id="potentiometer-1"]`).count(), 1);
      for (const pin of ['HIGH', 'WIPER', 'LOW']) assert.equal(await page.locator(
        `${profile.layer} [data-component-id="potentiometer-1"] [data-endpoint="potentiometer-1.${pin}"]`).count(), 1);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.selectOption('#board-select', profile.id);
      await page.waitForFunction(({ api }) => {
        const state = window[api]?.state(); const graph = state?.circuit ?? state?.project?.circuit;
        return graph?.components.some(({ id }) => id === 'potentiometer-1');
      }, profile);
      const after = await page.evaluate(({ api }) => {
        const state = window[api].state(); const graph = state.circuit ?? state.project.circuit;
        return { components: graph.components, nets: graph.nets,
          pot: graph.components.find(({ id }) => id === 'potentiometer-1') };
      }, profile);
      assert.deepEqual(after, before);
    }
    console.log(JSON.stringify({ ok: true, profiles: profiles.length, journey: 'Open → visible WIPER → reload' }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
