// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X56_URL || 'http://127.0.0.1:4174';
const profiles = [
  'board.atmega328p-16mhz-v1',
  'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1',
  'board.stm32f429zi-nucleo144-v1',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.addInitScript(() => { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; });
  const page = await context.newPage();
  const outside = []; const mutations = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  const workersBefore = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);

  const profileLocks = {};
  for (const profile of profiles) {
    await page.selectOption('#board-select', profile);
    profileLocks[profile] = await page.evaluate((selected) => {
      const envelope = JSON.parse(window.__COMMON_PROJECT_FILES__.current(selected));
      return { lock: envelope.modelLibrary, api: window.__COMMON_PROJECT_FILES__.modelLibraryLock(selected) };
    }, profile);
    assert.deepEqual(profileLocks[profile].lock, profileLocks[profile].api);
    assert.match(profileLocks[profile].lock.manifestSha256, /^[a-f0-9]{64}$/);
  }

  const avr = profiles[0];
  await page.selectOption('#board-select', avr);
  const current = await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), avr);
  const retained = JSON.parse(current);
  retained.schema = 'intent-mcu-project-envelope@6';
  delete retained.modelLibrary;
  await page.setInputFiles('#project-open-input', {
    name: 'retained-pre-x56.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(retained)),
  });
  await page.waitForFunction(() => document.querySelector('#model-library-summary').textContent.includes('retained'));
  const retainedState = await page.evaluate(() => ({
    bytes: window.__COMMON_PROJECT_FILES__.current(),
    preview: window.__COMMON_PROJECT_FILES__.modelLibraryPreview(),
    summary: document.querySelector('#model-library-summary').textContent,
    status: document.querySelector('#model-library-status').textContent,
    buttonDisabled: document.querySelector('#model-library-migrate').disabled,
    runtime: window.__M6_STATE__.artifactIdentity,
  }));
  assert.equal(retainedState.preview.migrationRequired, true);
  assert.equal(retainedState.preview.semanticChanges.length, 0);
  assert.equal(retainedState.preview.rendererChanges.length, 0);
  assert.equal(retainedState.preview.unchanged.length, 25);
  assert.equal(retainedState.buttonDisabled, false);
  assert.equal(retainedState.runtime, null);

  await page.locator('#model-library-detail > summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#model-library-detail').evaluate((node) => node.open), true);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#model-library-migrate'),
  ]);
  const downloadedPath = await download.path();
  const migrated = JSON.parse(fs.readFileSync(downloadedPath, 'utf8'));
  assert.equal(migrated.schema, 'intent-mcu-project-envelope@7');
  assert.equal(migrated.modelLibrary.version, profileLocks[avr].lock.version);
  assert.equal(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()), retainedState.bytes,
    'opt-in migration overwrote the open retained project');
  assert.match(await page.textContent('#project-message'), /original file were not changed/u);
  assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore,
    'preview or migration created a runtime worker');
  if (process.env.X56_SCREENSHOT) await page.screenshot({ path: process.env.X56_SCREENSHOT });

  await page.setViewportSize({ width: 390, height: 844 });
  assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1,
    'model-library disclosure caused horizontal overflow');

  const forged = JSON.parse(retainedState.bytes);
  forged.modelLibrary = { ...forged.modelLibrary, version: 'forged', manifestSha256: 'b'.repeat(64) };
  await page.setInputFiles('#project-open-input', {
    name: 'forged.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(forged)),
  });
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('MODEL_LIBRARY_LOCK_UNTRUSTED'));
  assert.equal(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()), retainedState.bytes,
    'untrusted model-library lock changed the open project');

  assert.deepEqual(outside, []);
  assert.deepEqual(mutations, []);
  assert.equal((await context.cookies()).length, 0);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ result: 'pass', profiles: profiles.length, exactLocks: true,
    retainedResolver: true, migrationCopyOnly: true, forgedLockRejected: true, externalRequests: 0 })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
