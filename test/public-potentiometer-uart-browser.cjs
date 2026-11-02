// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.PUBLIC_POT_URL || 'https://lab-preview.rust.finnandre.no';
const starter = process.env.PUBLIC_POT_STARTER || 'adc';
const componentId = process.env.PUBLIC_POT_COMPONENT || 'pot-1';
(async () => { const browser = await chromium.launch({ headless: true }); try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(90_000);
  await page.goto(base); await page.waitForFunction(() => window.__M11_READY__ === true); await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForFunction(() => window.__M11_READY__ === true); await page.click('#beginner-examples');
  await page.locator(`.starter-card[data-example="${starter}"] .starter-action:visible`).click(); await page.click('#beginner-run');
  await page.waitForFunction(() => document.querySelector('#beginner-status').textContent.includes('running'));
  await page.click('#serial-tab'); const observed = [];
  for (const [percent, adc] of [[0, 0], [50, 512], [100, 1023]]) {
    const control = page.locator(`[data-control="${componentId}.position"]:visible`); await control.fill(String(percent));
    await page.waitForFunction((expected) => document.querySelector('#serial-output').textContent.split(/\s+/u).includes(String(expected)), adc);
    const position = await page.evaluate((id) => window.__M6_PROJECT__().circuit.components.find((item) => item.id === id).controls.position, componentId);
    assert.equal(position, percent / 100); observed.push({ percent, adc, position });
  }
  process.stdout.write(`${JSON.stringify({ ok:true, starter, componentId, actualBuildRun:true, actualAvrUart:true, observed })}\n`);
} finally { await browser.close(); } })().catch((error) => { console.error(error); process.exitCode=1; });
