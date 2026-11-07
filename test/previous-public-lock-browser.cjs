// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.PREVIOUS_PUBLIC_LOCK_URL || 'http://127.0.0.1:4174';
const previousLock = Object.freeze({
  schema: 'intent-mcu-model-library-lock@2',
  libraryId: 'intent-mcu-public-models',
  version: '2.0.0-runtime-deadline-grace.1-current',
  manifestSha256: '88bc0f7643dc5512ee9c24986a4eaad033976b18e6fafd9823540abb0ca568f2',
  implementationSha256: '01035938b2c3a9e99a04bc35c4da49fddb8af076534ec199e8bcc9f010c0d48c',
});
const profiles = [
  { id: 'board.atmega328p-16mhz-v1', open: '#project-open-input', save: '#project-save' },
  { id: 'board.rp2040-pico-v1', open: '#pico-open-input', save: '#pico-save' },
  { id: 'board.esp32-c3-devmodule-v1', open: '#c3-open-input', save: '#c3-save' },
  { id: 'board.stm32f429zi-nucleo144-v1', open: '#stm32-open-input', save: '#stm32-save' },
];
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 960 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.showOpenFilePicker = undefined;
    window.showSaveFilePicker = undefined;
  });
  const page = await context.newPage();
  const outside = []; const mutations = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      mutations.push(`${request.method()} ${url.pathname}`);
    }
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);

  const results = [];
  for (const profile of profiles) {
    await page.selectOption('#board-select', profile.id);
    await page.waitForFunction((id) => document.querySelector('#board-select').value === id, profile.id);
    const fixture = await page.evaluate(({ id, lock }) => {
      const envelope = JSON.parse(window.__COMMON_PROJECT_FILES__.current(id));
      envelope.modelLibrary = lock;
      return `${JSON.stringify(envelope, null, 2)}\n`;
    }, { id: profile.id, lock: previousLock });

    await page.setInputFiles(profile.open, {
      name: `${profile.id}.intent-mcu.json`, mimeType: 'application/json', buffer: Buffer.from(fixture),
    });
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(({ id, manifest }) =>
      window.__COMMON_PROJECT_FILES__.modelLibraryLock(id).manifestSha256 === manifest,
    { id: profile.id, manifest: previousLock.manifestSha256 });

    const opened = await page.evaluate((id) => ({
      text: window.__COMMON_PROJECT_FILES__.current(id),
      lock: window.__COMMON_PROJECT_FILES__.modelLibraryLock(id),
      report: window.__COMMON_PROJECT_FILE_STATE__.report,
    }), profile.id);
    assert.equal(opened.text, fixture, `${profile.id} changed canonical bytes on Open`);
    assert.deepEqual(opened.lock, previousLock, `${profile.id} silently changed the old lock`);
    assert.equal(opened.report.legacy, false);
    assert.equal(opened.report.modelLibrary.migrationAvailable, true);
    assert.equal(opened.report.modelLibrary.executableAuthority, false);
    assert.equal(opened.report.modelLibrary.runtimeUnavailableCode, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
    assert.equal(opened.report.publishedRecovery, undefined,
      `${profile.id} used lossy published recovery instead of the finite resolver`);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click(profile.save),
    ]);
    const downloadedPath = await download.path();
    const downloaded = fs.readFileSync(downloadedPath, 'utf8');
    assert.equal(downloaded, fixture, `${profile.id} changed bytes on Download copy`);
    assert.deepEqual(await page.evaluate((id) =>
      window.__COMMON_PROJECT_FILES__.modelLibraryLock(id), profile.id), previousLock,
    `${profile.id} changed the lock after Download copy`);
    results.push({ profile: profile.id, bytes: Buffer.byteLength(fixture), sha256: sha256(fixture) });
  }

  assert.deepEqual(outside, []);
  assert.deepEqual(mutations, []);
  assert.equal((await context.cookies()).length, 0);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ result: 'pass', profiles: results,
    exactOpenAndDownload: true, silentMigration: false, builds: 0, runs: 0 })}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
