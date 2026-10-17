// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.SHARED_WORKBENCH_URL || 'http://127.0.0.1:4173';
const profiles = [
  { id: 'board.rp2040-pico-v1', family: 'architecture.rp2040-v1', name: '#pico-project-name', source: '#pico-source', api: '__RP2040_PUBLIC_WORKBENCH__' },
  { id: 'board.esp32-c3-devmodule-v1', family: 'architecture.esp32-v1', name: '#c3-project-name', source: '#c3-source', api: '__ESP32C3_PUBLIC_WORKBENCH__' },
  { id: 'board.stm32f429zi-nucleo144-v1', family: 'architecture.stm32-v1', name: '#stm32-project-name', source: '#stm32-source', api: '__STM32_PUBLIC_WORKBENCH__' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1265, height: 900 } });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  for (const [index, profile] of profiles.entries()) {
    await page.selectOption('#family-select', profile.family);
    await page.waitForFunction((key) => window[key]?.state().active === true, profile.api);
    const expectedName = `PARKED DRAFT ${index + 1}`;
    await page.fill(profile.name, expectedName);
    await page.locator(profile.name).blur();
    await page.fill(profile.source, `${await page.inputValue(profile.source)}\n/* PARKED_${index + 1} */\n`);
    await page.evaluate((key) => {
      const result = window[key].moveCircuitComponent('resistor-1', 0.49, 0.31);
      if (!result.ok) throw new Error(result.code);
    }, profile.api);
    const before = await page.evaluate((key) => window[key].state(), profile.api);
    await page.selectOption('#family-select', index === 1 ? 'architecture.stm32-v1' : 'architecture.esp32-v1');
    await page.selectOption('#family-select', profile.family);
    const after = await page.evaluate((key) => window[key].state(), profile.api);
    assert.equal(await page.inputValue(profile.name), expectedName, `${profile.id}: project name reset`);
    assert.equal(await page.inputValue(profile.source), before.source ?? before.project.source, `${profile.id}: source reset`);
    assert.deepEqual(after.circuit ?? after.project.circuit, before.circuit ?? before.project.circuit, `${profile.id}: circuit reset`);
    assert.equal(after.artifact, null, `${profile.id}: stale executable authority returned`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  console.log(JSON.stringify({ result: 'pass', profiles: profiles.length, inputBlurSwitchBack: true, draftPreserved: true, staleAuthority: false }));
  await browser.close();
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
