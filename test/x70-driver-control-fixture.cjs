// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X70_CURRENT_URL || 'http://127.0.0.1:18881';
const evidenceDir = process.env.X70_CURRENT_EVIDENCE || '/evidence';
const sha256 = (source) => crypto.createHash('sha256').update(source).digest('hex');

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const rejectionPage = await context.newPage();
  let downloads = 0;
  rejectionPage.on('download', () => { downloads += 1; });
  try {
    await rejectionPage.setContent(`<!doctype html><button id="export">Export</button><p id="status">Ready</p>
      <script>
        document.querySelector('#export').addEventListener('click', () => {
          document.querySelector('#status').textContent = 'Pause the current runtime before exporting.';
        });
      </script>`);
    const button = rejectionPage.locator('#export');
    assert.equal(await button.isVisible(), true);
    assert.equal(await button.isDisabled(), false);
    await button.click({ noWaitAfter: true });
    await rejectionPage.waitForFunction(() => /Pause the current runtime/u.test(
      document.querySelector('#status')?.textContent ?? ''));
    await rejectionPage.waitForTimeout(100);
    assert.equal(downloads, 0);
    await rejectionPage.close();

    const page = await context.newPage();
    assert.equal((await page.goto(base, { waitUntil: 'networkidle' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X70_ACCESSIBLE_DEMONSTRATION__);
    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
    await page.click('#project-demo');
    await page.click('.starter-card[data-example="blink"]');
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(() => document.querySelector('#example-select')?.value === 'blink');
    const svgButton = page.locator('#accessible-svg-export');
    assert.equal(await svgButton.isVisible(), true);
    assert.equal(await svgButton.isDisabled(), false);
    const [svgDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      svgButton.click({ noWaitAfter: true }),
    ]);
    const svgPath = path.join(evidenceDir, 'zero-producer-no-current.accessible-demonstration.svg');
    await svgDownload.saveAs(svgPath);
    const svg = fs.readFileSync(svgPath, 'utf8');
    assert.match(svg, /data-schema="intent-mcu-accessible-demonstration@2"/u);
    assert.match(svg, /data-id="no-current-measurements"/u);

    const projectContext = await browser.newContext({ acceptDownloads: true,
      viewport: { width: 1440, height: 900 } });
    const projectPage = await projectContext.newPage();
    assert.equal((await projectPage.goto(base, { waitUntil: 'networkidle' }))?.status(), 200);
    await projectPage.waitForFunction(() => window.__M11_READY__ === true);
    await projectPage.selectOption('#board-select', 'board.atmega328p-16mhz-v1');
    await projectPage.waitForFunction(() => document.querySelector('#project-bar')?.hidden === false);
    await projectPage.click('#project-files-open');
    await projectPage.waitForSelector('#workbench-project-dialog[open]');
    await projectPage.click('#project-demo');
    await projectPage.click('.starter-card[data-example="blink"]');
    if (await projectPage.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      await projectPage.click('#unsaved-discard');
    }
    await projectPage.waitForFunction(() => document.querySelector('#example-select')?.value === 'blink');
    await projectPage.click('#project-files-open');
    await projectPage.waitForSelector('#workbench-project-dialog[open]');
    const projectButton = projectPage.locator('#project-save');
    assert.equal(await projectButton.isVisible(), true);
    assert.equal(await projectButton.isDisabled(), false);
    const [projectDownload] = await Promise.all([
      projectPage.waitForEvent('download', { timeout: 20_000 }),
      projectButton.click({ noWaitAfter: true }),
    ]);
    const projectPath = path.join(evidenceDir, 'zero-producer-project.intent-mcu.json');
    await projectDownload.saveAs(projectPath);
    const project = fs.readFileSync(projectPath, 'utf8');
    const parsed = JSON.parse(project);
    assert.equal(typeof parsed.schema, 'string');
    assert.equal(project.includes('current-runtime-measurements'), false);
    await projectContext.close();

    process.stdout.write(`${JSON.stringify({ result: 'pass', action: 'locator.click',
      noWaitAfter: true, visible: true, enabled: true, rejection: { status: 'rejected', downloads: 0 },
      positiveBlobDownload: { suggestedFilename: svgDownload.suggestedFilename(),
        saved: true, bytes: Buffer.byteLength(svg), sha256: sha256(svg), readback: true },
      projectSaveBlobDownload: { suggestedFilename: projectDownload.suggestedFilename(),
        saved: true, bytes: Buffer.byteLength(project), sha256: sha256(project), readback: true },
      producerActivity: { builds: 0, runs: 0, scenarios: 0 } })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
