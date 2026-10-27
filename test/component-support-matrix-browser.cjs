// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('node:path');
const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium } = require(path.join(moduleRoot, 'playwright'));

const base = process.env.COMPONENT_MATRIX_URL || 'http://127.0.0.1:18781';
const screenshot = process.env.COMPONENT_MATRIX_SCREENSHOT || null;
function assert(value, message) { if (!value) throw new Error(message); }

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
  assert(await page.locator('#catalog-list .catalog-item').count() === 5, 'ordinary AVR default must show 5 Simulated models');

  await page.click('.starter-card[data-example="temperature-lcd-threshold"]');
  await page.waitForFunction(() => window.__M6_PROJECT__().schema === 'intent-mcu-project-contact-persistence@1');
  await page.waitForFunction(() => document.querySelectorAll('#catalog-list .catalog-item').length === 16);
  await page.selectOption('#catalog-status', 'all');
  await page.waitForFunction(() => document.querySelectorAll('#catalog-list .catalog-item').length === 16);

  const beforeMatrix = await page.evaluate(() => ({
    project: JSON.stringify(window.__M6_PROJECT__()), history: JSON.stringify(window.__M6_HISTORY__?.() ?? null),
    runtime: JSON.stringify(window.__M6_STATE__?.runtime ?? null),
  }));
  await page.focus('#catalog-support-open');
  await page.keyboard.press('Enter');
  await page.locator('#component-support-dialog').waitFor({ state: 'visible' });
  assert(await page.locator('#component-support-body tr').count() === 19, 'AVR matrix must render all 19 models');
  assert((await page.locator('#component-support-summary').textContent()).includes('16 of 19 models available'), 'AVR matrix count mismatch');
  assert(await page.locator('#component-support-body tr[data-status="partial"]').count() === 3, 'AVR must expose 3 Partial models');

  for (const profile of [
    'board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ]) {
    await page.selectOption('#component-support-profile', profile);
    assert((await page.locator('#component-support-summary').textContent()).includes('3 of 19 models available'), `${profile} available count mismatch`);
    assert(await page.locator('#component-support-body tr[data-status="unavailable"]').count() === 16, `${profile} unavailable count mismatch`);
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
  assert(await page.locator('#compatibility-matrix tbody tr[data-model]').count() === 19, 'crawlable matrix row count mismatch');
  assert((await page.locator('#compatibility-matrix').textContent()).includes('25 cells are available and 51 are unavailable'), 'crawlable totals missing');
  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
  console.log(JSON.stringify({ ok: true, avrAvailable: 16, narrowAvailable: 3, rows: 19, outsideRequests: 0 }));
})().catch((error) => {
  console.error(error.stack || error); process.exitCode = 1;
}).finally(async () => { await browser?.close(); });
