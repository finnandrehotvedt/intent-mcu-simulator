// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.DRAFT_SAFETY_URL || 'http://127.0.0.1:18932';
const profiles = [
  ['board.rp2040-pico-v1', '#pico-source', '#pico-project-name', '__RP2040_PUBLIC_WORKBENCH__'],
  ['board.esp32-c3-devmodule-v1', '#c3-source', '#c3-project-name', '__ESP32C3_PUBLIC_WORKBENCH__'],
  ['board.stm32f429zi-nucleo144-v1', '#stm32-source', '#stm32-project-name', '__STM32_PUBLIC_WORKBENCH__'],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(8_000);
    await page.route('**/api/page-views', (route) => route.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ status: 'disabled' }) }));
    await page.goto(base);
    await page.waitForFunction(() => window.__M11_READY__);

    for (const [profile, sourceSelector, nameSelector, apiName] of profiles) {
      await page.selectOption('#board-select', profile);
      await page.waitForTimeout(100);
      const marker = `draft-${profile}`;
      await page.evaluate(({ sourceSelector, marker }) => {
        const source = document.querySelector(sourceSelector);
        source.value = `${source.value}\n// ${marker}`;
        source.dispatchEvent(new Event('input', { bubbles: true }));
      }, { sourceSelector, marker });
      await page.waitForTimeout(100);
      await page.evaluate(({ nameSelector, marker }) => {
        const name = document.querySelector(nameSelector);
        name.value = marker;
        name.dispatchEvent(new Event('input', { bubbles: true }));
        name.dispatchEvent(new Event('change', { bubbles: true }));
      }, { nameSelector, marker });
      const before = await page.evaluate((name) => window[name].state(), apiName);
      const component = (before.circuit ?? before.project?.circuit ?? before.circuitEditor.draft).components[0];
      const moved = { x: Math.min(0.9, component.x + 0.03), y: Math.min(0.9, component.y + 0.02) };
      await page.evaluate(({ name, id, moved }) => window[name].moveCircuitComponent(id, moved.x, moved.y),
        { name: apiName, id: component.id, moved });
      await page.evaluate((name) => window[name].undoCircuit(), apiName);
      await page.evaluate(({ name, id, moved }) => window[name].moveCircuitComponent(id, moved.x, moved.y),
        { name: apiName, id: component.id, moved });
      const authored = await page.evaluate((name) => {
        const state = window[name].state();
        return { source: state.source ?? state.project?.source,
          circuit: state.circuit ?? state.project?.circuit ?? state.circuitEditor.draft };
      }, apiName);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__M11_READY__);
      assert.equal(await page.inputValue('#board-select'), profile, `${profile}: active profile not retained`);
      assert.equal(await page.inputValue(sourceSelector), authored.source, `${profile}: source not retained`);
      assert.equal(await page.inputValue(nameSelector), marker, `${profile}: name not retained`);
      assert.deepEqual(await page.evaluate((name) => {
        const state = window[name].state();
        return state.circuit ?? state.project?.circuit ?? state.circuitEditor.draft;
      }, apiName), authored.circuit,
        `${profile}: graph/layout not retained`);
      assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);
    }

    const beforeCorruptRecovery = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const corruptKey = await page.evaluate(() => {
      const id = 'deadbeef-dead-beef-dead-beefdeadbeef';
      const key = `teach-lab.simulator.project.v2.tab.${id}`;
      localStorage.setItem(key, '{bad json');
      const registry = JSON.parse(localStorage.getItem('intent-mcu.draft-registry.v1') || '[]');
      registry.unshift({ id, name: 'Corrupt preserved draft', updatedAt: Date.now() });
      localStorage.setItem('intent-mcu.draft-registry.v1', JSON.stringify(registry));
      return key;
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__);
    await page.selectOption('#board-select', 'board.atmega328p-16mhz-v1');
    await page.click('#workbench-more > summary');
    await page.click('#project-files-open');
    await page.click('#browser-draft-recovery > summary');
    await page.selectOption('#project-draft-recovery', corruptKey);
    await page.click('#project-draft-recover');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), beforeCorruptRecovery,
      'corrupt recovery must not replace the current project');
    assert.match(await page.textContent('#project-message'), /left untouched|remain untouched|validation failed|did not complete/iu);

    process.stdout.write(`${JSON.stringify({ result: 'pass', profiles: 4,
      sourceNameGraphRefresh: true, corruptRecoveryAtomic: true, nativeBuilds: 0, nativeRuns: 0 })}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
