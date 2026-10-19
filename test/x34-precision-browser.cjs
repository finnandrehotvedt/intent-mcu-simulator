// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X34_URL || 'http://127.0.0.1:18809';
const evidencePath = process.env.X34_EVIDENCE_PATH;
const screenshot = process.env.X34_SCREENSHOT_PATH;

async function run(page) {
  const report = await page.evaluate(() => window.__X34_PRECISION_CHECK__.run());
  assert.equal(await page.evaluate(() => window.__X34_PRECISION_CHECK__.passed()), true);
  return report;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1732, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage(); const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X34_PRECISION_CHECK__?.ready === true);
    const panel = await page.locator('#precision-check').locator('xpath=..').textContent();
    assert.match(panel, /INSTRUMENTED AVR FIXTURE — NOT THE UNMODIFIED PUBLIC ARTIFACT/u);
    assert.match(panel, /firmware-owned four-byte SRAM mailbox/u);
    assert.match(panel, /UART and host recomputation are corroboration only/u);

    await page.click('#project-demo');
    await page.waitForFunction(() => window.__M6_STATE__?.lifecycle?.phase === 'editing');
    await page.click('#build');
    await page.waitForFunction(() => window.__M6_STATE__?.runtime?.kind === 'ready', null, { timeout: 45_000 });
    const normalReady = await page.evaluate(() => window.__M6_STATE__.runtime.runtimeIdentity);
    assert.equal(normalReady.schema, 'intent-mcu-worker-runtime-identity@1');
    await page.click('#run');
    await page.waitForFunction(() => window.__M6_STATE__?.runtime?.paused === false
      && window.__M6_STATE__.runtime.cycle > 0);
    await page.click('#pause');
    await page.waitForFunction(() => window.__M6_STATE__?.runtime?.kind === 'paused');
    const normalPaused = await page.evaluate(() => window.__M6_STATE__.runtime.runtimeIdentity);
    assert.deepEqual(normalPaused, normalReady);

    const first = await run(page);
    assert.equal(first.schema, 'intent-mcu-x34-instrumented-precision-report@1');
    assert.equal(first.repeats.length, 2);
    assert.notEqual(first.repeats[0].runtimeBinding.runtimeGeneration, first.repeats[1].runtimeBinding.runtimeGeneration);
    assert.notEqual(first.repeats[0].runtimeIdentity.workerInstanceNonce, first.repeats[1].runtimeIdentity.workerInstanceNonce);
    assert.equal(first.repeats[0].firmwareTransaction.temperatureC, 30);
    assert.equal(first.repeats[0].firmwareTransaction.d13Level, 0);
    assert.equal(first.repeats[0].adc.value, 414);
    assert.equal(first.repeats[0].pin.level, false);
    assert.equal(first.repeats[0].voltage.numerator, 81);
    assert.equal(first.repeats[0].voltage.denominator, 40);
    assert.equal(first.repeatSemanticSha256.length, 64);
    assert.equal((await page.locator('#precision-check-state').textContent()).trim(), '6 joins · 2/2 fresh workers passed');
    assert.deepEqual(await page.locator('.precision-check-table thead th').allTextContents(),
      ['Quantity', 'Unit / resolution', 'Observed producer', 'Comparison', 'Outcome / provenance']);

    const exportPromise = page.waitForEvent('download'); await page.click('#precision-check-export');
    const exported = await exportPromise; const exportedReport = JSON.parse(fs.readFileSync(await exported.path(), 'utf8'));
    assert.deepEqual(exportedReport, first);
    if (await page.getAttribute('#serial-tab', 'aria-expanded') !== 'true') await page.click('#serial-tab');
    await page.locator('#precision-check').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const dock = document.querySelector('#serial-dock').getBoundingClientRect();
      return { serialNoOverlap: main.right <= dock.left + 1,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(layout.serialNoOverlap, true); assert.ok(layout.overflow <= 1);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });

    await page.dispatchEvent('#reset', 'click');
    await page.waitForFunction(() => window.__X34_PRECISION_CHECK__.report() === null);
    await run(page);
    await page.locator('#source').fill(`${await page.locator('#source').inputValue()}\n// X34 lifecycle edit`);
    await page.waitForFunction(() => window.__X34_PRECISION_CHECK__.report() === null);
    await run(page);
    const projectPromise = page.waitForEvent('download'); await page.click('#project-save');
    const project = await projectPromise; const projectPath = await project.path();
    const projectText = fs.readFileSync(projectPath, 'utf8');
    assert.doesNotMatch(projectText, /intent_x34_probe_v1|x34Probe|workerInstanceNonce|elfBase64/u);
    await page.setInputFiles('#project-open-input', projectPath);
    await page.waitForFunction(() => window.__X34_PRECISION_CHECK__.report() === null);
    await run(page);
    await page.dispatchEvent('#build', 'click');
    await page.waitForFunction(() => window.__X34_PRECISION_CHECK__.report() === null);
    await page.dispatchEvent('#cancel', 'click');
    await run(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X34_PRECISION_CHECK__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X34_PRECISION_CHECK__.report()), null);
    assert.equal(await page.locator('#precision-check-export').isDisabled(), true);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);

    const evidence = { schema: 'x34-private-browser-evidence@1', suiteSha256: first.suiteSha256,
      artifactIdentity: first.artifactIdentity, sourceSha256: first.sourceSha256,
      symbol: first.symbol, semanticSha256: first.semanticSha256,
      repeatSemanticSha256: first.repeatSemanticSha256,
      runtimeGenerationsDistinct: true, workerNoncesDistinct: true,
      normalWorkerReadyStatusIdentityStable: true,
      firmwareTemperatureC: 30, mailboxD13: 0, adcCount: 414, actualD13: false,
      exportMatched: true, resetCleared: true, sourceEditCleared: true, openCleared: true,
      projectFileExcludedProbeAuthority: true, buildCleared: true, reloadCleared: true,
      serialNoOverlap: true, overflow: layout.overflow,
      browserErrors: 0, cookies: 0, thirdPartyRequests: 0 };
    if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
