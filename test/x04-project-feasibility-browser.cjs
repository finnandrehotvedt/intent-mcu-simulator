// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X04_URL || 'http://127.0.0.1:18766';
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
    await page.click('#pico-build');
    await page.waitForFunction(() => ['built', 'failed'].includes(window.__RP2040_PUBLIC_STATE__?.phase), null, { timeout: 120_000 });
    assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_STATE__.phase), 'built');
    await page.click('#pico-run');
    await page.waitForFunction(() => document.querySelector('#pico-serial')?.textContent.includes('PICO PUBLIC')
      && window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime', null, { timeout: 60_000 });
    const before = await page.evaluate((selected) => ({
      project: JSON.stringify(window.__COMMON_PROJECT_FILES__.prepare(window.__COMMON_PROJECT_FILES__.current(selected)).project),
      artifact: window.__SHARED_INSTRUMENT_SUMMARY__.artifactIdentity,
    }), profile);
    await page.fill('#project-brief-acceptance', 'REQ-PREFLIGHT | Inspect required capabilities before Build | main.c:1-5 | TEST-PREFLIGHT');
    await page.fill('#project-brief-capabilities', [
      'NEED-GPIO | peripheral | gpio | REQ-PREFLIGHT',
      'NEED-ADC | peripheral | adc | REQ-PREFLIGHT',
      'NEED-MYSTERY | component | sensor.mystery-v1 | REQ-PREFLIGHT',
      'NEED-DETAIL | component | ? | REQ-PREFLIGHT',
    ].join('\n'));
    const after = await page.evaluate((selected) => ({
      project: JSON.stringify(window.__COMMON_PROJECT_FILES__.prepare(window.__COMMON_PROJECT_FILES__.current(selected)).project),
      artifact: window.__SHARED_INSTRUMENT_SUMMARY__.artifactIdentity,
      runtimeState: window.__SHARED_INSTRUMENT_SUMMARY__.state,
      feasibility: window.__PROJECT_FEASIBILITY__.current(selected),
      brief: window.__PROJECT_BRIEF__.current(selected),
    }), profile);
    assert.equal(after.project, before.project, 'feasibility metadata changed source/circuit bytes');
    assert.equal(after.artifact, before.artifact, 'feasibility metadata retired the current artifact');
    assert.equal(after.runtimeState, 'current-runtime');
    assert.deepEqual(after.feasibility.items.map((item) => item.state),
      ['available', 'unsupported', 'unknown', 'unresolved']);
    assert.equal(after.feasibility.evaluated, false);
    assert.equal(after.feasibility.buildAuthority, false);
    assert(after.brief.requiredCapabilities.every((item) => !Object.hasOwn(item, 'state') && !Object.hasOwn(item, 'verdict')));
    assert.deepEqual(await page.locator('.feasibility-state').allTextContents(),
      ['available', 'unsupported', 'unknown', 'unresolved']);
    assert.equal(outside.length, 0, JSON.stringify(outside));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    process.stdout.write(`${JSON.stringify({ status: 'pass', profile,
      states: after.feasibility.items.map((item) => item.state), artifactRetained: true,
      runtimeRetained: true, evaluated: false, buildAuthority: false,
      outsideRequests: 0, browserErrors: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
