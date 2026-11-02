// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.PUBLIC_SWITCH_CONTROLS_URL || 'https://lab-preview.rust.finnandre.no';

async function loadStarter(page, id, componentId) {
  if (!(await page.locator('#beginner-examples').isVisible())) await page.click('#workbench-view-simple');
  await page.click('#beginner-examples');
  await page.waitForSelector('#example-picker-dialog[open]');
  await page.locator(`.starter-card[data-example="${id}"] .starter-action:visible`).click();
  if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) await page.click('#unsaved-discard');
  await page.waitForFunction((expected) => {
    const project = window.__M6_PROJECT__(); const circuit = project.circuit ?? project.candidateCircuit;
    return circuit?.components.some(({ id: component }) => component === expected);
  }, componentId);
}

async function buildRun(page) {
  await page.click('#beginner-run');
  await page.waitForFunction(() => document.querySelector('#beginner-status').textContent.includes('running'), null,
    { timeout: 90_000 });
  await page.click('#serial-tab');
  await page.waitForSelector('#workbench-instruments-dialog[open]');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    page.setDefaultTimeout(60_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await loadStarter(page, 'avr-toggle-input', 'toggle-switch-1');
    await buildRun(page);
    await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('TOGGLE OPEN'));
    const toggle = page.locator('[data-control="toggle-switch-1.closed"]:visible');
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('TOGGLE CLOSED'));
    await page.waitForFunction(() => window.__INSTRUMENT_EVIDENCE__?.state === 'recorded-runtime');
    assert.equal(await page.locator('#instrument-evidence-state').textContent(), 'Recorded runtime');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => (window.__M6_PROJECT__().circuit
      ?? window.__M6_PROJECT__().candidateCircuit).components.find(({ id }) => id === 'toggle-switch-1').controls.closed), true);
    await page.click('#workbench-instruments-dialog .workbench-popup-close');
    await page.click('#workbench-view-advanced');
    await page.click('#project-files-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    const saved = fs.readFileSync(await download.path());
    await page.setInputFiles('#project-open-input', { name: 'spst-retained.intent-mcu.json',
      mimeType: 'application/json', buffer: saved });
    if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => (window.__M6_PROJECT__().circuit
      ?? window.__M6_PROJECT__().candidateCircuit).components
      .find(({ id }) => id === 'toggle-switch-1')?.controls.closed === true);
    assert.equal(await page.locator('#quick-run').isDisabled(), true);
    if (await page.locator('#workbench-project-dialog').evaluate((dialog) => dialog.open)) {
      await page.click('#workbench-project-dialog .workbench-popup-close');
    }

    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ ok: true, models: 1, fields: 1, actualBuildRun: 1,
      spstRuntime: ['TOGGLE OPEN', 'TOGGLE CLOSED'], saveOpen: true, staleRuntimeCleared: true })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
