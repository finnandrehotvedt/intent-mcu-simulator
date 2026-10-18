// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X26_MATRIX_URL || 'http://127.0.0.1:18791';
let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
  assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
  await page.waitForFunction(() => window.__X26_REGRESSION_MATRIX__?.ready === true);
  const matrix = await page.evaluate(() => window.__X26_REGRESSION_MATRIX__.matrix());
  assert.equal(matrix.cells.length, 4);
  assert.equal(new Set(matrix.cells.map((cell) => cell.expected.kind)).size, 4);
  assert.match(await page.textContent('#regression-matrix-identity'), /[0-9a-f]{64}/u);
  assert.match(await page.textContent('#regression-matrix'), /QEMU CPU\/UART remains separate/u);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(outside, []);
  assert.equal((await context.cookies()).length, 0);
  console.log(JSON.stringify({ result: 'pass', cells: 4, distinctOracles: 4, transientReport: true }));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); });
