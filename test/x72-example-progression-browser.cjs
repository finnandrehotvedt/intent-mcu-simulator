// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X72_URL || 'http://127.0.0.1:18830';
const screenshot = process.env.X72_SCREENSHOT || null;
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = []; const mutations = []; const outside = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const target = new URL(request.url());
    if (target.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) mutations.push(`${request.method()} ${target.pathname}`);
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);

  const initial = await page.evaluate(() => ({
    workers: window.__M6_STATE__.runtimeWorkerCreations,
    chooserOpen: document.querySelector('#example-picker-dialog').open,
    projectOpenerVisible: Boolean(document.querySelector('#project-files-open').getClientRects().length),
    activeCanvasVisible: Boolean(document.querySelector('#active-canvas-stage').getClientRects().length),
  }));
  assert(!initial.chooserOpen, 'example chooser displaced the workspace on load');
  assert(initial.projectOpenerVisible && initial.activeCanvasVisible,
    'primary workspace or Project & files action is not prominent on load');

  await page.click('#project-files-open');
  assert(await page.locator('#project-demo').isVisible() && await page.locator('.project-bar').isVisible(),
    'Choose example is not visible inside Project & files');
  await page.click('#project-demo');
  const cards = page.locator('.starter-card');
  assert(await cards.count() === 16, 'AVR chooser must retain exactly 16 cards');
  const cardShape = await cards.evaluateAll((nodes) => nodes.map((node) => ({
    id: node.dataset.example,
    text: node.textContent.toLocaleLowerCase(),
    labels: [...node.querySelectorAll('.starter-learning-grid b')].map((item) => item.textContent),
  })));
  for (const card of cardShape) {
    assert(JSON.stringify(card.labels) === JSON.stringify(['Learn', 'Try', 'Observe', 'Limits', 'Next']),
      `${card.id}: incomplete progression hierarchy`);
  }

  const titleQuery = 'Thermostat boundary test';
  const normalized = titleQuery.toLocaleLowerCase();
  const expectedMatches = cardShape.filter(({ text }) => text.includes(normalized)).map(({ id }) => id);
  await page.fill('#example-picker-search', titleQuery);
  const visibleMatches = await cards.evaluateAll((nodes) => nodes
    .filter((node) => !node.hidden && node.getClientRects().length)
    .map((node) => node.dataset.example));
  assert(JSON.stringify(visibleMatches) === JSON.stringify(expectedMatches),
    `title search mismatch: ${JSON.stringify({ expectedMatches, visibleMatches })}`);
  assert(await page.textContent('#example-picker-status')
    === `${expectedMatches.length} of ${cardShape.length} examples match “${titleQuery}”`,
  'title search status does not describe the exact derived result');

  await page.locator('.starter-card[data-example="avr-thermostat-boundary-v1"]').click();
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-project-dialog .workbench-popup-close');
  }
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);
  await page.click('#brief-tests-open');
  assert(await page.locator('#scenario-editor').count() === 1,
    'Thermostat did not expose the supported Scenario timeline next step');
  assert((await page.textContent('#scenario-editor')).includes('AVR thermostat subset'),
    'Scenario timeline omitted its supported-subset boundary');

  await page.keyboard.press('Escape');
  const profiles = [
    ['architecture.rp2040-v1', 'board.rp2040-pico-v1', 'pico', '__RP2040_PUBLIC_WORKBENCH__'],
    ['architecture.esp32-v1', 'board.esp32-c3-devmodule-v1', 'c3', '__ESP32C3_PUBLIC_WORKBENCH__'],
    ['architecture.stm32-v1', 'board.stm32f429zi-nucleo144-v1', 'stm32', '__STM32_PUBLIC_WORKBENCH__'],
  ];
  const profileCards = [];
  for (const [family, option, prefix, api] of profiles) {
    await page.selectOption('#family-select', family);
    await page.selectOption('#board-select', option);
    await page.waitForFunction(({ option, api }) => document.querySelector('#board-select').value === option
      && window[api]?.state().active === true, { option, api });
    const rows = await page.locator(`#${prefix}-profile-examples .profile-example-card`).evaluateAll((nodes) => nodes.map((node) => ({
      id: node.dataset.profileExample,
      labels: [...node.querySelectorAll('span b')].map((item) => item.textContent),
    })));
    assert(rows.length === 2, `${prefix}: paired profile cards missing`);
    for (const row of rows) {
      assert(JSON.stringify(row.labels) === JSON.stringify(['Learn', 'Try', 'Observe', 'Limits', 'Next']),
        `${row.id}: incomplete profile progression hierarchy`);
      profileCards.push(row.id);
    }
  }

  await page.selectOption('#family-select', 'architecture.avr-v1');
  await page.selectOption('#board-select', 'board.atmega328p-16mhz-v1');
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }]) {
    await page.setViewportSize(viewport);
    if (!(await page.locator('#example-picker-dialog').evaluate((node) => node.open))) {
      if (!(await page.locator('#workbench-project-dialog').evaluate((node) => node.open))) await page.click('#project-files-open');
      await page.click('#project-demo');
    }
    const layout = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      gridOverflow: document.querySelector('#starter-examples').scrollWidth
        - document.querySelector('#starter-examples').clientWidth,
      dialogInternalScroll: document.querySelector('#starter-examples').scrollHeight
        >= document.querySelector('#starter-examples').clientHeight,
    }));
    assert(layout.pageOverflow <= 1 && layout.gridOverflow <= 1,
      `${viewport.width}px desktop overflow: ${JSON.stringify(layout)}`);
    assert(layout.dialogInternalScroll, `${viewport.width}px chooser lost bounded internal scrolling`);
    await page.keyboard.press('Escape');
    assert(await page.locator('#project-demo').evaluate((node) => document.activeElement === node),
      `${viewport.width}px Escape did not restore focus`);
    await page.click('#workbench-project-dialog .workbench-popup-close');
  }

  const finalWorkers = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
  assert(finalWorkers === initial.workers, 'X72 inspection created a runtime worker');
  assert(!mutations.some((item) => item.includes('/api/build')), `X72 issued a build request: ${mutations.join(', ')}`);
  assert(mutations.length === 0, `X72 made a server mutation: ${mutations.join(', ')}`);
  assert(outside.length === 0, `X72 made a third-party request: ${outside.join(', ')}`);
  assert(errors.length === 0, `X72 raised browser errors: ${errors.join(' | ')}`);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('#project-files-open');
  await page.click('#project-demo');
  if (screenshot) {
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot, fullPage: false });
  }
  console.log(JSON.stringify({ result: 'pass', avrCards: cardShape.length, profileCards,
    titleQuery, expectedMatches, desktopWidths: [1440, 1024], runtimeWorkersCreated: 0 }));
  await context.close(); await browser.close();
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
