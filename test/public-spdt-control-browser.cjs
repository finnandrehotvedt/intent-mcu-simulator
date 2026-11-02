// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.PUBLIC_SPDT_URL || 'https://lab-preview.rust.finnandre.no';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(90_000); const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#beginner-examples');
    await page.locator('.starter-card[data-example="avr-spdt-selector"] .starter-action:visible').click();
    await page.waitForFunction(() => {
      const project = window.__M6_PROJECT__(); const circuit = project.circuit ?? project.candidateCircuit;
      return circuit.components.some(({ id }) => id === 'selector-1');
    });
    await page.click('#beginner-run');
    await page.waitForFunction(() => document.querySelector('#beginner-status').textContent.includes('running'));
    await page.click('#serial-tab');
    await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('THROW A LOW'));
    const control = page.locator('[data-control="selector-1.selectedThrow"]:visible');
    await control.click();
    await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('THROW B HIGH'));
    assert((await page.textContent('#project-message')).includes('through BREAK'));
    const value = () => page.evaluate(() => {
      const project = window.__M6_PROJECT__(); const circuit = project.circuit ?? project.candidateCircuit;
      return circuit.components.find(({ id }) => id === 'selector-1').controls.selectedThrow;
    });
    assert.equal(await value(), 'B');
    await page.click('#workbench-instruments-dialog .workbench-popup-close');
    await page.click('#beginner-runtime-toggle');
    await page.waitForFunction(() => document.querySelector('#beginner-runtime-toggle').dataset.state === 'paused');
    await page.keyboard.press('Control+z');
    const afterUndo = await value();
    await page.keyboard.press('Control+Shift+z');
    const afterRedo = await value();
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ ok: true, runtime: ['THROW A LOW', 'THROW B HIGH'],
      breakBeforeMake: true, afterPauseUndo: afterUndo, afterPauseRedo: afterRedo,
      historyContract: afterUndo === 'A' && afterRedo === 'B' ? 'undo-redo' : 'live-input-not-in-history' })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
