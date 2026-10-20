// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X42_URL || 'http://127.0.0.1:18789';
const fixturePath = process.env.X42_AVR_FIXTURE
  || '/srv/codex-workspaces/intentforce-station/handoffs/desktop-etvt6l5-ct109-lab-x42-virtual-budget-native-20261020-001/evidence/x42-native-failure.json';
const expectedFixtureHash = 'dc09bb77de76cee6bb5787c767a8198d009a57523555681a47b6fa0cef52dcd1';
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
  const envelope = JSON.parse(bytes);
  assert.equal(envelope.schema, 'x42-native-failure@1');
  assert.equal(envelope.phase, 'native-capture-validation');
  assert.equal(envelope.browser.capture.state, 'captured');
  assert.equal(envelope.browser.capture.binding.artifactIdentity,
    'c6998b25e46fa70fbe47f36513c26294a6f5c0f0f8f361b14828c41f0689db5c');
  const actual = {
    sharedSummary: envelope.browser.summary,
    avrState: { lifecycle: envelope.browser.lifecycle },
  };
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

      await panel.scrollIntoViewIfNeeded();
      const readability = await panel.evaluate((root) => {
        const px = (selector) => [...root.querySelectorAll(selector)].map((node) => parseFloat(getComputedStyle(node).fontSize));
        const rows = root.querySelector('[data-x42-rows]');
        const trigger = root.querySelector('[data-relative-position="0"]');
        const rect = root.getBoundingClientRect();
        return {
          fonts: {
            heading: px('.shared-instrument-tool-heading'), boundary: px('.x42-trigger-boundary'),
            limits: px('[data-x42-limits]'), labels: px('.x42-trigger-controls label'),
            factLabels: px('.x42-trigger-facts dt'), facts: px('.x42-trigger-facts dd'), rows: px('[data-x42-rows]'),
          },
          rows: { overflowY: getComputedStyle(rows).overflowY, scrollHeight: rows.scrollHeight, clientHeight: rows.clientHeight },
          trigger: { color: getComputedStyle(trigger).color, background: getComputedStyle(trigger).backgroundColor,
            borderLeftWidth: parseFloat(getComputedStyle(trigger).borderLeftWidth) },
          panel: { width: rect.width, height: rect.height },
        };
      });
      for (const [name, values] of Object.entries(readability.fonts)) {
        assert(values.length > 0, `${name} readability target missing`);
        assert(values.every((value) => value >= 12), `${name} below 12px: ${JSON.stringify(values)}`);
      }
      assert.match(readability.rows.overflowY, /auto|scroll/u);
      assert(readability.rows.scrollHeight > readability.rows.clientHeight, '33 rows must scroll inside the X42 panel');
      assert.notEqual(readability.trigger.background, 'rgba(0, 0, 0, 0)');
      assert(readability.trigger.borderLeftWidth >= 3);

      if (evidenceDir) await panel.screenshot({
        path: path.join(evidenceDir, `x42-native-replay-panel-advanced-${viewport.width}x${viewport.height}.png`),
      });
      await page.click('#workbench-instruments-dialog .workbench-popup-close');
      await page.click('#workbench-view-simple');
      await page.click('#instruments-open');
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state), 'captured');
      assert.equal(await panel.locator('[data-x42-rows] li').count(), 33);
      await panel.scrollIntoViewIfNeeded();
      if (evidenceDir) await panel.screenshot({
        path: path.join(evidenceDir, `x42-native-replay-panel-simple-${viewport.width}x${viewport.height}.png`),
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

      // The historical native fixture is presentation/lifecycle replay only.
      // Rejected and cancelled visible Open preserve its still-valid binding.
      await closeInstruments();
      await page.click('#project-files-open');
      await page.waitForSelector('#workbench-project-dialog[open]');
      const projectDialog = page.locator('#workbench-project-dialog');
      const openButton = projectDialog.locator('#project-open');
      assert.equal(await openButton.count(), 1);
      assert.equal(await openButton.isVisible(), true);
      let chooserPromise = page.waitForEvent('filechooser');
      await openButton.click();
      let chooser = await chooserPromise;
      await chooser.setFiles({
        name: 'rejected.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":'),
      });
      await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Open rejected'));
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state), 'captured');

      chooserPromise = page.waitForEvent('filechooser');
      await openButton.click();
      chooser = await chooserPromise;
      await chooser.setFiles([]);
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state), 'captured');
      await page.click('#workbench-project-dialog .workbench-popup-close');
      await page.click('#instruments-open');
      assert.equal(await panel.locator('[data-x42-rows] li').count(), 33);
      await closeInstruments();
      await page.click('#project-files-open');
      await page.waitForSelector('#workbench-project-dialog[open]');

      // Accepted visible Open advances authority and clears the replayed rows.
      const currentProject = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current());
      chooserPromise = page.waitForEvent('filechooser');
      await openButton.click();
      chooser = await chooserPromise;
      await chooser.setFiles({
        name: 'accepted.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(currentProject),
      });
      await page.waitForFunction(() => document.querySelector('#unsaved-change-dialog').open
        || /Common project opened|migrated in memory/u.test(document.querySelector('#project-message').textContent));
      if (await page.locator('#unsaved-change-dialog').isVisible()) await page.click('#unsaved-discard');
      await page.waitForFunction(() => /Common project opened|migrated in memory/u.test(
        document.querySelector('#project-message').textContent,
      ));
      await page.waitForFunction(() => window.__X42_TRIGGER_CAPTURE__.snapshot().state === 'invalidated');
      if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
        await page.click('#workbench-project-dialog .workbench-popup-close');
      }
      await page.click('#instruments-open');
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
        readability, outsideRequests: outside.length, producerRequests: producerRequests.length, activity: activityAfter });
      await page.close();
    }
    process.stdout.write(`${JSON.stringify({ status: 'pass', fixtureSha256: expectedFixtureHash,
      fixtureAuthority: 'checksum-pinned replay of accepted native core evidence; presentation/lifecycle only; not new compiled evidence',
      producers: { builds: 0, runs: 0, scenarios: 0 }, reports }, null, 2)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
