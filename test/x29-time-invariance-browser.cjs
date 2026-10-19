// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X29_TIME_URL || 'http://127.0.0.1:18797';
const screenshot = process.env.X29_SCREENSHOT_PATH;
const evidencePath = process.env.X29_EVIDENCE_PATH;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1732, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage(); const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X29_TIME_INVARIANCE__?.ready === true);
    const report = await page.evaluate(() => window.__X29_TIME_INVARIANCE__.run());
    assert.equal(report.schema, 'intent-mcu-time-invariance-report@1');
    assert.deepEqual(report.executions.map((entry) => entry.executionId),
      ['X29-REFERENCE-1X', 'X29-MAXIMUM', 'X29-PAUSE-RESUME']);
    assert.deepEqual(report.executions.map((entry) => entry.outcome.academicStatus), ['passed', 'passed', 'passed']);
    assert.deepEqual(report.executions.map((entry) => entry.outcome.jobStatus), ['completed', 'completed', 'completed']);
    assert.equal(report.validationProbe.code, 'TIME_CONTRACT_WALL_REQUIREMENT_FORBIDDEN');
    assert.equal(report.validationProbe.academicOutcomeCreated, false);
    const pause = report.executions[2].actual.pauseProbe;
    assert.deepEqual(pause.after, pause.before);
    assert.equal(pause.requirementSatisfiedBeforeWait, false);
    assert.equal(pause.requirementSatisfiedAfterWait, false);
    assert.ok(pause.wallWaitMilliseconds >= 150);
    assert.equal(await page.evaluate(() => window.__X29_TIME_INVARIANCE__.passed()), true);
    assert.equal((await page.locator('#time-invariance-state').textContent()).trim(), '3/3 passed · wall requirement rejected');
    assert.deepEqual(await page.locator('.time-invariance-cell strong').allTextContents(),
      ['Reference · 1×', 'Maximum pacing', 'Pause and resume']);
    assert.equal(await page.locator('.time-invariance-raw').count(), 3);
    await page.locator('.time-invariance-raw summary').first().focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.time-invariance-raw').first().getAttribute('open'), '');
    const exportPromise = page.waitForEvent('download'); await page.click('#time-invariance-export');
    const exported = await exportPromise; const exportedReport = JSON.parse(fs.readFileSync(await exported.path(), 'utf8'));
    assert.equal(exportedReport.semanticSha256, report.semanticSha256);
    if (await page.getAttribute('#serial-tab', 'aria-expanded') !== 'true') await page.click('#serial-tab');
    await page.locator('#time-invariance').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const dock = document.querySelector('#serial-dock').getBoundingClientRect();
      const badges = [...document.querySelectorAll('#time-invariance-results .long-duration-outcome-badge')];
      return { serialNoOverlap: main.right <= dock.left + 1,
        badgesSingleLine: badges.every((node) => node.getClientRects().length === 1),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(layout.serialNoOverlap, true); assert.equal(layout.badgesSingleLine, true); assert.ok(layout.overflow <= 1);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });
    const projectPromise = page.waitForEvent('download'); await page.click('#project-save');
    const savedProject = await projectPromise; await page.setInputFiles('#project-open-input', await savedProject.path());
    await page.waitForFunction(() => window.__X29_TIME_INVARIANCE__.report() === null);
    assert.equal((await page.locator('#time-invariance-state').textContent()).trim(), 'Not run');
    assert.equal(await page.locator('#time-invariance-export').isDisabled(), true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X29_TIME_INVARIANCE__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X29_TIME_INVARIANCE__.report()), null);
    assert.equal((await page.locator('#time-invariance-state').textContent()).trim(), 'Not run');
    assert.equal(await page.locator('#time-invariance-export').isDisabled(), true);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);
    const evidence = { schema: 'x29-private-browser-evidence@1', artifactSha256: report.artifactSha256,
      semanticSha256: report.semanticSha256, suiteSha256: report.suiteSha256,
      executions: report.executions.map((entry) => ({ executionId: entry.executionId, pacing: entry.pacing,
        ready: entry.ready, actual: entry.actual, outcome: entry.outcome, diagnostics: entry.diagnostics })),
      validationProbe: report.validationProbe, exportMatched: true, openCleared: true, reloadCleared: true,
      serialNoOverlap: true, badgesSingleLine: true, overflow: layout.overflow,
      browserErrors: 0, cookies: 0, thirdPartyRequests: 0 };
    if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
