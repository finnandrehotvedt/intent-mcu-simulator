// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.X61_URL || 'http://127.0.0.1:18852';
const profiles = [
  ['AVR', null, 'board.atmega328p-16mhz-v1', 'D13', 'main.ino'],
  ['Pico', 'architecture.rp2040-v1', 'board.rp2040-pico-v1', 'GP0', 'main.c'],
  ['C3', 'architecture.esp32-v1', 'board.esp32-c3-devmodule-v1', 'GPIO2', 'sketch.ino'],
  ['STM32', 'architecture.stm32-v1', 'board.stm32f429zi-nucleo144-v1', 'PB0', 'main.c'],
];
(async () => {
  const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const external = []; const errors = []; await page.addInitScript(() => { window.__X61_POINTER__ = 0; addEventListener('pointerdown', () => { window.__X61_POINTER__ += 1; }, true); });
  page.on('pageerror', (error) => errors.push(error.message)); page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#project-demo').focus(); await page.keyboard.press('Enter');
  await page.locator('[data-example="blink"]').focus(); await page.keyboard.press('Enter');
  await page.locator('#source-file-name').fill('helpers.h'); await page.locator('#source-file-add').focus(); await page.keyboard.press('Enter');
  await page.locator('#source').fill('#define NAV_HELPER 13\n');
  await page.locator('#project-brief-acceptance').fill('REQ-NAV | Find helper | helpers.h:1 | TEST-NAV');
  const nav = page.locator('#project-navigation'); if (!await nav.evaluate((node) => node.open)) { await nav.locator('summary').focus(); await page.keyboard.press('Enter'); }
  const navQuery = page.locator('#project-navigation-query'); await navQuery.fill('helpers.h');
  assert.equal(await page.locator('[data-navigation-kind="file"]').first().getAttribute('data-navigation-id'), 'helpers.h');
  await navQuery.fill('TEST-NAV'); assert.equal(await page.locator('[data-navigation-kind="test"]').count(), 1);
  await navQuery.fill('NAV_HELPER'); const stale = await page.locator('[data-navigation-kind="source"]').first().elementHandle();
  await page.locator('#source').fill('#define NAV_HELPER 12\n'); await stale.evaluate((button) => button.click());
  assert.match(await page.locator('#project-navigation-status').textContent(), /Project changed; search again/u);
  await page.locator('#project-demo').focus(); await page.keyboard.press('Enter');
  await page.locator('[data-example="avr-thermostat-boundary-v1"]').focus(); await page.keyboard.press('Enter');
  if (await page.locator('#unsaved-discard').isVisible().catch(() => false)) { await page.locator('#unsaved-discard').focus(); await page.keyboard.press('Enter'); }
  await navQuery.fill('THERM-SCENARIO'); assert((await page.locator('[data-navigation-kind="test"]').count()) >= 4);
  for (const [name, family, profile, pin, file] of profiles) {
    if (family) { await page.locator('#family-select').selectOption(family); await page.locator('#board-select').selectOption(profile); }
    const details = page.locator('#project-navigation'); if (!await details.evaluate((node) => node.open)) { await details.locator('summary').focus(); await page.keyboard.press('Enter'); }
    const query = page.locator('#project-navigation-query'); await query.focus(); await query.fill(pin);
    const pinResult = page.locator('[data-navigation-kind="pin"]').first();
    await pinResult.waitFor({ timeout: 5000 }).catch(async (error) => { throw new Error(`${name}: ${await page.locator('#project-navigation-status').textContent()} · ${error.message}`); });
    assert((await pinResult.textContent()).includes(pin), `${name} pin absent`);
    await page.keyboard.press('Tab');
    await query.fill(file); const fileResult = page.locator('[data-navigation-kind="file"]').first(); await fileResult.waitFor(); assert.equal(await fileResult.getAttribute('data-navigation-id'), file);
    const before = await page.evaluate((p) => p === 'board.atmega328p-16mhz-v1' ? window.__M6_STATE__.revision : p.includes('rp2040') ? window.__RP2040_PUBLIC_WORKBENCH__.state().revision : p.includes('esp32') ? window.__ESP32C3_PUBLIC_WORKBENCH__.state().revision : window.__STM32_PUBLIC_WORKBENCH__.state().revision, profile);
    await fileResult.focus(); await page.keyboard.press('Enter');
    const after = await page.evaluate((p) => p === 'board.atmega328p-16mhz-v1' ? window.__M6_STATE__.revision : p.includes('rp2040') ? window.__RP2040_PUBLIC_WORKBENCH__.state().revision : p.includes('esp32') ? window.__ESP32C3_PUBLIC_WORKBENCH__.state().revision : window.__STM32_PUBLIC_WORKBENCH__.state().revision, profile);
    assert.equal(after, before, `${name} navigation mutated revision`);
  }
  assert.equal(await page.evaluate(() => window.__X61_POINTER__), 0); assert.deepEqual(external, []); assert.deepEqual(errors, []);
  assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  await browser.close(); process.stdout.write(JSON.stringify({ status: 'passed', profiles: profiles.map((row) => row[0]), pointerEvents: 0 }) + '\n');
})().catch((error) => { console.error(error); process.exit(1); });
