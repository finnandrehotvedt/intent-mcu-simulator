// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X36_REPLAY_URL || 'http://127.0.0.1:18814';
const screenshot = process.env.X36_SCREENSHOT_PATH;
const evidencePath = process.env.X36_EVIDENCE_PATH;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1732, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage(); const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X36_FAILURE_REPLAY__?.ready === true);
    await page.click('#project-demo');
    await page.locator('#failure-replay').scrollIntoViewIfNeeded();

    const open = async (viaButton = false) => {
      if (viaButton) await page.click('#failure-replay-open');
      else await page.evaluate(() => window.__X36_FAILURE_REPLAY__.open());
      await page.waitForFunction(() => window.__X36_FAILURE_REPLAY__.phase() === 'anchor-open');
      assert.equal(await page.evaluate(() => window.__X36_FAILURE_REPLAY__.activeWorkers()), 2);
      const anchors = await page.evaluate(() => window.__X36_FAILURE_REPLAY__.anchors());
      assert.equal(anchors.length, 2); assert.deepEqual(anchors[0], anchors[1]);
      assert.deepEqual(anchors[0], { instructionOrdinal: 151, cycle: 224, pc: 315, paused: true,
        d13: { mode: 'OUTPUT', level: true },
        retentionDrops: { logic: 0, serial: 0, adc: 0, unsupported: 0 }, pendingInputs: 0 });
      assert.match(await page.locator('#failure-replay-state').textContent(), /paused 2\/2/u);
      assert.equal(await page.locator('#failure-replay-advance').isDisabled(), false);
      return anchors;
    };

    await open(true);
    await page.click('#failure-replay-advance');
    await page.waitForFunction(() => window.__X36_FAILURE_REPLAY__.phase() === 'fault-open');
    const report = await page.evaluate(() => window.__X36_FAILURE_REPLAY__.report());
    assert.equal(report.schema, 'intent-mcu-x36-failure-replay-report@1');
    assert.equal(report.snapshot.capability, 'unavailable');
    assert.equal(report.snapshot.omittedStateClasses.length, 7);
    assert.equal(report.classifications.execution.academicStatus, 'unsupported');
    assert.equal(report.classifications.validation.status, 'accepted');
    assert.equal(report.classifications.infrastructure.status, 'available');
    assert.notEqual(report.repeats[0].runtimeIdentity.workerInstanceNonce,
      report.repeats[1].runtimeIdentity.workerInstanceNonce);
    for (const repeat of report.repeats) {
      assert.equal(repeat.fault.address, 0x4c); assert.equal(repeat.fault.value, 0x40);
      assert.equal(repeat.fault.producerCycle, 224); assert.equal(repeat.fault.stoppedCycle, 225);
      assert.equal(repeat.fault.postFaultAcceptedRecords, 0);
    }
    assert.equal(await page.evaluate(() => window.__X36_FAILURE_REPLAY__.passed()), true);
    assert.equal(await page.evaluate(() => window.__X36_FAILURE_REPLAY__.activeWorkers()), 0);
    assert.equal(await page.evaluate(() => window.__X36_FAILURE_REPLAY__.retirements()), 2);
    assert.match(await page.locator('#failure-replay-results').textContent(), /Full snapshotunavailable|Full snapshot unavailable/iu);

    const exportPromise = page.waitForEvent('download'); await page.click('#failure-replay-export');
    const exported = await exportPromise; const exportPath = await exported.path();
    const exportedValue = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    assert.deepEqual(exportedValue, report);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });

    await open(); const beforeClear = await page.evaluate(() => window.__X36_FAILURE_REPLAY__.retirements());
    await page.evaluate(() => window.__X36_FAILURE_REPLAY__.clear('Browser retirement probe.'));
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__X36_FAILURE_REPLAY__.report()), null);
    assert.equal(await page.evaluate(() => window.__X36_FAILURE_REPLAY__.activeWorkers()), 0);
    assert.equal(await page.evaluate(() => window.__X36_FAILURE_REPLAY__.retirements()), beforeClear + 2);

    await open(); await page.dispatchEvent('#reset', 'click');
    assert.equal(await page.evaluate(() => window.__X36_FAILURE_REPLAY__.phase()), 'empty');
    await open(); await page.fill('#source', `${await page.inputValue('#source')}\n`);
    assert.equal(await page.evaluate(() => window.__X36_FAILURE_REPLAY__.phase()), 'empty');
    await open();
    const savePromise = page.waitForEvent('download'); await page.click('#project-save');
    const project = await savePromise;
    await page.setInputFiles('#project-open-input', await project.path());
    if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) {
      await page.click('#unsaved-discard');
      await page.waitForFunction(() => !document.querySelector('#unsaved-change-dialog').open);
    }
    await page.waitForFunction(() => window.__X36_FAILURE_REPLAY__.phase() === 'empty');

    await open(); await page.click('#build');
    await page.waitForFunction(() => window.__X36_FAILURE_REPLAY__.phase() === 'empty');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X36_FAILURE_REPLAY__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X36_FAILURE_REPLAY__.phase()), 'empty');
    assert.equal(await page.locator('#failure-replay-export').isDisabled(), true);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1); assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    assert.deepEqual(await context.cookies(), []);
    const evidence = { schema: 'intent-mcu-x36-private-browser-evidence@1',
      suiteSha256: report.recipe.suiteSha256, semanticSha256: report.semanticSha256,
      sourceSha256: report.recipe.sourceSha256, artifactIdentity: report.recipe.artifactIdentity,
      anchor: report.repeats[0].anchor, fault: report.repeats[0].fault,
      freshWorkerNonces: report.repeats.map((repeat) => repeat.runtimeIdentity.workerInstanceNonce),
      snapshotCapability: report.snapshot.capability, omittedStateClasses: report.snapshot.omittedStateClasses,
      academicDisposition: report.classifications.execution.academicStatus,
      infrastructureDisposition: report.classifications.infrastructure.status,
      validationDisposition: report.classifications.validation.status,
      exportMatched: true, resetCleared: true, sourceEditCleared: true, openCleared: true,
      buildCleared: true, reloadCleared: true, lateCallbacksIgnoredAfterRetirement: true,
      workersDisposedOrRetired: true, overflow, browserErrors: errors.length,
      cookies: 0, thirdPartyRequests: outside.length };
    if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
