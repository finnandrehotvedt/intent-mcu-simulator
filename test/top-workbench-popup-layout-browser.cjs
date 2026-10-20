// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.TOP_LAYOUT_URL || 'http://host.docker.internal:18867';
const outputDir = process.env.TOP_LAYOUT_OUTPUT || '/tmp/top-layout-evidence';
const profiles = [
  { id: 'board.atmega328p-16mhz-v1', slug: 'avr', canvas: '.board-card', source: '#source', parts: '.catalog', inspector: '.inspector' },
  { id: 'board.rp2040-pico-v1', slug: 'pico', canvas: '.pico-circuit-pane', source: '#pico-source', parts: '.shared-parts-surface', inspector: '#pico-shared-inspector' },
  { id: 'board.esp32-c3-devmodule-v1', slug: 'c3', canvas: '.c3-circuit-pane', source: '#c3-source', parts: '.shared-parts-surface', inspector: '#c3-shared-inspector' },
  { id: 'board.stm32f429zi-nucleo144-v1', slug: 'stm32', canvas: '.stm32-circuit-pane', source: '#stm32-source', parts: '.shared-parts-surface', inspector: '#stm32-shared-inspector' },
];
const dialogs = [
  ['project', '#project-files-open'], ['parts', '#toggle-catalog'], ['inspector', '#toggle-inspector'],
  ['firmware', '#firmware-open'], ['brief', '#brief-tests-open'],
  ['instruments', '#instruments-open'], ['help', '#help-limits-open'],
];

async function selectProfile(page, profile) {
  await page.selectOption('#board-select', profile.id);
  await page.waitForFunction(({ id, canvas }) => {
    const node = document.querySelector(`#active-canvas-mount > ${canvas}`);
    return document.querySelector('#board-select').value === id && node && node.getClientRects().length > 0;
  }, { id: profile.id, canvas: profile.canvas });
}

async function geometry(page, viewport, profile) {
  await page.evaluate(() => scrollTo(0, 0));
  const value = await page.evaluate(({ profileId, canvasSelector }) => {
    const stage = document.querySelector('#active-canvas-stage').getBoundingClientRect();
    const canvas = document.querySelector(`#active-canvas-mount > ${canvasSelector}`).getBoundingClientRect();
    const controls = document.querySelector('#workbench-popup-controls').getBoundingClientRect();
    return {
      profileId, scrollY: scrollY, stageTop: stage.top, stageWidth: stage.width,
      stageVisibleHeight: Math.min(innerHeight, stage.bottom) - Math.max(0, stage.top),
      canvasTop: canvas.top, canvasHeight: canvas.height, controlsTop: controls.top,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      directCanvasCount: document.querySelectorAll('#active-canvas-mount > [data-shared-surface="canvas"], #active-canvas-mount > .board-card').length,
      buildVisible: Boolean(document.querySelector('#quick-build').getClientRects().length),
      runVisible: Boolean(document.querySelector('#quick-run').getClientRects().length),
    };
  }, { profileId: profile.id, canvasSelector: profile.canvas });
  assert.equal(value.scrollY, 0);
  assert(value.stageTop <= 210, `${profile.slug}: stage starts at ${value.stageTop}`);
  assert(value.stageWidth >= 700, `${profile.slug}: stage width ${value.stageWidth}`);
  assert(value.stageVisibleHeight >= (viewport.height <= 768 ? 430 : 540), `${profile.slug}: visible height ${value.stageVisibleHeight}`);
  assert(value.canvasHeight >= 560, `${profile.slug}: canvas height ${value.canvasHeight}`);
  assert(value.controlsTop < value.stageTop);
  assert(value.overflow <= 1, `${profile.slug}: horizontal overflow ${value.overflow}`);
  assert.equal(value.directCanvasCount, 1);
  assert.equal(value.buildVisible, true);
  assert.equal(value.runVisible, true);
  return value;
}

async function verifyDialog(page, name, openerSelector, profile) {
  const dialog = `#workbench-${name}-dialog`;
  await page.click(openerSelector);
  await page.waitForSelector(`${dialog}[open]`);
  assert.equal(await page.getAttribute(openerSelector, 'aria-expanded'), 'true');
  assert.equal(await page.evaluate((selector) => document.querySelector(selector).contains(document.activeElement), dialog), true);
  assert.equal(await page.evaluate((selector) => document.activeElement === document.querySelector(`${selector} h2`), dialog), true);
  assert(await page.locator(`${dialog} [data-workbench-popup-mount="${name}"] > *`).count() > 0, `${profile.slug}/${name}: empty popup`);
  if (name === 'parts') assert.equal(await page.locator(`${dialog} ${profile.parts}`).count(), 1);
  if (name === 'inspector') assert.equal(await page.locator(`${dialog} ${profile.inspector}`).count(), 1);
  if (name === 'firmware') assert.equal(await page.locator(`${dialog} ${profile.source}`).count(), 1);

  const focusable = `${dialog} button:not([disabled]), ${dialog} input:not([disabled]):not([type="hidden"]), ${dialog} select:not([disabled]), ${dialog} textarea:not([disabled]), ${dialog} a[href], ${dialog} [tabindex]:not([tabindex="-1"])`;
  const count = await page.locator(focusable).count();
  assert(count > 0);
  await page.locator(focusable).last().focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate((selector) => document.activeElement === document.querySelector(selector), focusable), true);

  await page.keyboard.press('Escape');
  await page.waitForFunction((selector) => !document.querySelector(selector).open, dialog);
  assert.equal(await page.getAttribute(openerSelector, 'aria-expanded'), 'false');
  assert.equal(await page.evaluate((selector) => document.activeElement === document.querySelector(selector), openerSelector), true);
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { base, producerRequests: [], mutatingRequests: [], workerCreations: [], viewports: [] };
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
      const viewportReport = { viewport, profiles: [] };
      for (const profile of profiles) {
        await selectProfile(page, profile);
        const measurements = await geometry(page, viewport, profile);
        await page.screenshot({ path: path.join(outputDir, `${viewport.width}x${viewport.height}-${profile.slug}.png`), fullPage: false });
        for (const [name, opener] of dialogs) await verifyDialog(page, name, opener, profile);
        viewportReport.profiles.push({ id: profile.id, measurements, sevenDialogs: true });
      }
      report.workerCreations.push(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations));
      report.viewports.push(viewportReport);
      await context.close();
    }

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('request', (request) => {
      const item = { method: request.method(), url: request.url() };
      if (/\/api\//u.test(new URL(request.url()).pathname)) report.producerRequests.push(item);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) report.mutatingRequests.push(item);
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    // The existing nested example chooser remains the topmost modal and does
    // not close the owning Project popup or leak keyboard focus.
    await page.click('#project-files-open');
    await page.click('#project-demo');
    await page.waitForSelector('#example-picker-dialog[open]');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#example-picker-dialog').getAttribute('open'), null);
    assert.equal(await page.locator('#workbench-project-dialog').getAttribute('open'), '');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#workbench-project-dialog').getAttribute('open'), null);

    // Real file/history controls, not placeholders, remain in the popup.
    await page.click('#project-files-open');
    assert.equal(await page.locator('#workbench-project-dialog #project-save').count(), 1);
    assert.equal(await page.locator('#workbench-project-dialog #project-open').count(), 1);
    assert.equal(await page.locator('#workbench-project-dialog #local-history').count(), 1);
    await page.keyboard.press('Escape');

    // Source drafts survive popup close/reopen because the authoritative
    // editor node is moved rather than cloned.
    for (const profile of profiles) {
      await selectProfile(page, profile);
      await page.click('#firmware-open');
      const before = await page.inputValue(profile.source);
      const marker = `\n// private-layout-${profile.slug}`;
      await page.fill(profile.source, `${before}${marker}`);
      await page.keyboard.press('Escape');
      await page.click('#firmware-open');
      assert((await page.inputValue(profile.source)).endsWith(marker));
      await page.keyboard.press('Escape');
    }

    // Escape closes the popup but preserves a real pending named-wire draft.
    await selectProfile(page, profiles[1]);
    await page.evaluate(() => {
      const api = window.__RP2040_PUBLIC_WORKBENCH__;
      api.selectCircuit({ kind: 'net', id: 'net-gpio0' });
      api.beginReconnect();
      api.activateEndpoint({ component: 'pico-1', pin: 'GP0' });
    });
    const draftBefore = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuitEditor.wireDraft);
    assert.notEqual(draftBefore.mode, 'none');
    await page.click('#help-limits-open');
    await page.keyboard.press('Escape');
    const draftAfter = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuitEditor.wireDraft);
    assert.deepEqual(draftAfter, draftBefore);

    // A profile switch closes an open popup and moves exactly one real canvas.
    await page.click('#toggle-catalog');
    await page.selectOption('#board-select', profiles[2].id);
    await page.waitForFunction(() => document.querySelector('#board-select').value === 'board.esp32-c3-devmodule-v1');
    assert.equal(await page.locator('#workbench-parts-dialog').getAttribute('open'), null);
    assert.equal(await page.locator('#active-canvas-mount > .c3-circuit-pane').count(), 1);
    await page.click('#firmware-open');
    await page.screenshot({ path: path.join(outputDir, 'keyboard-popup.png'), fullPage: false });
    await page.keyboard.press('Escape');

    report.workerCreations.push(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations));
    report.serviceWorkers = context.serviceWorkers().length;
    report.assertions = {
      fourProfilesTwoViewports: true, sevenDialogsPerProfile: true, exactFocusRestore: true,
      tabTrap: true, nestedModal: true, sourceDraftPreserved: true, wireDraftPreserved: true,
      profileSwitchClosesPopup: true, actualNodesMoved: true, firmwareActionsInvoked: 0,
    };
    assert.equal(report.producerRequests.length, 0);
    assert.equal(report.mutatingRequests.length, 0);
    assert.deepEqual(report.workerCreations, [0, 0, 0]);
    assert.equal(report.serviceWorkers, 0);
    fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report.assertions)}\n`);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
