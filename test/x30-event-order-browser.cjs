// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X30_ORDER_URL || 'http://127.0.0.1:18800';
const screenshot = process.env.X30_SCREENSHOT_PATH;
const evidencePath = process.env.X30_EVIDENCE_PATH;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1732, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X30_EVENT_ORDER__?.ready === true);
    const report = await page.evaluate(() => window.__X30_EVENT_ORDER__.run());
    assert.equal(report.schema, 'intent-mcu-event-order-report@1');
    assert.deepEqual(report.executions.map((entry) => entry.executionId), ['X30-REPEAT-A', 'X30-REPEAT-B']);
    assert.deepEqual(report.executions.map((entry) => entry.outcome.academicStatus), ['passed', 'passed']);
    assert.deepEqual(report.executions.map((entry) => entry.outcome.jobStatus), ['completed', 'completed']);
    assert.deepEqual(report.executions.map((entry) => entry.phases.map((phase) => phase.phase)), [
      ['RESET_BARRIER', 'INPUT_ORDINAL_ASC', 'PRE_EXECUTION_SAMPLE', 'CPU_EXECUTION', 'FINAL_SAMPLE'],
      ['RESET_BARRIER', 'INPUT_ORDINAL_ASC', 'PRE_EXECUTION_SAMPLE', 'CPU_EXECUTION', 'FINAL_SAMPLE'],
    ]);
    for (const execution of report.executions) {
      assert.equal(execution.preReset.pendingBeforeReset, 1);
      assert.equal(execution.preReset.resetCleared, true);
      assert.equal(execution.preReset.generationRetired, true);
      const [reset, input, preSample, cpu, finalSample] = execution.phases.map((phase) => phase.producer);
      assert.equal(reset.pending.length, 0);
      assert.equal(reset.inputLog.length, 0);
      assert.deepEqual(input.inputLog.map((entry) => [entry.sequence, entry.targetCycle,
        entry.componentId]), [[1, 0, 'pot-1'], [2, 0, 'button-1']]);
      assert.deepEqual(preSample, input);
      assert.deepEqual(finalSample, cpu);
      assert.equal(preSample.cpuCycles, 0);
      assert.equal(preSample.instructions, 0);
      assert.equal(cpu.d13, true);
      assert.ok(cpu.cpuCycles >= 1_600_000 && cpu.cpuCycles <= 2_400_000);
      assert.ok(cpu.d13HighCycle > 0 && cpu.d13HighCycle <= cpu.cpuCycles);
      assert.ok(cpu.uartMarkerCycle > 0 && cpu.uartMarkerCycle <= cpu.cpuCycles);
    }
    assert.equal(report.validationProbe.status, 'rejected-before-execution');
    assert.equal(report.validationProbe.code, 'EVENT_ORDER_ORDINAL_SEQUENCE');
    assert.equal(report.validationProbe.academicOutcomeCreated, false);
    assert.equal(report.evidenceFailureProbe.status, 'failed-as-expected');
    assert.equal(report.evidenceFailureProbe.outcome.academicStatus, 'failed');
    assert.equal(report.evidenceFailureProbe.outcome.jobStatus, 'completed');
    assert.deepEqual(report.evidenceFailureProbe.outcome.reasons, ['EVENT_ORDER_OLD_PENDING_RETIRED']);
    assert.equal(await page.evaluate(() => window.__X30_EVENT_ORDER__.passed()), true);
    assert.equal((await page.locator('#event-order-state').textContent()).trim(), '2/2 repeats · semantic parity');
    assert.deepEqual(await page.locator('.event-order-cell strong').allTextContents(), [
      'Reset barrier', 'Inputs · ordinal 1 → 2', 'Read-only sample', 'CPU execution', 'Final read-only sample',
    ]);
    assert.equal(await page.locator('.event-order-raw').count(), 5);
    await page.locator('.event-order-raw summary').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.event-order-raw').first().getAttribute('open'), '');
    const exportPromise = page.waitForEvent('download');
    await page.click('#event-order-export');
    const exported = await exportPromise;
    const exportedReport = JSON.parse(fs.readFileSync(await exported.path(), 'utf8'));
    assert.deepEqual(exportedReport, report);
    if (await page.getAttribute('#serial-tab', 'aria-expanded') !== 'true') await page.click('#serial-tab');
    await page.locator('#event-order').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const dock = document.querySelector('#serial-dock').getBoundingClientRect();
      const badges = [...document.querySelectorAll('#event-order-results .long-duration-outcome-badge')];
      return { serialNoOverlap: main.right <= dock.left + 1,
        badgesSingleLine: badges.every((node) => node.getClientRects().length === 1),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(layout.serialNoOverlap, true);
    assert.equal(layout.badgesSingleLine, true);
    assert.ok(layout.overflow <= 1);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });
    const projectPromise = page.waitForEvent('download');
    await page.click('#project-save');
    const savedProject = await projectPromise;
    await page.setInputFiles('#project-open-input', await savedProject.path());
    await page.waitForFunction(() => window.__X30_EVENT_ORDER__.report() === null);
    assert.equal((await page.locator('#event-order-state').textContent()).trim(), 'Not run');
    assert.equal(await page.locator('#event-order-export').isDisabled(), true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X30_EVENT_ORDER__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X30_EVENT_ORDER__.report()), null);
    assert.equal((await page.locator('#event-order-state').textContent()).trim(), 'Not run');
    assert.equal(await page.locator('#event-order-export').isDisabled(), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    assert.deepEqual(await context.cookies(), []);
    const evidence = {
      schema: 'x30-private-browser-evidence@1', artifactSha256: report.artifactSha256,
      semanticSha256: report.semanticSha256, suiteSha256: report.suiteSha256,
      repeatSemanticSha256: report.repeatSemanticSha256,
      executions: report.executions, validationProbe: report.validationProbe,
      evidenceFailureProbe: report.evidenceFailureProbe,
      exportMatched: true, openCleared: true, reloadCleared: true,
      sampleReadOnly: true, oldPendingRetired: true, repeatSemanticParity: true,
      serialNoOverlap: true, badgesSingleLine: true, overflow: layout.overflow,
      browserErrors: 0, cookies: 0, thirdPartyRequests: 0,
    };
    if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
