// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X33_URL || 'http://127.0.0.1:18807';
const evidencePath = process.env.X33_EVIDENCE_PATH;
const screenshot = process.env.X33_SCREENSHOT_PATH;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1732, height: 1100 } });
    const page = await context.newPage(); const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    const response = await page.goto(base, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.__X33_DIGITAL_STATE__?.ready === true);
    const heading = await page.locator('#digital-state').locator('xpath=..').textContent();
    assert.match(heading, /STATIC SYNTHETIC CIRCUIT-MODEL CHECK/u);
    assert.match(heading, /does not compile firmware, execute a runtime or prove physical hardware behaviour/u);
    await page.click('#digital-state-run');
    await page.waitForFunction(() => window.__X33_DIGITAL_STATE__.report() !== null);
    const first = await page.evaluate(() => window.__X33_DIGITAL_STATE__.report());
    assert.equal(await page.evaluate(() => window.__X33_DIGITAL_STATE__.passed()), true);
    assert.equal((await page.locator('#digital-state-state').textContent()).trim(), '4 states · 2/2 semantic repeats');
    assert.deepEqual(await page.locator('.digital-state-table thead th').allTextContents(),
      ['Case', 'Producer annotations', 'Resolved / validation state', 'Requirement outcome', 'Full evidence']);
    assert.deepEqual(first.repeats[0].rows.map((row) => row.disposition),
      ['resolved-low', 'high-impedance', 'conflict', 'unknown-evidence']);
    assert.deepEqual(first.repeats[0].rows.map((row) => row.outcome?.academicStatus ?? null),
      ['passed', 'indeterminate', null, 'indeterminate']);
    assert.equal(first.repeats[0].pullupCompanion.resolution, 'PULLED_HIGH');
    assert.equal(first.strictParserProbe.resolverCalled, false);
    assert.equal(first.repeats.flatMap((repeat) => repeat.rows)
      .some((row) => row.producerAnnotations.some((item) => item.level === 'UNKNOWN')), false);
    const details = page.locator('.digital-state-raw').first(); await details.locator('summary').focus();
    await page.keyboard.press('Enter'); assert.equal(await details.getAttribute('open'), '');
    const downloadPromise = page.waitForEvent('download'); await page.click('#digital-state-export');
    const download = await downloadPromise; const exportPath = await download.path();
    const exportBytes = fs.statSync(exportPath).size;
    assert.deepEqual(JSON.parse(fs.readFileSync(exportPath, 'utf8')), first);
    if (await page.getAttribute('#serial-tab', 'aria-expanded') !== 'true') await page.click('#serial-tab');
    await page.locator('#digital-state').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const dock = document.querySelector('#serial-dock').getBoundingClientRect();
      const badges = [...document.querySelectorAll('#digital-state-results .long-duration-outcome-badge')];
      return { serialNoOverlap: main.right <= dock.left + 1,
        badgesSingleLine: badges.every((node) => node.getClientRects().length === 1),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(layout.serialNoOverlap, true); assert.equal(layout.badgesSingleLine, true); assert.ok(layout.overflow <= 1);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });

    await page.dispatchEvent('#reset', 'click');
    await page.waitForFunction(() => window.__X33_DIGITAL_STATE__.report() === null);
    await page.click('#digital-state-run');
    await page.waitForFunction(() => window.__X33_DIGITAL_STATE__.report() !== null);
    const projectPromise = page.waitForEvent('download'); await page.click('#project-save');
    const project = await projectPromise; await page.setInputFiles('#project-open-input', await project.path());
    await page.waitForFunction(() => window.__X33_DIGITAL_STATE__.report() === null);

    await page.click('#digital-state-run');
    await page.waitForFunction(() => window.__X33_DIGITAL_STATE__.report() !== null);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__X33_DIGITAL_STATE__?.ready === true);
    assert.equal(await page.evaluate(() => window.__X33_DIGITAL_STATE__.report()), null);
    assert.equal((await page.locator('#digital-state-state').textContent()).trim(), 'Not run');
    assert.equal(await page.locator('#digital-state-export').isDisabled(), true);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(await context.cookies(), []);

    const evidence = { schema: 'x33-private-browser-evidence@1', suiteSha256: first.suiteSha256,
      semanticSha256: first.semanticSha256, repeatSemanticSha256: first.repeatSemanticSha256,
      dispositions: first.repeats[0].rows.map((row) => row.disposition),
      academicStatuses: first.repeats[0].rows.map((row) => row.outcome?.academicStatus ?? null),
      pullupCompanion: first.repeats[0].pullupCompanion, strictParserProbe: first.strictParserProbe,
      exportBytes, exportMatched: true, resetCleared: true, openCleared: true,
      buildInvalidationBoundInUi: true, reloadCleared: true, nativeDetails: true,
      serialNoOverlap: true, badgesSingleLine: true, overflow: layout.overflow,
      browserErrors: 0, cookies: 0, thirdPartyRequests: 0,
      compiledFirmwareClaimed: false, runtimeExecutionClaimed: false, physicalProofClaimed: false };
    if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
