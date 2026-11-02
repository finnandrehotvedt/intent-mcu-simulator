// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('node:path');
const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium } = require(path.join(moduleRoot, 'playwright'));

const base = process.env.COMPONENT_MATRIX_URL || 'http://127.0.0.1:18781';
const screenshot = process.env.COMPONENT_MATRIX_SCREENSHOT || null;
function assert(value, message) { if (!value) throw new Error(message); }
async function fullCatalogueTypes(page) {
  if (!(await page.locator('#component-catalog').isVisible())) await page.click('#toggle-catalog');
  assert(await page.locator('#catalog-status').inputValue() === 'all', 'ordinary catalogue status must be All statuses');
  assert((await page.locator('#catalog-count').textContent()).includes('103 parts'), 'ordinary catalogue must report 103 parts');
  const first = await page.locator('#catalog-list .catalog-item').evaluateAll((rows) => rows.map((row) => row.dataset.type));
  assert(first.length === 80, 'ordinary catalogue first page must contain 80 models');
  await page.locator('#catalog-next').evaluate((node) => node.click());
  const second = await page.locator('#catalog-list .catalog-item').evaluateAll((rows) => rows.map((row) => row.dataset.type));
  assert(second.length === 23, 'ordinary catalogue second page must contain 23 models');
  await page.locator('#catalog-prev').evaluate((node) => node.click());
  return [...first, ...second];
}

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  const errors = []; const outside = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('#toggle-catalog');
  const sharedTypes = await fullCatalogueTypes(page);
  await page.locator('#simple-parts-close').evaluate((node) => node.click());
  await page.click('#workbench-view-advanced');
  assert(JSON.stringify(await fullCatalogueTypes(page)) === JSON.stringify(sharedTypes), 'Advanced AVR catalogue differs from Simple');
  for (const profile of [
    'board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
    'board.atmega328p-16mhz-v1',
  ]) {
    await page.selectOption('#board-select', profile);
    await page.waitForFunction((value) => document.querySelector('#board-select').value === value, profile);
    assert(JSON.stringify(await fullCatalogueTypes(page)) === JSON.stringify(sharedTypes), `${profile}: full ordinary list mismatch`);
  }
  await page.locator('#catalog-status').evaluate((node) => { node.value = 'simulated'; node.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  assert(await page.locator('#catalog-status').inputValue() === 'simulated', 'explicit status filter did not persist');
  await page.locator('#catalog-status').evaluate((node) => { node.value = 'all'; node.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector('#catalog-count').textContent.includes('103 parts'));

  await page.locator('.starter-card[data-example="temperature-lcd-threshold"] .starter-action').evaluate((node) => node.click());
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');
  await page.waitForFunction(() => document.querySelector('#catalog-count').textContent.includes('103 parts'));
  await page.click('#workbench-view-advanced');
  if (await page.locator('#simple-parts-drawer').getAttribute('aria-hidden') === 'true') {
    await page.click('#toggle-catalog');
  }
  await page.selectOption('#catalog-status', 'all', { force: true });
  await page.waitForFunction(() => document.querySelector('#catalog-count').textContent.includes('103 parts'));

  const beforeMatrix = await page.evaluate(() => ({
    project: JSON.stringify(window.__M6_PROJECT__()), history: JSON.stringify(window.__M6_HISTORY__?.() ?? null),
    runtime: JSON.stringify(window.__M6_STATE__?.runtime ?? null),
  }));
  await page.locator('#catalog-support-open').evaluate((node) => node.focus());
  await page.keyboard.press('Enter');
  await page.locator('#component-support-dialog').waitFor({ state: 'visible' });
  assert(await page.locator('#component-support-body tr').count() === 103, 'AVR matrix must render all 103 models');
  assert((await page.locator('#component-support-summary').textContent()).includes('81 of 103 models available'), 'AVR matrix count mismatch');
  assert(await page.locator('#component-support-body tr[data-status="partial"]').count() === 38, 'AVR must expose 38 Partial models');

  for (const profile of [
    'board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ]) {
    await page.selectOption('#component-support-profile', profile);
    assert((await page.locator('#component-support-summary').textContent()).includes('3 of 103 models available'), `${profile} available count mismatch`);
    assert(await page.locator('#component-support-body tr[data-status="unavailable"]').count() === 81, `${profile} unavailable count mismatch`);
  }
  await page.selectOption('#component-support-profile', 'board.atmega328p-16mhz-v1');
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });
  await page.keyboard.press('Escape');
  await page.locator('#component-support-dialog').waitFor({ state: 'hidden' });
  assert(await page.locator('#catalog-support-open').evaluate((node) => document.activeElement === node), 'matrix close must return keyboard focus');
  const afterMatrix = await page.evaluate(() => ({
    project: JSON.stringify(window.__M6_PROJECT__()), history: JSON.stringify(window.__M6_HISTORY__?.() ?? null),
    runtime: JSON.stringify(window.__M6_STATE__?.runtime ?? null),
  }));
  assert(JSON.stringify(afterMatrix) === JSON.stringify(beforeMatrix), 'matrix inspection changed project, history or runtime state');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 1, `unexpected horizontal page overflow: ${overflow}px`);

  await page.goto(`${base}/components.html#compatibility-matrix`, { waitUntil: 'domcontentloaded' });
  assert(await page.locator('#compatibility-matrix tbody tr[data-model]').count() === 103, 'crawlable matrix row count mismatch');
  assert((await page.locator('#compatibility-matrix').textContent()).includes('90 cells are executable, 72 more are authoring-only and 250 are unavailable'), 'crawlable totals missing');
  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
  console.log(JSON.stringify({ ok: true, avrAvailable: 81, narrowAvailable: 3, rows: 103, outsideRequests: 0 }));
})().catch((error) => {
  console.error(error.stack || error); process.exitCode = 1;
}).finally(async () => { await browser?.close(); });
