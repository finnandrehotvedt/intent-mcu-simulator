// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = option('--url', process.env.X26_MATRIX_URL ?? 'http://127.0.0.1:18791');
const selector = option('--selector', 'all');
const output = option('--output');
const screenshot = option('--screenshot');
const negative = args.includes('--wrong-expectation');
const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(moduleRoot, 'playwright'));

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  if (response?.status() !== 200) throw new Error(`X26_ROOT_${response?.status() ?? 'NO_RESPONSE'}`);
  await page.waitForFunction(() => window.__M11_READY__ === true && window.__X26_REGRESSION_MATRIX__?.ready === true);
  const report = await page.evaluate(async ({ selected, wrong }) => wrong
    ? window.__X26_REGRESSION_MATRIX__.runWrongExpectation(selected)
    : window.__X26_REGRESSION_MATRIX__.run(selected), { selected: selector, wrong: negative });
  const browserEvidence = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    state: document.querySelector('#regression-matrix-state').textContent,
    rows: document.querySelectorAll('#regression-matrix-results tr').length,
  }));
  const cookies = await context.cookies();
  if (errors.length || outside.length || cookies.length || browserEvidence.overflow > 1) {
    throw new Error(`X26_BROWSER_BOUNDARY ${JSON.stringify({ errors, outside, cookies: cookies.length, browserEvidence })}`);
  }
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (output) await writeFile(output, text, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(text);
  process.stderr.write(`${JSON.stringify({ browserEvidence, cookies: 0, thirdPartyRequests: 0, errors: 0 })}\n`);
} catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
