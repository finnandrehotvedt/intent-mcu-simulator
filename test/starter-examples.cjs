// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('fs');
const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18766';
const browserName = process.env.M6_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

function assert(condition, message) { if (!condition) throw new Error(message); }

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const mutations = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) mutations.push(`${request.method()} ${request.url()}`);
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  const cards = page.locator('.starter-card');
  assert(await cards.count() === 6, 'starter gallery does not expose all six validated examples');
  assert((await cards.nth(0).innerText()).includes('Controller · resistor · LED'), 'starter card omits its parts');
  const examples = [
    ['blink', 'Blink demo'],
    ['button', 'Button input'],
    ['adc', 'ADC dial'],
    ['pwm', 'PWM fade'],
    ['temperature-lcd-threshold', 'Temperature display'],
    ['avr-thermostat-boundary-v1', 'Thermostat boundary test'],
  ];
  const projectName = () => page.evaluate(() => {
    const value = window.__M6_PROJECT__();
    return value.schema === 'intent-mcu-project-contact-persistence@1'
      ? value.project.metadata.name : value.metadata.name;
  });
  for (const [id, name] of examples) {
    await page.click(`.starter-card[data-example="${id}"]`);
    await page.waitForFunction(([expectedId, expectedName]) => {
      const value = window.__M6_PROJECT__();
      const observed = value.schema === 'intent-mcu-project-contact-persistence@1'
        ? value.project.metadata.name : value.metadata.name;
      return document.querySelector('#example-select').value === expectedId && observed === expectedName;
    }, [id, name]);
  }
  await page.locator('#prompt-drawer').evaluate((drawer) => { drawer.open = true; });
  await page.click('#prompt-generate');
  assert((await page.inputValue('#prompt-output')).length > 100,
    'Temperature candidate did not generate a portable prompt from its validated runtime projection');
  assert((await page.textContent('#prompt-message')).includes('generated locally'),
    'Temperature candidate prompt generation did not report local completion');
  // Re-enter every ordinary project from the validated candidate-v3 example,
  // then return to candidate-v3, using the compact dropdown path as well.
  for (const [id, name] of examples) {
    await page.selectOption('#example-select', id);
    await page.click('#project-demo');
    await page.waitForFunction(([expectedId, expectedName]) => {
      const value = window.__M6_PROJECT__();
      const observed = value.schema === 'intent-mcu-project-contact-persistence@1'
        ? value.project.metadata.name : value.metadata.name;
      return document.querySelector('#example-select').value === expectedId && observed === expectedName;
    }, [id, name]);
  }
  await page.selectOption('#example-select', 'button');
  await page.click('#project-demo');
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Button input loaded'));
  const loaded = await page.evaluate(() => ({
    name: window.__M6_PROJECT__().metadata.name,
    types: window.__M6_PROJECT__().circuit.components.map((component) => component.type),
    selectedExample: document.querySelector('#example-select').value,
  }));
  assert(loaded.name === 'Button input', 'starter card did not use the expected project identity');
  assert(loaded.selectedExample === 'button', 'starter card did not synchronize the compact example selector');
  assert(JSON.stringify(loaded.types) === JSON.stringify(['board.atmega328p-16mhz-v1', 'button.momentary-v1']), 'starter card bypassed the validated example graph');
  for (const viewport of [
    { width: 1440, height: 1000 }, { width: 768, height: 900 },
    { width: 390, height: 844 }, { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      visibleCards: [...document.querySelectorAll('.starter-card')].filter((card) => card.getClientRects().length).length,
    }));
    assert(layout.overflow <= 1, `starter gallery overflows at ${viewport.width}px`);
    assert(layout.visibleCards === 6, `starter cards disappear at ${viewport.width}px`);
  }
  assert(mutations.length === 0, `starter gallery made server mutation request: ${mutations.join(', ')}`);
  assert(errors.length === 0, `starter journeys raised browser errors: ${errors.join(' | ')}`);
  if (process.env.STARTER_SCREENSHOT) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    fs.mkdirSync(path.dirname(process.env.STARTER_SCREENSHOT), { recursive: true });
    await page.screenshot({ path: process.env.STARTER_SCREENSHOT, fullPage: true });
  }
  console.log(JSON.stringify({ browser: browserName, result: 'pass', cards: 6,
    cardJourneys: examples.length, dropdownJourneys: examples.length + 1,
    finalProject: await projectName(), serverProjectWrites: 0 }));
  await context.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
