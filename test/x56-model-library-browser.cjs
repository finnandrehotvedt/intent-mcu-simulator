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
    assert.match(profileLocks[profile].lock.implementationSha256, /^[a-f0-9]{64}$/);
  }

  const avr = profiles[0];
  await page.selectOption('#board-select', avr);
  const current = await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), avr);
  const preX56 = JSON.parse(current);
  preX56.schema = 'intent-mcu-project-envelope@6';
  delete preX56.modelLibrary;
  await page.setInputFiles('#project-open-input', {
    name: 'generated-pre-x56.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(preX56)),
  });
  await page.waitForFunction(() => document.querySelector('#model-library-summary').textContent.includes('retained'));
  const preX56State = await page.evaluate(() => ({
    bytes: window.__COMMON_PROJECT_FILES__.current(),
    preview: window.__COMMON_PROJECT_FILES__.modelLibraryPreview(),
    buttonDisabled: document.querySelector('#model-library-migrate').disabled,
    runtime: window.__M6_STATE__.artifactIdentity,
  }));
  assert.equal(preX56State.preview.migrationRequired, true);
  assert.equal(preX56State.preview.semanticChanges.length, 0);
  assert.equal(preX56State.preview.rendererChanges.length, 0);
  assert.equal(preX56State.preview.unchanged.length, 25);
  assert.equal(preX56State.buttonDisabled, false,
    'pre-X56 retained compatibility lost its separately supported data-only migration path');
  assert.equal(preX56State.runtime, null);

  const priorX56 = JSON.parse(current);
  priorX56.modelLibrary = {
    schema: 'intent-mcu-model-library-lock@2',
    libraryId: 'intent-mcu-public-models',
    version: '2.0.0-x56-current',
    manifestSha256: '5c94ce070526d2e7e417fed0cb152fc28bdea24ee9beb52c65488328d41eac0b',
    implementationSha256: '4e0fc926236de5edda6b3e85c3770b709a4ae3643d47b8cd9b3138c4c1b61633',
  };
  const priorX56Bytes = JSON.stringify(priorX56);

  await page.click('#firmware-open');
  const sourceBefore = await page.inputValue('#source');
  await page.fill('#source', `${sourceBefore}\n// generated-prior-x56-cancel-guard`);
  await page.keyboard.press('Escape');
  const dirtyRetainedBytes = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current());
  await page.setInputFiles('#project-open-input', {
    name: 'generated-prior-x56.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(priorX56Bytes),
  });
  await page.waitForFunction(() => document.querySelector('#unsaved-change-dialog').open);
  await page.click('#unsaved-keep');
  assert.equal(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()), dirtyRetainedBytes,
    'cancelled prior-X56 Open replaced the retained project');
  assert.match(await page.inputValue('#source'), /generated-prior-x56-cancel-guard/u);

  await page.setInputFiles('#project-open-input', {
    name: 'generated-prior-x56.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(priorX56Bytes),
  });
  await page.waitForFunction(() => document.querySelector('#unsaved-change-dialog').open);
  await page.click('#unsaved-discard');
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

  await page.click('#project-files-open');
  if (!await page.locator('#model-library-detail').evaluate((node) => node.open)) {
    await page.click('#model-library-detail > summary');
  }
  assert.equal(await page.locator('#model-library-detail').evaluate((node) => node.open), true);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#model-library-migrate'),
  ]);
  const downloadedPath = await download.path();
  const migrated = JSON.parse(fs.readFileSync(downloadedPath, 'utf8'));
  assert.equal(migrated.schema, 'intent-mcu-project-envelope@8');
  assert.equal(migrated.modelLibrary.version, profileLocks[avr].lock.version);
  assert.equal(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()), retainedState.bytes,
    'opt-in migration overwrote the open retained project');
  assert.match(await page.textContent('#project-message'), /original file were not changed/u);
  assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore,
    'preview or migration created a runtime worker');
  if (process.env.X56_SCREENSHOT) await page.screenshot({ path: process.env.X56_SCREENSHOT });

  await page.setInputFiles('#project-open-input', {
    name: 'generated-prior-x56-migrated.intent-mcu.json', mimeType: 'application/json',
    buffer: Buffer.from(fs.readFileSync(downloadedPath)),
  });
  await page.waitForFunction((version) => JSON.parse(window.__COMMON_PROJECT_FILES__.current()).modelLibrary.version === version,
    profileLocks[avr].lock.version);
  assert.equal(await page.evaluate(() => window.__M6_STATE__.artifactIdentity), null);
  await page.click('#project-files-open');
  const [saved] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  const savedEnvelope = JSON.parse(fs.readFileSync(await saved.path(), 'utf8'));
  assert.deepEqual(savedEnvelope.modelLibrary, profileLocks[avr].lock);
  assert.equal(savedEnvelope.runtime, undefined);
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
    await page.keyboard.press('Escape');
  }

  assert((await page.evaluate(() => document.documentElement.scrollWidth
    - document.documentElement.clientWidth)) <= 1,
  'model-library disclosure caused horizontal overflow in the supported desktop workbench');

  const protectedBytes = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current());
  const forged = JSON.parse(protectedBytes);
  forged.modelLibrary = { ...forged.modelLibrary, version: 'forged', manifestSha256: 'b'.repeat(64) };
  await page.setInputFiles('#project-open-input', {
    name: 'forged.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(forged)),
  });
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('MODEL_LIBRARY_LOCK_UNTRUSTED'));
  assert.equal(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()), protectedBytes,
    'untrusted model-library lock changed the open project');

  assert.deepEqual(outside, []);
  assert.deepEqual(mutations, []);
  assert.equal((await context.cookies()).length, 0);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ result: 'pass', profiles: profiles.length, exactLocks: true,
    generatedPreX56Retained: true, generatedPriorX56: true, openCancelAtomic: true,
    migrationCopyOnly: true, migratedSaveRoundtrip: true, forgedLockRejected: true, externalRequests: 0 })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
