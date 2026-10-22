// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X66_URL || 'http://127.0.0.1:18898/dist/';
const output = process.env.X66_OUTPUT || '/tmp/x66-subcircuit-review-fix';
const PROFILE = 'board.atmega328p-16mhz-v1';

async function ready(page) {
  assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
  await page.waitForFunction(() => window.__M11_READY__ === true
    && window.__X66_CANVAS_ANNOTATIONS__ && window.__X66_BOUNDED_SUBCIRCUITS__
    && window.__LOCAL_VERSION_HISTORY__);
}

async function state(page) {
  return page.evaluate(async () => ({
    project: window.__M6_PROJECT__(),
    annotations: window.__X66_CANVAS_ANNOTATIONS__.snapshot(),
    subcircuits: window.__X66_BOUNDED_SUBCIRCUITS__.snapshot(),
    dirty: window.__UNSAVED_CHANGE_GUARD__.isDirty(),
    history: (await window.__LOCAL_VERSION_HISTORY__.list()).map(({ id }) => id),
  }));
}

async function installHistoryRecord(page, { envelope, modelLibrary }) {
  return page.evaluate(async ({ source, profile, sourceModelLibrary }) => {
    const bytes = new TextEncoder().encode(source);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    const record = { schema: 'intent-mcu-local-history-record@1', id: `${profile}:${hash}`,
      createdAt: '2026-10-22T08:30:00.000Z', label: 'Published rc.107 annotated workspace v2', profile,
      projectSha256: hash, byteLength: bytes.length, modelLibrary: sourceModelLibrary, envelope: source };
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
  }, { source: envelope, profile: PROFILE, sourceModelLibrary: modelLibrary });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const snapshots = await import(pathToFileURL(path.join(process.cwd(), 'src/model-library-snapshots.mjs')).href);
  const published = snapshots.PRE_X66_BOUNDED_SUBCIRCUITS_CURRENT_MODEL_LIBRARY_MANIFEST;
  const publishedLock = { schema: 'intent-mcu-model-library-lock@2', libraryId: published.libraryId,
    version: published.version, manifestSha256: published.manifestSha256,
    implementationSha256: published.implementationSha256 };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
    serviceWorkers: 'block' });
  const page = await context.newPage();
  const observations = { producers: [], mutations: [], outside: [], errors: [] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/api\/(build|run|scenario|worker)/u.test(url.pathname)) observations.producers.push(`${request.method()} ${url.pathname}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) observations.mutations.push(`${request.method()} ${url.pathname}`);
    if (url.origin !== new URL(base).origin) observations.outside.push(url.href);
  });
  page.on('pageerror', (error) => observations.errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') observations.errors.push(message.text()); });
  try {
    await ready(page);
    const workersBefore = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
    await page.click('#project-files-open'); await page.click('#project-demo');
    await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
    await page.click('#canvas-annotations-open');
    await page.fill('#canvas-note-text', 'RC107 v2 distinct migration note.'); await page.click('#canvas-note-add');
    await page.fill('#canvas-group-label', 'RC107 v2 distinct heater group');
    await page.check('#canvas-group-components input[value="heater-resistor-1"]'); await page.click('#canvas-group-add');
    await page.selectOption('#canvas-net-label-net', 'net-thermostat-ground');
    await page.fill('#canvas-net-label-text', 'RC107_V2_GROUND'); await page.click('#canvas-net-label-add');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#canvas-annotations-download')]);
    const current = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    const publishedV2 = structuredClone(current);
    publishedV2.schema = 'intent-mcu-annotated-workspace@2'; delete publishedV2.subcircuits;
    publishedV2.project.modelLibrary = publishedLock;
    const publishedV2Text = `${JSON.stringify(publishedV2, null, 2)}\n`;
    await page.click('#canvas-annotations-close');

    await page.setInputFiles('#project-open-input', { name: 'published-rc107-v2.intent-mcu.json',
      mimeType: 'application/json', buffer: Buffer.from(publishedV2Text) });
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot().notes[0]?.text
      === 'RC107 v2 distinct migration note.');
    let migrated = await state(page);
    assert.equal(migrated.annotations.notes[0].text, 'RC107 v2 distinct migration note.');
    assert.equal(migrated.annotations.groups[0].label, 'RC107 v2 distinct heater group');
    assert.deepEqual(migrated.annotations.netLabels.labels.map(({ netId, text }) => ({ netId, text })),
      [{ netId: 'net-thermostat-ground', text: 'RC107_V2_GROUND' }]);
    assert.deepEqual(migrated.subcircuits.definitions, []); assert.deepEqual(migrated.subcircuits.instances, []);

    await page.click('#project-files-open'); await page.locator('#local-history > summary').click();
    await page.click('#local-history-enable'); await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.enabled());
    const historyId = await installHistoryRecord(page, { envelope: publishedV2Text, modelLibrary: publishedLock });
    const historyOpen = await page.evaluate((id) => window.__LOCAL_VERSION_HISTORY__.open(id), historyId);
    assert.equal(historyOpen.ok, true, JSON.stringify(historyOpen));
    migrated = await state(page);
    assert.equal(migrated.annotations.notes[0].text, 'RC107 v2 distinct migration note.');
    assert.equal(migrated.annotations.groups[0].label, 'RC107 v2 distinct heater group');
    assert.equal(migrated.annotations.netLabels.labels[0].text, 'RC107_V2_GROUND');
    assert.deepEqual(migrated.subcircuits.definitions, []); assert.deepEqual(migrated.subcircuits.instances, []);

    await page.click('#canvas-annotations-open');
    await page.screenshot({ path: `${output}/x66-rc107-v2-history-migrated.png`, fullPage: false });
    await page.click('#canvas-annotations-close');
    const beforeMalformed = await state(page);
    const malformed = structuredClone(publishedV2); malformed.annotations.executable = 'never';
    await page.setInputFiles('#project-open-input', { name: 'malformed-rc107-v2.intent-mcu.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformed)) });
    await page.waitForFunction(() => /Open rejected/u.test(document.querySelector('#project-message').textContent));
    assert.deepEqual(await state(page), beforeMalformed);

    const recoveryContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await recoveryContext.addInitScript((source) => {
      localStorage.setItem('teach-lab.simulator.project.recovery.v2', source);
    }, publishedV2Text);
    const recoveryPage = await recoveryContext.newPage(); await ready(recoveryPage);
    const recovered = await state(recoveryPage);
    assert.equal(recovered.annotations.notes[0].text, 'RC107 v2 distinct migration note.');
    assert.equal(recovered.annotations.groups[0].label, 'RC107 v2 distinct heater group');
    assert.equal(recovered.annotations.netLabels.labels[0].text, 'RC107_V2_GROUND');
    assert.deepEqual(recovered.subcircuits.definitions, []); assert.deepEqual(recovered.subcircuits.instances, []);
    assert.match(await recoveryPage.locator('#project-message').textContent(), /Recovered and revalidated/u);
    await recoveryContext.close();

    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore);
    assert.deepEqual(observations.producers, []); assert.deepEqual(observations.mutations, []);
    assert.deepEqual(observations.outside, []); assert.deepEqual(observations.errors, []);
    assert.deepEqual(await context.cookies(), []);
    const result = { result: 'pass', schema: 'intent-mcu-annotated-workspace@2', modelVersion: published.version,
      normalOpen: true, recovery: true, localHistoryExactBytes: true, emptyOwner: true,
      note: 'RC107 v2 distinct migration note.', group: 'RC107 v2 distinct heater group',
      netLabel: 'RC107_V2_GROUND', malformedAtomic: true, producers: 0, mutations: 0,
      outsideRequests: 0, cookies: 0, errors: 0, runtimeWorkers: workersBefore };
    fs.writeFileSync(`${output}/x66-subcircuit-review-fix.json`, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
