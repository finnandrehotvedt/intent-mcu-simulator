// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X43_URL || 'http://127.0.0.1:18883';
const fixturePath = process.env.X43_AVR_FIXTURE
  || '/srv/codex-workspaces/intentforce-station/handoffs/desktop-etvt6l5-ct109-lab-x70-avr-pico-acceptance-recovery-20261020-001/browser/avr-recovery/failure-state.json';
const fixtureSha256 = '5989993916aa2a07eb2be6ae31546801565e71a7f32484a8715f83f4f2d64946';
const evidenceDir = process.env.X43_EVIDENCE_DIR || '';
const viewports = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }];

async function inject(page, source, { cycle = source.runtime.cycle, instructions = source.runtime.instructions } = {}) {
  await page.evaluate(({ source, cycle, instructions }) => {
    const next = structuredClone(source);
    next.runtime.cycle = cycle;
    next.runtime.instructions = instructions;
    next.lifecycle.output.cycle = cycle;
    next.lifecycle.output.instructions = instructions;
    for (const key of ['compilerTarget', 'revision', 'artifactIdentity', 'inputIdentity', 'lifecycle', 'runtime']) {
      window.__M6_STATE__[key] = structuredClone(next[key]);
    }
  }, { source, cycle, instructions });
}

async function stopControl(page, id) {
  await page.evaluate((targetId) => {
    let observed = false;
    const stop = (event) => {
      if (event.target?.id !== targetId) return;
      observed = true;
      event.stopImmediatePropagation();
      document.removeEventListener('click', stop, true);
    };
    document.addEventListener('click', stop, true);
    document.getElementById(targetId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    if (!observed) throw new Error(`X43_CONTROL_EVENT_NOT_OBSERVED:${targetId}`);
  }, id);
}

(async () => {
  const bytes = await readFile(fixturePath);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), fixtureSha256);
  const fixture = JSON.parse(bytes).avrState;
  assert(fixture.runtime?.runtimeIdentity?.workerInstanceNonce);
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      const outside = []; const failures = []; const producerRequests = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== new URL(base).origin) outside.push(request.url());
        if (/^\/api\/(build|rp2040|c3|stm32)/u.test(url.pathname)) producerRequests.push(request.url());
      });
      page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
      page.on('pageerror', (error) => failures.push(error.stack || error.message));
      page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
      await page.addInitScript(() => {
        window.__X43_TEST_ACTIVITY__ = { storageWrites: 0, workers: 0, serviceWorkers: 0 };
        for (const name of ['setItem', 'removeItem', 'clear']) {
          const original = Storage.prototype[name];
          Storage.prototype[name] = function wrapped(...args) {
            window.__X43_TEST_ACTIVITY__.storageWrites += 1;
            return original.apply(this, args);
          };
        }
        const NativeWorker = window.Worker;
        window.Worker = class CountedWorker extends NativeWorker {
          constructor(...args) { window.__X43_TEST_ACTIVITY__.workers += 1; super(...args); }
        };
        if (navigator.serviceWorker?.register) {
          const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
          navigator.serviceWorker.register = (...args) => {
            window.__X43_TEST_ACTIVITY__.serviceWorkers += 1;
            return register(...args);
          };
        }
      });
      const response = await page.goto(base, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true && window.__X43_AVR_PROFILE__);
      await inject(page, fixture);
      await page.click('#instruments-open');
      const panel = page.locator('#workbench-instruments-dialog [data-x43-runtime-profile]');
      await panel.waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('#workbench-instruments-dialog [data-x43-start]').disabled);
      const activityBefore = await page.evaluate(() => structuredClone(window.__X43_TEST_ACTIVITY__));

      // The control lifecycle changes before the worker acknowledgement. Keep
      // the exact Start binding internally, but expose no interval or Capture
      // authority until the first coherent worker projection arrives.
      await panel.locator('[data-x43-start]').click();
      const transitionStart = await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot().interval.start);
      await page.evaluate(() => {
        window.__M6_STATE__.lifecycle.phase = 'running';
        document.querySelector('#quick-state').textContent = 'fixture · running';
      });
      await page.waitForFunction(() => window.__X43_AVR_PROFILE__.transitionState() === 'transitioning');
      assert.equal(await panel.locator('[data-x43-capture]').isEnabled(), false);
      assert.equal(await panel.locator('[data-x43-counters]').textContent(), 'No captured interval.');
      assert.match(await panel.locator('[data-x43-binding]').textContent(), /Awaiting one coherent AVR worker status/u);
      if (evidenceDir) await panel.screenshot({
        path: path.join(evidenceDir, `x43-run-transition-unavailable-${viewport.width}x${viewport.height}.png`),
      });
      await inject(page, { ...fixture, lifecycle: { ...fixture.lifecycle, phase: 'running' },
        runtime: { ...fixture.runtime, paused: false } }, {
        cycle: transitionStart.cycle + 200, instructions: transitionStart.instructions + 130,
      });
      await page.evaluate(() => { document.querySelector('#quick-state').textContent = 'fixture · running current'; });
      await page.waitForFunction(() => window.__X43_AVR_PROFILE__.transitionState() === 'observing');
      const retainedTransition = await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot());
      assert.deepEqual(retainedTransition.interval.start, transitionStart);
      assert.equal(await panel.locator('[data-x43-capture]').isEnabled(), true);
      await panel.locator('[data-x43-capture]').click();
      assert.equal((await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot())).state, 'captured');

      // Keyboard-only Start followed by deterministic counter replay and Capture.
      await panel.locator('[data-x43-start]').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__X43_AVR_PROFILE__.snapshot().state === 'observing');
      const start = await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot().interval.start);
      await inject(page, fixture, { cycle: start.cycle + 320, instructions: start.instructions + 160 });
      await page.waitForTimeout(20);
      await panel.locator('[data-x43-capture]').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__X43_AVR_PROFILE__.snapshot().state === 'captured');
      const captured = await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot());
      assert.deepEqual(captured.interval.delta, { cycles: 320, instructions: 160 });
      assert.deepEqual(captured.interval.virtualTime,
        { numerator: '20000', denominator: 1, unit: 'nanosecond', clockHertz: 16000000 });
      for (const support of Object.values(captured.support)) {
        assert.equal(support.value, null);
        assert.equal(support.status, 'unavailable');
      }

      await panel.scrollIntoViewIfNeeded();
      const readability = await panel.evaluate((root) => {
        const fontSizes = [...root.querySelectorAll('strong, span, p, button, dt, dd')]
          .map((node) => parseFloat(getComputedStyle(node).fontSize));
        const rect = root.getBoundingClientRect();
        return { minimumFontPixels: Math.min(...fontSizes), width: rect.width, height: rect.height,
          controls: [...root.querySelectorAll('button')].map((button) => ({ text: button.textContent, disabled: button.disabled })) };
      });
      assert(readability.minimumFontPixels >= 12, JSON.stringify(readability));
      assert.match(await panel.locator('[data-x43-wall]').textContent(), /diagnostic only/u);
      assert.match(await panel.locator('[data-x43-binding]').textContent(),
        /source .*revision 1.*project\/build\/runtime 2\/3\/5.*model .*worker 2\//u);
      const activityAfterCapture = await page.evaluate(() => structuredClone(window.__X43_TEST_ACTIVITY__));
      assert.equal(activityAfterCapture.storageWrites - activityBefore.storageWrites, 0);
      assert.equal(activityAfterCapture.workers - activityBefore.workers, 0);
      assert.equal(activityAfterCapture.serviceWorkers - activityBefore.serviceWorkers, 0);
      if (evidenceDir) await panel.screenshot({
        path: path.join(evidenceDir, `x43-avr-profile-replay-${viewport.width}x${viewport.height}.png`),
      });

      // A later accepted projection becomes the monotonic floor. Capture may
      // not fall back toward Start, and the stale interval clears before paint.
      await inject(page, fixture);
      await panel.locator('[data-x43-start]').click();
      const orderStart = await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot().interval.start);
      await inject(page, fixture, { cycle: orderStart.cycle + 200, instructions: orderStart.instructions + 130 });
      assert.equal((await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot())).state, 'observing');
      await inject(page, fixture, { cycle: orderStart.cycle + 100, instructions: orderStart.instructions + 60 });
      await panel.locator('[data-x43-capture]').click();
      const orderRegression = await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot());
      assert.equal(orderRegression.state, 'invalidated');
      assert.equal(orderRegression.reason, 'X43_COUNTER_REGRESSION');
      assert.equal(orderRegression.interval, null);
      assert.equal(await panel.locator('[data-x43-counters]').textContent(), 'No captured interval.');
      if (evidenceDir) await panel.screenshot({
        path: path.join(evidenceDir, `x43-counter-regression-cleared-${viewport.width}x${viewport.height}.png`),
      });

      // Establish a new explicit capture for the Open lifecycle checks below.
      await inject(page, fixture);
      await panel.locator('[data-x43-start]').click();
      await inject(page, fixture, { cycle: fixture.runtime.cycle + 320, instructions: fixture.runtime.instructions + 160 });
      await panel.locator('[data-x43-capture]').click();
      assert.equal((await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot())).state, 'captured');
      const activityAfterX43Sequences = await page.evaluate(() => structuredClone(window.__X43_TEST_ACTIVITY__));
      assert.equal(activityAfterX43Sequences.storageWrites - activityBefore.storageWrites, 0);
      assert.equal(activityAfterX43Sequences.workers - activityBefore.workers, 0);
      assert.equal(activityAfterX43Sequences.serviceWorkers - activityBefore.serviceWorkers, 0);

      // Rejected and cancelled Open preserve the exact captured binding.
      await page.click('#workbench-instruments-dialog .workbench-popup-close');
      await page.click('#project-files-open');
      const projectDialog = page.locator('#workbench-project-dialog');
      await projectDialog.waitFor({ state: 'visible' });
      const openButton = projectDialog.locator('#project-open');
      let chooserPromise = page.waitForEvent('filechooser');
      await openButton.click();
      let chooser = await chooserPromise;
      await chooser.setFiles({ name: 'rejected.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":') });
      await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Open rejected'));
      assert.equal((await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot())).state, 'captured');
      chooserPromise = page.waitForEvent('filechooser');
      await openButton.click();
      chooser = await chooserPromise;
      await chooser.setFiles([]);
      await page.waitForTimeout(100);
      assert.equal((await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot())).state, 'captured');

      // An accepted Open changes authoritative generations and clears immediately.
      const currentProject = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current());
      chooserPromise = page.waitForEvent('filechooser');
      await openButton.click();
      chooser = await chooserPromise;
      await chooser.setFiles({ name: 'accepted.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(currentProject) });
      await page.waitForFunction(() => document.querySelector('#unsaved-change-dialog').open
        || /Common project opened|migrated in memory/u.test(document.querySelector('#project-message').textContent));
      if (await page.locator('#unsaved-change-dialog').isVisible()) await page.click('#unsaved-discard');
      await page.waitForFunction(() => /Common project opened|migrated in memory/u.test(document.querySelector('#project-message').textContent));
      await page.waitForFunction(() => window.__X43_AVR_PROFILE__.snapshot().state === 'invalidated');
      assert.equal((await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot())).interval, null);

      // Source and graph changes invalidate without waiting for another worker message.
      if (await projectDialog.evaluate((node) => node.open)) await projectDialog.locator('.workbench-popup-close').click();
      await inject(page, fixture);
      await page.click('#instruments-open');
      await panel.locator('[data-x43-start]').click();
      await inject(page, fixture, { cycle: fixture.runtime.cycle + 10, instructions: fixture.runtime.instructions + 5 });
      await panel.locator('[data-x43-capture]').click();
      await page.click('#workbench-instruments-dialog .workbench-popup-close');
      await page.evaluate(() => document.querySelector('#source').dispatchEvent(new InputEvent('input', { bubbles: true })));
      assert.equal((await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot())).reason, 'X43_SOURCE_EDITED');

      await inject(page, fixture);
      await page.click('#instruments-open');
      await panel.locator('[data-x43-start]').click();
      await inject(page, fixture, { cycle: fixture.runtime.cycle + 10, instructions: fixture.runtime.instructions + 5 });
      await panel.locator('[data-x43-capture]').click();
      await page.click('#workbench-instruments-dialog .workbench-popup-close');
      const graphEdit = await page.evaluate(() => window.__M6_ADD__('resistor.fixed-v1'));
      assert.equal(graphEdit.ok, true, graphEdit.code);
      await page.waitForFunction(() => window.__X43_AVR_PROFILE__.snapshot().state === 'invalidated');

      // Existing lifecycle controls are intercepted before producer actions.
      for (const [id, reason] of [['build', 'X43_BUILD_STARTED'], ['reset', 'X43_RESET'],
        ['project-new', 'X43_NEW_PROJECT'], ['project-demo', 'X43_EXAMPLE_LOADED']]) {
        await inject(page, fixture);
        await page.click('#instruments-open');
        await panel.locator('[data-x43-start]').click();
        await page.click('#workbench-instruments-dialog .workbench-popup-close');
        await stopControl(page, id);
        assert.equal((await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot())).reason, reason);
      }

      // Profile switch clears AVR values and presents no invented parity.
      await inject(page, fixture);
      await page.click('#instruments-open');
      await panel.locator('[data-x43-start]').click();
      await page.click('#workbench-instruments-dialog .workbench-popup-close');
      await page.selectOption('#board-select', 'board.rp2040-pico-v1');
      assert.equal((await page.evaluate(() => window.__X43_AVR_PROFILE__.snapshot())).reason, 'X43_PROFILE_CHANGED');
      await page.click('#instruments-open');
      assert.match(await panel.locator('[data-x43-binding]').textContent(), /rp2040-profile-contract-pending/u);

      const activityAfter = await page.evaluate(() => ({
        ...structuredClone(window.__X43_TEST_ACTIVITY__),
        runtimeWorkerCreations: window.__M6_STATE__.runtimeWorkerCreations,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      assert.equal(activityAfter.workers - activityBefore.workers, 0);
      assert.equal(activityAfter.serviceWorkers - activityBefore.serviceWorkers, 0);
      assert.equal(activityAfter.runtimeWorkerCreations, 0);
      assert(activityAfter.overflow <= 1, `horizontal overflow ${activityAfter.overflow}px`);
      assert.equal(outside.length, 0, JSON.stringify(outside));
      assert.equal(producerRequests.length, 0, JSON.stringify(producerRequests));
      assert.equal(failures.length, 0, JSON.stringify(failures));
      reports.push({ viewport, fixtureReplay: true, delta: captured.interval.delta,
        virtualTime: captured.interval.virtualTime, counterRegressionClearedBeforePresentation: true,
        readability, outsideRequests: outside.length,
        producerRequests: producerRequests.length, workersCreated: activityAfter.workers - activityBefore.workers,
        x43ActionStorageWrites: activityAfterX43Sequences.storageWrites - activityBefore.storageWrites,
        storageWritesDuringWholeLifecycleReview: activityAfter.storageWrites - activityBefore.storageWrites,
        horizontalOverflowPixels: activityAfter.overflow });
      await page.close();
    }
    process.stdout.write(`${JSON.stringify({ status: 'pass', fixtureSha256,
      authority: 'checksum-pinned deterministic replay for presentation/lifecycle only; no fresh firmware execution',
      producers: { builds: 0, runs: 0, scenarios: 0 }, reports }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
