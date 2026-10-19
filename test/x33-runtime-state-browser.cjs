// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X33_RUNTIME_URL || 'http://127.0.0.1:18821';
const evidencePath = process.env.X33_RUNTIME_EVIDENCE_PATH;
const screenshot = process.env.X33_RUNTIME_SCREENSHOT_PATH;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1732, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage(); const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__X33_RUNTIME_DIGITAL_STATE__?.ready === true);
    const panel = await page.locator('#digital-state-runtime').locator('xpath=..').textContent();
    assert.match(panel, /ACTUAL PIN PRODUCERS \/ IDEAL NET CLASSIFICATION/u);
    assert.match(panel, /raw false pin sample is never valid LOW authority/u);
    assert.match(panel, /No avr8js wire coupling/u);
    const workerCreationsBefore = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
    const report = await page.evaluate(() => window.__X33_RUNTIME_DIGITAL_STATE__.run());
    assert.equal(await page.evaluate(() => window.__X33_RUNTIME_DIGITAL_STATE__.passed()), true);
    assert.equal(report.repeats.length, 2);
    assert.deepEqual(report.runtime, { engine: 'avr8js', version: '0.21.1',
      workerIdentitySchema: 'intent-mcu-worker-runtime-identity@1' });
    assert.equal(report.toolchainImageId, 'sha256:62e4324594b63e88b17052a17eb9edf52593aff7d907647bc1e9c2fd809fbc74');
    assert.notEqual(report.repeats[0].runtimeBinding.runtimeGeneration, report.repeats[1].runtimeBinding.runtimeGeneration);
    assert.notEqual(report.repeats[0].runtimeIdentity.workerInstanceNonce, report.repeats[1].runtimeIdentity.workerInstanceNonce);
    assert.deepEqual(report.repeats[0].rows.map((row) => row.resolution), ['HIGH_Z', 'LOW', 'CONFLICT']);
    assert.deepEqual(report.repeats[0].rows.map((row) => row.requirement.academicVerdict), [null, 'passed', null]);
    assert.deepEqual(report.repeats[0].pins.D2, { pin: 'D2', mode: 'INPUT', level: false,
      externalDrive: 'RELEASED', pwm: null, diagnostic: 'OK' });
    assert.deepEqual(report.repeats[0].pins.D5, { pin: 'D5', mode: 'INPUT', level: false,
      externalDrive: 'LOW', pwm: null, diagnostic: 'OK' });
    assert.deepEqual(report.repeats[0].pins.D3, { pin: 'D3', mode: 'OUTPUT', level: true,
      externalDrive: 'RELEASED', pwm: null, diagnostic: 'OK' });
    assert.deepEqual(report.repeats[0].pins.D4, { pin: 'D4', mode: 'OUTPUT', level: false,
      externalDrive: 'RELEASED', pwm: null, diagnostic: 'OK' });
    assert.ok(Object.values(report.validationProbes).every(Boolean));
    assert.deepEqual(report.topology.endpoints,
      [{ component: 'board-1', pin: 'D3' }, { component: 'board-1', pin: 'D4' }]);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workerCreationsBefore);
    assert.equal((await page.locator('#digital-state-runtime-state').textContent()).trim(),
      '3 classifications · 2/2 fresh workers passed');

    const downloadPromise = page.waitForEvent('download');
    await page.click('#digital-state-runtime-export');
    const download = await downloadPromise;
    assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(), 'utf8')), report);
    if (await page.getAttribute('#serial-tab', 'aria-expanded') !== 'true') await page.click('#serial-tab');
    await page.locator('#digital-state-runtime').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const dock = document.querySelector('#serial-dock').getBoundingClientRect();
      return { serialNoOverlap: main.right <= dock.left + 1,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(layout.serialNoOverlap, true); assert.ok(layout.overflow <= 1);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });

    await page.dispatchEvent('#reset', 'click');
    await page.waitForFunction(() => window.__X33_RUNTIME_DIGITAL_STATE__.report() === null);
    await page.locator('#source').fill(`${await page.locator('#source').inputValue()}\n// X33 lifecycle edit`);
    assert.equal(await page.evaluate(() => window.__X33_RUNTIME_DIGITAL_STATE__.report()), null);
    await page.click('#project-demo');
    assert.equal(await page.evaluate(() => window.__X33_RUNTIME_DIGITAL_STATE__.report()), null);
    await page.dispatchEvent('#build', 'click');
    assert.equal(await page.evaluate(() => window.__X33_RUNTIME_DIGITAL_STATE__.report()), null);
    await page.dispatchEvent('#cancel', 'click');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X33_RUNTIME_DIGITAL_STATE__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X33_RUNTIME_DIGITAL_STATE__.report()), null);
    assert.equal(await page.locator('#digital-state-runtime-export').isDisabled(), true);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);

    const evidence = { schema: 'x33-runtime-private-browser-evidence@1',
      suiteSha256: report.suiteSha256, sourceSha256: report.sourceSha256,
      artifactIdentity: report.artifactIdentity, inputIdentity: report.inputIdentity,
      toolchainImageId: report.toolchainImageId, topologySha256: report.topologySha256,
      semanticSha256: report.semanticSha256, repeatSemanticSha256: report.repeatSemanticSha256,
      runtimeGenerationsDistinct: true, workerNoncesDistinct: true,
      states: report.repeats[0].rows.map((row) => row.resolution), negativeProbes: report.validationProbes,
      exactTwoEndpointTopology: true, exportMatched: true,
      resetCleared: true, sourceEditRemainedCleared: true, openRemainedCleared: true,
      buildRemainedCleared: true, reloadCleared: true, unrelatedPublicWorkerCreations: 0,
      serialNoOverlap: true, overflow: layout.overflow, browserErrors: 0, cookies: 0,
      thirdPartyRequests: 0 };
    if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
