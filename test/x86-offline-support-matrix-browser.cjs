// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X86_URL || 'http://127.0.0.1:18865';
const output = process.env.X86_OUTPUT || '/tmp/x86-private-browser.json';
const screenshot = process.env.X86_SCREENSHOT || null;
const profiles = [
  { id: 'board.atmega328p-16mhz-v1', label: 'ATmega328P', name: '#project-name', source: '#source',
    save: '#project-save', open: '#project-open-input', message: '#project-message', run: '#run', global: null,
    sourceEdit: (value) => `${value}\n// X86 visible offline draft` },
  { id: 'board.rp2040-pico-v1', label: 'RP2040 Pico', name: '#pico-project-name', source: '#pico-source',
    save: '#pico-save', open: '#pico-open-input', message: '#pico-message', run: '#pico-run', global: '__RP2040_PUBLIC_WORKBENCH__',
    sourceEdit: (value) => value.replace('PICO PUBLIC', 'PICO OFFLINE') },
  { id: 'board.esp32-c3-devmodule-v1', label: 'ESP32-C3', name: '#c3-project-name', source: '#c3-source',
    save: '#c3-save', open: '#c3-open-input', message: '#c3-message', run: '#c3-run', global: '__ESP32C3_PUBLIC_WORKBENCH__',
    sourceEdit: (value) => value.replace('C3_PUBLIC', 'C3_OFFLINE') },
  { id: 'board.stm32f429zi-nucleo144-v1', label: 'STM32F429ZI', name: '#stm32-project-name', source: '#stm32-source',
    save: '#stm32-save', open: '#stm32-open-input', message: '#stm32-message', run: '#stm32-run', global: '__STM32_PUBLIC_WORKBENCH__',
    sourceEdit: (value) => value.replace('STM32 PUBLIC', 'STM32 OFFLINE') },
];

async function authority(page, profile) {
  return page.evaluate(({ global, run }) => {
    const state = global ? window[global].state() : window.__M6_STATE__;
    return {
      artifact: global ? state.artifact : state.artifactIdentity,
      runtime: state.runtime,
      runnable: global ? state.runnable : state.buildState === 'succeeded',
      runDisabled: document.querySelector(run).disabled,
      workerCreations: window.__M6_STATE__.runtimeWorkerCreations,
    };
  }, { global: profile.global, run: profile.run });
}

async function openProjectFiles(page) {
  const dialog = page.locator('#workbench-project-dialog');
  if (!await dialog.evaluate((node) => node.open)) {
    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
  }
  assert.equal(await dialog.evaluate((node) => node.open), true);
}

async function closeProjectFiles(page) {
  const dialog = page.locator('#workbench-project-dialog');
  if (await dialog.evaluate((node) => node.open)) {
    await page.click('#workbench-project-dialog .workbench-popup-close');
    await page.waitForFunction(() => !document.querySelector('#workbench-project-dialog').open);
  }
}

async function openFirmware(page) {
  const dialog = page.locator('#workbench-firmware-dialog');
  if (!await dialog.evaluate((node) => node.open)) {
    await page.click('#firmware-open');
    await page.waitForSelector('#workbench-firmware-dialog[open]');
  }
  assert.equal(await dialog.evaluate((node) => node.open), true);
}

async function closeFirmware(page) {
  const dialog = page.locator('#workbench-firmware-dialog');
  if (await dialog.evaluate((node) => node.open)) {
    await page.click('#workbench-firmware-dialog .workbench-popup-close');
    await page.waitForFunction(() => !document.querySelector('#workbench-firmware-dialog').open);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = { base, observedProducerRequests: [], observedRequestsDuringLocalWorkflow: [] };
  try {
    const noJsContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, javaScriptEnabled: false });
    const noJsSupport = await noJsContext.newPage();
    assert.equal((await noJsSupport.goto(`${base}/support.html#offline-support`, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    assert.equal(await noJsSupport.locator('.offline-support-table tbody tr').count(), 4);
    assert.equal(await noJsSupport.locator('.offline-support-table thead th').count(), 8);
    assert.equal(await noJsSupport.locator('[data-offline-field="offlineNavigationReload"]').count(), 4);
    assert.match(await noJsSupport.locator('#offline-support').textContent(), /Browser-worker runtime ownership does not imply an offline compiler/iu);
    if (screenshot) await noJsSupport.locator('#offline-support').screenshot({ path: screenshot });
    await noJsContext.close();

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
      serviceWorkers: 'allow' });
    const workbench = await context.newPage();
    assert.equal((await workbench.goto(base, { waitUntil: 'networkidle' }))?.status(), 200);
    await workbench.waitForFunction(() => window.__M11_READY__ === true);
    const support = await context.newPage();
    assert.equal((await support.goto(`${base}/support.html#offline-support`, { waitUntil: 'networkidle' }))?.status(), 200);
    const staticJson = await support.evaluate(async () => (await fetch('/offline-support-matrix.json', {
      cache: 'no-store', credentials: 'omit',
    })).json());
    assert.equal(await support.locator('.offline-support-table tbody tr').count(), 4);
    assert.equal(await support.locator('.offline-support-table thead th').count(), 8);
    assert.equal(await support.locator('[data-offline-state="available-in-loaded-document"]').count(), 4);
    const projected = await support.locator('[data-offline-profile]').evaluateAll((rows) => rows.map((row) => ({
      id: row.dataset.offlineProfile,
      fields: Object.fromEntries([...row.querySelectorAll('[data-offline-field]')]
        .map((cell) => [cell.dataset.offlineField, cell.dataset.offlineState])),
    })));
    assert.deepEqual(projected, staticJson.profiles.map((profile) => ({ id: profile.id, fields: {
      freshOfflineNavigation: profile.freshOfflineNavigation,
      loadedDocument: profile.loadedDocument,
      offlineNavigationReload: profile.offlineNavigationReload,
      localDownloadOpen: profile.localDownloadOpen,
      compiler: profile.compiler,
      runtime: profile.runtime,
      offlineRun: profile.offlineRun,
    } })));

    workbench.on('request', (request) => {
      const record = { method: request.method(), url: request.url().replace(base, '') };
      report.observedRequestsDuringLocalWorkflow.push(record);
      if (/\/api\//u.test(new URL(request.url()).pathname)
          && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) report.observedProducerRequests.push(record);
    });
    await context.setOffline(true);
    assert.equal(context.serviceWorkers().length, 0);
    report.profiles = [];
    for (const profile of profiles) {
      await workbench.selectOption('#board-select', profile.id);
      await workbench.waitForFunction((id) => document.querySelector('#board-select').value === id, profile.id);
      if (profile.global) await workbench.waitForFunction((name) => window[name].state().active === true, profile.global);
      await openProjectFiles(workbench);
      await workbench.locator(profile.save).waitFor({ state: 'visible' });
      await workbench.locator(profile.name).waitFor({ state: 'visible' });
      const original = { name: await workbench.inputValue(profile.name), source: await workbench.inputValue(profile.source) };
      const downloadPromise = workbench.waitForEvent('download');
      await workbench.click(profile.save);
      const download = await downloadPromise;
      const filePath = await download.path();
      const downloadBytes = fs.statSync(filePath).size;
      const downloadedText = fs.readFileSync(filePath, 'utf8');
      assert(downloadBytes > 0);

      await openProjectFiles(workbench);
      const changedName = `${original.name} · offline draft`;
      const changedSource = profile.sourceEdit(original.source);
      assert.notEqual(changedSource, original.source, `${profile.label}: source fixture did not change`);
      await workbench.fill(profile.name, changedName);
      await workbench.locator(profile.name).press('Tab');
      assert.equal(await workbench.inputValue(profile.name), changedName);
      await closeProjectFiles(workbench);
      await openFirmware(workbench);
      await workbench.locator(profile.source).waitFor({ state: 'visible' });
      await workbench.fill(profile.source, changedSource);
      assert.equal(await workbench.inputValue(profile.source), changedSource);
      await closeFirmware(workbench);
      assert.notEqual(await workbench.evaluate((id) => window.__COMMON_PROJECT_FILES__.current(id), profile.id),
        downloadedText, `${profile.label}: visible edits did not change canonical project data`);

      await openProjectFiles(workbench);
      await workbench.setInputFiles(profile.open, filePath);
      await workbench.waitForTimeout(250);
      if (await workbench.locator('#unsaved-change-dialog').isVisible()) await workbench.click('#unsaved-discard');
      await workbench.waitForFunction(({ name, source, originalName, originalSource }) =>
        document.querySelector(name).value === originalName
          && document.querySelector(source).value === originalSource,
      { name: profile.name, source: profile.source, originalName: original.name, originalSource: original.source });
      await workbench.waitForFunction((selector) => /opened/iu.test(document.querySelector(selector).textContent), profile.message);
      await openProjectFiles(workbench);
      await workbench.locator(profile.name).waitFor({ state: 'visible' });
      assert.equal(await workbench.inputValue(profile.name), original.name);
      await closeProjectFiles(workbench);
      await openFirmware(workbench);
      await workbench.locator(profile.source).waitFor({ state: 'visible' });
      assert.equal(await workbench.inputValue(profile.source), original.source);
      const after = await authority(workbench, profile);
      assert.equal(after.artifact, null, `${profile.label}: executable authority restored`);
      assert.equal(after.runtime, null, `${profile.label}: runtime authority restored`);
      assert.equal(after.runnable, false, `${profile.label}: project became runnable`);
      assert.equal(after.runDisabled, true, `${profile.label}: Run enabled after offline Open`);
      assert.equal(after.workerCreations, 0, `${profile.label}: worker created`);
      report.profiles.push({ id: profile.id, downloadBytes, changedNameVisible: true,
        changedSourceVisible: true, restoredName: await workbench.inputValue(profile.name),
        restoredSource: await workbench.inputValue(profile.source), authority: after });
      await closeFirmware(workbench);
    }
    assert.equal(report.observedProducerRequests.length, 0);
    assert.equal(report.observedRequestsDuringLocalWorkflow.length, 0);
    report.serviceWorkers = context.serviceWorkers().length;
    report.matrixProfiles = staticJson.profiles.map(({ id }) => id);
    report.assertions = { canonicalProjection: true, accessibleNoJsTable: true,
      allFourChangedThenRestored: true, executableAuthorityAbsent: true,
      runDisabledAllProfiles: true, observedZeroProducerMutations: true,
      observedZeroNetworkRequestsAroundLocalWorkflow: true, firmwareActionsInvoked: 0 };
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    await context.close();
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
