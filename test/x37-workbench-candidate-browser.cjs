// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X37_CANDIDATE_URL || 'http://127.0.0.1:18893';
const output = process.env.X37_CANDIDATE_OUTPUT || '/tmp/x37-workbench-candidate';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { builds: 0, runs: 0, candidateUrl: `${base}/?x37-candidate=1`, viewports: [] };
  try {
    for (const viewport of [{ width: 1366, height: 900 }, { width: 1440, height: 1000 }]) {
      const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      const requests = [];
      page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));
      assert.equal((await page.goto(report.candidateUrl, { waitUntil: 'domcontentloaded' }))?.status(), 200);
      await page.waitForFunction(() => window.__X37_CANDIDATE__?.enabled === true);
      assert.equal(await page.locator('#x37-workbench-candidate').isVisible(), true);
      for (const selector of ['#x37-candidate-build', '#x37-candidate-run', '#x37-candidate-pause',
        '#x37-candidate-stop', '#x37-candidate-reset']) assert.equal(await page.isDisabled(selector), true);
      assert.match(await page.textContent('#x37-candidate-status'), /public RP2040 compiler grammar/u);
      assert.equal((await page.locator('.x37-candidate-controls').count()), 1);
      assert.equal((await page.locator('.x37-shared-wire').count()), 1);
      await page.click('#x37-source-rp');
      assert.equal(await page.getAttribute('#x37-source-rp', 'aria-selected'), 'true');
      await page.fill('#x37-candidate-source', '/* authored candidate edit */\n');
      const before = await page.evaluate(() => JSON.stringify(window.__X37_CANDIDATE__.project()));
      const downloadPromise = page.waitForEvent('download'); await page.click('#x37-candidate-download');
      const download = await downloadPromise; const file = path.join(output, `candidate-${viewport.width}.json`);
      await download.saveAs(file); const saved = fs.readFileSync(file, 'utf8');
      assert.equal(JSON.stringify(JSON.parse(saved)), before);
      assert(!/artifact|runtimeGeneration|worker|trace|verdict|firmwareHex/u.test(saved));
      await page.setInputFiles('#x37-candidate-open-input', file);
      await page.waitForFunction(() => document.querySelector('#x37-candidate-status').textContent.includes('Opened and atomically validated'));
      assert.equal(JSON.stringify(await page.evaluate(() => window.__X37_CANDIDATE__.project())), before);
      const rejected = path.join(output, `invalid-${viewport.width}.json`);
      fs.writeFileSync(rejected, JSON.stringify({ ...JSON.parse(saved), runtime: {} }));
      await page.setInputFiles('#x37-candidate-open-input', rejected);
      await page.waitForFunction(() => document.querySelector('#x37-candidate-status').textContent.includes('Open rejected atomically'));
      assert.equal(JSON.stringify(await page.evaluate(() => window.__X37_CANDIDATE__.project())), before);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 1, `horizontal overflow ${overflow}`);
      const screenshot = path.join(output, `x37-candidate-${viewport.width}x${viewport.height}.png`);
      await page.locator('#x37-workbench-candidate').screenshot({ path: screenshot });
      const producer = requests.filter(({ url }) => /\/api\/(?:build|runtime|compile)/u.test(url));
      assert.deepEqual(producer, []); report.viewports.push({ viewport, overflow, screenshot });
      await context.close();
    }
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
