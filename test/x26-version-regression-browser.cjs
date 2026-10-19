// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X26_VERSION_URL || 'http://127.0.0.1:18819';
const output = process.env.X26_VERSION_EVIDENCE_PATH;
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
    const page = await context.newPage(); const errors = []; const outside = []; let buildRequests = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/build') buildRequests += 1;
    });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X26_VERSION_REGRESSION__?.ready === true);
    await page.click('#project-demo');
    await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('loaded'));
    assert.equal(await page.evaluate(() => window.__X26_VERSION_REGRESSION__.report()), null);
    assert.equal(await page.locator('#version-regression-export').isDisabled(), true);
    assert.match(await page.locator('#version-regression').locator('xpath=..').textContent(), /same pinned model, toolchain and runtime set/iu);
    assert.match(await page.locator('#version-regression').locator('xpath=..').textContent(), /not a compiler-version, MCU-revision or physical-hardware comparison/iu);

    const initialSave = page.waitForEvent('download'); await page.click('#project-save');
    const projectDownload = await initialSave; const projectPath = await projectDownload.path();

    const report = await page.evaluate(() => window.__X26_VERSION_REGRESSION__.loadReviewed());
    assert.equal(await page.evaluate(() => window.__X26_VERSION_REGRESSION__.passed()), true);
    assert.equal(await page.evaluate(() => window.__X26_VERSION_REGRESSION__.activeWorkers()), 0);
    assert.equal(report.results.length, 4); assert.equal(report.conclusion.jobsCompleted, 8);
    assert.equal(report.comparisonPolicy.freshExecutionOnLoad, false);
    const exportEvent = page.waitForEvent('download'); await page.click('#version-regression-export');
    const exported = await exportEvent; const exportedReport = JSON.parse(fs.readFileSync(await exported.path(), 'utf8'));
    assert.deepEqual(exportedReport, report);

    const negative = await page.evaluate(() => window.__X26_VERSION_REGRESSION__.syntheticNegative());
    assert.deepEqual(negative, { accepted: false, code: 'X26_VERSION_REPORT_DRIFT', synthetic: true, producerRuns: 0 });
    assert.equal(await page.evaluate(() => window.__X26_VERSION_REGRESSION__.report()), null);
    assert.equal(await page.locator('#version-regression-export').isDisabled(), true);

    await page.evaluate(() => window.__X26_VERSION_REGRESSION__.loadReviewed());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X26_VERSION_REGRESSION__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X26_VERSION_REGRESSION__.report()), null);

    await page.evaluate(() => window.__X26_VERSION_REGRESSION__.loadReviewed());
    await page.locator('#source').fill(`${await page.locator('#source').inputValue()} `);
    assert.equal(await page.evaluate(() => window.__X26_VERSION_REGRESSION__.report()), null);

    await page.evaluate(() => window.__X26_VERSION_REGRESSION__.loadReviewed());
    await page.evaluate(() => window.__X26_VERSION_REGRESSION__.retire());
    assert.equal(await page.evaluate(() => window.__X26_VERSION_REGRESSION__.report()), null);

    await page.evaluate(() => window.__X26_VERSION_REGRESSION__.loadReviewed());
    const buildRequest = page.waitForRequest((request) => request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/build');
    await page.click('#build');
    await buildRequest;
    await page.waitForFunction(() => window.__X26_VERSION_REGRESSION__.report() === null);
    await page.waitForFunction(() => !document.querySelector('#build').disabled, null, { timeout: 30_000 });
    assert.equal(buildRequests, 1);

    await page.waitForFunction(() => !document.querySelector('#reset').disabled, null, { timeout: 30_000 });
    await page.evaluate(() => window.__X26_VERSION_REGRESSION__.loadReviewed());
    await page.click('#reset');
    assert.equal(await page.evaluate(() => window.__X26_VERSION_REGRESSION__.report()), null);

    await page.evaluate(() => window.__X26_VERSION_REGRESSION__.loadReviewed());
    await page.setInputFiles('#project-open-input', projectPath);
    if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) {
      await page.click('#unsaved-discard');
      await page.waitForFunction(() => !document.querySelector('#unsaved-change-dialog').open);
    }
    assert.equal(await page.evaluate(() => window.__X26_VERSION_REGRESSION__.report()), null);
    assert.equal(await page.locator('#version-regression-export').isDisabled(), true);

    if (await page.getAttribute('#serial-tab', 'aria-expanded') !== 'true') await page.click('#serial-tab');
    await page.locator('#version-regression').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      serialNoOverlap: document.querySelector('main').getBoundingClientRect().right
        <= document.querySelector('#serial-dock').getBoundingClientRect().left + 1,
    }));
    assert.ok(layout.overflow <= 1); assert.equal(layout.serialNoOverlap, true);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);
    if (process.env.X26_VERSION_SCREENSHOT_PATH) await page.screenshot({ path: process.env.X26_VERSION_SCREENSHOT_PATH, fullPage: true });
    const evidence = { schema: 'intent-mcu-x26-version-browser-evidence@1', semanticSha256: report.semanticSha256,
      exportedExact: true, syntheticRejectedWithoutProducerRun: true, reloadCleared: true,
      sourceEditCleared: true, workerRetirementCleared: true, resetCleared: true,
      buildCleared: true, openCleared: true, activeWorkers: 0, buildRequests,
      x26ProducerRunsDuringReview: 0, serialNoOverlap: true, overflow: layout.overflow,
      browserErrors: 0, cookies: 0, thirdPartyRequests: 0 };
    if (output) fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
