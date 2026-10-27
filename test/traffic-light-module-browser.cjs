// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.TRAFFIC_LIGHT_URL || 'http://127.0.0.1:18769';

async function loadStarter(page) {
  await page.evaluate(() => document.querySelector(
    '.starter-card[data-example="avr-traffic-light"] .starter-action',
  ).click());
  if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) {
    await page.click('#unsaved-discard');
  }
  await page.waitForFunction(() => {
    const value = window.__M6_PROJECT__();
    return (value?.project ?? value)?.metadata?.name === 'Traffic light sequence';
  });
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
    await loadStarter(page);

    const card = page.locator('[data-component-id="traffic-light-1"]');
    assert.equal(await card.locator('[data-artwork-key="output-traffic-light-module"]').count(), 1);
    for (const pin of ['RED', 'AMBER', 'GREEN', 'COM']) {
      assert.equal(await card.locator(`[data-terminal-pin="${pin}"]`).count(), 1, pin);
    }
    const graph = await page.evaluate(() => window.__M6_PROJECT__().candidateCircuit);
    const component = graph.components.find(({ id }) => id === 'traffic-light-1');
    assert.equal(component.type, 'output.traffic-light-module-v1');
    assert.deepEqual(component.properties, {}); assert.deepEqual(component.controls, {});

    await page.click('#firmware-open');
    await page.click('#build');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded');
    await page.click('#workbench-firmware-dialog .workbench-popup-close');
    await page.waitForFunction(() => !document.querySelector('#quick-run').disabled);
    await page.click('#quick-run');
    await page.waitForFunction(() => document.querySelector('#worker-state').textContent.includes('Running'));
    await page.waitForFunction(() => /RED[\s\S]*RED AMBER[\s\S]*GREEN[\s\S]*AMBER/u
      .test(document.querySelector('#serial-output').textContent), null, { timeout: 20_000 });
    for (const [key, predicate] of [
      ['red', (value) => value.redOn === 'true' && value.greenOn === 'false'],
      ['redAmber', (value) => value.redOn === 'true' && value.amberOn === 'true'],
      ['green', (value) => value.greenOn === 'true' && value.redOn === 'false'],
      ['amber', (value) => value.amberOn === 'true' && value.redOn === 'false' && value.greenOn === 'false'],
    ]) {
      await page.waitForFunction(({ name }) => {
        const value = document.querySelector('[data-artwork-key="output-traffic-light-module"]')?.dataset ?? {};
        if (name === 'red') return value.redOn === 'true' && value.greenOn === 'false';
        if (name === 'redAmber') return value.redOn === 'true' && value.amberOn === 'true';
        if (name === 'green') return value.greenOn === 'true' && value.redOn === 'false';
        return value.amberOn === 'true' && value.redOn === 'false' && value.greenOn === 'false';
      }, { name: key }, { timeout: 20_000 });
      void predicate;
    }

    await page.click('#quick-pause');
    await page.waitForFunction(() => document.querySelector('#worker-state').textContent.includes('Paused'));
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.evaluate(() => document.querySelector('#project-save').click()),
    ]);
    const saved = fs.readFileSync(await download.path(), 'utf8');
    await page.setInputFiles('#project-open-input', {
      name: 'cmp041-traffic-light.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(saved),
    });
    if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components.some(
      ({ id, type }) => id === 'traffic-light-1' && type === 'output.traffic-light-module-v1'));
    assert.equal(await card.locator('[data-artwork-key="output-traffic-light-module"]').count(), 1);
    assert.equal(await page.locator('#quick-run').isDisabled(), true, 'Open restored stale runtime authority');

    assert.deepEqual(builds.length, 1); assert(builds[0] > 0);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, exactArtwork: true, namedTerminals: 4,
      observedPhases: ['RED', 'RED AMBER', 'GREEN', 'AMBER'], starterBuildRun: true,
      saveOpen: true, staleRuntimeAuthorityCleared: true, compilerPosts: builds.length })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
