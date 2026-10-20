// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  try {
    await page.setContent(`<!doctype html><button id="export">Export</button><p id="status">Ready</p>
      <script>
        document.querySelector('#export').addEventListener('click', () => {
          document.querySelector('#status').textContent = 'Pause the current runtime before exporting.';
        });
      </script>`);
    const button = page.locator('#export');
    assert.equal(await button.isVisible(), true);
    assert.equal(await button.isDisabled(), false);
    await button.click({ noWaitAfter: true });
    await page.waitForFunction(() => /Pause the current runtime/u.test(
      document.querySelector('#status')?.textContent ?? ''));
    await page.waitForTimeout(100);
    assert.equal(downloads, 0);
    process.stdout.write(`${JSON.stringify({ result: 'pass', action: 'locator.click',
      noWaitAfter: true, visible: true, enabled: true, status: 'rejected', downloads: 0,
      producerActivity: { builds: 0, runs: 0, scenarios: 0 } })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
