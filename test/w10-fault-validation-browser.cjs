// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.W10_URL || 'http://127.0.0.1:18789';

async function preparedProject() {
  const { createExampleProject } = await import('../src/example-projects.mjs');
  return JSON.stringify(createExampleProject('blink').project);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(120_000);
    const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.setInputFiles('#project-open-input', { name: 'w10-fault.intent-mcu.json',
      mimeType: 'application/json', buffer: Buffer.from(await preparedProject()) });
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__M6_PROJECT__()?.circuit?.nets?.some((net) => net.id === 'net-example-3'));
    await page.selectOption('#selected-net', 'net-example-3');
    await page.click('#delete-wire');
    await page.waitForFunction(() => !window.__M6_PROJECT__().circuit.nets.some((net) => net.id === 'net-example-3'));
    const diagnostic = await page.textContent('#circuit-diagnostics');
    assert.match(diagnostic, /Complete the documented named-pin path without extra branches/u);
    assert.equal(await page.locator('#run').isDisabled(), true);
    await page.click('#undo');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.nets.some((net) => net.id === 'net-example-3'));
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    const width = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
    assert.equal(width[0], width[1]);
    process.stdout.write(`${JSON.stringify({ ok: true, requirement: 'W10', actionableDiagnostic: true,
      runBlocked: true, undo: true, outsideRequests: 0, browserErrors: 0, overflow: false })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
