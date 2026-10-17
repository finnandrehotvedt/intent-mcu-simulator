// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium, firefox, webkit } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.NATIVE_FILE_URL || 'http://127.0.0.1:18766';
const browserName = process.env.NATIVE_FILE_BROWSER || 'chromium';
const screenshotPath = process.env.NATIVE_FILE_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

const AVR = 'board.atmega328p-16mhz-v1';
const profiles = [
  { id: 'avr', option: AVR, name: '#project-name', download: '#project-save', openInput: '#project-open-input',
    nativeOpen: '#project-native-open', nativeSave: '#project-native-save', nativeCopy: '#project-native-save-copy' },
  { id: 'pico', option: 'board.rp2040-pico-v1', name: '#pico-project-name', download: '#pico-save', openInput: '#pico-open-input',
    nativeOpen: '#pico-native-open', nativeSave: '#pico-native-save', nativeCopy: '#pico-native-save-copy' },
  { id: 'c3', option: 'board.esp32-c3-devmodule-v1', name: '#c3-project-name', download: '#c3-save', openInput: '#c3-open-input',
    nativeOpen: '#c3-native-open', nativeSave: '#c3-native-save', nativeCopy: '#c3-native-save-copy' },
  { id: 'stm32', option: 'board.stm32f429zi-nucleo144-v1', name: '#stm32-project-name', download: '#stm32-save', openInput: '#stm32-open-input',
    nativeOpen: '#stm32-native-open', nativeSave: '#stm32-native-save', nativeCopy: '#stm32-native-save-copy' },
];

async function ready(page) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true && window.__NATIVE_PROJECT_FILES__);
}
async function choose(page, profile) {
  await page.selectOption('#board-select', profile.option);
  await page.waitForFunction((value) => document.querySelector('#board-select').value === value, profile.option);
}
async function rename(page, profile, value) {
  await page.fill(profile.name, value);
  await page.locator(profile.name).press('Tab');
}
async function canonical(page, profile) {
  return page.evaluate((value) => window.__COMMON_PROJECT_FILES__.current(value), profile.option);
}
async function waitIdle(page, profile) {
  await page.waitForFunction((value) => !window.__NATIVE_PROJECT_FILES__.status(value).busy, profile.option);
}
function trackRequests(page) {
  const outside = []; const mutations = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) mutations.push(`${request.method()} ${request.url()}`);
  });
  return { outside, mutations };
}
async function mockState(page) {
  return page.evaluate(() => ({
    writes: [...window.__NATIVE_FILE_MOCK__.writes],
    aborts: window.__NATIVE_FILE_MOCK__.aborts,
    saveCalls: window.__NATIVE_FILE_MOCK__.saveCalls,
    openCalls: window.__NATIVE_FILE_MOCK__.openCalls,
  }));
}

const installNativeMock = () => {
  const state = {
    mode: 'ok', openMode: 'ok', openText: '', writes: [], aborts: 0,
    saveCalls: 0, openCalls: 0, nextName: 'chosen.intent-mcu.json',
    resolveSave: null,
  };
  const abort = () => new DOMException('cancelled', 'AbortError');
  const makeHandle = (name = state.nextName) => ({
    name,
    async getFile() {
      if (state.openMode === 'get-fail') throw new DOMException('read denied', 'NotAllowedError');
      return new File([state.openText], name, { type: 'application/json' });
    },
    async createWritable() {
      if (state.mode === 'create-fail') throw new DOMException('write denied', 'NotAllowedError');
      let text = '';
      return {
        async write(blob) {
          if (state.mode === 'write-fail') throw new DOMException('write failed', 'NotAllowedError');
          text = await blob.text();
        },
        async close() {
          if (state.mode === 'close-fail') throw new DOMException('close failed', 'NotAllowedError');
          state.writes.push({ name, text });
        },
        async abort() { state.aborts += 1; },
      };
    },
  });
  window.__NATIVE_FILE_MOCK__ = state;
  window.showSaveFilePicker = async () => {
    state.saveCalls += 1;
    if (state.mode === 'abort') throw abort();
    if (state.mode === 'hang') return new Promise(() => {});
    if (state.mode === 'deferred') return new Promise((resolve) => { state.resolveSave = () => resolve(makeHandle()); });
    return makeHandle();
  };
  window.showOpenFilePicker = async () => {
    state.openCalls += 1;
    if (state.openMode === 'abort') throw abort();
    if (state.openMode === 'hang') return new Promise(() => {});
    return [makeHandle('opened.intent-mcu.json')];
  };
};

async function verifyFallback(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(() => { window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined; });
  const page = await context.newPage();
  const requests = trackRequests(page);
  await ready(page);
  for (const profile of profiles) {
    await choose(page, profile);
    assert.equal(await page.locator(profile.nativeOpen).isHidden(), true, `${profile.id}: native Open visible without support`);
    assert.equal(await page.locator(profile.nativeCopy).isHidden(), true, `${profile.id}: native Save copy visible without support`);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click(profile.download)]);
    assert(download.suggestedFilename().endsWith('.intent-mcu.json'), `${profile.id}: fallback filename`);
  }
  assert.equal((await context.cookies()).length, 0, 'fallback introduced cookies');
  assert.deepEqual(requests.outside, [], 'fallback made an outside request');
  assert.deepEqual(requests.mutations, [], 'fallback made a server mutation request');
  await context.close();
}

async function verifyNative(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(installNativeMock);
  const page = await context.newPage();
  const requests = trackRequests(page);
  await ready(page);

  for (const profile of profiles) {
    await choose(page, profile);
    assert.equal(await page.locator(profile.nativeCopy).isVisible(), true, `${profile.id}: native Save copy hidden`);
    assert.equal(await page.locator(profile.nativeSave).isDisabled(), true, `${profile.id}: disconnected Save enabled`);
    await rename(page, profile, `${profile.id.toUpperCase()} native parity`);
    assert.equal(await page.evaluate((value) => window.__UNSAVED_CHANGE_GUARD__.isDirty(value), profile.option), true);
    await page.evaluate(() => { window.__NATIVE_FILE_MOCK__.mode = 'ok'; window.__NATIVE_FILE_MOCK__.nextName = 'chosen.intent-mcu.json'; });
    await page.click(profile.nativeCopy);
    await waitIdle(page, profile);
    const expected = await canonical(page, profile);
    const state = await mockState(page);
    assert.equal(state.writes.at(-1).text, expected, `${profile.id}: native Save copy bytes differ`);
    assert.equal(await page.evaluate((value) => window.__NATIVE_PROJECT_FILES__.status(value).connected, profile.option), true);
    assert.equal(await page.evaluate(() => Object.values(localStorage).some((value) => value.includes('chosen.intent-mcu.json'))), false,
      `${profile.id}: native handle name leaked into localStorage`);
    assert.equal(await page.evaluate((value) => window.__UNSAVED_CHANGE_GUARD__.isDirty(value), profile.option), false,
      `${profile.id}: completed native Save copy did not establish baseline`);
    if (profile.id === 'avr' && screenshotPath) await page.screenshot({ path: screenshotPath });
    await rename(page, profile, `${profile.id.toUpperCase()} native parity edited`);
    const beforeSave = (await mockState(page)).writes.length;
    await page.click(profile.nativeSave);
    await waitIdle(page, profile);
    assert.equal((await mockState(page)).writes.length, beforeSave + 1, `${profile.id}: connected Save did not write`);
    assert.equal(await page.evaluate((value) => window.__UNSAVED_CHANGE_GUARD__.isDirty(value), profile.option), false,
      `${profile.id}: connected Save did not update baseline`);
  }

  const avr = profiles[0];
  await choose(page, avr);
  const connectedBeforeCancel = await page.evaluate(() => window.__NATIVE_PROJECT_FILES__.status());
  await rename(page, avr, 'AVR cancellation remains dirty');
  await page.evaluate(() => { window.__NATIVE_FILE_MOCK__.mode = 'abort'; });
  await page.click(avr.nativeCopy); await waitIdle(page, avr);
  assert.deepEqual(await page.evaluate(() => window.__NATIVE_PROJECT_FILES__.status()), connectedBeforeCancel,
    'Save copy cancellation changed current connection');
  assert.equal(await page.evaluate(() => window.__UNSAVED_CHANGE_GUARD__.isDirty()), true, 'Save copy cancellation cleared dirty state');

  for (const mode of ['create-fail', 'write-fail', 'close-fail']) {
    const before = await canonical(page, avr);
    const writes = (await mockState(page)).writes.length;
    await page.evaluate((value) => { window.__NATIVE_FILE_MOCK__.mode = value; }, mode);
    await page.click(avr.nativeCopy); await waitIdle(page, avr);
    assert.equal(await canonical(page, avr), before, `${mode}: project changed`);
    assert.equal((await mockState(page)).writes.length, writes, `${mode}: completed write claimed`);
    assert.equal(await page.evaluate(() => window.__UNSAVED_CHANGE_GUARD__.isDirty()), true, `${mode}: dirty state cleared`);
  }

  await page.evaluate(() => { window.__NATIVE_FILE_MOCK__.mode = 'deferred'; });
  await page.click(avr.nativeCopy);
  await page.waitForFunction(() => window.__NATIVE_PROJECT_FILES__.status().busy);
  const writesBeforeStale = (await mockState(page)).writes.length;
  await rename(page, avr, 'AVR changed while picker pending');
  await page.evaluate(() => window.__NATIVE_FILE_MOCK__.resolveSave());
  await waitIdle(page, avr);
  assert.equal((await mockState(page)).writes.length, writesBeforeStale, 'stale picker overwrote a file');

  await page.evaluate(() => { window.__NATIVE_FILE_MOCK__.mode = 'hang'; });
  await page.click(avr.nativeCopy);
  await page.waitForFunction(() => window.__NATIVE_PROJECT_FILES__.status().busy);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(avr.download)]);
  assert(download.suggestedFilename().endsWith('.intent-mcu.json'), 'hung native picker blocked primary Download copy');
  await page.click('#project-new');
  await page.waitForSelector('#unsaved-change-dialog[open]');
  await page.click('#unsaved-keep');

  await context.close();
  assert.deepEqual(requests.outside, [], 'native flow made an outside request');
  assert.deepEqual(requests.mutations, [], 'native flow made a server mutation request');

  const openContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await openContext.addInitScript(installNativeMock);
  const openPage = await openContext.newPage();
  const openRequests = trackRequests(openPage);
  await ready(openPage);
  const cleanText = await canonical(openPage, avr);
  await rename(openPage, avr, 'AVR dirty before connected Open');
  await openPage.evaluate((text) => { window.__NATIVE_FILE_MOCK__.openText = text; }, cleanText);
  await openPage.click(avr.nativeOpen);
  await openPage.waitForSelector('#unsaved-change-dialog[open]');
  assert.equal(await openPage.evaluate(() => window.__NATIVE_PROJECT_FILES__.status().connected), false,
    'native handle attached before unsaved decision');
  await openPage.click('#unsaved-keep');
  assert.equal(await openPage.inputValue(avr.name), 'AVR dirty before connected Open');
  await openPage.click(avr.nativeOpen);
  await openPage.waitForSelector('#unsaved-change-dialog[open]');
  await openPage.click('#unsaved-discard');
  await openPage.waitForFunction(() => window.__NATIVE_PROJECT_FILES__.status().connected);
  assert.equal(await openPage.evaluate(() => window.__UNSAVED_CHANGE_GUARD__.isDirty()), false,
    'accepted connected Open did not establish baseline');
  const connectedText = await canonical(openPage, avr);
  await openPage.setInputFiles(avr.openInput, {
    name: 'ordinary-open.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(connectedText),
  });
  await openPage.waitForFunction(() => !window.__NATIVE_PROJECT_FILES__.status().connected);

  const legacyText = await openPage.evaluate(() => window.__COMMON_PROJECT_FILES__.legacy());
  await openPage.evaluate((text) => { window.__NATIVE_FILE_MOCK__.openText = text; }, legacyText);
  await openPage.click(avr.nativeOpen); await waitIdle(openPage, avr);
  assert.equal(await openPage.evaluate(() => window.__NATIVE_PROJECT_FILES__.status().connected), false,
    'legacy original became a writable connected file');

  await openPage.evaluate(() => { window.__NATIVE_FILE_MOCK__.mode = 'ok'; });
  await openPage.click(avr.nativeCopy); await waitIdle(openPage, avr);
  assert.equal(await openPage.evaluate(() => window.__NATIVE_PROJECT_FILES__.status().connected), true);
  await openPage.click('#project-new');
  await openPage.waitForFunction(() => !window.__NATIVE_PROJECT_FILES__.status().connected);

  const c3 = profiles[2];
  await choose(openPage, c3);
  const c3Text = await canonical(openPage, c3);
  await choose(openPage, avr);
  await openPage.evaluate((text) => { window.__NATIVE_FILE_MOCK__.openText = text; }, c3Text);
  await openPage.click(avr.nativeOpen);
  await openPage.waitForFunction((value) => document.querySelector('#board-select').value === value, c3.option);
  assert.equal(await openPage.evaluate((value) => window.__NATIVE_PROJECT_FILES__.status(value).connected, c3.option), true,
    'cross-profile native Open did not attach handle to declared target');
  assert.equal(await openPage.evaluate((value) => window.__NATIVE_PROJECT_FILES__.status(value).connected, AVR), false,
    'cross-profile native Open attached handle to source profile');
  assert.equal((await openContext.cookies()).length, 0, 'native flow introduced cookies');
  assert.deepEqual(openRequests.outside, [], 'connected Open made an outside request');
  assert.deepEqual(openRequests.mutations, [], 'connected Open made a server mutation request');
  await openContext.close();
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  await verifyFallback(browser);
  if (browserName === 'chromium') await verifyNative(browser);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', browser: browserName,
    fallbackProfiles: profiles.map((profile) => profile.id), syntheticNativeProfiles: browserName === 'chromium' ? profiles.map((profile) => profile.id) : [],
    actualOsChooserAutomated: false, hungPickerIsolation: browserName === 'chromium', staleIntentRejected: browserName === 'chromium' })}\n`);
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
