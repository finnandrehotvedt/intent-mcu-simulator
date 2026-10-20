// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.COMMON_PROJECT_URL || 'http://127.0.0.1:4174';
const AVR = 'board.atmega328p-16mhz-v1';
const C3 = 'board.esp32-c3-devmodule-v1';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1265, height: 950 }, acceptDownloads: true });
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

  await page.click('#project-files-open');
  await page.click('#project-demo');
  await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
  const legacy = await page.evaluate(() => window.__M6_PROJECT__());
  assert.equal(legacy.schema, 'intent-mcu-project-contact-persistence@1');
  assert.equal(legacy.project.artifact.status, 'dirty');
  assert.equal(legacy.project.artifact.inputIdentitySha256, null);
  assert.equal(legacy.project.artifact.artifactIdentitySha256, null);
  assert.equal(legacy.compiledFixture.schema, 'intent-mcu-compiled-fixture-ref@1');
  const envelope = await page.evaluate((profile) => window.__COMMON_PROJECT_FILES__.current(profile), AVR);
  const parsedEnvelope = JSON.parse(envelope);
  assert.deepEqual(parsedEnvelope.project, legacy);

  await page.setInputFiles('#project-open-input', { name: 'legacy-contact.intent-mcu.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)) });
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('migrated in memory'));
  const migrated = await page.evaluate(() => ({
    project: window.__M6_PROJECT__(), state: window.__M6_STATE__, file: window.__COMMON_PROJECT_FILE_STATE__,
  }));
  assert.deepEqual(migrated.project, legacy, 'legacy contact migration changed authored data');
  assert.equal(migrated.state.artifactIdentity, null, 'legacy contact migration restored artifact authority');
  assert.deepEqual(migrated.state.thermostatExperiment?.results ?? [], [], 'legacy contact migration restored verdicts');
  assert.equal(migrated.file.report.legacy, true);

  const protectedBefore = await page.evaluate(() => ({
    profile: document.querySelector('#board-select').value,
    project: window.__M6_PROJECT__(),
    lifecycle: window.__M6_STATE__.lifecycle,
    artifact: window.__M6_STATE__.artifactIdentity,
  }));
  const mismatch = { ...parsedEnvelope, profile: C3 };
  await page.setInputFiles('#project-open-input', { name: 'mismatch.intent-mcu.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(mismatch)) });
  await page.waitForTimeout(60);
  const protectedAfter = await page.evaluate(() => ({
    profile: document.querySelector('#board-select').value,
    project: window.__M6_PROJECT__(),
    lifecycle: window.__M6_STATE__.lifecycle,
    artifact: window.__M6_STATE__.artifactIdentity,
  }));
  assert.deepEqual(protectedAfter, protectedBefore, 'profile/schema mismatch changed active family, draft, lifecycle or authority');

  const rawAuthority = structuredClone(legacy); rawAuthority.runtime = { verdict: 'passed' };
  await page.setInputFiles('#project-open-input', { name: 'authority.intent-mcu.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(rawAuthority)) });
  await page.waitForTimeout(60);
  assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__()), legacy,
    'raw authority was silently stripped instead of rejecting atomically');

  await page.selectOption('#family-select', 'architecture.esp32-v1');
  await page.click('#project-files-open');
  await page.fill('#c3-project-name', 'C3 CROSS FAMILY FILE');
  await page.locator('#c3-project-name').press('Tab');
  const c3Envelope = await page.evaluate((profile) => window.__COMMON_PROJECT_FILES__.current(profile), C3);
  await page.keyboard.press('Escape');
  await page.selectOption('#family-select', 'architecture.avr-v1');
  assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__()), legacy, 'AVR draft was not parked across profile switch');
  await page.setInputFiles('#project-open-input', { name: 'c3.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(c3Envelope) });
  await page.waitForFunction((profile) => document.querySelector('#board-select').value === profile, C3);
  assert.equal(await page.inputValue('#c3-project-name'), 'C3 CROSS FAMILY FILE');
  await page.selectOption('#family-select', 'architecture.avr-v1');
  assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__()), legacy,
    'valid cross-family Open changed the parked previous profile');

  await page.click('#project-files-open');
  const [legacyDownload] = await Promise.all([page.waitForEvent('download'), page.click('#project-export')]);
  const legacyPath = await legacyDownload.path();
  assert.equal(JSON.parse(fs.readFileSync(legacyPath, 'utf8')).schema, 'intent-mcu-project-contact-persistence@1');

  assert.deepEqual(outside, []);
  assert.deepEqual(mutations, []);
  assert.equal((await context.cookies()).length, 0);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ result: 'pass', legacyContact: true, rawAuthorityRejected: true,
    mismatchAtomic: true, crossFamilyRouting: true, parkedDraftPreserved: true, rollbackLegacyCopy: true })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
