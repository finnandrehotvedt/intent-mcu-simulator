// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X59_URL || 'http://host.docker.internal:18890';
const outputDir = process.env.X59_OUTPUT || '/tmp/x59-private-evidence';
const profiles = [
  { id: 'board.atmega328p-16mhz-v1', slug: 'avr', global: null },
  { id: 'board.rp2040-pico-v1', slug: 'pico', global: '__RP2040_PUBLIC_WORKBENCH__' },
  { id: 'board.esp32-c3-devmodule-v1', slug: 'c3', global: '__ESP32C3_PUBLIC_WORKBENCH__' },
  { id: 'board.stm32f429zi-nucleo144-v1', slug: 'stm32', global: '__STM32_PUBLIC_WORKBENCH__' },
];

async function selectProfile(page, profile) {
  await page.selectOption('#board-select', profile.id);
  await page.waitForFunction((id) => document.querySelector('#board-select').value === id, profile.id);
  if (profile.global) await page.waitForFunction((name) => window[name].state().active === true, profile.global);
}

async function canonicalSnapshot(page, profile) {
  return page.evaluate(({ id, global }) => {
    const project = window.__COMMON_PROJECT_FILES__.current(id);
    const state = global ? window[global].state() : window.__M6_STATE__;
    return JSON.stringify({ project, state, recovery: window.__M6_PROJECT__?.() ?? null,
      storage: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])) });
  }, profile);
}

async function setMode(page, mode) {
  await page.click(`#workbench-view-${mode}`);
  await page.waitForFunction((value) => document.body.dataset.workbenchView === value, mode);
  assert.equal(await page.getAttribute(`#workbench-view-${mode}`, 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute(`#workbench-view-${mode === 'simple' ? 'advanced' : 'simple'}`, 'aria-pressed'), 'false');
}

async function assertCoreVisible(page) {
  for (const selector of ['#project-files-open', '#toggle-catalog', '#toggle-inspector', '#firmware-open',
    '#instruments-open', '#help-limits-open', '#quick-build', '#quick-run', '#top-stage-state', '#top-stage-detail']) {
    assert.equal(await page.locator(selector).isVisible(), true, `${selector} hidden in Simple view`);
  }
  for (const selector of ['#brief-tests-open', '#build-list-export', '#accessible-svg-export', '#regression-matrix']) {
    assert.equal(await page.locator(selector).isVisible(), false, `${selector} visible in Simple view`);
  }
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { base, firmwareBuilds: 0, runtimeRuns: 0, scenarios: 0,
    producerRequests: [], mutatingRequests: [], screenshots: [], profiles: [] };
  try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.on('request', (request) => {
        const item = { method: request.method(), url: request.url() };
        if (/\/api\//u.test(new URL(request.url()).pathname)) report.producerRequests.push(item);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) report.mutatingRequests.push(item);
      });
      assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true);
      assert.equal(await page.getAttribute('body', 'data-workbench-view'), 'advanced');
      assert.equal(await page.getAttribute('#workbench-view-advanced', 'aria-pressed'), 'true');

      for (const profile of profiles) {
        await selectProfile(page, profile);
        const before = await canonicalSnapshot(page, profile);
        await setMode(page, 'simple');
        await assertCoreVisible(page);
        const simple = await canonicalSnapshot(page, profile);
        assert.equal(simple, before, `${profile.slug}: Simple changed canonical state`);
        await setMode(page, 'advanced');
        const advanced = await canonicalSnapshot(page, profile);
        assert.equal(advanced, before, `${profile.slug}: Advanced changed canonical state`);
        report.profiles.push({ viewport, profile: profile.id, canonicalInvariant: true });
      }

      const advancedScreenshot = path.join(outputDir, `x59-advanced-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: advancedScreenshot, fullPage: false });
      report.screenshots.push(advancedScreenshot);
      await setMode(page, 'simple');
      for (const profile of profiles) {
        await selectProfile(page, profile);
        assert.equal(await page.getAttribute('body', 'data-workbench-view'), 'simple');
      }
      const screenshot = path.join(outputDir, `x59-simple-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      report.screenshots.push(screenshot);
      assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);

      if (viewport.width === 1440) {
        await setMode(page, 'advanced');
        await page.click('#brief-tests-open');
        await page.waitForSelector('#workbench-brief-dialog[open]');
        assert.equal(await page.locator('#workbench-brief-dialog #project-brief').isVisible(), true);
        await page.evaluate(() => document.querySelector('#workbench-view-simple').click());
        await page.waitForFunction(() => document.body.dataset.workbenchView === 'simple');
        await page.waitForFunction(() => !document.querySelector('#workbench-brief-dialog').open);
        await page.waitForFunction(() => document.activeElement === document.querySelector('#workbench-view-simple'));
        await setMode(page, 'advanced');
        await page.click('#brief-tests-open');
        await page.waitForSelector('#workbench-brief-dialog[open]');
        assert.equal(await page.locator('#workbench-brief-dialog #project-navigation').isVisible(), true);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement === document.querySelector('#brief-tests-open'));
        await setMode(page, 'simple');

        await selectProfile(page, profiles[2]);
        await page.click('#help-limits-open');
        await page.waitForSelector('#workbench-help-dialog[open]');
        const c3Limit = await page.locator('#workbench-help-dialog').textContent();
        assert.match(c3Limit, /QEMU pin state is not observed/iu);
        assert.match(c3Limit, /separately labelled project-owned/iu);
        await page.keyboard.press('Escape');

        await selectProfile(page, profiles[1]);
        await page.click('#project-files-open');
        const originalName = await page.inputValue('#pico-project-name');
        const downloadPromise = page.waitForEvent('download');
        await page.click('#pico-save');
        const download = await downloadPromise;
        const filePath = await download.path();
        assert(fs.statSync(filePath).size > 0);
        await page.fill('#pico-project-name', `${originalName} · X59 view test`);
        await page.locator('#pico-project-name').press('Tab');
        assert.notEqual(await page.inputValue('#pico-project-name'), originalName);
        await page.setInputFiles('#pico-open-input', filePath);
        await page.waitForTimeout(150);
        if (await page.locator('#unsaved-change-dialog').isVisible()) await page.click('#unsaved-discard');
        await page.waitForFunction((name) => document.querySelector('#pico-project-name').value === name, originalName);
        assert.equal(await page.getAttribute('body', 'data-workbench-view'), 'simple');
        const authority = await page.evaluate(() => {
          const state = window.__RP2040_PUBLIC_WORKBENCH__.state();
          return { artifact: state.artifact, runtime: state.runtime, runDisabled: document.querySelector('#pico-run').disabled,
            workerCreations: window.__M6_STATE__.runtimeWorkerCreations };
        });
        assert.deepEqual(authority, { artifact: null, runtime: null, runDisabled: true, workerCreations: 0 });
        report.localFileJourney = { profile: profiles[1].id, downloadBytes: fs.statSync(filePath).size,
          changedThenRestored: true, modeRetained: true, authority };
      }
      await context.close();
    }
    assert.equal(report.producerRequests.length, 0);
    assert.equal(report.mutatingRequests.length, 0);
    fs.writeFileSync(path.join(outputDir, 'x59-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ result: 'pass', cases: report.profiles.length,
      localFileJourney: report.localFileJourney, producerActivity: [0, 0, 0], screenshots: report.screenshots })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
