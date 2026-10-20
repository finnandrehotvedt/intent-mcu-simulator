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
  { id: 'board.atmega328p-16mhz-v1', family: 'architecture.avr-v1', name: '#project-name', source: '#source', input: '#project-open-input', download: '#project-save', native: '#project-native-open', run: '#run' },
  { id: 'board.rp2040-pico-v1', family: 'architecture.rp2040-v1', name: '#pico-project-name', source: '#pico-source', input: '#pico-open-input', download: '#pico-save', native: '#pico-native-open', run: '#pico-run' },
  { id: 'board.esp32-c3-devmodule-v1', family: 'architecture.esp32-v1', name: '#c3-project-name', source: '#c3-source', input: '#c3-open-input', download: '#c3-save', native: '#c3-native-open', run: '#c3-run' },
  { id: 'board.stm32f429zi-nucleo144-v1', family: 'architecture.stm32-v1', name: '#stm32-project-name', source: '#stm32-source', input: '#stm32-open-input', download: '#stm32-save', native: '#stm32-native-open', run: '#stm32-run' },
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

async function openOrdinaryPath(page, profile, filePath, expected) {
  await page.setInputFiles(profile.input, filePath);
  await page.waitForFunction(({ id, value }) => window.__COMMON_PROJECT_FILES__.current(id) === value,
    { id: profile.id, value: expected });
}

async function downloadCurrentProject(page, profile) {
  const [download] = await Promise.all([
    page.waitForEvent('download'), activate(page.locator(profile.download)),
  ]);
  const filePath = await download.path();
  return { filePath, bytes: fs.readFileSync(filePath, 'utf8') };
}

async function editVisibleSource(page, profile, marker) {
  const before = await page.inputValue(profile.source);
  const phase = marker.includes('DIRTY') ? 'DIRTY' : marker.includes('RETAINED') ? 'RETAINED' : 'B';
  let after = `${before}\n// ${marker}`;
  if (profile.id === 'board.rp2040-pico-v1') {
    after = before.includes('PICO PUBLIC')
      ? before.replace('intent_gpio0_output(1u)', 'intent_gpio0_output(0u)').replace('PICO PUBLIC', 'X63 PICO B')
      : before.replace(/X63 PICO (?:B|DIRTY)/u, `X63 PICO ${phase}`);
  } else if (profile.id === 'board.esp32-c3-devmodule-v1') {
    after = before.includes('C3_PUBLIC')
      ? before.replace('digitalWrite(2, HIGH)', 'digitalWrite(2, LOW)').replace('C3_PUBLIC', 'X63_C3_B')
      : before.replace(/X63_C3_(?:B|DIRTY)/u, `X63_C3_${phase}`);
  } else if (profile.id === 'board.stm32f429zi-nucleo144-v1') {
    after = before.includes('STM32 PUBLIC')
      ? before.replace('intent_pb0_output(1u)', 'intent_pb0_output(0u)').replace('STM32 PUBLIC', 'X63 STM32 B')
      : before.replace(/X63 STM32 (?:B|DIRTY)/u, `X63 STM32 ${phase}`);
  }
  assert.notEqual(after, before, `${profile.id}: no accepted visible source transformation was available`);
  await page.locator(profile.source).focus();
  await page.locator(profile.source).fill(after);
  await page.keyboard.press('Tab');
  assert.notEqual(await page.inputValue(profile.source), before, `${profile.id}: visible source did not change`);
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
    status: document.querySelector('#local-history-status').textContent,
  }));
  const expectedId = historyId(snapshot.profile, snapshot.canonical);
  await activate(page.locator('#local-history-save'));
  await page.waitForFunction(async ({ id, priorStatus }) => {
    const text = document.querySelector('#local-history-status').textContent;
    const saved = (await window.__LOCAL_VERSION_HISTORY__.list()).some((record) => record?.id === id);
    return (text !== priorStatus && (saved || /LOCAL_HISTORY_|Saved local version|already saved/u.test(text)))
      || document.querySelector('#local-history-confirm').open;
  }, { id: expectedId, priorStatus: snapshot.status });
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
      const downloadedA = await downloadCurrentProject(page, profile);
      await openOrdinaryPath(page, profile, downloadedA.filePath, downloadedA.bytes);
      await page.locator('#local-history-label').fill(`${profile.id} A`);
      await saveVersion(page);
      const a = await canonical(page, profile);
      assert.equal(a, downloadedA.bytes, `${profile.id}: ordinary Open changed downloaded A bytes`);
      await editVisibleSource(page, profile, `X63_SOURCE_B_${profile.id}`);
      await page.locator('#local-history-label').fill(`${profile.id} B`);
      await saveVersion(page);
      const b = await canonical(page, profile);
      assert.notEqual(a, b, `${profile.id}: A/B bytes did not differ`);
      accepted.push({ profile, a, b, aId: historyId(profile.id, a), bId: historyId(profile.id, b),
        aLock: JSON.parse(a).modelLibrary, bLock: JSON.parse(b).modelLibrary });
    }
    assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)),
      selectedProfiles.length * 2);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__?.enabled());
    await openHistoryDetails(page);
    assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.settings().retentionCount), 10);
    assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)),
      selectedProfiles.length * 2, 'records did not persist across reload');

    const storedAfterReload = await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list());
    for (const item of accepted) {
      const storedA = storedAfterReload.find((record) => record.id === item.aId);
      const storedB = storedAfterReload.find((record) => record.id === item.bId);
      assert(storedA && storedB, `${item.profile.id}: exact A/B hashes missing after reload`);
      assert.deepEqual(storedA.modelLibrary, item.aLock, `${item.profile.id}: A model lock changed`);
      assert.deepEqual(storedB.modelLibrary, item.bLock, `${item.profile.id}: B model lock changed`);

      await choose(page, item.profile);
      await openHistoryDetails(page);
      await openOrdinary(page, item.profile, item.b, `${item.profile.id}-B.intent-mcu.json`);
      if (item.profile === accepted[0].profile) {
        await page.evaluate((text) => { window.__X63_NATIVE__.text = text; }, item.b);
        await activate(page.locator(item.profile.native));
        await page.waitForFunction((id) => window.__NATIVE_PROJECT_FILES__.status(id).connected, item.profile.id);
      }
      await editVisibleSource(page, item.profile, `X63_DIRTY_GUARD_${item.profile.id}`);
      const dirty = await canonical(page, item.profile);
      const row = page.locator(`.local-history-row[data-history-id="${item.aId}"]`);
      await activate(row.getByRole('button', { name: 'Open this version' }));
      await page.waitForSelector('#unsaved-change-dialog[open]');
      await activate(page.locator('#unsaved-keep'));
      assert.equal(await canonical(page, item.profile), dirty, `${item.profile.id}: guard cancel replaced dirty source`);
      await activate(row.getByRole('button', { name: 'Open this version' }));
      await page.waitForSelector('#unsaved-change-dialog[open]');
      await activate(page.locator('#unsaved-discard'));
      await page.waitForFunction(({ id, expected }) => window.__COMMON_PROJECT_FILES__.current(id) === expected,
        { id: item.profile.id, expected: item.a });
      assert.equal(await page.inputValue('#board-select'), item.profile.id, `${item.profile.id}: History Open routed to wrong profile`);
      assert.deepEqual(JSON.parse(await canonical(page, item.profile)).modelLibrary, item.aLock,
        `${item.profile.id}: History Open changed A model lock`);
      assert.equal(await page.evaluate((id) => window.__NATIVE_PROJECT_FILES__.status(id).connected, item.profile.id), false,
        `${item.profile.id}: History Open retained native file authority`);
      assert.equal(await page.locator(item.profile.run).isDisabled(), true, `${item.profile.id}: History Open retained runtime authority`);

      const [download] = await Promise.all([
        page.waitForEvent('download'), activate(row.getByRole('button', { name: 'Download copy' })),
      ]);
      const downloadPath = await download.path();
      assert.equal(fs.readFileSync(downloadPath, 'utf8'), item.a, `${item.profile.id}: downloaded A bytes changed`);
      const recoveryContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const recoveryPage = await recoveryContext.newPage();
      await ready(recoveryPage);
      await choose(recoveryPage, item.profile);
      await openOrdinaryPath(recoveryPage, item.profile, downloadPath, item.a);
      assert.equal(await canonical(recoveryPage, item.profile), item.a, `${item.profile.id}: fresh-context ordinary Open changed A`);
      assert.deepEqual(JSON.parse(await canonical(recoveryPage, item.profile)).modelLibrary, item.aLock,
        `${item.profile.id}: fresh-context ordinary Open changed lock`);
      assert.equal(await recoveryPage.locator(item.profile.run).isDisabled(), true,
        `${item.profile.id}: fresh-context recovery restored runtime authority`);
      await recoveryContext.close();
    }

    if (full) {
      const avr = profiles[0];
      await choose(page, avr);
      await openHistoryDetails(page);
      const legacy = JSON.parse(accepted[0].a);
      legacy.schema = 'intent-mcu-project-envelope@6';
      delete legacy.modelLibrary;
      await page.setInputFiles(avr.input, {
        name: 'known-pre-x56.intent-mcu.json', mimeType: 'application/json',
        buffer: Buffer.from(`${JSON.stringify(legacy)}\n`),
      });
      await page.waitForFunction(() => window.__COMMON_PROJECT_FILES__.modelLibraryLock().version.includes('retained'));
      const retained = await canonical(page, avr);
      const retainedLock = JSON.parse(retained).modelLibrary;
      assert.equal(retainedLock.version, '2.0.0-rc.72-retained');
      await page.locator('#local-history-label').fill('Known retained X56 project');
      await saveVersion(page);
      const retainedId = historyId(avr.id, retained);
      await openOrdinary(page, avr, accepted[0].a, 'current-avr.intent-mcu.json');
      await editVisibleSource(page, avr, 'X63_RETAINED_OPEN_GUARD');
      const retainedRow = page.locator(`.local-history-row[data-history-id="${retainedId}"]`);
      await activate(retainedRow.getByRole('button', { name: 'Open this version' }));
      await page.waitForSelector('#unsaved-change-dialog[open]');
      await activate(page.locator('#unsaved-discard'));
      await page.waitForFunction((expected) => window.__COMMON_PROJECT_FILES__.current() === expected, retained);
      assert.deepEqual(JSON.parse(await canonical(page, avr)).modelLibrary, retainedLock,
        'retained History Open did not preserve the known X56 model lock');
      assert.equal(await page.locator(avr.run).isDisabled(), true, 'retained History Open restored runtime authority');

      let fillIndex = 0;
      while (await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)) < 10) {
        fillIndex += 1;
        await rename(page, avr, `Retention fill ${fillIndex}`);
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
      await activate(page.locator('#local-history-save'));
      await page.waitForFunction(() => /LOCAL_HISTORY_CORRUPT_STORE/u.test(
        document.querySelector('#local-history-status').textContent));
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

      const forgedBase = await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then(
        (rows) => rows.find((record) => record?.schema === 'intent-mcu-local-history-record@1')),
      );
      assert(forgedBase, 'no valid record available for forged-model inert-row check');
      const forgedProject = JSON.parse(forgedBase.envelope);
      forgedProject.modelLibrary = {
        ...forgedProject.modelLibrary, version: 'forged-x63', manifestSha256: 'b'.repeat(64),
      };
      const forgedEnvelope = `${JSON.stringify(forgedProject)}\n`;
      const forgedHash = sha(forgedEnvelope);
      const forgedRecord = {
        ...forgedBase,
        id: `${forgedBase.profile}:${forgedHash}`,
        createdAt: '2026-10-20T02:30:00.000Z',
        label: 'Forged model lock must remain inert',
        projectSha256: forgedHash,
        byteLength: Buffer.byteLength(forgedEnvelope),
        modelLibrary: forgedProject.modelLibrary,
        envelope: forgedEnvelope,
      };
      await page.evaluate(async (record) => {
        const request = indexedDB.open('intent-mcu-local-history-v1', 1);
        const database = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction('versions', 'readwrite');
        transaction.objectStore('versions').put(record);
        await new Promise((resolve, reject) => {
          transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error);
        });
        database.close();
      }, forgedRecord);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__?.enabled());
      await openHistoryDetails(page);
      const forgedRow = page.locator(`.local-history-row[data-history-id="string:${forgedRecord.id}"]`);
      assert.equal(await forgedRow.getByRole('button', { name: 'Open this version' }).isDisabled(), true,
        'forged model-lock history row became openable');
      assert.match(await forgedRow.textContent(), /Invalid local history record/u);

      const staleEntry = await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.entries().then(
        (entries) => entries.find((entry) => entry.valid && entry.record.id !== 'synthetic-corrupt-row')),
      );
      assert(staleEntry, 'no valid row available for stale-row check');
      const staleRow = page.locator(`.local-history-row[data-history-id="${staleEntry.record.id}"]`);
      const activeProfileId = await page.inputValue('#board-select');
      const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? avr;
      const beforeStaleOpen = await canonical(page, activeProfile);
      const stalePage = await context.newPage();
      await ready(stalePage);
      await stalePage.evaluate(async (storageKey) => {
        const request = indexedDB.open('intent-mcu-local-history-v1', 1);
        const database = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction('versions', 'readwrite');
        transaction.objectStore('versions').delete(storageKey);
        await new Promise((resolve, reject) => {
          transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error);
        });
        database.close();
      }, staleEntry.storageKey);
      await stalePage.close();
      await activate(staleRow.getByRole('button', { name: 'Open this version' }));
      await page.waitForFunction(() => /LOCAL_HISTORY_STALE_SELECTION/u.test(
        document.querySelector('#local-history-status').textContent));
      assert.equal(await canonical(page, activeProfile), beforeStaleOpen, 'stale row changed the current project');

      const beforeClear = await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length));
      await activate(page.locator('#local-history-clear'));
      await page.waitForSelector('#local-history-confirm[open]');
      await activate(page.locator('#local-history-confirm-cancel'));
      assert.equal(await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length)), beforeClear,
        'cancelled Delete all changed local history');
      await activate(page.locator('#local-history-clear'));
      await page.waitForSelector('#local-history-confirm[open]');
      await activate(page.locator('#local-history-confirm-accept'));
      await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length === 0));

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
