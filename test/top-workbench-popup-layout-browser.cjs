// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.TOP_LAYOUT_URL || 'http://host.docker.internal:18867';
const outputDir = process.env.TOP_LAYOUT_OUTPUT || '/tmp/top-layout-evidence';
const profiles = [
  { id: 'board.atmega328p-16mhz-v1', slug: 'avr', canvas: '.board-card', visual: '#circuit-canvas', source: '#source', parts: '.catalog', inspector: '.inspector', save: '#project-save', open: '#project-open-input', run: '#run' },
  { id: 'board.rp2040-pico-v1', slug: 'pico', canvas: '.pico-circuit-pane', visual: '#pico-diagram', source: '#pico-source', parts: '.shared-parts-surface', inspector: '#pico-shared-inspector', save: '#pico-save', open: '#pico-open-input', run: '#pico-run' },
  { id: 'board.esp32-c3-devmodule-v1', slug: 'c3', canvas: '.c3-circuit-pane', visual: '#c3-diagram', source: '#c3-source', parts: '.shared-parts-surface', inspector: '#c3-shared-inspector', save: '#c3-save', open: '#c3-open-input', run: '#c3-run' },
  { id: 'board.stm32f429zi-nucleo144-v1', slug: 'stm32', canvas: '.stm32-circuit-pane', visual: '#stm32-diagram', source: '#stm32-source', parts: '.shared-parts-surface', inspector: '#stm32-shared-inspector', save: '#stm32-save', open: '#stm32-open-input', run: '#stm32-run' },
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
  const value = await page.evaluate(({ profileId, canvasSelector, visualSelector }) => {
    const stage = document.querySelector('#active-canvas-stage').getBoundingClientRect();
    const canvas = document.querySelector(`#active-canvas-mount > ${canvasSelector}`).getBoundingClientRect();
    const visualNode = document.querySelector(visualSelector);
    const visual = visualNode.getBoundingClientRect();
    const controls = document.querySelector('#workbench-popup-controls').getBoundingClientRect();
    const intersection = (rect) => ({
      width: Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)),
      height: Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)),
    });
    const primaryControls = [
      '#family-select', '#board-select', '#quick-build', '#quick-run', '#quick-pause',
      '#quick-reset', '#quick-stop', '#project-files-open',
    ].map((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { selector, ...intersection(rect), top: rect.top, bottom: rect.bottom };
    });
    return {
      profileId, scrollY: scrollY, stageTop: stage.top, stageWidth: stage.width,
      stageVisibleHeight: Math.min(innerHeight, stage.bottom) - Math.max(0, stage.top),
      canvasTop: canvas.top, canvasHeight: canvas.height, controlsTop: controls.top,
      visualTop: visual.top, visualWidth: visual.width, visualHeight: visual.height,
      visualIntersection: intersection(visual), primaryControls,
      visualPredecessors: [...visualNode.parentElement.children].slice(0, [...visualNode.parentElement.children].indexOf(visualNode)).map((node) => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName, id: node.id, className: node.className, top: rect.top, height: rect.height,
          display: getComputedStyle(node).display };
      }),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      directCanvasCount: document.querySelectorAll('#active-canvas-mount > [data-shared-surface="canvas"], #active-canvas-mount > .board-card').length,
    };
  }, { profileId: profile.id, canvasSelector: profile.canvas, visualSelector: profile.visual });
  assert.equal(value.scrollY, 0);
  assert(value.stageTop <= 210, `${profile.slug}: stage starts at ${value.stageTop}`);
  assert(value.stageWidth >= 700, `${profile.slug}: stage width ${value.stageWidth}`);
  assert(value.stageVisibleHeight >= (viewport.height <= 768 ? 430 : 540), `${profile.slug}: visible height ${value.stageVisibleHeight}`);
  assert(value.canvasHeight >= 560, `${profile.slug}: canvas height ${value.canvasHeight}`);
  assert(value.visualIntersection.width >= 700, `${profile.slug}: actual canvas visible width ${value.visualIntersection.width}`);
  assert(value.visualIntersection.height >= (viewport.height <= 768 ? 430 : 540), `${profile.slug}: actual canvas visible height ${value.visualIntersection.height}`);
  assert(value.controlsTop < value.stageTop);
  assert(value.overflow <= 1, `${profile.slug}: horizontal overflow ${value.overflow}`);
  assert.equal(value.directCanvasCount, 1);
  for (const control of value.primaryControls) {
    assert(control.width > 0 && control.height > 0, `${profile.slug}: ${control.selector} is outside the viewport`);
    assert(control.top >= 0 && control.bottom <= viewport.height, `${profile.slug}: ${control.selector} is clipped`);
  }
  return value;
}

async function authoredSnapshot(page, profile) {
  return page.evaluate((slug) => {
    if (slug === 'avr') {
      const project = window.__M6_PROJECT__();
      return { source: project.source, circuit: project.circuit };
    }
    const state = slug === 'pico' ? window.__RP2040_PUBLIC_WORKBENCH__.state()
      : slug === 'c3' ? window.__ESP32C3_PUBLIC_WORKBENCH__.state()
        : window.__STM32_PUBLIC_WORKBENCH__.state();
    return { source: state.source ?? state.project.source, circuit: state.circuit ?? state.project.circuit };
  }, profile.slug);
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
    if (process.env.TOP_LAYOUT_GEOMETRY_ONLY === '1') {
      fs.writeFileSync(path.join(outputDir, 'geometry.json'), `${JSON.stringify(report.viewports, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify({ geometryOnly: true, cases: 8 })}\n`);
      return;
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
    assert.equal(await page.evaluate(() => document.querySelector('#example-picker-dialog').contains(document.activeElement)), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.querySelector('#example-picker-dialog').contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#example-picker-dialog').getAttribute('open'), null);
    assert.equal(await page.locator('#workbench-project-dialog').getAttribute('open'), '');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#project-demo')), true);
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

    // Exercise the moved real project controls end to end for all profiles:
    // Download, make a visible authored edit, cancel one nested Open decision,
    // then confirm Open and prove exact source/circuit restoration with Run
    // still disabled. No Build or Run control is invoked.
    const filePage = await context.newPage();
    filePage.on('request', (request) => {
      const item = { method: request.method(), url: request.url() };
      if (/\/api\//u.test(new URL(request.url()).pathname)) report.producerRequests.push(item);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) report.mutatingRequests.push(item);
    });
    await filePage.goto(base, { waitUntil: 'domcontentloaded' });
    await filePage.waitForFunction(() => window.__M11_READY__ === true);
    report.fileJourneys = [];
    for (const profile of profiles) {
      await selectProfile(filePage, profile);
      const original = await authoredSnapshot(filePage, profile);
      await filePage.click('#project-files-open');
      const downloadPromise = filePage.waitForEvent('download');
      await filePage.click(profile.save);
      const download = await downloadPromise;
      const filePath = await download.path();
      const bytes = fs.statSync(filePath).size;
      assert(bytes > 0, `${profile.slug}: empty project download`);
      await filePage.keyboard.press('Escape');

      await filePage.click('#firmware-open');
      const sourceText = await filePage.inputValue(profile.source);
      const changedSource = `${sourceText}\n// popup-file-guard-${profile.slug}`;
      await filePage.fill(profile.source, changedSource);
      await filePage.keyboard.press('Escape');

      await filePage.click('#project-files-open');
      await filePage.setInputFiles(profile.open, filePath);
      await filePage.waitForTimeout(300);
      assert.equal(await filePage.locator('#unsaved-change-dialog').getAttribute('open'), '', `${profile.slug}: Open did not show the unsaved-change guard`);
      assert.equal(await filePage.evaluate(() => document.querySelector('#unsaved-change-dialog').contains(document.activeElement)), true);
      await filePage.click('#unsaved-keep');
      assert.equal(await filePage.inputValue(profile.source), changedSource);
      assert.equal(await filePage.locator('#workbench-project-dialog').getAttribute('open'), '');

      await filePage.setInputFiles(profile.open, filePath);
      await filePage.waitForSelector('#unsaved-change-dialog[open]');
      await filePage.click('#unsaved-discard');
      await filePage.waitForFunction(({ selector, expected }) => document.querySelector(selector).value === expected,
        { selector: profile.source, expected: sourceText });
      assert.deepEqual(await authoredSnapshot(filePage, profile), original);
      assert.equal(await filePage.isDisabled(profile.run), true);
      if (await filePage.locator('#workbench-project-dialog').getAttribute('open') !== null) {
        await filePage.keyboard.press('Escape');
      }
      report.fileJourneys.push({ profile: profile.id, bytes, cancelPreservedEdit: true,
        confirmedOpenRestoredSourceAndCircuit: true, runDisabled: true });
    }

    // One actual local-history lifecycle exercises a nested destructive
    // decision: enable, save, cancel Clear with Escape, then confirm Clear.
    await selectProfile(filePage, profiles[0]);
    await filePage.click('#project-files-open');
    await filePage.click('#local-history > summary');
    await filePage.click('#local-history-enable');
    await filePage.waitForFunction(() => document.querySelector('#local-history').dataset.enabled === 'true');
    await filePage.click('#local-history-save');
    await filePage.waitForFunction(() => document.querySelectorAll('#local-history-list > li').length === 1);
    await filePage.click('#local-history-clear');
    await filePage.waitForSelector('#local-history-confirm[open]');
    assert.equal(await filePage.evaluate(() => document.activeElement === document.querySelector('#local-history-confirm-cancel')), true);
    await filePage.keyboard.press('Tab');
    assert.equal(await filePage.evaluate(() => document.querySelector('#local-history-confirm').contains(document.activeElement)), true);
    await filePage.keyboard.press('Escape');
    assert.equal(await filePage.locator('#local-history-confirm').getAttribute('open'), null);
    assert.equal(await filePage.locator('#local-history-list > li').count(), 1);
    assert.equal(await filePage.evaluate(() => document.activeElement === document.querySelector('#local-history-clear')), true);
    await filePage.click('#local-history-clear');
    await filePage.waitForSelector('#local-history-confirm[open]');
    await filePage.click('#local-history-confirm-accept');
    await filePage.waitForFunction(() => document.querySelectorAll('#local-history-list > li').length === 0);
    await filePage.click('#local-history-disable');
    await filePage.waitForFunction(() => document.querySelector('#local-history').dataset.enabled === 'false');
    await filePage.keyboard.press('Escape');
    report.localHistoryJourney = { enabled: true, saved: true, cancelPreserved: true, confirmedClear: true, disabled: true };

    // The moved Inspector previews the model value until its explicit atomic
    // Apply, and the existing canvas Undo restores the original circuit value.
    await selectProfile(filePage, profiles[1]);
    await filePage.click('#active-canvas-mount [data-component-id="resistor-1"]');
    await filePage.click('#toggle-inspector');
    await filePage.fill('#resistor-1-ohms', '330');
    assert.equal(await filePage.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit
      .components.find((item) => item.id === 'resistor-1').properties.ohms), 220);
    await filePage.click('[data-bounded-model-apply="resistor-1"]');
    await filePage.waitForFunction(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit
      .components.find((item) => item.id === 'resistor-1').properties.ohms === 330);
    await filePage.keyboard.press('Escape');
    assert.equal(await filePage.isDisabled('#pico-undo'), false);
    await filePage.click('#pico-undo');
    assert.equal(await filePage.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit
      .components.find((item) => item.id === 'resistor-1').properties.ohms), 220);
    report.inspectorEditUndo = true;

    // Navigation from Brief & tests must open the moved authoritative Firmware
    // surface; hidden parked focus is not accepted as navigation success.
    await selectProfile(filePage, profiles[0]);
    await filePage.click('#brief-tests-open');
    await filePage.click('#project-navigation > summary');
    await filePage.fill('#project-navigation-query', 'main.ino');
    const sourceResult = filePage.locator('#project-navigation-results button[data-navigation-kind="file"], #project-navigation-results button[data-navigation-kind="source"]').first();
    await sourceResult.waitFor();
    await sourceResult.click();
    await filePage.waitForSelector('#workbench-firmware-dialog[open]');
    await filePage.evaluate(() => new Promise((resolve) => queueMicrotask(() => requestAnimationFrame(() => queueMicrotask(resolve)))));
    assert.equal(await filePage.evaluate(() => document.activeElement === document.querySelector('#source-file')), true);
    report.sourceNavigationOpenedFirmware = true;
    await filePage.keyboard.press('Escape');

    // Component, net, and pin search results are owned by the visible canvas.
    // Following each result must close Brief before selecting/focusing the
    // real canvas target; a parked-node focus is not a successful journey.
    await selectProfile(filePage, profiles[1]);
    const navigateFromBrief = async (query, kind) => {
      await filePage.click('#brief-tests-open');
      const navigation = filePage.locator('#project-navigation');
      if (!await navigation.evaluate((node) => node.open)) await navigation.locator('summary').click();
      await filePage.fill('#project-navigation-query', query);
      const result = filePage.locator(`#project-navigation-results button[data-navigation-kind="${kind}"]`).first();
      await result.waitFor();
      await result.click();
      assert.equal(await filePage.locator('#workbench-brief-dialog').getAttribute('open'), null,
        `${kind}: Brief remained over the canvas owner`);
    };
    await navigateFromBrief('resistor-1', 'component');
    assert.deepEqual(await filePage.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuitEditor.selection),
      { kind: 'component', id: 'resistor-1' });
    assert.equal(await filePage.locator('#active-canvas-mount [data-component-id="resistor-1"]').isVisible(), true);

    await navigateFromBrief('net-gpio0', 'net');
    assert.deepEqual(await filePage.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuitEditor.selection),
      { kind: 'net', id: 'net-gpio0' });

    await navigateFromBrief('GP0', 'pin');
    await filePage.waitForFunction(() => {
      const active = document.activeElement;
      return active?.matches('#active-canvas-mount #pico-editor-components .pin-anchor')
        && active.getClientRects().length > 0;
    });
    assert.equal(await filePage.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active?.matches('#active-canvas-mount #pico-editor-components .pin-anchor')
        && active.getClientRects().length > 0);
    }), true);
    report.canvasNavigationOpenedOwner = { component: true, net: true, pin: true };

    report.workerCreations.push(await filePage.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations));
    await filePage.close();

    report.workerCreations.push(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations));
    report.serviceWorkers = context.serviceWorkers().length;
    report.assertions = {
      fourProfilesTwoViewports: true, sevenDialogsPerProfile: true, exactFocusRestore: true,
      tabTrap: true, nestedModal: true, sourceDraftPreserved: true, wireDraftPreserved: true,
      profileSwitchClosesPopup: true, actualNodesMoved: true, actualCanvasIntersection: true,
      primaryControlsInsideViewport: true, fourProfileDownloadOpenGuards: true,
      localHistoryNestedDecision: true, inspectorEditUndo: true,
      sourceNavigationOpenedFirmware: true, firmwareActionsInvoked: 0,
      canvasNavigationOpenedOwner: true,
    };
    assert.equal(report.producerRequests.length, 0);
    assert.equal(report.mutatingRequests.length, 0);
    assert.deepEqual(report.workerCreations, [0, 0, 0, 0]);
    assert.equal(report.serviceWorkers, 0);
    fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report.assertions)}\n`);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
