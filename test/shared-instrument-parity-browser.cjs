// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.SHARED_INSTRUMENT_URL || 'http://127.0.0.1:18789';
const profiles = {
  avr: 'board.atmega328p-16mhz-v1', pico: 'board.rp2040-pico-v1',
  c3: 'board.esp32-c3-devmodule-v1', stm32: 'board.stm32f429zi-nucleo144-v1',
};

async function summary(page) {
  return page.evaluate(() => structuredClone(window.__SHARED_INSTRUMENT_SUMMARY__));
}

async function assertPresentation(page, profile, classifications) {
  const value = await summary(page);
  assert.equal(value.schema, 'intent-mcu-shared-instrument-summary@1');
  assert.equal(value.profile, profile);
  assert.equal(value.state, 'current-runtime');
  assert.deepEqual(Object.values(value.channels).map((channel) => channel.classification), classifications);
  const root = profile === profiles.avr ? '#instrument-evidence' : `[data-instrument-profile="${profile}"]`;
  for (const [name, channel] of Object.entries(value.channels)) {
    const text = await page.locator(`${root} [data-instrument-summary-channel="${name}"]`).textContent();
    assert(text.startsWith(channel.classification), `${profile}.${name} UI/state mismatch: ${text}`);
    assert(text.includes(channel.provenance), `${profile}.${name} provenance missing`);
  }
  const trace = await page.evaluate(() => structuredClone(window.__SHARED_INSTRUMENT_VIEW__.trace));
  assert.equal(trace.schema, 'intent-mcu-runtime-trace@1');
  assert.equal(trace.classification, value.channels.logic.classification);
  assert.equal(trace.artifactIdentity, value.artifactIdentity);
  const traceClass = await page.locator(`${root} [data-shared-trace-classification]`).textContent();
  assert.equal(traceClass, trace.classification);
  assert((await page.locator(`${root} [data-shared-trace-axis]`).textContent()).length > 10);
  assert((await page.locator(`${root} [data-shared-trace-provenance]`).textContent()).includes(trace.provenance));
  if (trace.channels.length) assert.equal(await page.locator(`${root} [data-shared-trace-select]`).isDisabled(), false);
  return value;
}

async function select(page, profile) {
  await page.selectOption('#board-select', profile);
  await page.waitForFunction((expected) => window.__SHARED_INSTRUMENT_SUMMARY__?.profile === expected, profile);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1536, height: 1100 } });
    const outside = []; const errors = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.stack || error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true);

    // AVR: actual compiler/worker journey, layout retention, reset retirement,
    // then source invalidation.
    await page.selectOption('#example-select', 'button');
    await page.click('#project-demo');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.some((item) => item.id === 'button-1'));
    await page.click('#build');
    await page.waitForFunction(() => ['succeeded', 'failed'].includes(window.__M6_STATE__.buildState), null, { timeout: 45_000 });
    assert.equal(await page.evaluate(() => window.__M6_STATE__.buildState), 'succeeded');
    await page.click('#run');
    await page.waitForFunction(() => window.__M6_STATE__.runtime?.cycle > 20_000
      && window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime', null, { timeout: 20_000 });
    const avr = await assertPresentation(page, profiles.avr,
      ['recorded-runtime', 'recorded-runtime', 'recorded-runtime', 'recorded-runtime']);
    if (process.env.I03_SCREENSHOT) {
      await page.locator('#instrument-evidence').scrollIntoViewIfNeeded();
      await page.screenshot({ path: process.env.I03_SCREENSHOT, fullPage: false });
    }
    await page.locator('#component-layer [data-component-id="board-1"]').dispatchEvent('click');
    await page.keyboard.press('ArrowRight');
    assert.equal((await summary(page)).artifactIdentity, avr.artifactIdentity);
    await page.click('#reset');
    await page.waitForFunction(() => window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime');
    const avrSource = await page.inputValue('#source');
    await page.fill('#source', `${avrSource}\n`);
    await page.waitForFunction(() => window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'no-current-runtime');

    // RP2040: current UF2 worker evidence survives layout-only movement, reset
    // retires the old snapshot, and an electrical edit clears authority.
    await select(page, profiles.pico);
    assert.equal((await summary(page)).state, 'no-current-runtime');
    await page.click('#pico-build');
    await page.waitForFunction(() => window.__RP2040_PUBLIC_STATE__?.phase === 'built', null, { timeout: 45_000 });
    await page.click('#pico-run');
    await page.waitForFunction(() => window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime', null, { timeout: 20_000 });
    const pico = await assertPresentation(page, profiles.pico,
      ['recorded-runtime', 'recorded-runtime', 'recorded-runtime', 'unavailable']);
    const picoPosition = await page.evaluate(() => window.__RP2040_PUBLIC_STATE__.circuit.layout.positions['resistor-1']);
    await page.evaluate(({ x, y }) => window.__RP2040_PUBLIC_WORKBENCH__.moveCircuitComponent('resistor-1', x + 0.02, y), picoPosition);
    assert.equal((await summary(page)).artifactIdentity, pico.artifactIdentity);
    await page.click('#pico-reset');
    await page.waitForFunction(() => window.__RP2040_PUBLIC_STATE__?.runtime?.kind === 'reset'
      && window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime');
    assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_STATE__.runtime.cycle), 0);
    await page.evaluate(() => {
      window.__RP2040_PUBLIC_WORKBENCH__.selectCircuit({ kind: 'component', id: 'resistor-1' });
      window.__RP2040_PUBLIC_WORKBENCH__.deleteSelected();
    });
    await page.waitForFunction(() => window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'no-current-runtime');

    // C3: actual QEMU UART and separately labelled project GPIO2 model; Open
    // imports authored data only and clears the runtime summary.
    await select(page, profiles.c3);
    await page.click('#c3-build');
    await page.waitForFunction(() => ['built', 'failed'].includes(window.__ESP32C3_PUBLIC_STATE__?.phase), null, { timeout: 190_000 });
    assert.equal((await page.evaluate(() => window.__ESP32C3_PUBLIC_STATE__.phase)), 'built');
    await page.click('#c3-run');
    await page.waitForFunction(() => window.__ESP32C3_PUBLIC_STATE__?.phase === 'complete'
      && window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime', null, { timeout: 50_000 });
    const c3 = await assertPresentation(page, profiles.c3,
      ['recorded-runtime', 'project-model', 'project-model', 'unavailable']);
    assert.match(c3.channels.gpio.provenance, /not QEMU pin state/u);
    assert.match(c3.channels.logic.provenance, /not QEMU CPU GPIO/u);
    const c3Position = await page.evaluate(() => window.__ESP32C3_PUBLIC_STATE__.project.circuit.layout.positions['resistor-1']);
    await page.evaluate(({ x, y }) => window.__ESP32C3_PUBLIC_WORKBENCH__.moveCircuitComponent('resistor-1', x + 0.02, y), c3Position);
    assert.equal((await summary(page)).artifactIdentity, c3.artifactIdentity);
    const c3Project = await page.evaluate((profile) => window.__COMMON_PROJECT_FILES__.current(profile), profiles.c3);
    await page.setInputFiles('#c3-open-input', { name: 'c3.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(c3Project) });
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'no-current-runtime');

    // STM32: actual Renode USART3/PB0 result, layout retention, reset retirement,
    // and source invalidation.
    await select(page, profiles.stm32);
    await page.click('#stm32-build');
    await page.waitForFunction(() => ['built', 'failed', 'blocked'].includes(window.__STM32_PUBLIC_STATE__?.phase), null, { timeout: 120_000 });
    assert.equal((await page.evaluate(() => window.__STM32_PUBLIC_STATE__.phase)), 'built');
    await page.click('#stm32-run');
    await page.waitForFunction(() => window.__STM32_PUBLIC_STATE__?.phase === 'completed'
      && window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime', null, { timeout: 120_000 });
    const stm32 = await assertPresentation(page, profiles.stm32,
      ['recorded-runtime', 'recorded-runtime', 'recorded-runtime', 'unavailable']);
    const stmPosition = await page.evaluate(() => window.__STM32_PUBLIC_STATE__.project.circuit.layout.positions['resistor-1']);
    await page.evaluate(({ x, y }) => window.__STM32_PUBLIC_WORKBENCH__.moveCircuitComponent('resistor-1', x + 0.02, y), stmPosition);
    assert.equal((await summary(page)).artifactIdentity, stm32.artifactIdentity);
    await page.click('#stm32-reset');
    assert.equal((await summary(page)).state, 'no-current-runtime');
    await page.waitForFunction(() => window.__STM32_PUBLIC_STATE__?.phase === 'completed'
      && window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime', null, { timeout: 120_000 });
    const stmSource = await page.inputValue('#stm32-source');
    await page.fill('#stm32-source', `${stmSource}\n`);
    await page.waitForFunction(() => window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'no-current-runtime');

    await select(page, profiles.avr);
    assert.equal((await summary(page)).state, 'no-current-runtime', 'profile return revived stale AVR evidence');
    assert.equal(outside.length, 0, JSON.stringify(outside));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
    process.stdout.write(`${JSON.stringify({ status: 'pass', profiles: Object.values(profiles),
      classifications: { avr: Object.values(avr.channels).map((x) => x.classification),
        pico: Object.values(pico.channels).map((x) => x.classification),
        c3: Object.values(c3.channels).map((x) => x.classification),
        stm32: Object.values(stm32.channels).map((x) => x.classification) },
      invalidation: ['source', 'electrical', 'open', 'profile', 'reset'], layoutRetained: true,
      outsideRequests: 0, browserErrors: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
