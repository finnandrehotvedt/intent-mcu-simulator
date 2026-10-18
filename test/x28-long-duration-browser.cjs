// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X28_LONG_DURATION_URL || 'http://127.0.0.1:18794';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
    const page = await context.newPage(); const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X28_LONG_DURATION__?.ready === true);
    assert.match(await page.textContent('#regression-matrix'), /fixture-only timer shortcut/u);
    const report = await page.evaluate(() => window.__X28_LONG_DURATION__.run());
    assert.equal(report.schema, 'intent-mcu-long-duration-report@1');
    assert.deepEqual(report.results.map((result) => result.outcome.academicStatus), ['passed', 'passed', 'passed']);
    assert.equal(report.knownBad.outcome.academicStatus, 'failed');
    assert.equal(report.knownBad.outcome.jobStatus, 'completed');
    assert.equal(report.knownBad.actual.failedAsExpected, true);
    assert.equal(await page.evaluate(() => window.__X28_LONG_DURATION__.passed()), true);
    assert.equal((await page.textContent('#long-duration-state')).trim(), '3/3 passed · known-bad rejected');
    const semantic = report.semanticSha256;
    const downloadPromise = page.waitForEvent('download');
    await page.click('#project-save');
    const savedProject = await downloadPromise;
    await page.setInputFiles('#project-open-input', await savedProject.path());
    await page.waitForFunction(() => window.__X28_LONG_DURATION__.report() === null);
    assert.equal((await page.textContent('#long-duration-state')).trim(), 'Not run');
    assert.equal(await page.isDisabled('#long-duration-export'), true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X28_LONG_DURATION__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X28_LONG_DURATION__.report()), null);
    assert.equal((await page.textContent('#long-duration-state')).trim(), 'Not run');
    assert.equal(await page.isDisabled('#long-duration-export'), true);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);
    assert.ok(semantic.length === 64);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
    process.stdout.write(`${JSON.stringify({ artifactSha256: report.artifactSha256,
      semanticSha256: report.semanticSha256, sourceSha256: report.sourceSha256,
      cells: report.results.map((result) => ({ cellId: result.cellId,
        academicStatus: result.outcome.academicStatus, jobStatus: result.outcome.jobStatus })),
      knownBad: { academicStatus: report.knownBad.outcome.academicStatus,
        jobStatus: report.knownBad.outcome.jobStatus, failedAsExpected: report.knownBad.actual.failedAsExpected },
      openCleared: true, reloadRestoredAuthority: false, errors: 0,
      cookies: 0, thirdPartyRequests: 0, overflow: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
