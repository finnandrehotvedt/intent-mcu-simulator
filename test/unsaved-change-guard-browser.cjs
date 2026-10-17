// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, firefox, webkit } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.UNSAVED_GUARD_URL || 'http://127.0.0.1:18766';
const screenshotPath = process.env.UNSAVED_GUARD_SCREENSHOT || null;
const browserName = process.env.UNSAVED_GUARD_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);
const AVR = 'board.atmega328p-16mhz-v1';
const profiles = [
  { id: 'avr', option: AVR, name: '#project-name', source: '#source', open: '#project-open-input', openButton: '#project-open',
    sourceEdit: (value) => `${value}\n// guarded authored source` },
  { id: 'pico', option: 'board.rp2040-pico-v1', name: '#pico-project-name', source: '#pico-source', open: '#pico-open-input', openButton: '#pico-open', global: '__RP2040_PUBLIC_WORKBENCH__',
    sourceEdit: (value) => value.replace('intent_gpio0_output(1u)', 'intent_gpio0_output(0u)') },
  { id: 'c3', option: 'board.esp32-c3-devmodule-v1', name: '#c3-project-name', source: '#c3-source', open: '#c3-open-input', openButton: '#c3-open', global: '__ESP32C3_PUBLIC_WORKBENCH__',
    sourceEdit: (value) => value.replace('digitalWrite(2, HIGH)', 'digitalWrite(2, LOW)') },
  { id: 'stm32', option: 'board.stm32f429zi-nucleo144-v1', name: '#stm32-project-name', source: '#stm32-source', open: '#stm32-open-input', openButton: '#stm32-open', global: '__STM32_PUBLIC_WORKBENCH__',
    sourceEdit: (value) => value.replace('intent_pb0_output(1u)', 'intent_pb0_output(0u)') },
];

async function choose(page, profile) {
  await page.selectOption('#board-select', profile.option);
  await page.waitForFunction((option) => document.querySelector('#board-select').value === option, profile.option);
}

async function canonical(page, profile) {
  return page.evaluate((option) => window.__COMMON_PROJECT_FILES__.current(option), profile.option);
}

async function exactState(page, profile) {
  return page.evaluate(({ option, global }) => ({
    profile: document.querySelector('#board-select').value,
    canonical: window.__COMMON_PROJECT_FILES__.current(option),
    state: structuredClone(global ? window[global].state() : window.__M6_STATE__),
  }), { option: profile.option, global: profile.global });
}

async function makeDirty(page, profile) {
  await page.fill(profile.name, `${profile.id.toUpperCase()} guarded draft`);
  await page.locator(profile.name).press('Tab');
  const source = await page.inputValue(profile.source);
  await page.fill(profile.source, profile.sourceEdit(source));
  await page.locator(profile.source).press('Tab');
  if (profile.global) {
    await page.evaluate((global) => {
      const api = window[global];
      for (const result of [
        api.setComponentProperty('resistor-1', 'ohms', 109),
        api.moveCircuitComponent('resistor-1', 0.58, 0.33),
        api.rotateCircuitComponent('resistor-1'),
      ]) if (!result?.ok) throw new Error(result?.code || 'narrow edit failed');
    }, profile.global);
  } else {
    await page.click('#project-demo');
    await page.locator('#component-layer [data-component-id="resistor-1"]').click({ force: true });
    await page.click('#rotate-component');
    const net = await page.locator('#selected-net option').nth(1).getAttribute('value');
    if (net) {
      await page.selectOption('#selected-net', net);
      await page.selectOption('#wire-color', '#5f8cff');
    }
  }
  assert.equal(await page.evaluate((option) => window.__UNSAVED_CHANGE_GUARD__.isDirty(option), profile.option), true,
    `${profile.id}: authored edits were not dirty`);
}

async function inputFile(page, profile, text, name = `${profile.id}.intent-mcu.json`) {
  await page.setInputFiles(profile.open, { name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(() => { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true && window.__UNSAVED_CHANGE_GUARD__);

  const baselines = {};
  for (const profile of profiles) {
    await choose(page, profile);
    baselines[profile.id] = await canonical(page, profile);
    await makeDirty(page, profile);
    const dirty = await canonical(page, profile);

    await inputFile(page, profile, '{"schema":');
    await page.waitForTimeout(40);
    assert.equal(await page.locator('#unsaved-change-dialog').evaluate((node) => node.open), false,
      `${profile.id}: malformed input opened the guard`);
    assert.equal(await canonical(page, profile), dirty, `${profile.id}: malformed input changed draft`);

    const beforeEscape = await exactState(page, profile);
    const initiatorId = await page.locator(profile.openButton).evaluate((node) => {
      node.focus(); return document.activeElement.id;
    });
    await inputFile(page, profile, baselines[profile.id]);
    await page.waitForSelector('#unsaved-change-dialog[open]');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'unsaved-keep', `${profile.id}: safe initial focus`);
    assert.equal(await canonical(page, profile), dirty, `${profile.id}: validated file replaced before consent`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#unsaved-change-dialog', { state: 'hidden' });
    assert.equal(await canonical(page, profile), dirty, `${profile.id}: Escape changed draft`);
    assert.deepEqual(await exactState(page, profile), beforeEscape, `${profile.id}: Escape changed history, profile or runtime`);
    assert.equal(await page.evaluate(() => window.__UNSAVED_CHANGE_GUARD__.pending()), null, `${profile.id}: Escape retained action`);
    assert.equal(await page.evaluate(() => document.activeElement.id), initiatorId, `${profile.id}: Escape did not restore focus`);

    await inputFile(page, profile, baselines[profile.id]);
    await page.waitForSelector('#unsaved-change-dialog[open]');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#unsaved-download')]);
    assert(download.suggestedFilename().endsWith('.intent-mcu.json'), `${profile.id}: guard download filename`);
    assert.equal(await page.locator('#unsaved-change-dialog').evaluate((node) => node.open), true,
      `${profile.id}: download dismissed guard`);
    assert.match(await page.textContent('#unsaved-change-status'), /browser or operating system decides/i,
      `${profile.id}: download overclaimed durable storage`);
    assert.equal(await canonical(page, profile), dirty, `${profile.id}: download changed draft`);
    assert.equal(await page.evaluate((option) => window.__UNSAVED_CHANGE_GUARD__.isDirty(option), profile.option), true,
      `${profile.id}: download cleared dirty state`);

    await page.click('#unsaved-discard');
    await page.waitForSelector('#unsaved-change-dialog', { state: 'hidden' });
    assert.equal(await canonical(page, profile), baselines[profile.id], `${profile.id}: discard did not open exact file`);
    assert.equal(await page.evaluate((option) => window.__UNSAVED_CHANGE_GUARD__.isDirty(option), profile.option), false,
      `${profile.id}: successful Open did not establish clean baseline`);
  }

  await choose(page, profiles[0]);
  await makeDirty(page, profiles[0]);
  await inputFile(page, profiles[0], baselines.avr, 'first-queued-avr.intent-mcu.json');
  await page.waitForSelector('#unsaved-change-dialog[open]');
  const firstPending = await page.evaluate(() => window.__UNSAVED_CHANGE_GUARD__.pending());
  await inputFile(page, profiles[0], baselines.avr, 'second-queued-avr.intent-mcu.json');
  assert.deepEqual(await page.evaluate(() => window.__UNSAVED_CHANGE_GUARD__.pending()), firstPending,
    'repeated Open replaced the first pending intent');
  assert.match(await page.textContent('#unsaved-change-status'), /No additional action was queued/i,
    'repeated Open did not explain serialization');
  await page.locator('#source').evaluate((node) => {
    node.value += '\n// newer draft while decision open';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const newerDraft = await canonical(page, profiles[0]);
  await page.click('#unsaved-discard');
  await page.waitForSelector('#unsaved-change-dialog', { state: 'hidden' });
  assert.equal(await canonical(page, profiles[0]), newerDraft, 'stale pending Open discarded the newer draft');
  assert.match(await page.textContent('#project-message'), /older action was cancelled/i, 'stale intent cancellation was not explained');

  await makeDirty(page, profiles[0]);
  const beforeNew = await canonical(page, profiles[0]);
  await page.click('#project-new');
  await page.waitForSelector('#unsaved-change-dialog[open]');
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.click('#unsaved-keep');
  assert.equal(await canonical(page, profiles[0]), beforeNew, 'AVR Keep editing changed project');
  await page.click('#project-new');
  await page.click('#unsaved-discard');
  assert.equal(await page.evaluate(() => window.__M6_PROJECT__().circuit.components.length), 0, 'AVR confirmed New was not empty');
  assert.equal(await page.evaluate(() => window.__UNSAVED_CHANGE_GUARD__.isDirty()), false, 'AVR confirmed New was not baseline');

  await page.click('#project-demo');
  await page.click('#build');
  await page.waitForFunction(() => window.__M6_STATE__.buildState === 'succeeded', null, { timeout: 45_000 });
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.kind === 'ready', null, { timeout: 10_000 });
  await page.click('#run');
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.cycle > 20_000, null, { timeout: 10_000 });
  await page.click('#pause');
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.kind === 'paused', null, { timeout: 10_000 });
  const pausedRuntime = await exactState(page, profiles[0]);
  await inputFile(page, profiles[0], baselines.avr, 'replace-running-avr.intent-mcu.json');
  await page.waitForSelector('#unsaved-change-dialog[open]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#unsaved-change-dialog', { state: 'hidden' });
  assert.deepEqual(await exactState(page, profiles[0]), pausedRuntime, 'Escape changed paused runtime authority or exact AVR state');

  await choose(page, profiles[1]);
  await makeDirty(page, profiles[1]);
  const parkedPico = await canonical(page, profiles[1]);
  await inputFile(page, profiles[1], baselines.c3, 'cross-family-c3.intent-mcu.json');
  await page.waitForFunction((option) => document.querySelector('#board-select').value === option, profiles[2].option);
  assert.equal(await page.locator('#unsaved-change-dialog').evaluate((node) => node.open), false, 'cross-family Open prompted');
  await choose(page, profiles[1]);
  assert.equal(await canonical(page, profiles[1]), parkedPico, 'cross-family Open changed parked draft');

  await page.setViewportSize({ width: 390, height: 844 });
  await inputFile(page, profiles[1], baselines.pico, 'mobile-pico.intent-mcu.json');
  await page.waitForSelector('#unsaved-change-dialog[open]');
  const mobile = await page.evaluate(() => {
    const dialog = document.querySelector('#unsaved-change-dialog').getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      left: dialog.left, right: dialog.right, width: innerWidth };
  });
  assert(mobile.overflow <= 1 && mobile.left >= 0 && mobile.right <= mobile.width,
    `mobile guard overflow ${JSON.stringify(mobile)}`);
  await page.keyboard.press('Escape');

  assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
  assert.equal((await context.cookies()).length, 0, 'guard introduced cookies');
  await context.close();
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', browser: browserName, profiles: profiles.map((profile) => profile.id),
    dirtyFields: ['name', 'source', 'properties', 'layout', 'rotation', 'wire-style'],
    keep: true, escape: true, focusRestored: true, pausedRuntimePreserved: true,
    serializedIntent: true, staleIntentCancelled: true, downloadWithoutDiscard: true, discardOnce: true,
    invalidAtomic: true, crossFamilyParking: true, desktopMobile: true })}\n`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
