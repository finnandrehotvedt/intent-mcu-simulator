// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.SUPPORTED_EXAMPLES_URL || 'http://127.0.0.1:18788';
const runtime = process.env.SUPPORTED_EXAMPLES_RUNTIME === '1';
const screenshot = process.env.SUPPORTED_EXAMPLES_SCREENSHOT || null;
const assert = (value, message) => { if (!value) throw new Error(message); };

const profiles = [
  { option: 'board.rp2040-pico-v1', prefix: 'pico', api: '__RP2040_PUBLIC_WORKBENCH__', examples: [
    ['pico-led-on', 'PICO LED ON', true], ['pico-led-off', 'PICO LED OFF', false],
  ] },
  { option: 'board.esp32-c3-devmodule-v1', prefix: 'c3', api: '__ESP32C3_PUBLIC_WORKBENCH__', examples: [
    ['c3-led-on', 'C3_LED_ON', true], ['c3-led-off', 'C3_LED_OFF', false],
  ] },
  { option: 'board.stm32f429zi-nucleo144-v1', prefix: 'stm32', api: '__STM32_PUBLIC_WORKBENCH__', examples: [
    ['stm32-led-on', 'STM32 LED ON', true], ['stm32-led-off', 'STM32 LED OFF', false],
  ] },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; const outside = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);

  assert(await page.locator('.starter-card[data-example="pwm-pulse"]').count() === 1, 'AVR PWM pair card missing');
  await page.click('.starter-card[data-example="pwm-pulse"]');
  assert(await page.inputValue('#project-name') === 'PWM pulse', 'AVR PWM pair did not load');
  assert((await page.textContent('#project-message')).includes('same safety checks'), 'AVR example bypassed ordinary loader');
  if (runtime) {
    await page.click('#quick-build');
    await page.waitForFunction(() => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(window.__M6_STATE__.buildState), null, { timeout: 40_000 });
    assert(await page.evaluate(() => window.__M6_STATE__.buildState) === 'succeeded', 'AVR PWM pair build failed');
    await page.selectOption('#speed', 'maximum'); await page.click('#quick-run');
    await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('PWM 25')
      && document.querySelector('#serial-output').textContent.includes('PWM 75'), null, { timeout: 15_000 });
    await page.click('#quick-pause');
  }

  const observed = [];
  for (const profile of profiles) {
    await page.selectOption('#board-select', profile.option);
    await page.waitForFunction((name) => window[name]?.state().active === true, profile.api);
    const cards = page.locator(`#${profile.prefix}-profile-examples .profile-example-card`);
    assert(await cards.count() === 2, `${profile.prefix}: expected two visible examples`);
    for (const [id, marker, expectedLed] of profile.examples) {
      await page.click(`#${profile.prefix}-profile-examples [data-profile-example="${id}"]`);
      if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
        const guard = await page.textContent('#unsaved-change-description');
        assert(guard.includes('loading ') && guard.includes('will replace authored changes'), `${id}: unsaved guard copy missing`);
        await page.click('#unsaved-discard');
      }
      let state = await page.evaluate((name) => window[name].state(), profile.api);
      assert(state.phase === 'editing' && !state.runnable && !state.artifact,
        `${id}: load retained executable authority`);
      assert(state.message.includes('Build fresh before Run'), `${id}: fresh-build boundary missing`);
      if (runtime) {
        await page.click(`#${profile.prefix}-build`);
        await page.waitForFunction(({ name, prefix }) => {
          const phase = window[name].state().phase;
          return prefix === 'stm32' ? ['built', 'failed'].includes(phase) : ['built', 'failed', 'blocked'].includes(phase);
        }, { name: profile.api, prefix: profile.prefix }, { timeout: 190_000 });
        state = await page.evaluate((name) => window[name].state(), profile.api);
        assert(state.phase === 'built' && state.runnable, `${id}: build failed: ${state.message}`);
        await page.click(`#${profile.prefix}-run`);
        if (profile.prefix === 'pico') {
          await page.waitForFunction(({ marker: text, led }) => document.querySelector('#pico-serial').textContent.includes(text)
            && document.querySelector('#pico-external-led').classList.contains('on') === led, { marker, led: expectedLed }, { timeout: 30_000 });
          await page.click('#pico-pause');
        } else {
          await page.waitForFunction((name) => ['complete', 'completed', 'failed'].includes(window[name].state().phase), profile.api, { timeout: 70_000 });
          state = await page.evaluate((name) => window[name].state(), profile.api);
          assert(['complete', 'completed'].includes(state.phase), `${id}: run failed: ${state.message}`);
          const terminal = await page.textContent(profile.prefix === 'c3' ? '#c3-terminal' : '#stm32-terminal');
          assert(terminal.includes(marker), `${id}: expected UART marker missing`);
          assert(await page.locator(`#${profile.prefix}-diagram`).getAttribute('data-led') === (expectedLed ? 'on' : 'off'),
            `${id}: LED result mismatch`);
        }
      }
      observed.push(id);
    }
  }

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cards: document.querySelectorAll('.profile-example-card').length,
  }));
  assert(layout.overflow <= 1 && layout.cards === 6, `example layout failed: ${JSON.stringify(layout)}`);
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  assert(errors.length === 0, `browser errors: ${errors.join(' | ')}`);
  assert(outside.length === 0, `outside requests: ${outside.join(', ')}`);
  console.log(JSON.stringify({ result: 'pass', runtime, avr: 'pwm-pulse', narrow: observed, layout }));
  await context.close(); await browser.close();
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
