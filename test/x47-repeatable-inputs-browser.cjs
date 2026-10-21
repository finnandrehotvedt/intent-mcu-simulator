// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X47_URL || 'http://127.0.0.1:18883';
const evidenceDir = process.env.X47_EVIDENCE_DIR || '';

(async () => {
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const failures = []; const outside = []; const producers = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (/^\/api\/(build|rp2040|c3|stm32)/u.test(url.pathname)) producers.push(request.url());
    });
    page.on('pageerror', (error) => failures.push(error.stack || error.message));
    page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
    await page.addInitScript(() => {
      window.__X47_REPEATABLE_ACTIVITY__ = { storageWrites: 0, workers: 0, serviceWorkers: 0 };
      for (const name of ['setItem', 'removeItem', 'clear']) {
        const native = Storage.prototype[name];
        Storage.prototype[name] = function wrapped(...args) {
          window.__X47_REPEATABLE_ACTIVITY__.storageWrites += 1;
          return native.apply(this, args);
        };
      }
      const NativeWorker = window.Worker;
      window.Worker = class CountedWorker extends NativeWorker {
        constructor(...args) { window.__X47_REPEATABLE_ACTIVITY__.workers += 1; super(...args); }
      };
      if (navigator.serviceWorker?.register) {
        const native = navigator.serviceWorker.register.bind(navigator.serviceWorker);
        navigator.serviceWorker.register = (...args) => {
          window.__X47_REPEATABLE_ACTIVITY__.serviceWorkers += 1; return native(...args);
        };
      }
    });
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X47_REPEATABLE_INPUTS__);
    if (await page.locator('#walkthrough').getAttribute('open') !== null) {
      await page.locator('#walkthrough button').last().click();
    }
    await page.locator('#project-files-open').click();
    await page.locator('#project-demo').click();
    await page.locator('.starter-card[data-example="avr-thermostat-boundary-v1"]').click();
    if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) {
      await page.locator('#unsaved-discard').click();
    }
    await page.waitForFunction(() => window.__M6_STATE__.graph?.components?.some(
      (component) => component.id === 'temperature-sensor-1',
    ));
    await page.locator('#instruments-open').click();
    const panel = page.locator('#workbench-instruments-dialog [data-x47-repeatable-inputs]');
    await panel.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector(
      '#workbench-instruments-dialog [data-x47-repeatable-preview]',
    ).disabled);
    const before = await page.evaluate(() => structuredClone(window.__X47_REPEATABLE_ACTIVITY__));
    const family = panel.locator('[data-x47-repeatable-family]');
    const parameters = panel.locator('[data-x47-repeatable-parameters]');
    const preview = panel.locator('[data-x47-repeatable-preview]');

    await preview.click();
    let snapshot = await page.evaluate(() => window.__X47_REPEATABLE_INPUTS__.snapshot());
    assert.equal(snapshot.record.family, 'ramp');
    assert.deepEqual(snapshot.record.events.map((event) => event.temperatureC), [20, 25, 30, 35, 40]);
    assert.equal(snapshot.record.units.value, 'degC');
    assert.equal(snapshot.record.units.time, 'avr-native-cycle');
    assert.equal(await panel.locator('[data-x47-repeatable-apply]').isDisabled(), true);

    await family.selectOption('seeded-noise'); await preview.click();
    const noiseOne = await page.evaluate(() => window.__X47_REPEATABLE_INPUTS__.snapshot().canonicalText);
    await preview.click();
    assert.equal(await page.evaluate(() => window.__X47_REPEATABLE_INPUTS__.snapshot().canonicalText), noiseOne);
    await panel.locator('[data-x47-repeatable-seed]').fill('305419897'); await preview.click();
    assert.notEqual(await page.evaluate(() => window.__X47_REPEATABLE_INPUTS__.snapshot().canonicalText), noiseOne);

    await family.selectOption('recorded');
    await parameters.fill('{"points":[{"offsetCycles":16000,"temperatureC":21},{"offsetCycles":48000,"temperatureC":37}]}');
    await preview.click();
    snapshot = await page.evaluate(() => window.__X47_REPEATABLE_INPUTS__.snapshot());
    assert.deepEqual(snapshot.record.events, [
      { offsetCycles: 16000, temperatureC: 21 },
      { offsetCycles: 48000, temperatureC: 37 },
    ]);
    const acceptedRecorded = snapshot.canonicalText;
    await parameters.fill('{"points":[{"offsetCycles":16000,"temperatureC":21}],"points":[]}');
    await preview.click();
    assert.match(await panel.locator('[data-x47-repeatable-state]').textContent(), /Rejected/u);
    assert.equal((await page.evaluate(() => window.__X47_REPEATABLE_INPUTS__.snapshot())).canonicalText,
      acceptedRecorded);

    assert.match(await panel.textContent(), /Private candidate.*finite data-only preview.*no native execution claim/su);
    assert.match(await panel.textContent(), /Apply queues data only and never resumes execution/u);
    assert.equal(await panel.locator('[data-x47-repeatable-events] li').count(), 2);
    const readability = await panel.evaluate((root) => ({
      minimumFontPixels: Math.min(...[...root.querySelectorAll('strong,span,p,label,input,select,textarea,button,li,summary')]
        .map((node) => parseFloat(getComputedStyle(node).fontSize))),
      panelOverflow: root.scrollWidth - root.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    }));
    assert(readability.minimumFontPixels >= 11, JSON.stringify(readability));
    assert(readability.panelOverflow <= 1, JSON.stringify(readability));
    assert(readability.pageOverflow <= 1, JSON.stringify(readability));
    if (evidenceDir) await panel.screenshot({
      path: path.join(evidenceDir, 'x47-repeatable-inputs-1440x1000.png'),
    });
    const after = await page.evaluate(() => structuredClone(window.__X47_REPEATABLE_ACTIVITY__));
    assert.deepEqual({ storageWrites: after.storageWrites - before.storageWrites,
      workers: after.workers - before.workers,
      serviceWorkers: after.serviceWorkers - before.serviceWorkers },
    { storageWrites: 0, workers: 0, serviceWorkers: 0 });
    assert.deepEqual(producers, []); assert.deepEqual(outside, []); assert.deepEqual(failures, []);
    process.stdout.write(`${JSON.stringify({ ramp: 5, seededNoise: 8, recorded: 2,
      deterministic: true, malformedRecordedRejected: true, applyDisabledWithoutPausedWorker: true,
      producerRequests: 0, outsideRequests: 0, readability })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
