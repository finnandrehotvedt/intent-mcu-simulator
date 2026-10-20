// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.X61_URL || 'http://127.0.0.1:18852';
const profiles = [
  { name: 'AVR', profile: 'board.atmega328p-16mhz-v1', component: 'Controller', pin: 'D13', file: 'main.ino', source: 'void setup', key: 'AVR' },
  { name: 'Pico', family: 'architecture.rp2040-v1', profile: 'board.rp2040-pico-v1', component: 'RP2040', pin: 'GP0', file: 'main.c', source: 'intent_gpio0_output', key: 'PICO' },
  { name: 'C3', family: 'architecture.esp32-v1', profile: 'board.esp32-c3-devmodule-v1', component: 'ESP32', pin: 'GPIO2', file: 'sketch.ino', source: 'pinMode', key: 'C3' },
  { name: 'STM32', family: 'architecture.stm32-v1', profile: 'board.stm32f429zi-nucleo144-v1', component: 'STM32', pin: 'PB0', file: 'main.c', source: 'intent_pb0_output', key: 'STM32' },
];
const activate = async (locator, page) => { await locator.focus(); await page.keyboard.press('Enter'); };
const state = (page, profile) => page.evaluate((id) => {
  const text = window.__COMMON_PROJECT_FILES__.current(id);
  if (id === 'board.atmega328p-16mhz-v1') return { text, revision: window.__M6_STATE__.revision, circuitRevision: window.__M6_STATE__.revision,
    dirty: window.__M6_STATE__.project.build.status, undoDisabled: document.querySelector('#undo').disabled,
    redoDisabled: document.querySelector('#redo').disabled, artifact: window.__M6_STATE__.artifactIdentity, runtime: window.__M6_STATE__.runtime };
  const value = id.includes('rp2040') ? window.__RP2040_PUBLIC_WORKBENCH__.state()
    : id.includes('esp32') ? window.__ESP32C3_PUBLIC_WORKBENCH__.state() : window.__STM32_PUBLIC_WORKBENCH__.state();
  return { text, revision: value.revision, circuitRevision: value.circuitEditor.revision, dirty: value.phase,
    undoDisabled: !value.circuitEditor.canUndo, redoDisabled: !value.circuitEditor.canRedo,
    artifact: value.artifact ?? null, runtime: value.runtime ?? null };
}, profile);
const selected = (page, profile) => page.evaluate((id) => {
  if (id === 'board.atmega328p-16mhz-v1') return { component: window.__M6_STATE__.selectedComponentId, net: window.__M6_STATE__.selectedNetId };
  return (id.includes('rp2040') ? window.__RP2040_PUBLIC_WORKBENCH__.state()
    : id.includes('esp32') ? window.__ESP32C3_PUBLIC_WORKBENCH__.state() : window.__STM32_PUBLIC_WORKBENCH__.state()).circuitEditor.selection;
}, profile);

(async () => {
  const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const external = []; const errors = []; await page.addInitScript(() => { window.__X61_POINTER__ = 0; addEventListener('pointerdown', () => { window.__X61_POINTER__ += 1; }, true); });
  page.on('pageerror', (error) => errors.push(error.message)); page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url()); });
  await page.goto(base, { waitUntil: 'networkidle' }); await activate(page.locator('#project-demo'), page); await activate(page.locator('[data-example="blink"]'), page);
  await page.locator('#source-file-name').fill('helpers.h'); await activate(page.locator('#source-file-add'), page); await page.locator('#source').fill('#define NAV_HELPER 13\n');
  await page.locator('#project-brief-acceptance').fill('REQ-HELPER | Find helper | helpers.h:1 | TEST-HELPER');
  const nav = page.locator('#project-navigation'); if (!await nav.evaluate((node) => node.open)) await activate(nav.locator('summary'), page); const query = page.locator('#project-navigation-query');
  await query.fill('helpers.h'); await activate(page.locator('[data-navigation-kind="file"][data-navigation-id="helpers.h"]'), page); assert.equal(await page.locator('#source-file').inputValue(), 'helpers.h');
  await query.fill('NAV_HELPER'); await activate(page.locator('[data-navigation-kind="source"]').first(), page); assert.equal(await page.locator('#source').evaluate((node) => node.value.slice(node.selectionStart, node.selectionEnd)), '#define NAV_HELPER 13');
  await query.fill('TEST-HELPER'); await activate(page.locator('[data-navigation-kind="test"]').first(), page); assert.equal(await page.evaluate(() => document.activeElement.closest('[data-requirement-id]')?.dataset.requirementId), 'REQ-HELPER');
  await query.fill('NAV_HELPER'); const stale = await page.locator('[data-navigation-kind="source"]').first().elementHandle(); await page.locator('#source').fill('#define NAV_HELPER 12\n'); await stale.evaluate((button) => button.click()); assert.match(await page.locator('#project-navigation-status').textContent(), /Project changed; search again/u);
  await activate(page.locator('#project-demo'), page); await activate(page.locator('[data-example="avr-thermostat-boundary-v1"]'), page); if (await page.locator('#unsaved-discard').isVisible().catch(() => false)) await activate(page.locator('#unsaved-discard'), page);
  await query.fill('THERM-SCENARIO-EQUALITY-ENABLED-TEMP'); await activate(page.locator('[data-navigation-kind="test"]').first(), page); assert.equal(await page.evaluate(() => document.activeElement.closest('[data-scenario-id]')?.dataset.scenarioId), 'THERM-SCENARIO-EQUALITY-ENABLED');

  for (const profile of profiles) {
    if (profile.family) { await page.locator('#family-select').selectOption(profile.family); await page.locator('#board-select').selectOption(profile.profile); }
    await page.locator('#project-brief-acceptance').fill(`REQ-${profile.key} | Navigate ${profile.name} | ${profile.file}:1 | TEST-${profile.key}`); const before = await state(page, profile.profile);
    await query.fill(profile.component); const component = page.locator('[data-navigation-kind="component"]').first(); const componentId = await component.getAttribute('data-navigation-id'); await activate(component, page); const cs = await selected(page, profile.profile); assert.equal(cs.component ?? cs.id, componentId, `${profile.name} component landing`);
    await query.fill(profile.pin); const pin = page.locator('[data-navigation-kind="pin"]').first(); const pinId = await pin.getAttribute('data-navigation-id'); await activate(pin, page); await page.waitForFunction((id) => (document.activeElement.dataset.endpoint ?? document.activeElement.dataset.editorEndpoint) === id, pinId); assert.equal(await page.evaluate(() => document.activeElement.dataset.endpoint ?? document.activeElement.dataset.editorEndpoint), pinId, `${profile.name} pin landing`);
    await query.fill('net-'); const net = page.locator('[data-navigation-kind="net"]').first(); const netId = await net.getAttribute('data-navigation-id'); await activate(net, page); const ns = await selected(page, profile.profile); assert.equal(ns.net ?? ns.id, netId, `${profile.name} net landing`);
    await query.fill(profile.file); await activate(page.locator(`[data-navigation-kind="file"][data-navigation-id="${profile.file}"]`).first(), page); const fileOwner = profile.name === 'AVR' ? '#source-file' : profile.name === 'Pico' ? '#pico-source' : profile.name === 'C3' ? '#c3-source' : '#stm32-source'; assert(await page.locator(fileOwner).evaluate((node) => node === document.activeElement), `${profile.name} file landing`);
    await query.fill(profile.source); await activate(page.locator('[data-navigation-kind="source"]').first(), page); const editor = profile.name === 'AVR' ? page.locator('#source') : page.locator(fileOwner); assert((await editor.evaluate((node) => node.value.slice(node.selectionStart, node.selectionEnd))).includes(profile.source), `${profile.name} source landing`);
    await query.fill(`TEST-${profile.key}`); await activate(page.locator('[data-navigation-kind="test"]').first(), page); assert.equal(await page.evaluate(() => document.activeElement.closest('[data-requirement-id]')?.dataset.requirementId), `REQ-${profile.key}`, `${profile.name} test landing`);
    assert.deepEqual(await state(page, profile.profile), before, `${profile.name} navigation changed canonical/dirty/history/runtime authority`);
  }

  await query.fill('PRIVATE-QUERY-NOT-SAVED'); const [download] = await Promise.all([page.waitForEvent('download'), activate(page.locator('#stm32-save'), page)]); const saved = fs.readFileSync(await download.path(), 'utf8'); assert(!saved.includes('PRIVATE-QUERY-NOT-SAVED'));
  const beforeOpen = await state(page, 'board.stm32f429zi-nucleo144-v1'); await page.setInputFiles('#stm32-open-input', { name: 'stm32.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(saved) }); if (await page.locator('#unsaved-discard').isVisible().catch(() => false)) await activate(page.locator('#unsaved-discard'), page); await page.waitForTimeout(50); assert.equal((await state(page, 'board.stm32f429zi-nucleo144-v1')).text, beforeOpen.text);
  await query.fill('PB0'); const count = await page.locator('[data-navigation-kind]').count(); await page.setInputFiles('#stm32-open-input', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"bad":true}') }); await page.waitForTimeout(50); assert.equal((await state(page, 'board.stm32f429zi-nucleo144-v1')).text, beforeOpen.text); assert.equal(await page.locator('[data-navigation-kind]').count(), count);
  await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.locator('#project-navigation-query').inputValue(), ''); assert.equal(await page.locator('[data-navigation-kind]').count(), 0);
  assert.equal(await page.evaluate(() => window.__X61_POINTER__), 0); assert.deepEqual(external, []); assert.deepEqual(errors, []); assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  await browser.close(); process.stdout.write(JSON.stringify({ status: 'passed', profiles: profiles.map(({ name }) => name), pointerEvents: 0, navigationKinds: ['component', 'pin', 'net', 'file', 'source', 'test'], lifecycle: ['save-open', 'rejected-open', 'reload', 'stale'] }) + '\n');
})().catch((error) => { console.error(error); process.exit(1); });
