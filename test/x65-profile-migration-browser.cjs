// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X65_URL || 'http://127.0.0.1:18831';
const screenshotPath = process.env.X65_SCREENSHOT || null;
const AVR = 'board.atmega328p-16mhz-v1';
const PICO = 'board.rp2040-pico-v1';
const C3 = 'board.esp32-c3-devmodule-v1';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const outside = []; const mutations = []; const errors = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('#project-demo');
  await page.click('.starter-card[data-example="button"]');
  await page.fill('#source', `${await page.inputValue('#source')}\n// unsaved X65 preservation check`);
  await page.locator('#source').press('Tab');
  assert.equal(await page.evaluate((profile) => window.__UNSAVED_CHANGE_GUARD__.isDirty(profile), AVR), true,
    'AVR fixture was not an unsaved draft');
  const before = await page.evaluate(() => ({
    project: JSON.stringify(window.__M6_PROJECT__()),
    workers: window.__M6_STATE__.runtimeWorkerCreations,
  }));

  await page.selectOption('#board-select', PICO);
  await page.waitForFunction((profile) => window.__PROFILE_MIGRATION_EXPLANATION__?.to.profile === profile, PICO);
  const details = page.locator('#profile-migration-explanation');
  assert.equal(await details.isHidden(), false, 'migration explanation stayed hidden');
  assert.equal(await details.evaluate((node) => node.open), false, 'migration explanation should use progressive disclosure');
  assert.match(await page.textContent('#profile-migration-summary'), /ATmega328P.*RP2040 Pico/u);

  await page.locator('#profile-migration-summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await details.evaluate((node) => node.open), true, 'keyboard did not open the explanation');
  const avrToPico = await page.evaluate(() => structuredClone(window.__PROFILE_MIGRATION_EXPLANATION__));
  const visibleText = await details.textContent();
  assert.equal(avrToPico.automaticMigration, false);
  assert.equal(avrToPico.source.state, 'unknown', 'arbitrary AVR semantics were inferred');
  assert.match(visibleText, /Arbitrary AVR sketch semantics are not inferred/u);
  assert.match(visibleText, /not aliases for GP0/u);
  assert.match(visibleText, /button: unsupported/iu);
  assert.match(visibleText, /No automatic remap/u);
  if (screenshotPath) {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await details.scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
  }

  const protectedAfterFirstSwitch = await page.evaluate(() => ({
    project: JSON.stringify(window.__M6_PROJECT__()),
    workers: window.__M6_STATE__.runtimeWorkerCreations,
    runDisabled: document.querySelector('#quick-run').disabled,
  }));
  assert.equal(protectedAfterFirstSwitch.project, before.project, 'AVR project bytes changed during explanation');
  assert.equal(protectedAfterFirstSwitch.workers, before.workers, 'migration explanation created a runtime worker');
  assert.equal(protectedAfterFirstSwitch.runDisabled, true, 'migration explanation restored stale runtime authority');

  await page.selectOption('#board-select', C3);
  await page.waitForFunction((profile) => window.__PROFILE_MIGRATION_EXPLANATION__?.to.profile === profile, C3);
  const picoToC3 = await page.evaluate(() => structuredClone(window.__PROFILE_MIGRATION_EXPLANATION__));
  assert.equal(picoToC3.from.profile, PICO);
  assert.equal(picoToC3.source.state, 'recognized');
  assert.deepEqual(picoToC3.source.currentPins, ['GP0']);
  assert(picoToC3.source.currentApis.includes('intent_gpio0_output'));
  assert.match(picoToC3.pins.action, /GP0.*not aliases for GPIO2/u);

  await page.selectOption('#board-select', AVR);
  await page.waitForFunction((profile) => window.__PUBLIC_CONTROLLER_PROJECTION__?.selectedProfile === profile, AVR);
  const returned = await page.evaluate(() => ({
    project: JSON.stringify(window.__M6_PROJECT__()),
    workers: window.__M6_STATE__.runtimeWorkerCreations,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panel: document.querySelector('#profile-migration-explanation').getBoundingClientRect(),
    controller: document.querySelector('#controller-workbench').getBoundingClientRect(),
  }));
  assert.equal(returned.project, before.project, 'parked AVR draft was not restored exactly');
  assert.equal(returned.workers, before.workers, 'profile round trip created a runtime worker');
  assert(returned.overflow <= 1, `horizontal overflow ${returned.overflow}`);
  assert(returned.panel.left >= returned.controller.left && returned.panel.right <= returned.controller.right + 1,
    'migration explanation escaped the existing controller panel');
  assert.deepEqual(outside, []);
  assert.deepEqual(mutations, []);
  assert.deepEqual(errors, []);
  assert.equal((await context.cookies()).length, 0);

  await browser.close();
  process.stdout.write(`${JSON.stringify({ result: 'pass', progressiveDisclosure: true, keyboard: true,
    parkedDraftExact: true, noAutomaticMap: true, noMutationRequests: true,
    runtimeWorkerCreations: returned.workers, screenshot: screenshotPath })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
