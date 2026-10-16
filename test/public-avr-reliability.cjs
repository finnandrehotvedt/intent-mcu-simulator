// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.AVR_PUBLIC_URL || 'http://127.0.0.1:18777';
const builds = Number(process.env.AVR_RELIABILITY_BUILDS || 3);
function assert(condition, message) { if (!condition) throw new Error(message); }

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert(response?.status() === 200, 'public AVR page did not load');
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('.starter-card[data-example="temperature-lcd-threshold"]');
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');
  const measurements = [];
  for (let index = 0; index < builds; index += 1) {
    const prior = await page.inputValue('#source');
    await page.fill('#source', `${prior.replace(/\n\/\/ RELIABILITY_[A-Z0-9_]+\n?$/u, '')}\n// RELIABILITY_${Date.now()}_${index}\n`);
    const started = Date.now();
    await page.click('#build');
    await page.waitForFunction(() => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(
      window.__M6_STATE__?.buildState,
    ), null, { timeout: 45_000 });
    const result = await page.evaluate(() => ({
      state: window.__M6_STATE__.buildState,
      cacheHit: window.__M6_STATE__.cacheHit,
      diagnostics: document.querySelector('#diagnostics').textContent,
      log: document.querySelector('#build-log').textContent,
    }));
    result.elapsedMs = Date.now() - started;
    measurements.push(result);
    assert(result.state === 'succeeded', `AVR build ${index + 1} failed: ${JSON.stringify(result)}`);
  }
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('TEMP_C=25 STATE=COOL'), null, { timeout: 20_000 });
  await page.waitForTimeout(500);
  const peripheralState = await page.evaluate(() => {
    const lcd = document.querySelector('[data-component-id="character-lcd-1"] [data-artwork-key="output-character-lcd-16x2-4bit"]');
    const rgb = document.querySelector('[data-component-id="rgb-led-1"] [data-artwork-key="output-rgb-led-common-cathode"]');
    return {
      lcd: lcd ? { protocolState: lcd.dataset.protocolState, line1: lcd.dataset.line1,
        line2: lcd.dataset.line2, aria: lcd.getAttribute('aria-label') } : null,
      rgb: rgb ? { rDuty: rgb.dataset.rDuty, gDuty: rgb.dataset.gDuty,
        bDuty: rgb.dataset.bDuty, aria: rgb.getAttribute('aria-label') } : null,
      runtimePins: window.__M6_STATE__.runtime?.pins,
    };
  });
  assert(peripheralState.lcd?.protocolState === 'ready'
    && peripheralState.lcd.line1.trimEnd() === 'Temp: 25 C'
    && peripheralState.lcd.line2.trimEnd() === 'COOL < 30 C',
  `AVR LCD did not follow executed firmware: ${JSON.stringify(peripheralState)}`);
  assert(peripheralState.rgb?.rDuty === '0.000' && peripheralState.rgb.gDuty === '0.375'
    && peripheralState.rgb.bDuty === '1.000',
  `AVR RGB did not follow executed firmware: ${JSON.stringify(peripheralState)}`);
  assert(errors.length === 0, `browser errors: ${errors.join(' | ')}`);
  assert((await context.cookies()).length === 0, 'AVR workbench set cookies');
  console.log(JSON.stringify({ result: 'pass', project: 'Temperature display', measurements, peripheralState }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
