// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.INVALID_PROPERTY_URL || 'http://127.0.0.1:19002';
const legacyFile = process.env.LEGACY_PROPERTY_FILE;
const legacySha256 = '70a8bd874ef03f4a8f55659792c5e503abe0114cf4c084549a48a4246a0a1491';
const legacyManifestSha256 = 'e828a66478c64877ea7b30b82b54a2bfe33b224d6cbf68fac76d831909f3c5ab';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function discardIfRequired(page) {
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
}

async function ensureProjectDialog(page) {
  if (!(await page.locator('#workbench-project-dialog').evaluate((node) => node.open))) {
    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
  }
}

async function closeProjectDialog(page) {
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-project-dialog .workbench-popup-close');
  }
}

async function downloadSaveCopy(page) {
  await ensureProjectDialog(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  return JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
}

(async () => {
  assert(legacyFile, 'LEGACY_PROPERTY_FILE is required');
  const originalBytes = fs.readFileSync(legacyFile);
  assert.equal(sha256(originalBytes), legacySha256, 'the frozen Windows file changed');
  const original = JSON.parse(originalBytes);
  assert.equal(original.modelLibrary.manifestSha256, legacyManifestSha256);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(60_000);
    const errors = []; const outside = []; let buildRequests = 0;
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (request.method() === 'POST' && /\/api\/(?:build|compile)/u.test(url.pathname)) buildRequests += 1;
    });
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/page-views', (route) => route.fulfill({ status: 200,
      contentType: 'application/json', body: '{"status":"disabled"}' }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#workbench-view-advanced');

    await page.setInputFiles('#project-open-input', {
      name: 'API003-baseline.intent-mcu.json', mimeType: 'application/json', buffer: originalBytes,
    });
    await discardIfRequired(page);
    await page.waitForFunction(() => window.__M6_PROJECT__()?.circuit?.components
      ?.some(({ id }) => id === 'trimmer-1'));
    const opened = JSON.parse(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()));
    assert.deepEqual(opened, original, 'Open changed the frozen Windows project');
    const preview = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.modelLibraryPreview());
    assert.equal(preview.ok, true);
    assert.equal(preview.migrationRequired, true);
    assert.deepEqual(preview.semanticChanges, []);
    assert.deepEqual(preview.rendererChanges, []);
    assert.equal(preview.unchanged.length, 90);
    assert.equal(await page.locator('#model-library-migrate').isEnabled(), true,
      await page.locator('#model-library-status').textContent());

    const savedLegacy = await downloadSaveCopy(page);
    assert.deepEqual(savedLegacy, original, 'Save copy changed the pre-migration project or lock');
    if (!(await page.locator('#model-library-detail').evaluate((node) => node.open))) {
      await page.click('#model-library-detail > summary');
    }
    const beforeMigration = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current());
    const [migration] = await Promise.all([
      page.waitForEvent('download'), page.click('#model-library-migrate'),
    ]);
    const migratedBytes = fs.readFileSync(await migration.path());
    const migrated = JSON.parse(migratedBytes);
    assert.deepEqual(migrated.project, original.project, 'explicit migration changed project data');
    assert.deepEqual(migrated.brief, original.brief, 'explicit migration changed the project brief');
    assert.notEqual(migrated.modelLibrary.manifestSha256, legacyManifestSha256);
    assert.equal(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()), beforeMigration,
      'migration download overwrote the open original');
    assert.match(await page.locator('#project-message').textContent(), /original file were not changed/iu);

    await page.setInputFiles('#project-open-input', {
      name: 'API003-baseline-migrated.intent-mcu.json', mimeType: 'application/json', buffer: migratedBytes,
    });
    await discardIfRequired(page);
    await page.waitForFunction(() => document.querySelector('#model-library-status')
      ?.textContent.includes('current immutable'));
    await closeProjectDialog(page);
    await page.locator('.circuit-component[data-component-id="trimmer-1"]').click();
    await page.click('#toggle-inspector');
    const input = page.locator('#property-editor [data-property="ohms"]');
    const beforeInvalid = await page.evaluate(() => ({
      bytes: window.__COMMON_PROJECT_FILES__.current(), revision: window.__M6_STATE__.revision,
      workers: window.__M6_STATE__.runtimeWorkerCreations,
    }));
    await input.fill('-1'); await input.press('Tab');
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
    const description = page.locator(`#${await input.getAttribute('aria-describedby')}`);
    assert.equal(await description.isVisible(), true);
    assert.match(await description.textContent(), /1.*10,000,000.*Ω/iu);
    assert.doesNotMatch(await description.textContent(), /INVALID_|details|revision/iu);
    const afterInvalid = await page.evaluate(() => ({
      bytes: window.__COMMON_PROJECT_FILES__.current(), revision: window.__M6_STATE__.revision,
      workers: window.__M6_STATE__.runtimeWorkerCreations,
    }));
    assert.deepEqual(afterInvalid, beforeInvalid, 'invalid value changed migrated data, history or workers');

    await input.fill('5000'); await input.press('Tab');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components
      .find(({ id }) => id === 'trimmer-1')?.properties.ohms === 5000);
    assert.equal(await input.getAttribute('aria-invalid'), 'false');
    await page.click('#workbench-inspector-dialog .workbench-popup-close');
    const savedCorrected = await downloadSaveCopy(page);
    const expectedProject = structuredClone(migrated.project);
    expectedProject.circuit.components.find(({ id }) => id === 'trimmer-1').properties.ohms = 5000;
    assert.deepEqual(savedCorrected.project, expectedProject, 'valid correction changed unrelated project data');
    assert.deepEqual(savedCorrected.modelLibrary, migrated.modelLibrary,
      'valid correction changed the explicitly migrated lock');
    assert.equal(sha256(fs.readFileSync(legacyFile)), legacySha256, 'original Windows file was modified');
    assert.equal(buildRequests, 0);
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ ok: true, legacySha256,
      legacyManifestSha256, currentManifestSha256: migrated.modelLibrary.manifestSha256,
      migration: 'explicit-data-only', savedLegacyExact: true, invalidAtomic: true,
      correctedOhms: 5000, buildRequests })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
