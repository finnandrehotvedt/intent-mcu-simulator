// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X23_USART_URL || 'http://127.0.0.1:18815';
const screenshot = process.env.X23_USART_SCREENSHOT_PATH;
const evidencePath = process.env.X23_USART_EVIDENCE_PATH;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1732, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage(); const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X23_USART_RESPONSE__?.ready === true);
    await page.locator('#usart-response').scrollIntoViewIfNeeded();
    const report = await page.evaluate(() => window.__X23_USART_RESPONSE__.run());
    assert.equal(report.schema, 'intent-mcu-x23-usart-response-report@1');
    assert.equal(report.runs.length, 5);
    assert.equal(await page.evaluate(() => window.__X23_USART_RESPONSE__.passed()), true);
    assert.equal(new Set(report.runs.map((run) => run.runtimeIdentity.workerInstanceNonce)).size, 5);
    assert.equal(new Set(report.runs.map((run) => run.runtimeBinding.runtimeGeneration)).size, 5);
    for (const run of report.runs) {
      assert.equal(run.request.value, 0x3f); assert.equal(run.fixture.responseDelayCycles, 20);
      assert.equal(run.rxRequest.accepted, true); assert.ok(run.rxComplete.cycle > run.rxRequest.cycle);
      assert.deepEqual(run.retentionDrops, { logic: 0, serial: 0, adc: 0, unsupported: 0 });
      assert.equal(run.classifications.infrastructure.status, 'completed');
      assert.equal(run.classifications.validation.status, 'accepted');
    }
    assert.deepEqual(report.runs.slice(0, 2).map((run) => [run.consumer.serialText, run.consumer.d13]),
      [['OK\n', false], ['OK\n', false]]);
    assert.deepEqual(report.runs.slice(2, 4).map((run) => [run.consumer.serialText, run.consumer.d13]),
      [['ERR\n', true], ['ERR\n', true]]);
    assert.equal(report.runs[4].classifications.academic.academicStatus, 'failed');
    assert.deepEqual([report.runs[4].consumer.serialText, report.runs[4].consumer.d13], ['OK\n', false]);
    assert.match(await page.locator('#usart-response-state').textContent(), /4 passed.*known-bad failed.*5 completed/u);
    assert.match(await page.locator('#usart-response ~ .regression-matrix-limit').first().textContent(), /generic bus/iu);

    const downloadPromise = page.waitForEvent('download'); await page.click('#usart-response-export');
    const download = await downloadPromise; const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.deepEqual(exported, report);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });

    await page.dispatchEvent('#reset', 'click');
    assert.equal(await page.evaluate(() => window.__X23_USART_RESPONSE__.report()), null);
    assert.equal(await page.locator('#usart-response-export').isDisabled(), true);
    await page.evaluate(() => window.__X23_USART_RESPONSE__.run());
    await page.fill('#source', `${await page.inputValue('#source')}\n`);
    assert.equal(await page.evaluate(() => window.__X23_USART_RESPONSE__.report()), null);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X23_USART_RESPONSE__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X23_USART_RESPONSE__.report()), null);
    assert.equal(await page.locator('#usart-response-export').isDisabled(), true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1); assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    assert.deepEqual(await context.cookies(), []);
    const evidence = { schema: 'intent-mcu-x23-usart-private-browser-evidence@1',
      suiteSha256: report.recipe.suiteSha256, semanticSha256: report.semanticSha256,
      sourceSha256: report.recipe.sourceSha256, artifactIdentity: report.recipe.artifactIdentity,
      knownBadSourceSha256: report.recipe.knownBadSourceSha256,
      knownBadArtifactIdentity: report.recipe.knownBadArtifactIdentity,
      freshWorkerNonces: report.runs.map((run) => run.runtimeIdentity.workerInstanceNonce),
      expectedRepeatSha256: report.repeatHashes.expected,
      incorrectRepeatSha256: report.repeatHashes.incorrect,
      knownBadAcademicStatus: report.runs[4].classifications.academic.academicStatus,
      exportMatched: true, resetCleared: true, sourceEditCleared: true, reloadCleared: true,
      workersDisposedOrRetired: await page.evaluate(() => window.__X23_USART_RESPONSE__.activeWorkers()) === 0,
      overflow, browserErrors: errors.length, cookies: 0, thirdPartyRequests: outside.length };
    if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
