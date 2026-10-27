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
  await page.route('**/api/page-views', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'disabled' }),
  }));
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
  const dialog = page.locator('#example-picker-dialog');
  assert(await cards.count() === 17, 'example picker does not expose all seventeen validated examples');
  assert(!(await dialog.evaluate((node) => node.open)), 'example picker is open by default');
  assert(await cards.filter({ visible: true }).count() === 0, 'inline starter gallery remains visible by default');
  const initialProject = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  const initialWorkers = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
  await page.locator('#beginner-examples').focus();
  await page.keyboard.press('Enter');
  assert(await dialog.evaluate((node) => node.open), 'Choose example did not open the dialog');
  assert(await page.locator('#example-picker-search').evaluate((node) => document.activeElement === node),
    'example search did not receive initial focus');
  await page.fill('#example-picker-search', 'rotary');
  assert(await cards.filter({ visible: true }).count() === 1, 'example search did not filter to one card');
  await page.fill('#example-picker-search', '');
  await page.locator('#example-picker-close').focus();
  await page.keyboard.press('Shift+Tab');
  assert(await page.evaluate(() => document.activeElement?.dataset?.example === 'avr-rotary-encoder'),
    'Shift+Tab did not wrap to the last example card');
  await page.keyboard.press('Tab');
  assert(await page.locator('#example-picker-close').evaluate((node) => document.activeElement === node),
    'Tab did not wrap from the last card to the close control');
  await page.locator('#example-picker-search').focus();
  await page.keyboard.press('Escape');
  assert(!(await dialog.evaluate((node) => node.open)), 'Escape did not close the example dialog');
  assert(await page.locator('#beginner-examples').evaluate((node) => document.activeElement === node),
    'Escape did not return focus to Choose example');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === initialProject,
    'opening and cancelling the picker changed the project');
  assert(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations) === initialWorkers,
    'opening and cancelling the picker created a runtime worker');
  await page.click('#beginner-examples');
  assert((await cards.nth(0).innerText()).includes('Controller · resistor · LED'), 'starter card omits its parts');
  const examples = [
    ['blink', 'Blink demo'],
    ['button', 'Button input'],
    ['adc', 'ADC dial'],
    ['trimmer', 'Trimmer calibration'],
    ['pwm', 'PWM fade'],
    ['pwm-pulse', 'PWM pulse'],
    ['temperature-lcd-threshold', 'Temperature display'],
    ['avr-thermostat-boundary-v1', 'Thermostat boundary test'],
    ['avr-ground-reference-input', 'Ground reference input'],
    ['avr-ground-power-references', 'Ground and 5 V references'],
    ['avr-toggle-input', 'SPST toggle input'],
    ['avr-spdt-selector', 'SPDT input selector'],
    ['avr-light-analogue', 'Analogue light level'],
    ['avr-light-threshold', 'Digital light threshold'],
    ['avr-active-buzzer', 'Logical active buzzer'],
    ['avr-traffic-light', 'Traffic light sequence'],
    ['avr-seven-segment', 'Seven-segment digits'],
    ['avr-four-digit-seven-segment', 'Four-digit multiplex'],
    ['avr-rotary-encoder', 'Quadrature encoder'],
  ];
  const projectName = () => page.evaluate(() => {
    const value = window.__M6_PROJECT__();
    return value.schema === 'intent-mcu-project-contact-persistence@1'
      ? value.project.metadata.name : value.metadata.name;
  });
  for (let index = 0; index < examples.length; index += 1) {
    const [id, name] = examples[index];
    if (!(await dialog.evaluate((node) => node.open))) await page.click('#beginner-examples');
    await page.click(`.starter-card[data-example="${id}"]`);
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      if (index === 1) {
        await page.click('#unsaved-keep');
        assert(await dialog.evaluate((node) => node.open), 'Keep editing closed the example picker');
        assert(await projectName() === examples[0][1], 'Keep editing replaced the current project');
        await page.click(`.starter-card[data-example="${id}"]`);
      }
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(([expectedId, expectedName]) => {
      const value = window.__M6_PROJECT__();
      const observed = value.schema === 'intent-mcu-project-contact-persistence@1'
        ? value.project.metadata.name : value.metadata.name;
      return document.querySelector('#example-select').value === expectedId && observed === expectedName;
    }, [id, name]);
  }
  await page.click('#workbench-view-advanced');
  await page.click('#brief-tests-open');
  await page.locator('#prompt-drawer').evaluate((drawer) => { drawer.open = true; });
  await page.click('#prompt-generate');
  assert((await page.inputValue('#prompt-output')).length > 100,
    'Temperature candidate did not generate a portable prompt from its validated runtime projection');
  assert((await page.textContent('#prompt-message')).includes('generated locally'),
    'Temperature candidate prompt generation did not report local completion');
  await page.keyboard.press('Escape');
  await page.click('#workbench-view-simple');
  await page.click('#beginner-examples');
  await page.click('.starter-card[data-example="button"]');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
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
    if (!(await dialog.evaluate((node) => node.open))) await page.click('#beginner-examples');
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      visibleCards: [...document.querySelectorAll('.starter-card')].filter((card) => card.getClientRects().length).length,
      dialogOverflow: document.querySelector('#starter-examples').scrollWidth
        - document.querySelector('#starter-examples').clientWidth,
    }));
    assert(layout.overflow <= 1, `example picker overflows the page at ${viewport.width}px`);
    assert(layout.dialogOverflow <= 1, `example card grid overflows at ${viewport.width}px`);
    assert(layout.visibleCards === 15, `starter cards disappear at ${viewport.width}px`);
  }
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('#workbench-view-advanced');
  if (await page.getAttribute('#serial-tab', 'aria-expanded') !== 'true') await page.click('#serial-tab');
  const serialLayout = await page.evaluate(() => ({
    visible: !document.querySelector('#serial-dock').hidden,
    contained: document.querySelector('#serial-dock').getBoundingClientRect().left >= 0
      && document.querySelector('#serial-dock').getBoundingClientRect().right <= innerWidth,
  }));
  assert(serialLayout.visible && serialLayout.contained, 'example picker change clipped the Serial dock');
  const workersBeforeReload = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  assert(!(await page.locator('#example-picker-dialog').evaluate((node) => node.open)), 'reload restored an open picker');
  assert(await page.locator('.starter-card').filter({ visible: true }).count() === 0, 'reload restored the inline gallery');
  assert(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations) === workersBeforeReload,
    'reload created a runtime worker');
  assert(mutations.length === 0, `starter gallery made server mutation request: ${mutations.join(', ')}`);
  assert(errors.length === 0, `starter journeys raised browser errors: ${errors.join(' | ')}`);
  if (process.env.STARTER_SCREENSHOT) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click('#beginner-examples');
    fs.mkdirSync(path.dirname(process.env.STARTER_SCREENSHOT), { recursive: true });
    await page.screenshot({ path: process.env.STARTER_SCREENSHOT, fullPage: false });
  }
  console.log(JSON.stringify({ browser: browserName, result: 'pass', cards: 15,
    pickerJourneys: examples.length + 1, unsavedKeepAndDiscard: true,
    finalProject: await projectName(), serverProjectWrites: 0 }));
  await context.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
