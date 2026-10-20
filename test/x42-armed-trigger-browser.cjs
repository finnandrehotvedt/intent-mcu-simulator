// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X42_URL || 'http://127.0.0.1:18789';
const fixturePath = process.env.X42_AVR_FIXTURE
  || '/srv/codex-workspaces/intentforce-station/handoffs/desktop-etvt6l5-ct109-lab-x70-avr-pico-acceptance-recovery-20261020-001/browser/avr-recovery/failure-state.json';
const expectedFixtureHash = '5989993916aa2a07eb2be6ae31546801565e71a7f32484a8715f83f4f2d64946';
const X42_OBSERVER_INTERVAL_MS = 50;
const evidenceDir = process.env.X42_EVIDENCE_DIR || '';
const viewports = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }];

function prefix(actual, length) {
  const summary = structuredClone(actual.sharedSummary);
  const rows = summary.channels.logic.value.transitions.slice(0, length);
  summary.channels.logic.value.transitions = rows;
  summary.channels.logic.retention.retained = rows.length;
  summary.channels.logic.time.cycle = rows.at(-1)?.cycle ?? 0;
  summary.channels.logic.time.virtualMilliseconds = summary.channels.logic.time.cycle / 16_000;
  return summary;
}

async function inject(page, actual, length, lifecycle = actual.avrState.lifecycle) {
  await page.evaluate(({ summary, lifecycle }) => {
    window.__SHARED_INSTRUMENT_SUMMARY__ = structuredClone(summary);
    window.__M6_STATE__.lifecycle = structuredClone(lifecycle);
    window.__M6_STATE__.revision = summary.revision;
    window.__M6_STATE__.artifactIdentity = summary.artifactIdentity;
  }, { summary: prefix(actual, length), lifecycle });
}

(async () => {
  const bytes = await readFile(fixturePath);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedFixtureHash);
  const actual = JSON.parse(bytes);
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      const outside = []; const errors = []; const producerRequests = [];
      page.on('request', (request) => {
        if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
        if (new URL(request.url()).pathname.startsWith('/api/build')) producerRequests.push(request.url());
      });
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      page.on('pageerror', (error) => errors.push(error.stack || error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.addInitScript(() => {
        window.__X42_TEST_ACTIVITY__ = { storageWrites: 0, workerCreations: 0, serviceWorkerRegistrations: 0 };
        for (const name of ['setItem', 'removeItem', 'clear']) {
          const original = Storage.prototype[name];
          Storage.prototype[name] = function patchedStorage(...args) {
            window.__X42_TEST_ACTIVITY__.storageWrites += 1;
            return original.apply(this, args);
          };
        }
        const NativeWorker = window.Worker;
        window.Worker = class CountedWorker extends NativeWorker {
          constructor(...args) { window.__X42_TEST_ACTIVITY__.workerCreations += 1; super(...args); }
        };
        if (navigator.serviceWorker?.register) {
          const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
          navigator.serviceWorker.register = (...args) => {
            window.__X42_TEST_ACTIVITY__.serviceWorkerRegistrations += 1;
            return originalRegister(...args);
          };
        }
      });
      const response = await page.goto(base, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true && window.__X42_TRIGGER_CAPTURE__)
        .catch(() => { throw new Error(`X42_BROWSER_BOOT:${JSON.stringify(errors)}`); });
      let activityBefore = await page.evaluate(() => structuredClone(window.__X42_TEST_ACTIVITY__));
      await inject(page, actual, 20);
      await page.click('#instruments-open');
      const panel = page.locator('#workbench-instruments-dialog [data-x42-trigger-capture]');
      await panel.locator('[data-x42-channel]').waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('#workbench-instruments-dialog [data-x42-arm]').disabled);
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.observerActive()), false);

      // Keyboard-only configuration and Arm. The fixture rows existed before
      // Arm; only later prefixes are eligible to trigger.
      await panel.locator('[data-x42-channel]').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'armed');
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.observerActive()), true);
      await inject(page, actual, 21);
      await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'triggered');
      await inject(page, actual, 37);
      await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'captured');
      const captured = await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot());
      assert.equal(captured.capture.rows.length, 33);
      assert.equal(captured.capture.armedBeforeTrigger, true);
      assert.equal(captured.capture.rows[16].relativePosition, 0);
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.observerActive()), false);
      assert.equal(await panel.locator('[data-x42-rows] li').count(), 33);

      if (evidenceDir) await page.locator('#workbench-instruments-dialog').screenshot({
        path: path.join(evidenceDir, `x42-advanced-${viewport.width}x${viewport.height}.png`),
      });
      await page.click('#workbench-instruments-dialog .workbench-popup-close');
      await page.click('#workbench-view-simple');
      await page.click('#instruments-open');
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state), 'captured');
      assert.equal(await panel.locator('[data-x42-rows] li').count(), 33);
      if (evidenceDir) await page.locator('#workbench-instruments-dialog').screenshot({
        path: path.join(evidenceDir, `x42-simple-${viewport.width}x${viewport.height}.png`),
      });

      const recapture = async () => {
        await inject(page, actual, 20);
        const dialogOpen = await page.locator('#workbench-instruments-dialog').evaluate((node) => node.open);
        if (!dialogOpen) await page.click('#instruments-open');
        await page.waitForFunction(() => !document.querySelector('#workbench-instruments-dialog [data-x42-arm]').disabled);
        await panel.locator('[data-x42-arm]').click();
        await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'armed');
        await inject(page, actual, 21);
        await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'triggered');
        await inject(page, actual, 37);
        await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'captured');
        assert.equal(await panel.locator('[data-x42-rows] li').count(), 33);
      };
      const closeInstruments = async () => {
        if (await page.locator('#workbench-instruments-dialog').evaluate((node) => node.open)) {
          await page.click('#workbench-instruments-dialog .workbench-popup-close');
        }
      };

      // Rejected Open is atomic and does not discard a still-valid capture.
      await page.setInputFiles('#project-open-input', {
        name: 'rejected.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":'),
      });
      await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Open rejected'));
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state), 'captured');
      assert.equal(await panel.locator('[data-x42-rows] li').count(), 33);

      // An accepted actual file Open advances the authoritative project
      // generation. The old rows are cleared before the instrument view can
      // present them as current.
      const currentProject = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current());
      await page.setInputFiles('#project-open-input', {
        name: 'accepted.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(currentProject),
      });
      await page.waitForFunction(() => /Common project opened|migrated in memory/u.test(
        document.querySelector('#project-message').textContent,
      ));
      await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'invalidated');
      if (!(await page.locator('#workbench-instruments-dialog').evaluate((node) => node.open))) {
        await page.click('#instruments-open');
      }
      assert.equal(await panel.locator('[data-x42-rows] li').count(), 1);
      assert.equal(await panel.locator('[data-x42-rows] li').textContent(), 'No captured rows.');
      await inject(page, actual, 37);
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state), 'invalidated',
        'delayed stale Open summary resurrected capture');

      // A real graph edit updates the exposed authoritative revision. The
      // shell revalidates from that signal even after the finite observer has
      // stopped in captured.
      await recapture();
      await closeInstruments();
      const graphEdit = await page.evaluate(() => window.__M6_ADD__('resistor.fixed-v1'));
      assert.equal(graphEdit.ok, true, graphEdit.code);
      await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'invalidated');
      await page.click('#instruments-open');
      assert.equal(await panel.locator('[data-x42-rows] li').count(), 1);
      await inject(page, actual, 37);
      await page.waitForTimeout(X42_OBSERVER_INTERVAL_MS * 2);
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state), 'invalidated',
        'delayed graph summary resurrected capture');

      // The same authoritative graph signal closes the armed 50 ms lag before
      // a stale binding can be shown as current.
      await inject(page, actual, 20);
      await panel.locator('[data-x42-arm]').click();
      await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'armed');
      await closeInstruments();
      const armedGraphEdit = await page.evaluate(() => window.__M6_ADD__('led.basic-v1'));
      assert.equal(armedGraphEdit.ok, true, armedGraphEdit.code);
      await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'invalidated');
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.observerActive()), false);
      await inject(page, actual, 37);
      await page.waitForTimeout(X42_OBSERVER_INTERVAL_MS * 2);
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state), 'invalidated');

      // Existing lifecycle controls clear terminal captures through the shell
      // without invoking their producer actions in this zero-producer review.
      for (const [id, reason] of [
        ['build', 'X42_BUILD_STARTED'],
        ['reset', 'X42_RESET'],
        ['project-new', 'X42_NEW_PROJECT'],
      ]) {
        await page.click('#instruments-open');
        await recapture();
        await closeInstruments();
        await page.evaluate((targetId) => {
          let observed = false;
          const stopTarget = (event) => {
            if (event.target?.id !== targetId) return;
            observed = true;
            event.stopImmediatePropagation();
            document.removeEventListener('click', stopTarget, true);
          };
          document.addEventListener('click', stopTarget, true);
          document.getElementById(targetId).dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true,
          }));
          if (!observed) throw new Error(`X42_CONTROL_EVENT_NOT_OBSERVED:${targetId}`);
        }, id);
        const invalidatedControl = await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot());
        assert.equal(invalidatedControl.state, 'invalidated');
        assert.equal(invalidatedControl.reason, reason);
        assert.equal(invalidatedControl.capture, null);
      }
      assert.equal(producerRequests.length, 0, JSON.stringify(producerRequests));
      await page.click('#instruments-open');
      await recapture();

      // Storage writes above belong to the intentionally exercised existing
      // Open/edit journey, not X42. Reset the no-side-effect baseline before
      // retained profile/lifecycle checks.
      activityBefore = await page.evaluate(() => structuredClone(window.__X42_TEST_ACTIVITY__));

      // Profile transition invalidates atomically and exposes the truthful Pico
      // deferred boundary; it never relabels the old AVR capture.
      await page.click('#workbench-instruments-dialog .workbench-popup-close');
      await page.selectOption('#board-select', 'board.rp2040-pico-v1');
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state), 'invalidated');
      await page.click('#instruments-open');
      const picoText = await page.locator('#workbench-instruments-dialog [data-x42-binding]').textContent();
      assert.match(picoText, /deferred-retention-boundary|unavailable-profile-not-active/u);
      await page.click('#workbench-instruments-dialog .workbench-popup-close');

      // A new explicit Arm is permitted after returning to AVR. A lifecycle
      // mismatch invalidates and the old snapshot cannot resurrect it.
      await page.selectOption('#board-select', 'board.atmega328p-16mhz-v1');
      await inject(page, actual, 20);
      await page.click('#instruments-open');
      await page.waitForFunction(() => !document.querySelector('#workbench-instruments-dialog [data-x42-arm]').disabled);
      await panel.locator('[data-x42-arm]').click();
      await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'armed');
      const changed = structuredClone(actual.avrState.lifecycle);
      changed.projectGeneration += 1;
      changed.runtimeBinding.projectGeneration += 1;
      await inject(page, actual, 21, changed);
      const invalidated = await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.observeNow());
      assert.equal(invalidated.state, 'invalidated');
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.observerActive()), false);
      await inject(page, actual, 37);
      assert.equal((await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.observeNow())).state, 'invalidated');

      const activityAfter = await page.evaluate(() => ({
        ...structuredClone(window.__X42_TEST_ACTIVITY__),
        runtimeWorkerCreations: window.__M6_STATE__.runtimeWorkerCreations,
        storage: { local: localStorage.length, session: sessionStorage.length },
        width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      assert.equal(activityAfter.workerCreations - activityBefore.workerCreations, 0);
      assert.equal(activityAfter.storageWrites - activityBefore.storageWrites, 0);
      assert.equal(activityAfter.serviceWorkerRegistrations - activityBefore.serviceWorkerRegistrations, 0);
      assert.equal(activityAfter.runtimeWorkerCreations, 0);
      assert.equal(outside.length, 0, JSON.stringify(outside));
      assert.equal(producerRequests.length, 0, JSON.stringify(producerRequests));
      assert.equal(errors.length, 0, JSON.stringify(errors));
      assert(activityAfter.width <= 1, `horizontal overflow ${activityAfter.width}px`);
      reports.push({ viewport, capturedRows: captured.capture.rows.length,
        triggerCycle: captured.capture.triggerCycle, finalState: invalidated.state,
        outsideRequests: outside.length, producerRequests: producerRequests.length, activity: activityAfter });
      await page.close();
    }
    process.stdout.write(`${JSON.stringify({ status: 'pass', fixtureSha256: expectedFixtureHash,
      fixtureAuthority: 'preserved actual-runtime rows; owning X70 journey not accepted; not live X42 evidence',
      producers: { builds: 0, runs: 0, scenarios: 0 }, reports }, null, 2)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
