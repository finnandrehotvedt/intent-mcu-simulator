// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, firefox, webkit } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X63_URL || 'http://127.0.0.1:18857';
const browserName = process.env.X63_BROWSER || 'chromium';
const full = process.env.X63_MODE !== 'smoke';
const screenshot = process.env.X63_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

const profiles = [
  { id: 'board.atmega328p-16mhz-v1', family: 'architecture.avr-v1', name: '#project-name', input: '#project-open-input', native: '#project-native-open', run: '#run' },
  { id: 'board.rp2040-pico-v1', family: 'architecture.rp2040-v1', name: '#pico-project-name', input: '#pico-open-input', native: '#pico-native-open', run: '#pico-run' },
  { id: 'board.esp32-c3-devmodule-v1', family: 'architecture.esp32-v1', name: '#c3-project-name', input: '#c3-open-input', native: '#c3-native-open', run: '#c3-run' },
  { id: 'board.stm32f429zi-nucleo144-v1', family: 'architecture.stm32-v1', name: '#stm32-project-name', input: '#stm32-open-input', native: '#stm32-native-open', run: '#stm32-run' },
];

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const historyId = (profile, value) => `${profile}:${sha(value)}`;

async function activate(locator) {
  await locator.focus();
  await locator.press('Enter');
}

async function selectByKeyboard(page, selector, value) {
  const locator = page.locator(selector);
  const index = await locator.locator('option').evaluateAll((options, selected) =>
    options.findIndex((option) => option.value === selected), value);
  assert(index >= 0, `${selector}: missing ${value}`);
  await locator.focus();
  await page.keyboard.press('Home');
  for (let position = 0; position < index; position += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(({ target, selected }) => document.querySelector(target).value === selected,
    { target: selector, selected: value });
}

async function ready(page) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true && window.__LOCAL_VERSION_HISTORY__);
}

async function choose(page, profile) {
  await selectByKeyboard(page, '#family-select', profile.family);
  await page.waitForFunction((id) => document.querySelector('#board-select').value === id, profile.id);
}

async function rename(page, profile, value) {
  await page.locator(profile.name).focus();
  await page.locator(profile.name).fill(value);
  await page.keyboard.press('Tab');
}

async function canonical(page, profile) {
  return page.evaluate((id) => window.__COMMON_PROJECT_FILES__.current(id), profile.id);
}

async function openOrdinary(page, profile, text, name = 'project.intent-mcu.json') {
  await page.setInputFiles(profile.input, { name, mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForFunction(({ id, expected }) => window.__COMMON_PROJECT_FILES__.current(id) === expected,
    { id: profile.id, expected: text });
}

async function openHistoryDetails(page) {
  if (!await page.locator('#local-history').evaluate((node) => node.open)) {
    await activate(page.locator('#local-history > summary'));
  }
}

async function saveVersion(page) {
  const snapshot = await page.evaluate(() => ({
    profile: document.querySelector('#board-select').value,
    canonical: window.__COMMON_PROJECT_FILES__.current(),
  }));
  const expectedId = historyId(snapshot.profile, snapshot.canonical);
  await activate(page.locator('#local-history-save'));
  await page.waitForFunction(async (id) => {
    const text = document.querySelector('#local-history-status').textContent;
    const saved = (await window.__LOCAL_VERSION_HISTORY__.list()).some((record) => record?.id === id);
    return saved || /LOCAL_HISTORY_/u.test(text)
      || document.querySelector('#local-history-confirm').open;
  }, expectedId);
}

function installGuards() {
  const originalOpen = indexedDB.open.bind(indexedDB);
  window.__x63IndexedDbOpenCount = 0;
  indexedDB.open = (...args) => { window.__x63IndexedDbOpenCount += 1; return originalOpen(...args); };
  window.__x63PointerEvents = 0;
  for (const eventName of ['pointerdown', 'mousedown', 'touchstart']) {
    document.addEventListener(eventName, () => { window.__x63PointerEvents += 1; }, { capture: true });
  }
  const native = { text: '', calls: 0 };
  window.__X63_NATIVE__ = native;
  window.showOpenFilePicker = async () => [{
    name: 'connected.intent-mcu.json',
    async getFile() { return new File([native.text], 'connected.intent-mcu.json', { type: 'application/json' }); },
  }];
  window.showSaveFilePicker = undefined;
}

async function assertNoNetworkOrRuntime(page, observations, workersBefore) {
  assert.deepEqual(observations.outside, [], 'local history made a third-party request');
  assert.deepEqual(observations.mutations, [], 'local history made a server mutation');
  assert.deepEqual(observations.jobs, [], 'local history called a producer API');
  assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore,
    'local history created a firmware worker');
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
  await context.addInitScript(installGuards);
  const page = await context.newPage();
  const observations = { outside: [], mutations: [], jobs: [], errors: [] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) observations.outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) observations.mutations.push(`${request.method()} ${url.pathname}`);
    if (/^\/api\//u.test(url.pathname)) observations.jobs.push(`${request.method()} ${url.pathname}`);
  });
  page.on('pageerror', (error) => observations.errors.push(error.message));
  try {
    await ready(page);
    const workersBefore = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
    assert.equal(await page.evaluate(() => window.__x63IndexedDbOpenCount), 0, 'Off opened IndexedDB');
    assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.databaseOpen()), false);
    assert.equal(await page.textContent('#local-history-badge'), 'Off');
    await openHistoryDetails(page);
    await activate(page.locator('#local-history-enable'));
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.enabled());
    assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)), 0,
      'opt-in captured source automatically');

    await selectByKeyboard(page, '#local-history-retention', '10');
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.settings().retentionCount === 10);
    await activate(page.locator('#local-history-disable'));
    await page.waitForFunction(() => !window.__LOCAL_VERSION_HISTORY__.databaseOpen());
    assert.match(await page.textContent('#local-history-status'), /Retained local versions were not deleted/u);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__);
    assert.equal(await page.evaluate(() => window.__x63IndexedDbOpenCount), 0, 'disabled reload opened IndexedDB');
    await openHistoryDetails(page);
    await activate(page.locator('#local-history-enable'));
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.enabled());
    assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.settings().retentionCount), 10,
      'disable/re-enable reset retention');

    const accepted = [];
    const selectedProfiles = full ? profiles : [profiles[0]];
    for (const profile of selectedProfiles) {
      await choose(page, profile);
      await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__?.enabled());
      await openHistoryDetails(page);
      const historyUiState = await page.evaluate(() => ({
        enabled: window.__LOCAL_VERSION_HISTORY__.enabled(),
        databaseOpen: window.__LOCAL_VERSION_HISTORY__.databaseOpen(),
        settings: window.__LOCAL_VERSION_HISTORY__.settings(),
        detailsOpen: document.querySelector('#local-history').open,
        labelDisabled: document.querySelector('#local-history-label').disabled,
        status: document.querySelector('#local-history-status').textContent,
      }));
      assert.equal(historyUiState.labelDisabled, false, `${profile.id}: history UI lost enabled state: ${JSON.stringify(historyUiState)}`);
      const initial = await canonical(page, profile);
      await openOrdinary(page, profile, initial, `${profile.id}-A.intent-mcu.json`);
      await page.locator('#local-history-label').fill(`${profile.id} A`);
      await saveVersion(page);
      const a = await canonical(page, profile);
      await rename(page, profile, `${profile.id} Version B`);
      await page.locator('#local-history-label').fill(`${profile.id} B`);
      await saveVersion(page);
      const b = await canonical(page, profile);
      assert.notEqual(a, b, `${profile.id}: A/B bytes did not differ`);
      accepted.push({ profile, a, b, aId: historyId(profile.id, a), bId: historyId(profile.id, b) });
    }
    assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)),
      selectedProfiles.length * 2);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__?.enabled());
    await openHistoryDetails(page);
    assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.settings().retentionCount), 10);
    assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)),
      selectedProfiles.length * 2, 'records did not persist across reload');

    const first = accepted[0];
    const firstRow = page.locator(`.local-history-row[data-history-id="${first.aId}"]`);
    const [download] = await Promise.all([
      page.waitForEvent('download'), activate(firstRow.getByRole('button', { name: 'Download copy' })),
    ]);
    const downloadPath = await download.path();
    assert.equal(fs.readFileSync(downloadPath, 'utf8'), first.a, 'normal recovery bytes changed');

    const recoveryContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const recoveryPage = await recoveryContext.newPage();
    await ready(recoveryPage);
    await choose(recoveryPage, first.profile);
    await openOrdinary(recoveryPage, first.profile, fs.readFileSync(downloadPath, 'utf8'), 'recovered.intent-mcu.json');
    assert.equal(await canonical(recoveryPage, first.profile), first.a, 'ordinary Open did not recover exact A bytes');
    assert.equal(await recoveryPage.locator(first.profile.run).isDisabled(), true, 'recovery restored runtime authority');
    await recoveryContext.close();

    await choose(page, first.profile);
    await page.evaluate((text) => { window.__X63_NATIVE__.text = text; }, first.b);
    await activate(page.locator(first.profile.native));
    await page.waitForFunction((id) => window.__NATIVE_PROJECT_FILES__.status(id).connected, first.profile.id);
    await rename(page, first.profile, 'Unsaved before local history Open');
    await activate(firstRow.getByRole('button', { name: 'Open this version' }));
    await page.waitForSelector('#unsaved-change-dialog[open]');
    await activate(page.locator('#unsaved-keep'));
    assert.equal(await page.inputValue(first.profile.name), 'Unsaved before local history Open');
    await activate(firstRow.getByRole('button', { name: 'Open this version' }));
    await page.waitForSelector('#unsaved-change-dialog[open]');
    await activate(page.locator('#unsaved-discard'));
    await page.waitForFunction(({ id, expected }) => window.__COMMON_PROJECT_FILES__.current(id) === expected,
      { id: first.profile.id, expected: first.a });
    assert.equal(await page.evaluate((id) => window.__NATIVE_PROJECT_FILES__.status(id).connected, first.profile.id), false,
      'history Open retained native file authority');
    assert.equal(await page.locator(first.profile.run).isDisabled(), true, 'history Open retained runtime authority');

    if (full) {
      const avr = profiles[0];
      await choose(page, avr);
      for (const label of ['Ninth', 'Tenth']) {
        await rename(page, avr, `${label} explicit version`);
        await saveVersion(page);
      }
      assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)), 10);
      await rename(page, avr, 'Eleventh requires confirmation');
      await saveVersion(page);
      await page.waitForSelector('#local-history-confirm[open]');
      await activate(page.locator('#local-history-confirm-cancel'));
      assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)), 10,
        'cancelled replacement changed history');
      await saveVersion(page);
      await page.waitForSelector('#local-history-confirm[open]');
      await activate(page.locator('#local-history-confirm-accept'));
      await page.waitForFunction(() => !document.querySelector('#local-history-confirm').open);
      assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)), 10,
        'confirmed replacement did not retain the exact global limit');
      await rename(page, avr, 'Twelfth stale confirmation');
      await saveVersion(page);
      await page.waitForSelector('#local-history-confirm[open]');
      const page2 = await context.newPage();
      await ready(page2);
      await page2.evaluate(async () => {
        const entries = await window.__LOCAL_VERSION_HISTORY__.entries();
        const request = indexedDB.open('intent-mcu-local-history-v1', 1);
        const database = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction('versions', 'readwrite');
        transaction.objectStore('versions').delete(entries[0].storageKey);
        await new Promise((resolve, reject) => {
          transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error);
        });
        database.close();
      });
      await activate(page.locator('#local-history-confirm-accept'));
      await page.waitForFunction(() => /STALE_CONFIRMATION/u.test(document.querySelector('#local-history-confirm-status').textContent));
      assert.equal(await page.locator('#local-history-confirm').evaluate((node) => node.open), true,
        'stale confirmation silently proceeded');
      await activate(page.locator('#local-history-confirm-cancel'));
      await page2.close();

      const beforeQuota = await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length));
      await page.evaluate(() => {
        window.__x63OriginalAdd = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function rejectAdd() { throw new DOMException('synthetic quota', 'QuotaExceededError'); };
      });
      await saveVersion(page);
      await page.evaluate(() => { IDBObjectStore.prototype.add = window.__x63OriginalAdd; });
      assert.match(await page.textContent('#local-history-status'), /QuotaExceededError/u);
      assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)), beforeQuota,
        'quota failure changed retained history');
      await page.evaluate(() => {
        window.__x63OriginalAdd = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function abortAdd() {
          this.transaction.abort();
          return window.__x63OriginalAdd.apply(this, arguments);
        };
      });
      await saveVersion(page);
      await page.evaluate(() => { IDBObjectStore.prototype.add = window.__x63OriginalAdd; });
      assert.match(await page.textContent('#local-history-status'), /AbortError|InvalidStateError|TransactionInactiveError/u);
      assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)), beforeQuota,
        'aborted transaction changed retained history');

      const invalidEnvelope = '{"schema":"broken-local-recovery"';
      await page.evaluate(async (envelope) => {
        const request = indexedDB.open('intent-mcu-local-history-v1', 1);
        const database = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction('versions', 'readwrite');
        transaction.objectStore('versions').put({ id: 'synthetic-corrupt-row', createdAt: 7, envelope });
        await new Promise((resolve, reject) => {
          transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error);
        });
        database.close();
      }, invalidEnvelope);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__?.enabled());
      await openHistoryDetails(page);
      const invalidRow = page.locator('.local-history-row[data-valid="false"]');
      assert.equal(await invalidRow.count(), 1, 'corrupt record was not safely enumerated');
      assert.equal(await invalidRow.getByRole('button', { name: 'Open this version' }).isDisabled(), true);
      const [rawDownload] = await Promise.all([
        page.waitForEvent('download'), activate(invalidRow.getByRole('button', { name: 'Download raw recovery copy' })),
      ]);
      assert.equal(fs.readFileSync(await rawDownload.path(), 'utf8'), invalidEnvelope, 'raw recovery bytes changed');
      await choose(page, avr);
      await openHistoryDetails(page);
      await rename(page, avr, 'Save blocked by corrupt row');
      await saveVersion(page);
      assert.match(await page.textContent('#local-history-status'), /LOCAL_HISTORY_CORRUPT_STORE/u);
      await activate(invalidRow.getByRole('button', { name: 'Delete local version' }));
      await page.waitForSelector('#local-history-confirm[open]');
      await activate(page.locator('#local-history-confirm-accept'));
      await page.waitForFunction(() => !document.querySelector('#local-history-confirm').open);
      assert.equal(await page.locator('.local-history-row[data-valid="false"]').count(), 0,
        'explicit corrupt-record deletion did not complete');

      await selectByKeyboard(page, '#local-history-retention', '3');
      await page.waitForSelector('#local-history-confirm[open]');
      await activate(page.locator('#local-history-confirm-cancel'));
      assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.settings().retentionCount), 10,
        'cancelled retention reduction changed settings');
      await selectByKeyboard(page, '#local-history-retention', '3');
      await page.waitForSelector('#local-history-confirm[open]');
      await activate(page.locator('#local-history-confirm-accept'));
      await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.settings().retentionCount === 3);
      assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)), 3,
        'confirmed global retention reduction was not exact');

      const deniedContext = await browser.newContext({ viewport: { width: 1024, height: 800 } });
      await deniedContext.addInitScript(() => {
        const original = indexedDB.open.bind(indexedDB);
        indexedDB.open = (...args) => {
          if (args[0] === 'intent-mcu-local-history-v1') throw new DOMException('synthetic denial', 'SecurityError');
          return original(...args);
        };
      });
      const deniedPage = await deniedContext.newPage();
      await ready(deniedPage);
      await openHistoryDetails(deniedPage);
      await activate(deniedPage.locator('#local-history-enable'));
      await deniedPage.waitForFunction(() => /SecurityError/u.test(document.querySelector('#local-history-status').textContent));
      assert.equal(await deniedPage.evaluate(() => window.__LOCAL_VERSION_HISTORY__.databaseOpen()), false);
      await deniedContext.close();
    }

    if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1,
      'local history caused horizontal overflow');
    assert.equal(await page.evaluate(() => window.__x63PointerEvents), 0, 'acceptance used pointer input');
    assert.deepEqual(observations.errors, [], `browser errors: ${JSON.stringify(observations.errors)}`);
    await assertNoNetworkOrRuntime(page, observations, workersBefore);
    process.stdout.write(`${JSON.stringify({ status: 'pass', browser: browserName, mode: full ? 'full' : 'smoke',
      profiles: selectedProfiles.length, persistent: true, serverWrites: 0, producerCalls: 0 })}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
