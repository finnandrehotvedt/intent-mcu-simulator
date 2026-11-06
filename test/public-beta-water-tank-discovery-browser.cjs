// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.PUBLIC_BETA_DISCOVERY_URL || 'http://127.0.0.1:18766';
const expectedSource = '5fc21984366a4b6cc146f7afefce9c05c158eef3f046f72ed35c3841185d81bc';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    assert.deepEqual((await context.storageState()).origins, [], 'clean browser context already has storage');
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = []; const outside = []; let assetGets = 0;
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (url.pathname === '/examples/exact-visuino-water-tank.intent-mcu.json') assetGets += 1;
    });
    await page.route('**/api/page-views', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
    }));

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    assert.equal(await page.locator('body').getAttribute('data-workbench-view'), 'simple');
    const direct = page.locator('#beginner-water-tank');
    assert.equal(await direct.isVisible(), true, 'public-beta demo is absent from the first Simple view');
    assert.match(await direct.textContent(), /Public beta: water tank/u);
    const directBox = await direct.boundingBox();
    assert(directBox && directBox.y < 1000, 'public-beta action is below the first viewport');
    assert.match(await page.locator('#beginner-status').textContent(), /Public beta.*water-tank/u);

    await page.click('#beginner-examples');
    const card = page.locator('[data-example="avr-visuino-water-tank-public-beta"]');
    assert.equal(await card.isVisible(), true, 'water-tank card requires search or hidden expansion');
    assert.match(await card.textContent(), /five visible video states/u);
    await page.keyboard.press('Escape');

    await direct.click();
    await page.waitForFunction(() => {
      const value = window.__M6_PROJECT__();
      return value?.project?.metadata?.name === 'Exact Visuino water-tank controller';
    });
    const loaded = await page.evaluate(() => {
      const value = window.__M6_PROJECT__();
      return {
        profile: document.querySelector('#board-select').value,
        name: value.project.metadata.name,
        source: value.project.source.files.find((file) => file.name === 'main.ino').content,
        ids: value.candidateCircuit.components.map((component) => component.id),
        artifact: value.project.artifact,
        fileState: window.__COMMON_PROJECT_FILE_STATE__,
      };
    });
    assert.equal(loaded.profile, 'board.atmega328p-16mhz-v1');
    assert.equal(loaded.name, 'Exact Visuino water-tank controller');
    assert.deepEqual([...loaded.ids].sort(), [
      'board-1', 'auto-switch', 'manual-button', 'source-empty-switch', 'tank-level',
      'pcf8574-lcd-1', 'pump-led', 'alarm-led', 'pump-resistor', 'alarm-resistor',
    ].sort());
    assert.equal(createHash('sha256').update(loaded.source).digest('hex'), expectedSource);
    assert.equal(loaded.artifact.status, 'dirty');
    assert.equal(loaded.fileState.profile, 'board.atmega328p-16mhz-v1');
    assert.equal(await page.locator('#quick-run').isDisabled(), true, 'opening the demo restored executable authority');
    assert.match(await page.locator('#project-message').textContent(), /(fresh Build|Build fresh)/u);
    assert.equal(assetGets, 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, cleanContext: true, simpleView: true,
      firstViewport: true, cardWithoutSearch: true, project: loaded.name,
      sourceSha256: expectedSource, executableAuthorityRestored: false,
      assetGets, outsideRequests: 0 })}\n`);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
