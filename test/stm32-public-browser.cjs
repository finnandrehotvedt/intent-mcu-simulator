// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.STM32_PUBLIC_URL || 'http://127.0.0.1:18772';
const screenshotDirectory = process.env.STM32_PUBLIC_SCREENSHOT_DIR || null;
const assert = (value, message) => { if (!value) throw new Error(message); };

async function state(page) { return page.evaluate(() => structuredClone(window.__STM32_PUBLIC_STATE__)); }
async function waitPhase(page, phase) {
  await page.waitForFunction((value) => window.__STM32_PUBLIC_STATE__?.phase === value, phase, { timeout: 60_000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const external = [];
  const errors = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url());
  });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert(response && response.status() === 200, 'root did not load');
  await page.waitForFunction(() => window.__M11_READY__ === true && window.__STM32_PUBLIC_WORKBENCH__);
  await page.locator('#board-select').selectOption('board.stm32f429zi-nucleo144-v1');
  await page.waitForFunction(() => window.__STM32_PUBLIC_STATE__?.active === true);
  const geometry = await page.evaluate(() => {
    const board = document.querySelector('.stm32-board-body').getBBox();
    const svg = document.querySelector('#stm32-diagram').getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelHidden: document.querySelector('#stm32-public-workbench').hidden,
      pb0: [...document.querySelectorAll('.stm32-pin-label')].some((node) => node.textContent === 'PB0'),
      gnd: [...document.querySelectorAll('.stm32-pin-label')].some((node) => node.textContent === 'GND'),
      groundPath: document.querySelector('.stm32-wire-ground').getAttribute('d'),
      board: { x: board.x, y: board.y, width: board.width, height: board.height },
      svg: { x: svg.x, y: svg.y, width: svg.width, height: svg.height },
    };
  });
  assert(!geometry.panelHidden && geometry.pb0 && geometry.gnd, 'named STM32 pins not visible');
  assert(geometry.groundPath === 'M635 202 V334 H384 V241', `unexpected body-avoiding route ${geometry.groundPath}`);
  assert(geometry.overflow <= 1, `desktop overflow ${geometry.overflow}`);

  await page.click('#stm32-build');
  await waitPhase(page, 'built');
  let current = await state(page);
  assert(current.runnable && current.artifact.bytes > 4000, 'default ELF not runnable');
  const highElf = current.artifact.sha256;
  await page.click('#stm32-run');
  await waitPhase(page, 'running');
  await waitPhase(page, 'completed');
  current = await state(page);
  assert(current.runtime.observed.pb0 === true && current.runtime.observed.uartText === 'STM32 PUBLIC\n', 'default HIGH observation mismatch');
  assert(await page.locator('#stm32-diagram').getAttribute('data-led') === 'on', 'HIGH LED not on');
  assert((await page.textContent('#stm32-terminal')).includes('BOOT EPOCHS: 2'), 'reset evidence missing');

  await page.click('#stm32-reset');
  await waitPhase(page, 'running');
  await waitPhase(page, 'completed');
  assert((await state(page)).artifact.sha256 === highElf, 'Reset changed accepted ELF');

  const lowSource = (await page.inputValue('#stm32-source'))
    .replace('intent_pb0_output(1u)', 'intent_pb0_output(0u)')
    .replace('STM32 PUBLIC', 'STM32 LOW');
  await page.fill('#stm32-source', lowSource);
  current = await state(page);
  assert(current.phase === 'editing' && !current.runnable && current.artifact === null, 'source edit retained stale authority');
  assert(await page.locator('#stm32-run').isDisabled() && await page.locator('#stm32-reset').isDisabled(), 'Run/Reset not disabled after source edit');
  assert((await page.textContent('#stm32-terminal')).includes('No Renode execution'), 'old PB0/USART3 provenance survived source edit');

  await page.click('#stm32-build');
  await waitPhase(page, 'built');
  await page.click('#stm32-run');
  await waitPhase(page, 'running');
  await waitPhase(page, 'completed');
  current = await state(page);
  assert(current.runtime.observed.pb0 === false && current.runtime.observed.uartText === 'STM32 LOW\n', 'edited LOW observation mismatch');
  assert(current.artifact.sha256 !== highElf, 'edited source reused default ELF');
  const lowElf = current.artifact.sha256;
  assert(await page.locator('#stm32-diagram').getAttribute('data-led') === 'off', 'LOW LED not off');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#stm32-save')]);
  const savedPath = await download.path();
  assert(savedPath && fs.statSync(savedPath).size < 8192, 'data-only Save missing or oversized');
  const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
  assert(saved.source === lowSource && !('artifact' in saved) && !('runtime' in saved), 'Save retained executable/runtime state');

  await page.fill('#stm32-source', `${lowSource}intent_spi1();\n`);
  await page.click('#stm32-build');
  await waitPhase(page, 'blocked');
  current = await state(page);
  assert(!current.runnable && current.artifact === null && current.runtime === null, 'invalid source retained stale authority');
  assert((await page.textContent('#stm32-message')).includes('Source rejected'), 'invalid source not explained');

  await page.locator('#stm32-open-input').setInputFiles(savedPath);
  await waitPhase(page, 'editing');
  current = await state(page);
  assert(current.project.source === lowSource && !current.runnable && current.artifact === null, 'Open did not require fresh Build');
  assert((await page.textContent('#stm32-artifact-hash')) === 'not built', 'Open restored executable hash');

  await page.click('#stm32-build');
  await waitPhase(page, 'built');
  await page.click('#stm32-stop');
  current = await state(page);
  assert(current.phase === 'editing' && !current.runnable && current.artifact === null, 'Stop did not discard ELF');

  if (screenshotDirectory) {
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDirectory, 'stm32-public-desktop.png'), fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(mobileOverflow <= 1, `mobile overflow ${mobileOverflow}`);
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, 'stm32-public-mobile.png'), fullPage: true, animations: 'disabled' });

  assert((await context.cookies()).length === 0, 'cookies were set');
  assert(external.length === 0, `third-party requests: ${external.join(', ')}`);
  assert(errors.length === 0, `browser errors: ${errors.join(' | ')}`);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', geometry, highElf,
    lowElf, mobileOverflow, externalRequests: external.length,
    cookies: 0, screenshots: screenshotDirectory })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
