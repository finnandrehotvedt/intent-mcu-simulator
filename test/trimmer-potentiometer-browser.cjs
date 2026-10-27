// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.TRIMMER_URL || 'http://127.0.0.1:18769';

async function loadStarter(page, id, name) {
  await page.evaluate((exampleId) => document.querySelector(
    `.starter-card[data-example="${exampleId}"] .starter-action`,
  ).click(), id);
  if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) {
    await page.click('#unsaved-discard');
  }
  await page.waitForFunction((expected) => window.__M6_PROJECT__()?.metadata?.name === expected, name);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    page.setDefaultTimeout(60_000);
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/page-views', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
    }));
    const errors = []; const outside = []; const builds = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (request.method() === 'POST' && url.pathname === '/api/build') builds.push(request.postDataBuffer()?.length ?? 0);
    });

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#workbench-view-advanced');
    await loadStarter(page, 'trimmer', 'Trimmer calibration');

    assert.equal(await page.locator('[data-component-id="trimmer-1"] [data-terminal-pin="HIGH"]').count(), 1);
    assert.equal(await page.locator('[data-component-id="trimmer-1"] [data-terminal-pin="WIPER"]').count(), 1);
    assert.equal(await page.locator('[data-component-id="trimmer-1"] [data-terminal-pin="LOW"]').count(), 1);
    assert.equal(await page.locator('[data-component-id="trimmer-1"] [data-artwork-key="potentiometer-trimmer"]').count(), 1);
    const graph = await page.evaluate(() => window.__M6_PROJECT__().circuit);
    const trimmer = graph.components.find((component) => component.type === 'potentiometer.trimmer-v1');
    assert.deepEqual(trimmer.properties, { ohms: 10_000, taper: 'linear' });
    assert.deepEqual(trimmer.controls, { position: 0.5 });
    assert(graph.nets.some(({ endpoints }) => endpoints.some(
      ({ component, pin }) => component === trimmer.id && pin === 'WIPER') && endpoints.some(
      ({ component, pin }) => component === 'board-1' && pin === 'A1')));

    await page.click('#firmware-open');
    await page.click('#build');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded');
    await page.click('#workbench-firmware-dialog .workbench-popup-close');
    await page.waitForFunction(() => !document.querySelector('#quick-run').disabled);
    await page.click('#quick-run');
    await page.waitForFunction(() => document.querySelector('#worker-state').textContent.includes('Running'));
    await page.waitForFunction(() => /TRIM\s+\d+/u.test(document.querySelector('#serial-output').textContent), null,
      { timeout: 15_000 });
    const beforeValues = await page.evaluate(() => [...document.querySelector('#serial-output').textContent
      .matchAll(/TRIM\s+(\d+)/gu)].map((match) => Number(match[1])));
    assert(beforeValues.some((value) => value >= 510 && value <= 513), JSON.stringify(beforeValues));

    const control = page.locator('input[data-control="trimmer-1.position"]');
    assert.equal(await control.count(), 1);
    await page.evaluate(() => {
      const input = document.querySelector('input[data-control="trimmer-1.position"]');
      input.value = '80';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const values = [...document.querySelector('#serial-output').textContent.matchAll(/TRIM\s+(\d+)/gu)]
        .map((match) => Number(match[1]));
      return values.some((value) => value >= 817 && value <= 820);
    }, null, { timeout: 15_000 });
    const runtime = await page.evaluate(() => window.__M6_STATE__.runtime?.circuit);
    assert.equal(runtime.controls['trimmer-1'].position, 0.8);
    assert.equal(runtime.analogue.find(({ componentId }) => componentId === 'trimmer-1').voltage, 4);

    await page.click('#quick-pause');
    await page.waitForFunction(() => document.querySelector('#worker-state').textContent.includes('Paused'));
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.evaluate(() => document.querySelector('#project-save').click()),
    ]);
    const saved = fs.readFileSync(await download.path(), 'utf8');
    const savedValue = JSON.parse(saved);
    const savedProject = savedValue.project ?? savedValue;
    assert.equal(savedProject.circuit.components.find(({ id }) => id === 'trimmer-1').controls.position, 0.8);
    await page.setInputFiles('#project-open-input', {
      name: 'cmp003-trimmer.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(saved),
    });
    if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.find(
      ({ id }) => id === 'trimmer-1')?.controls.position === 0.8);
    assert.equal(await page.locator('[data-component-id="trimmer-1"] [data-artwork-key="potentiometer-trimmer"]').count(), 1);
    assert.equal(await page.locator('#quick-run').isDisabled(), true, 'Open restored stale runtime authority');

    assert.deepEqual(builds.length, 1); assert(builds[0] > 0);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, exactArtwork: true, namedTerminals: 3,
      starterBuildRun: true, retainedControl: 0.8, observedVolts: 4, saveOpen: true,
      staleRuntimeAuthorityCleared: true, compilerPosts: builds.length })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
