// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X47_URL || 'http://127.0.0.1:18883';
const evidenceDir = process.env.X47_EVIDENCE_DIR || '';
const viewports = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }];

async function loadButtonExample(page) {
  if (await page.locator('#workbench-project-dialog').getAttribute('open') === null) {
    await page.locator('#project-files-open').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#workbench-project-dialog[open]');
  }
  await page.locator('#project-demo').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('#example-picker-dialog[open]');
  await page.locator('.starter-card[data-example="button"]').focus();
  await page.keyboard.press('Enter');
  if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) {
    await page.locator('#unsaved-discard').focus();
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.__M6_STATE__.graph?.components?.some(
    (component) => component.type === 'button.momentary-v1',
  ));
}

async function openX47(page) {
  await page.locator('#instruments-open').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('#workbench-instruments-dialog[open]');
  const panel = page.locator('#workbench-instruments-dialog [data-x47-pulse-preview]');
  await panel.waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector(
    '#workbench-instruments-dialog [data-x47-preview]',
  ).disabled);
  return panel;
}

async function holdDigest(page) {
  await page.evaluate(() => {
    if (!window.__X47_NATIVE_DIGEST__) window.__X47_NATIVE_DIGEST__ = crypto.subtle.digest.bind(crypto.subtle);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    window.__X47_RELEASE_DIGEST__ = release;
    Object.defineProperty(crypto.subtle, 'digest', {
      configurable: true,
      value: async (...args) => { await gate; return window.__X47_NATIVE_DIGEST__(...args); },
    });
  });
}

async function releaseDigest(page) {
  await page.evaluate(() => {
    window.__X47_RELEASE_DIGEST__();
    Object.defineProperty(crypto.subtle, 'digest', {
      configurable: true, value: window.__X47_NATIVE_DIGEST__,
    });
  });
}

(async () => {
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
      page.on('response', (response) => {
        if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
      });
      page.on('pageerror', (error) => failures.push(error.stack || error.message));
      page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
      await page.addInitScript(() => {
        window.__X47_TEST_ACTIVITY__ = { storageWrites: 0, workers: 0, serviceWorkers: 0 };
        for (const name of ['setItem', 'removeItem', 'clear']) {
          const original = Storage.prototype[name];
          Storage.prototype[name] = function wrapped(...args) {
            window.__X47_TEST_ACTIVITY__.storageWrites += 1;
            return original.apply(this, args);
          };
        }
        const NativeWorker = window.Worker;
        window.Worker = class CountedWorker extends NativeWorker {
          constructor(...args) { window.__X47_TEST_ACTIVITY__.workers += 1; super(...args); }
        };
        if (navigator.serviceWorker?.register) {
          const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
          navigator.serviceWorker.register = (...args) => {
            window.__X47_TEST_ACTIVITY__.serviceWorkers += 1;
            return register(...args);
          };
        }
      });
      const response = await page.goto(base, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true && window.__X47_PULSE_PREVIEW__);
      if (await page.locator('#walkthrough').getAttribute('open') !== null) {
        await page.locator('#walkthrough button').last().click();
      }

      // Load authored project data through the real chooser. This is not a
      // firmware producer and gives the preview its exact validated D2 target.
      await loadButtonExample(page);

      // Use the real keyboard-accessible Instruments dialog path.
      const panel = await openX47(page);
      const activityBefore = await page.evaluate(() => structuredClone(window.__X47_TEST_ACTIVITY__));

      const start = panel.locator('[data-x47-start]');
      await start.focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await page.keyboard.type('16000');
      const width = panel.locator('[data-x47-width]');
      await width.focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await page.keyboard.type('32000');
      const preview = panel.locator('[data-x47-preview]');
      await preview.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__X47_PULSE_PREVIEW__.snapshot().state === 'preview');

      const snapshot = await page.evaluate(() => window.__X47_PULSE_PREVIEW__.snapshot());
      assert.deepEqual(snapshot.events, [
        { pin: 'D2', offsetCycles: 16000, level: false },
        { pin: 'D2', offsetCycles: 48000, level: true },
      ]);
      const parsed = JSON.parse(snapshot.canonicalText);
      assert.equal(parsed.schema, 'intent-mcu-x47-avr-d2-pulse@1');
      assert.equal(parsed.generatorId, 'x47-avr-d2-active-low-pulse-v1');
      assert.equal(parsed.randomness, 'none');
      assert.equal(parsed.seed, null);
      assert.match(parsed.graphIdentity, /^sha256:[0-9a-f]{64}$/u);
      const windowRevision = await page.evaluate(() => window.__M6_STATE__.revision);
      assert.equal(parsed.sourceProjectRevision, windowRevision);
      assert.equal(await panel.locator('[data-x47-events] li').count(), 2);
      assert.match(await panel.textContent(), /AVR D2 pulse.*transient.*not saved.*Usage and evidence limits/su);
      assert.equal(await panel.locator('a[href="/support.html#x47-avr-d2-pulse"]').count(), 1);
      assert.match(await panel.textContent(), /Build, Run, then explicitly Pause before Apply/u);
      assert.equal(await panel.locator('button').count(), 4);
      assert.equal(await panel.locator('[data-x47-apply]').isDisabled(), true);
      assert.equal(await panel.locator('[data-x47-resume]').isDisabled(), true);
      assert.equal(await panel.locator('[data-x47-stop]').isDisabled(), true);

      // A rejected replacement is atomic: while hashing, public reads expose
      // no old bytes; after strict rejection the prior accepted preview returns.
      const acceptedText = snapshot.canonicalText;
      await width.fill('0');
      await preview.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector(
        '#workbench-instruments-dialog [data-x47-state]',
      ).textContent.includes('Rejected'));
      const retained = await page.evaluate(() => window.__X47_PULSE_PREVIEW__.snapshot());
      assert.equal(retained.state, 'preview');
      assert.equal(retained.canonicalText, acceptedText);
      assert.deepEqual(retained.events, snapshot.events);
      await width.fill('32000');
      await preview.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector(
        '#workbench-instruments-dialog [data-x47-state]',
      ).textContent === 'Preview ready');

      const readability = await panel.evaluate((root) => {
        const fontSizes = [...root.querySelectorAll('strong, span, p, label, input, button, li, summary')]
          .map((node) => parseFloat(getComputedStyle(node).fontSize));
        const rect = root.getBoundingClientRect();
        return {
          minimumFontPixels: Math.min(...fontSizes), width: rect.width, height: rect.height,
          panelOverflow: root.scrollWidth - root.clientWidth,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      assert(readability.minimumFontPixels >= 12, JSON.stringify(readability));
      assert(readability.panelOverflow <= 1, JSON.stringify(readability));
      assert(readability.pageOverflow <= 1, JSON.stringify(readability));

      const activityAfter = await page.evaluate(() => structuredClone(window.__X47_TEST_ACTIVITY__));
      assert.equal(activityAfter.storageWrites - activityBefore.storageWrites, 0);
      assert.equal(activityAfter.workers - activityBefore.workers, 0);
      assert.equal(activityAfter.serviceWorkers - activityBefore.serviceWorkers, 0);
      assert.deepEqual(producerRequests, []);
      assert.deepEqual(outside, []);
      assert.deepEqual(failures, []);

      if (evidenceDir) await panel.screenshot({
        path: path.join(evidenceDir, `x47-avr-d2-pulse-preview-${viewport.width}x${viewport.height}.png`),
      });

      const raceResults = [];
      if (viewport.width === 1366) {
        // Source keyboard edit while the graph digest is pending. The prior
        // record and events disappear before the digest is released.
        await holdDigest(page);
        await preview.focus(); await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.__X47_PULSE_PREVIEW__.snapshot().state === 'pending');
        assert.equal(await page.evaluate(() => window.__X47_PULSE_PREVIEW__.canonicalText()), null);
        assert.deepEqual(await page.evaluate(() => window.__X47_PULSE_PREVIEW__.expandedEvents()), []);
        await page.keyboard.press('Escape');
        await page.locator('#firmware-open').focus(); await page.keyboard.press('Enter');
        await page.waitForSelector('#workbench-firmware-dialog[open]');
        await page.locator('#source').focus(); await page.keyboard.press('End');
        await page.keyboard.type('\n// x47 pending source edit');
        assert.equal(await page.evaluate(() => window.__X47_PULSE_PREVIEW__.canonicalText()), null);
        assert.deepEqual(await page.evaluate(() => window.__X47_PULSE_PREVIEW__.expandedEvents()), []);
        await releaseDigest(page); await page.waitForTimeout(20);
        assert.notEqual((await page.evaluate(() => window.__X47_PULSE_PREVIEW__.snapshot())).state, 'preview');
        raceResults.push('source-keyboard-cleared');

        // Reload authored data, then delete the button with the keyboard while
        // another digest is pending. Capture-phase invalidation precedes the
        // graph transaction and no stale API data survives.
        await page.keyboard.press('Escape'); await loadButtonExample(page);
        const graphPanel = await openX47(page);
        await graphPanel.locator('[data-x47-preview]').click();
        await page.waitForFunction(() => window.__X47_PULSE_PREVIEW__.snapshot().state === 'preview');
        await holdDigest(page);
        await graphPanel.locator('[data-x47-preview]').click();
        await page.waitForFunction(() => window.__X47_PULSE_PREVIEW__.snapshot().state === 'pending');
        await page.keyboard.press('Escape');
        const buttonCard = page.locator('#component-layer [data-component-id="button-1"]');
        await buttonCard.click({ force: true }); await buttonCard.focus();
        await page.keyboard.press('Delete');
        assert.equal(await page.evaluate(() => window.__X47_PULSE_PREVIEW__.canonicalText()), null);
        assert.deepEqual(await page.evaluate(() => window.__X47_PULSE_PREVIEW__.expandedEvents()), []);
        await releaseDigest(page); await page.waitForTimeout(20);
        assert.notEqual((await page.evaluate(() => window.__X47_PULSE_PREVIEW__.snapshot())).state, 'preview');
        raceResults.push('graph-keyboard-cleared');

        // A profile replacement also cancels a pending digest and
        // cannot restore the old AVR preview when that digest resolves.
        await loadButtonExample(page);
        const profilePanel = await openX47(page);
        await profilePanel.locator('[data-x47-preview]').click();
        await page.waitForFunction(() => window.__X47_PULSE_PREVIEW__.snapshot().state === 'preview');
        await holdDigest(page);
        await profilePanel.locator('[data-x47-preview]').click();
        await page.waitForFunction(() => window.__X47_PULSE_PREVIEW__.snapshot().state === 'pending');
        await page.keyboard.press('Escape');
        await page.locator('#board-select').selectOption('board.rp2040-pico-v1');
        await page.waitForFunction(() => document.body.dataset.activeProfile !== 'board.atmega328p-16mhz-v1');
        assert.equal(await page.evaluate(() => window.__X47_PULSE_PREVIEW__.canonicalText()), null);
        assert.deepEqual(await page.evaluate(() => window.__X47_PULSE_PREVIEW__.expandedEvents()), []);
        await releaseDigest(page); await page.waitForTimeout(20);
        assert.notEqual((await page.evaluate(() => window.__X47_PULSE_PREVIEW__.snapshot())).state, 'preview');
        raceResults.push('profile-replacement-cleared');
      }

      const finalActivity = await page.evaluate(() => structuredClone(window.__X47_TEST_ACTIVITY__));
      assert.equal(finalActivity.workers - activityBefore.workers, 0);
      assert.equal(finalActivity.serviceWorkers - activityBefore.serviceWorkers, 0);
      assert.deepEqual(producerRequests, []);
      assert.deepEqual(outside, []);
      assert.deepEqual(failures, []);

      // Escape closes the real modal and restores focus to its opener.
      if (await page.locator('#workbench-instruments-dialog').getAttribute('open') !== null) {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#workbench-instruments-dialog').open);
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'instruments-open');
      }
      reports.push({ viewport, activityDelta: {
        storageWrites: activityAfter.storageWrites - activityBefore.storageWrites,
        workers: activityAfter.workers - activityBefore.workers,
        serviceWorkers: activityAfter.serviceWorkers - activityBefore.serviceWorkers,
      }, producerRequests: producerRequests.length, outsideRequests: outside.length,
      eventCycles: snapshot.events.map((event) => event.offsetCycles), raceResults, readability });
      await page.close();
    }
  } finally { await browser.close(); }
  process.stdout.write(`${JSON.stringify({ ok: true, reports }, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
