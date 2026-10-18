// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X06_URL || 'http://127.0.0.1:18766';
const profile = 'board.rp2040-pico-v1';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const outside = []; const errors = [];
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.selectOption('#board-select', profile);
    await page.fill('#project-brief-purpose', 'Compare two GPIO0 LED designs.');
    await page.fill('#project-brief-acceptance', 'REQ-X06 | Drive the reviewed LED output | main.c:1-8 | TEST-X06');
    await page.fill('#project-brief-capabilities', 'NEED-GPIO | peripheral | gpio | REQ-X06');
    await page.click('#pico-build');
    await page.waitForFunction(() => ['built', 'failed'].includes(window.__RP2040_PUBLIC_STATE__?.phase), null, { timeout: 120_000 });
    assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_STATE__.phase), 'built');
    await page.click('#pico-run');
    await page.waitForFunction(() => document.querySelector('#pico-serial')?.textContent.includes('PICO PUBLIC')
      && window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime', null, { timeout: 60_000 });

    const fixture = await page.evaluate(async (selected) => {
      const current = window.__COMMON_PROJECT_FILES__.current(selected); const envelope = JSON.parse(current);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(current));
      const baseProjectSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      envelope.project.source = envelope.project.source.replace('PICO PUBLIC', 'DESIGN B');
      envelope.project.circuit.layout.positions['led-1'].x = 0.28;
      envelope.project.circuit.layout.wireStyles['net-gpio0'] = '#35d07f';
      return { before: current, artifact: window.__SHARED_INSTRUMENT_SUMMARY__.artifactIdentity,
        patch: JSON.stringify({ schema: 'intent-mcu-project-patch@1', profile: selected, baseProjectSha256,
          description: 'Compare a source, LED position and GPIO cable alternative.', proposedProject: envelope }) };
    }, profile);
    const reviewed = await page.evaluate(({ patch, profile }) => window.__PROJECT_PATCH__.review(patch, profile),
      { patch: fixture.patch, profile });
    assert.equal(reviewed.ok, true); assert.equal(await page.locator('#design-comparison-create').isEnabled(), true);
    await page.click('#design-comparison-create');
    await page.waitForFunction(() => document.querySelectorAll('.design-alternative').length === 2);
    const comparison = await page.evaluate(() => window.__DESIGN_COMPARISON__.state());
    assert.equal(comparison.schema, 'intent-mcu-design-comparison@1');
    assert.equal(comparison.alternatives.length, 2); assert.deepEqual(comparison.requirements.ids, ['REQ-X06']);
    assert.equal(comparison.requirements.sameForBoth, true); assert.equal(comparison.evaluated, false);
    assert.equal(comparison.recommendation, null); assert.equal(comparison.buildAuthority, false);
    assert.deepEqual(comparison.changes.map(({ kind }) => kind), ['source', 'component', 'wire']);
    assert.equal(comparison.alternatives[0].requiredCapabilities[0].state, 'available');
    assert.match(comparison.alternatives[0].model.limitation, /tested educational GPIO0\/UART0 subset/u);
    assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile), fixture.before);
    assert.equal(await page.evaluate(() => window.__SHARED_INSTRUMENT_SUMMARY__.artifactIdentity), fixture.artifact);
    assert.equal(await page.evaluate(() => window.__SHARED_INSTRUMENT_SUMMARY__.state), 'current-runtime');
    await page.click('#project-patch-apply');
    await page.waitForFunction(() => document.querySelector('#project-patch-status').textContent.includes('fresh Build'));
    assert.equal(await page.evaluate(() => window.__DESIGN_COMPARISON__.state()), null);
    assert.equal(await page.locator('.design-alternative').count(), 0);
    assert.equal(await page.evaluate(() => window.__SHARED_INSTRUMENT_SUMMARY__.state), 'no-current-runtime');
    assert.equal(outside.length, 0, JSON.stringify(outside)); assert.equal(errors.length, 0, JSON.stringify(errors));
    process.stdout.write(`${JSON.stringify({ status: 'pass', profile, alternatives: 2,
      requirement: 'REQ-X06', reviewKinds: ['source', 'component', 'wire'], noMutationDuringComparison: true,
      artifactRetainedDuringComparison: true, freshBuildRequired: true, outsideRequests: 0, browserErrors: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
