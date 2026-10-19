// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X31_RESET_URL || 'http://127.0.0.1:18802';
const screenshot = process.env.X31_SCREENSHOT_PATH;
const evidencePath = process.env.X31_EVIDENCE_PATH;

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
    await page.waitForFunction(() => window.__X31_RESET_CLASSES__?.ready === true);
    const report = await page.evaluate(() => window.__X31_RESET_CLASSES__.run());
    assert.equal(report.schema, 'intent-mcu-reset-class-report@1');
    assert.equal(report.executions.length, 6);
    assert.deepEqual([...new Set(report.executions.map(({ resetClass }) => resetClass))],
      ['cpu-reset', 'experiment-restart', 'power-on']);
    for (const execution of report.executions) {
      assert.equal(execution.before.volatileByte, 0xa5);
      assert.equal(execution.after.volatileByte, 0);
      assert.equal(execution.after.cpuCycles, 0);
      assert.equal(execution.after.instructions, 0);
      assert.equal(execution.outcome.academicStatus, 'passed');
      assert.equal(execution.outcome.jobStatus, 'completed');
      if (execution.resetClass === 'cpu-reset') {
        assert.deepEqual(execution.after.controls, { potPosition: 0.75, buttonPressed: true });
        assert.equal(execution.workerGenerationRetired, false);
      } else if (execution.resetClass === 'experiment-restart') {
        assert.deepEqual(execution.after.controls, { potPosition: 0.25, buttonPressed: false });
        assert.equal(execution.after.inputLog, 2);
      } else {
        assert.deepEqual(execution.after.controls, { potPosition: 0.5, buttonPressed: false });
        assert.equal(execution.workerGenerationRetired, true);
      }
    }
    assert.equal(report.validationProbe.academicOutcomeCreated, false);
    assert.equal(report.infrastructureProbe.academicOutcomeCreated, false);
    assert.equal(report.evidenceFailureProbe.outcome.academicStatus, 'failed');
    assert.equal(await page.evaluate(() => window.__X31_RESET_CLASSES__.passed()), true);
    assert.equal((await page.locator('#reset-class-state').textContent()).trim(), '3 classes · 2/2 repeats each');
    assert.deepEqual(await page.locator('.reset-class-cell strong').allTextContents(),
      ['CPU reset', 'Experiment restart', 'Power-on · fresh worker']);
    assert.equal(await page.locator('.reset-class-raw').count(), 3);
    await page.locator('.reset-class-raw summary').first().focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.reset-class-raw').first().getAttribute('open'), '');
    const exportPromise = page.waitForEvent('download'); await page.click('#reset-class-export');
    const exported = await exportPromise; const exportPath = await exported.path();
    const exportBytes = fs.statSync(exportPath).size;
    assert.deepEqual(JSON.parse(fs.readFileSync(exportPath, 'utf8')), report);
    if (await page.getAttribute('#serial-tab', 'aria-expanded') !== 'true') await page.click('#serial-tab');
    await page.locator('#reset-class').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const dock = document.querySelector('#serial-dock').getBoundingClientRect();
      const badges = [...document.querySelectorAll('#reset-class-results .long-duration-outcome-badge')];
      return { serialNoOverlap: main.right <= dock.left + 1,
        badgesSingleLine: badges.every((node) => node.getClientRects().length === 1),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(layout.serialNoOverlap, true); assert.equal(layout.badgesSingleLine, true); assert.ok(layout.overflow <= 1);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });
    const projectPromise = page.waitForEvent('download'); await page.click('#project-save');
    const project = await projectPromise; await page.setInputFiles('#project-open-input', await project.path());
    await page.waitForFunction(() => window.__X31_RESET_CLASSES__.report() === null);
    assert.equal((await page.locator('#reset-class-state').textContent()).trim(), 'Not run');
    assert.equal(await page.locator('#reset-class-export').isDisabled(), true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X31_RESET_CLASSES__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X31_RESET_CLASSES__.report()), null);
    assert.equal((await page.locator('#reset-class-state').textContent()).trim(), 'Not run');
    assert.equal(await page.locator('#reset-class-export').isDisabled(), true);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);
    const evidence = { schema: 'x31-private-browser-evidence@1',
      suiteSha256: report.suiteSha256, semanticSha256: report.semanticSha256,
      artifactSha256: report.artifactSha256, classSemanticSha256: report.classSemanticSha256,
      executions: report.executions, validationProbe: report.validationProbe,
      infrastructureProbe: report.infrastructureProbe, evidenceFailureProbe: report.evidenceFailureProbe,
      exportBytes, exportMatched: true, openCleared: true, reloadCleared: true,
      nativeDetails: true, serialNoOverlap: true, badgesSingleLine: true,
      overflow: layout.overflow, browserErrors: 0, cookies: 0, thirdPartyRequests: 0 };
    if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
