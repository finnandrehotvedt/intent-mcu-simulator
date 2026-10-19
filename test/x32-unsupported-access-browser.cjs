// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X32_ACCESS_URL || 'http://127.0.0.1:18805';
const screenshot = process.env.X32_SCREENSHOT_PATH;
const evidencePath = process.env.X32_EVIDENCE_PATH;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1732, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X32_UNSUPPORTED_ACCESS__?.ready === true);
    await page.click('#project-demo');

    const run = async () => {
      const report = await page.evaluate(() => window.__X32_UNSUPPORTED_ACCESS__.run());
      assert.equal(report.schema, 'intent-mcu-unsupported-access-report@1');
      assert.equal(report.executions.length, 2);
      assert.equal(report.repeatSemanticSha256.length, 64);
      for (const execution of report.executions) {
        assert.deepEqual(execution.access, { operation: 'write', peripheral: 'SPI', address: 0x4c,
          value: 0x40, cycle: 224, instructionOrdinal: 152 });
        assert.deepEqual(execution.lastSupportedObservation,
          { kind: 'gpio', pin: 'D13', level: true, cycle: 220 });
        assert.equal(execution.stop.status, 'stopped-unsupported');
        assert.equal(execution.stop.postFaultAcceptedRecords, 0);
        assert.equal(execution.outcome.academicStatus, 'unsupported');
        assert.equal(execution.outcome.jobStatus, 'completed');
      }
      assert.equal(report.goodCompanion.status, 'completed-supported');
      assert.equal(report.goodCompanion.unsupportedRecords, 0);
      assert.equal(report.classifications.compiler.status, 'rejected-before-runtime');
      assert.equal(report.classifications.validation.status, 'rejected-before-execution');
      assert.equal(report.classifications.runtimeCapability.status, 'stopped-unsupported');
      assert.equal(report.classifications.infrastructure.status, 'classified-without-execution');
      assert.equal(report.classifications.academic.outcome.academicStatus, 'indeterminate');
      assert.equal(report.staleRecordProbe.priorReportRetained, true);
      assert.equal(await page.evaluate(() => window.__X32_UNSUPPORTED_ACCESS__.passed()), true);
      return report;
    };

    const first = await run();
    assert.equal((await page.locator('#unsupported-access-state').textContent()).trim(),
      'SPI stopped · 2/2 semantic repeats');
    assert.match(await page.locator('#unsupported-access-summary').textContent(),
      /unsupported, never passed/iu);
    assert.deepEqual(await page.locator('.unsupported-access-table thead th').allTextContents(),
      ['Access', 'Producer evidence', 'Runtime disposition', 'Affected requirement', 'Full evidence']);
    await page.locator('.unsupported-access-raw summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.unsupported-access-raw').getAttribute('open'), '');
    const exportPromise = page.waitForEvent('download'); await page.click('#unsupported-access-export');
    const exported = await exportPromise; const exportPath = await exported.path();
    const exportBytes = fs.statSync(exportPath).size;
    assert.deepEqual(JSON.parse(fs.readFileSync(exportPath, 'utf8')), first);
    if (await page.getAttribute('#serial-tab', 'aria-expanded') !== 'true') await page.click('#serial-tab');
    await page.locator('#unsupported-access').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const dock = document.querySelector('#serial-dock').getBoundingClientRect();
      const badges = [...document.querySelectorAll('#unsupported-access-results .long-duration-outcome-badge')];
      return { serialNoOverlap: main.right <= dock.left + 1,
        badgesSingleLine: badges.every((node) => node.getClientRects().length === 1),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(layout.serialNoOverlap, true); assert.equal(layout.badgesSingleLine, true); assert.ok(layout.overflow <= 1);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });

    await page.dispatchEvent('#reset', 'click');
    await page.waitForFunction(() => window.__X32_UNSUPPORTED_ACCESS__.report() === null);
    assert.equal((await page.locator('#unsupported-access-state').textContent()).trim(), 'Not run');

    assert.equal(await page.locator('#build').isDisabled(), false);
    await page.click('#build');
    await page.waitForFunction(() => window.__X32_UNSUPPORTED_ACCESS__.report() === null);
    await page.waitForFunction(() => ['succeeded', 'failed', 'timeout', 'cancelled'].includes(window.__M6_STATE__.buildState),
      null, { timeout: 30_000 });

    const projectPromise = page.waitForEvent('download'); await page.click('#project-save');
    const project = await projectPromise;
    await page.setInputFiles('#project-open-input', await project.path());
    await page.waitForFunction(() => window.__X32_UNSUPPORTED_ACCESS__.report() === null);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X32_UNSUPPORTED_ACCESS__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X32_UNSUPPORTED_ACCESS__.report()), null);
    assert.equal((await page.locator('#unsupported-access-state').textContent()).trim(), 'Not run');
    assert.equal(await page.locator('#unsupported-access-export').isDisabled(), true);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);

    const evidence = { schema: 'x32-private-browser-evidence@1',
      suiteSha256: first.suiteSha256, semanticSha256: first.semanticSha256,
      artifactSha256: first.artifactSha256, repeatSemanticSha256: first.repeatSemanticSha256,
      executions: first.executions, goodCompanion: first.goodCompanion,
      classifications: first.classifications, staleRecordProbe: first.staleRecordProbe,
      lifecycleAuthorityNeverRestored: true,
      exportBytes, exportMatched: true, resetCleared: true, newBuildCleared: true,
      openCleared: true, reloadCleared: true, nativeDetails: true,
      serialNoOverlap: true, badgesSingleLine: true, overflow: layout.overflow,
      browserErrors: 0, cookies: 0, thirdPartyRequests: 0 };
    if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
