// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.POWER_REFERENCE_URL || 'http://127.0.0.1:18769';

async function loadGroundStarter(page) {
  await page.evaluate(() => document.querySelector(
    '.starter-card[data-example="avr-ground-reference-input"] .starter-action',
  ).click());
  if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) {
    await page.click('#unsaved-discard');
  }
  await page.waitForFunction(() => window.__M6_PROJECT__()?.project?.metadata?.name === 'Ground reference input');
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
    const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#workbench-view-advanced');
    await loadGroundStarter(page);

    if (!(await page.locator('#component-catalog').isVisible())) await page.click('#toggle-catalog');
    await page.locator('.catalog-item[data-type="reference.power-5v-v1"]').click();
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components.some(
      (component) => component.id === 'power-reference-1',
    ));
    assert(!(await page.textContent('#project-message')).includes('rejected'));
    assert.equal(await page.locator('[data-component-id="power-reference-1"] [data-terminal-pin="OUT"]').count(), 1);
    await page.evaluate(() => window.__M6_CONNECT__('power-reference-1.OUT', 'board-1.D3'));
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.nets.some((net) => net.endpoints.some(
      (endpoint) => endpoint.component === 'power-reference-1' && endpoint.pin === 'OUT',
    )));
    assert.equal((await page.evaluate(() => window.__BROWSER_SESSION_CANONICAL_OWNER__.snapshot())).candidateValidation.executable, true);

    const [download] = await Promise.all([
      page.waitForEvent('download'), page.evaluate(() => document.querySelector('#project-save').click()),
    ]);
    const saved = fs.readFileSync(await download.path(), 'utf8');
    await page.setInputFiles('#project-open-input', {
      name: 'cmp020-browser.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(saved),
    });
    if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components.some(
      (component) => component.id === 'power-reference-1',
    ));
    assert.equal((await page.evaluate(() => window.__BROWSER_SESSION_CANONICAL_OWNER__.snapshot())).candidateValidation.executable, true);

    await loadGroundStarter(page);
    const api = await page.evaluate(() => {
      const owner = window.__BROWSER_SESSION_CANONICAL_OWNER__;
      const before = owner.snapshot();
      const transactionId = 'cmp020-browser-api-0001';
      const applied = owner.batch({
        expectedProjectId: before.projectId, expectedRevision: before.revision, transactionId,
        commands: [
          { type: 'component.add', component: {
            id: 'power-reference-api', type: 'reference.power-5v-v1', label: '5 V circuit source',
            properties: { voltageVolts: 5 }, controls: {},
          }, position: { x: 0.18, y: 0.64, rotation: 0 } },
          { type: 'wire.create', net: { id: 'net-power-reference-api-d3', endpoints: [
            { component: 'power-reference-api', pin: 'OUT' }, { component: 'board-1', pin: 'D3' },
          ] } },
        ],
      });
      const after = owner.snapshot();
      const undone = owner.undo({ expectedProjectId: after.projectId,
        expectedRevision: after.revision, transactionId });
      const afterUndo = owner.snapshot();
      const redone = owner.redo({ expectedProjectId: afterUndo.projectId,
        expectedRevision: afterUndo.revision, transactionId });
      return { before, applied, after, undone, afterUndo, redone, final: owner.snapshot() };
    });
    assert.equal(api.applied.ok, true, JSON.stringify(api.applied));
    assert.equal(api.after.candidateValidation.executable, true);
    assert.equal(api.undone.ok, true); assert.equal(api.redone.ok, true);
    assert.equal(api.afterUndo.project.circuit.components.some(
      (component) => component.id === 'power-reference-api'), false);
    assert.equal(api.final.project.circuit.components.some(
      (component) => component.id === 'power-reference-api'), true);
    assert.equal(api.final.candidateValidation.executable, true);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, manualAdd: true, namedOutWire: true,
      saveOpenReload: true, canonicalApiAdd: true, exactUndoRedo: true, mixedGroundPower: true })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
