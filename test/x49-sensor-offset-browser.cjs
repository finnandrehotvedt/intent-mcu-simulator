// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X49_URL || 'http://127.0.0.1:18884';
const evidenceDir = process.env.X49_EVIDENCE_DIR || '';
const viewports = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }];

function report() {
  const sourceSha256 = '1'.repeat(64); const artifactIdentity = '2'.repeat(64);
  const modelImplementationSha256 = '3'.repeat(64); const modelExecutionContextSha256 = '4'.repeat(64);
  const values = [
    ['baseline-offset-0', 0, 30, 2, 409, 29, true],
    ['offset-plus-1', 1, 31, 2.025, 414, 30, false],
  ];
  return {
    schema: 'intent-mcu-x49-sensor-offset-report@1', contractId: 'x49-avr-temperature-offset-v1',
    fixtureClass: 'instrumented-avr-mailbox-fixture-required', sourceSha256, artifactIdentity,
    cases: values.map(([caseId, offsetC, effectiveTemperatureC, voltage, adcValue, temperatureC, level], index) => {
      const runtimeBinding = { schema: 'intent-mcu-runtime-binding@2', projectGeneration: 9,
        runtimeGeneration: 40 + index, artifactIdentity, modelImplementationSha256,
        modelExecutionContextSha256 };
      return {
        caseId,
        input: { authored: { referenceTemperatureC: 30, offsetC, effectiveTemperatureC },
          targetCycle: 0, appliedCycle: 0, retainedThroughCycle: 3_000_000 },
        modelOutput: { componentId: 'temperature-sensor-1', boardPin: 'A1', voltage },
        runtimeBinding,
        runtimeIdentity: { schema: 'intent-mcu-worker-runtime-identity@2', projectGeneration: 9,
          runtimeGeneration: 40 + index, artifactIdentity, modelImplementationSha256,
          modelExecutionContextSha256, workerInitialization: index + 1,
          workerInstanceNonce: String(index + 5).repeat(32) },
        adc: { channel: 1, value: adcValue, startCycle: 2_600_000, completionCycle: 2_700_000 },
        firmwareTransaction: { schema: 'intent-mcu-x34-firmware-producer@1',
          fixtureClass: 'instrumented-avr-mailbox-fixture-required', sourceSha256, artifactIdentity,
          commit: 2, temperatureC, d13Level: level ? 1 : 0, adcChannel: 1,
          adcValue, adcCompletionCycle: 2_700_000, beginCycle: 2_800_000, commitCycle: 2_900_000 },
        pin: { pin: 'D13', mode: 'OUTPUT', level, observedCycle: 2_900_000 },
        time: { cpuCycles: 3_000_000, virtualMilliseconds: 187.5 },
        retention: { droppedTraceRows: 0, droppedAdcCompletions: 0, droppedMailboxTransactions: 0 },
      };
    }),
  };
}

(async () => {
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      const failures = []; const outside = []; const producerRequests = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== new URL(base).origin) outside.push(request.url());
        if (/^\/api\/(build|run|scenario|rp2040|c3|stm32)/u.test(url.pathname)) producerRequests.push(request.url());
      });
      page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
      page.on('pageerror', (error) => failures.push(error.stack || error.message));
      page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
      await page.addInitScript(() => {
        window.__X49_ACTIVITY__ = { storageWrites: 0, workers: 0, serviceWorkers: 0 };
        for (const name of ['setItem', 'removeItem', 'clear']) {
          const original = Storage.prototype[name];
          Storage.prototype[name] = function wrapped(...args) {
            window.__X49_ACTIVITY__.storageWrites += 1; return original.apply(this, args);
          };
        }
        const NativeWorker = window.Worker;
        window.Worker = class CountedWorker extends NativeWorker {
          constructor(...args) { window.__X49_ACTIVITY__.workers += 1; super(...args); }
        };
        if (navigator.serviceWorker?.register) {
          const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
          navigator.serviceWorker.register = (...args) => {
            window.__X49_ACTIVITY__.serviceWorkers += 1; return register(...args);
          };
        }
      });
      const response = await page.goto(base, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true && window.__X49_OFFSET_COMPARISON__);
      if (await page.locator('#walkthrough').getAttribute('open') !== null) await page.locator('#walkthrough button').last().click();
      const before = await page.evaluate(() => structuredClone(window.__X49_ACTIVITY__));
      await page.locator('#instruments-open').focus(); await page.keyboard.press('Enter');
      await page.waitForSelector('#workbench-instruments-dialog[open]');
      const panel = page.locator('#workbench-instruments-dialog [data-x49-offset-comparison]');
      await panel.waitFor({ state: 'visible' });
      const preview = panel.locator('[data-x49-preview]');
      await preview.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__X49_OFFSET_COMPARISON__.snapshot().state === 'preview');
      assert.equal(await panel.locator('tbody tr').count(), 2);
      const text = await panel.textContent();
      for (const expected of ['Reference 30 °C', 'offset +0 °C', 'offset +1 °C', '2.000 V', 'ADC 409',
        'firmware integer 29 °C', 'D13 HIGH', '2.025 V', 'ADC 414', 'firmware integer 30 °C',
        'D13 LOW', 'Native emulator observation', 'Physical observation', 'Absent',
        'ordinary thermostat snapshots and UART text are not authoritative']) assert.equal(text.includes(expected), true, expected);
      assert.equal((await page.evaluate(() => window.__X49_OFFSET_COMPARISON__.snapshot())).academicStatus, 'unavailable');

      await page.evaluate((value) => window.__X49_OFFSET_COMPARISON__.acceptSyntheticReplay(value), report());
      await page.waitForFunction(() => window.__X49_OFFSET_COMPARISON__.snapshot().state === 'synthetic-replay');
      assert.match(await panel.textContent(), /Synthetic browser replay.*Academic\/native status remains unavailable/su);
      assert.match(await panel.textContent(), /cannot pass native acceptance/u);
      assert.equal((await page.evaluate(() => window.__X49_OFFSET_COMPARISON__.snapshot())).academicStatus, 'unavailable');
      const afterX49 = await page.evaluate(() => structuredClone(window.__X49_ACTIVITY__));
      assert.deepEqual({ storageWrites: afterX49.storageWrites - before.storageWrites,
        workers: afterX49.workers - before.workers,
        serviceWorkers: afterX49.serviceWorkers - before.serviceWorkers },
      { storageWrites: 0, workers: 0, serviceWorkers: 0 });

      await page.keyboard.press('Escape');
      await page.locator('#firmware-open').focus(); await page.keyboard.press('Enter');
      await page.locator('#source').focus(); await page.keyboard.press('End'); await page.keyboard.type('\n// x49 lifecycle clear');
      assert.equal((await page.evaluate(() => window.__X49_OFFSET_COMPARISON__.snapshot())).state, 'invalidated');
      assert.deepEqual((await page.evaluate(() => window.__X49_OFFSET_COMPARISON__.snapshot())).cases, []);
      await page.keyboard.press('Escape'); await page.locator('#instruments-open').focus(); await page.keyboard.press('Enter');
      assert.match(await panel.textContent(), /transient comparison and any replay were cleared/u);

      const readability = await panel.evaluate((root) => ({
        minimumFontPixels: Math.min(...[...root.querySelectorAll('strong,span,p,button,th,td')]
          .map((node) => parseFloat(getComputedStyle(node).fontSize))),
        panelOverflow: root.scrollWidth - root.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
      }));
      assert(readability.minimumFontPixels >= 11, JSON.stringify(readability));
      assert(readability.panelOverflow <= 1, JSON.stringify(readability));
      assert(readability.pageOverflow <= 1, JSON.stringify(readability));
      const after = await page.evaluate(() => structuredClone(window.__X49_ACTIVITY__));
      assert.equal(after.workers - before.workers, 0);
      assert.equal(after.serviceWorkers - before.serviceWorkers, 0);
      assert.deepEqual(producerRequests, []); assert.deepEqual(outside, []); assert.deepEqual(failures, []);
      if (evidenceDir) await panel.screenshot({ path: path.join(evidenceDir, `x49-offset-${viewport.width}x${viewport.height}.png`) });
      results.push({ viewport, readability, producerRequests: 0, outsideRequests: 0,
        storageWrites: 0, workers: 0, serviceWorkers: 0, academicStatus: 'unavailable' });
      await page.close();
    }
    if (evidenceDir) await writeFile(path.join(evidenceDir, 'X49-PRIVATE-BROWSER.json'), `${JSON.stringify(results, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(results)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
