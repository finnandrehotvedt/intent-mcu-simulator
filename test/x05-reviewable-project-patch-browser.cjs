// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X05_URL || 'http://127.0.0.1:18766';
const profile = 'board.rp2040-pico-v1';
const description = 'Set the reviewed Pico output LOW, move the LED, and recolour the GPIO cable.';

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
    await page.click('#pico-build');
    await page.waitForFunction(() => ['built', 'failed'].includes(window.__RP2040_PUBLIC_STATE__?.phase), null, { timeout: 120_000 });
    assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_STATE__.phase), 'built');
    await page.click('#pico-run');
    await page.waitForFunction(() => document.querySelector('#pico-serial')?.textContent.includes('PICO PUBLIC')
      && window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime', null, { timeout: 60_000 });

    const prepared = await page.evaluate(async ({ selected, requested }) => {
      const current = window.__COMMON_PROJECT_FILES__.current(selected);
      const envelope = JSON.parse(current);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(current));
      const baseProjectSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      envelope.project.source = envelope.project.source.replace('intent_gpio0_output(1u)', 'intent_gpio0_output(0u)')
        .replace('PICO PUBLIC', 'PATCH REVIEW');
      envelope.project.circuit.layout.positions['led-1'].x = 0.28;
      envelope.project.circuit.layout.wireStyles['net-gpio0'] = '#35d07f';
      return {
        before: current,
        artifact: window.__SHARED_INSTRUMENT_SUMMARY__.artifactIdentity,
        patch: JSON.stringify({ schema: 'intent-mcu-project-patch@1', profile: selected,
          baseProjectSha256, description: requested, proposedProject: envelope }, null, 2),
        baseProjectSha256,
      };
    }, { selected: profile, requested: description });

    await page.fill('#project-patch-description', description);
    await page.click('#project-patch-generate');
    await page.waitForFunction((hash) => document.querySelector('#project-patch-prompt').value.includes(hash), prepared.baseProjectSha256);
    assert.match(await page.inputValue('#project-patch-prompt'), /No Markdown fence/u);
    await page.fill('#project-patch-input', prepared.patch);
    await page.click('#project-patch-review');
    await page.waitForFunction(() => document.querySelectorAll('.project-patch-change').length === 3);
    assert.deepEqual(await page.locator('.project-patch-change strong').allTextContents(), ['source', 'component', 'wire']);
    assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile), prepared.before);
    assert.equal(await page.evaluate(() => window.__SHARED_INSTRUMENT_SUMMARY__.state), 'current-runtime');
    assert.equal(await page.evaluate(() => window.__SHARED_INSTRUMENT_SUMMARY__.artifactIdentity), prepared.artifact);
    const reviewState = await page.evaluate(() => window.__PROJECT_PATCH__.state());
    assert.equal(reviewState.evaluated, false); assert.equal(reviewState.buildAuthority, false);

    await page.click('#project-patch-apply');
    await page.waitForFunction(() => document.querySelector('#project-patch-status').textContent.includes('fresh Build'));
    const applied = await page.evaluate((selected) => ({
      text: window.__COMMON_PROJECT_FILES__.current(selected),
      state: window.__RP2040_PUBLIC_STATE__,
      shared: window.__SHARED_INSTRUMENT_SUMMARY__,
    }), profile);
    assert.notEqual(applied.text, prepared.before);
    const appliedEnvelope = JSON.parse(applied.text);
    assert.match(appliedEnvelope.project.source, /intent_gpio0_output\(0u\)/u);
    assert.equal(appliedEnvelope.project.circuit.layout.positions['led-1'].x, 0.28);
    assert.equal(appliedEnvelope.project.circuit.layout.wireStyles['net-gpio0'], '#35d07f');
    assert.equal(applied.state.artifact, null); assert.equal(applied.state.runtime, null);
    assert.equal(applied.shared.state, 'no-current-runtime');

    const appliedBytes = applied.text;
    await page.fill('#project-patch-input', prepared.patch);
    await page.click('#project-patch-review');
    await page.waitForFunction(() => document.querySelector('#project-patch-status').textContent.includes('PROJECT_PATCH_STALE_BASE'));
    assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile), appliedBytes);
    assert.equal(await page.locator('#project-patch-apply').isDisabled(), true);
    assert.equal(outside.length, 0, JSON.stringify(outside));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    process.stdout.write(`${JSON.stringify({ status: 'pass', profile,
      reviewKinds: ['source', 'component', 'wire'], preApplyMutation: false,
      artifactRetainedDuringReview: true, freshBuildRequired: true,
      staleReplayRejected: true, outsideRequests: 0, browserErrors: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
