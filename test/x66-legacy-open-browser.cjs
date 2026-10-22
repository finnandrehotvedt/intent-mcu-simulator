// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X66_URL || 'http://127.0.0.1:18898/';
const output = process.env.X66_OUTPUT || '/tmp/x66-legacy-open';
const PROFILE = 'board.atmega328p-16mhz-v1';

async function ready(page) {
  assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
  await page.waitForFunction(() => window.__M11_READY__ === true
    && window.__X66_CANVAS_ANNOTATIONS__ && window.__LOCAL_VERSION_HISTORY__);
}

async function state(page) {
  return page.evaluate(async () => ({
    project: window.__M6_PROJECT__(),
    annotations: window.__X66_CANVAS_ANNOTATIONS__.snapshot(),
    dirty: window.__UNSAVED_CHANGE_GUARD__.isDirty(),
    history: (await window.__LOCAL_VERSION_HISTORY__.list()).map(({ id }) => id),
  }));
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const snapshots = await import(pathToFileURL(path.join(process.cwd(), 'src/model-library-snapshots.mjs')).href);
  const historical = snapshots.PRE_X66_NET_LABELS_CURRENT_MODEL_LIBRARY_MANIFEST;
  const historicalLock = { schema: 'intent-mcu-model-library-lock@2', libraryId: historical.libraryId,
    version: historical.version, manifestSha256: historical.manifestSha256,
    implementationSha256: historical.implementationSha256 };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true,
    serviceWorkers: 'block' });
  const page = await context.newPage();
  const producers = []; const mutations = []; const outside = []; const errors = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/api\/(build|run|scenario|worker)/u.test(url.pathname)) producers.push(`${request.method()} ${url.pathname}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    if (url.origin !== new URL(base).origin) outside.push(url.href);
  });
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await ready(page);
    await page.click('#project-files-open'); await page.click('#project-demo');
    await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
    await page.click('#canvas-annotations-open');
    await page.fill('#canvas-note-text', 'Published v1 note survives migration.');
    await page.click('#canvas-note-add');
    await page.fill('#canvas-group-label', 'Published v1 group');
    await page.check('#canvas-group-components input[value="heater-resistor-1"]');
    await page.click('#canvas-group-add');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#canvas-annotations-download')]);
    const current = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    const legacy = structuredClone(current);
    legacy.schema = 'intent-mcu-annotated-workspace@1';
    legacy.project.modelLibrary = historicalLock;
    legacy.annotations = { schema: 'intent-mcu-canvas-annotations@1',
      notes: current.annotations.notes, groups: current.annotations.groups };
    const legacyText = `${JSON.stringify(legacy, null, 2)}\n`;
    await page.click('#canvas-annotations-close');

    await page.setInputFiles('#project-open-input', { name: 'published-v1.intent-mcu.json',
      mimeType: 'application/json', buffer: Buffer.from(legacyText) });
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot().notes[0]?.text.includes('Published v1'));
    let migrated = await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot());
    assert.equal(migrated.schema, 'intent-mcu-canvas-annotations@2');
    assert.equal(migrated.notes.length, 1); assert.equal(migrated.groups.length, 1);
    assert.deepEqual(migrated.netLabels, { schema: 'intent-mcu-net-labels@1', labels: [] });

    await page.click('#project-files-open');
    await page.locator('#local-history > summary').click(); await page.click('#local-history-enable');
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.enabled());
    const historyId = await page.evaluate(async ({ envelope, profile, modelLibrary }) => {
      const bytes = new TextEncoder().encode(envelope);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
      const record = { schema: 'intent-mcu-local-history-record@1', id: `${profile}:${hash}`,
        createdAt: '2026-10-22T00:00:00.000Z', label: 'Published annotation v1', profile,
        projectSha256: hash, byteLength: bytes.length, modelLibrary, envelope };
      const request = indexedDB.open('intent-mcu-local-history-v1', 1);
      const database = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('versions', 'readwrite');
        transaction.objectStore('versions').put(record);
        transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
      });
      database.close(); return record.id;
    }, { envelope: legacyText, profile: PROFILE, modelLibrary: historicalLock });
    const historyOpen = await page.evaluate((id) => window.__LOCAL_VERSION_HISTORY__.open(id), historyId);
    assert.equal(historyOpen.ok, true, JSON.stringify(historyOpen));
    migrated = await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot());
    assert.equal(migrated.notes.length, 1); assert.equal(migrated.groups.length, 1);
    assert.deepEqual(migrated.netLabels.labels, []);

    const beforeMalformed = await state(page);
    const malformed = structuredClone(legacy); malformed.annotations.executable = 'never';
    await page.setInputFiles('#project-open-input', { name: 'malformed-v1.intent-mcu.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformed)) });
    await page.waitForFunction(() => /Open rejected/u.test(document.querySelector('#project-message').textContent));
    assert.deepEqual(await state(page), beforeMalformed);

    const recoveryContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await recoveryContext.addInitScript((source) => {
      localStorage.setItem('teach-lab.simulator.project.recovery.v2', source);
    }, legacyText);
    const recoveryPage = await recoveryContext.newPage(); await ready(recoveryPage);
    const recovered = await recoveryPage.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot());
    assert.equal(recovered.notes.length, 1); assert.equal(recovered.groups.length, 1);
    assert.deepEqual(recovered.netLabels, { schema: 'intent-mcu-net-labels@1', labels: [] });
    assert.match(await recoveryPage.locator('#project-message').textContent(), /Recovered and revalidated/u);
    await recoveryContext.close();

    assert.deepEqual(producers, []); assert.deepEqual(mutations, []); assert.deepEqual(outside, []);
    assert.deepEqual(errors, []); assert.equal((await context.cookies()).length, 0);
    const result = { result: 'pass', legacyNormalOpen: true, legacyRecovery: true,
      legacyLocalHistory: true, malformedAtomic: true, notes: 1, groups: 1, netLabels: 0,
      producers: 0, mutations: 0, outsideRequests: 0, cookies: 0 };
    fs.writeFileSync(`${output}/x66-legacy-open.json`, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
