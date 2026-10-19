// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X82_URL || 'http://host.docker.internal:18847';
const packagePath = process.env.X82_PACKAGE;
const screenshotPath = process.env.X82_SCREENSHOT || null;
const outputPath = process.env.X82_REPORT_OUTPUT || null;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

let browser;
(async () => {
  assert(packagePath, 'X82_PACKAGE is required');
  const retainedSource = fs.readFileSync(packagePath, 'utf8');
  const retained = JSON.parse(retainedSource);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; const outside = []; const mutations = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });

  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__M11_READY__ === true && window.__CHECKABLE_EVIDENCE__);
  const workersBefore = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
  const report = await page.evaluate(async (source) =>
    window.__CHECKABLE_EVIDENCE__.setPackage(source), retainedSource);

  assert.equal(report.schema, 'intent-mcu-checkable-evidence-report@1');
  assert.equal(report.producer.adapterId, 'x82-authored-gpio-v2');
  assert.equal(report.measurements.length, 8);
  assert.equal(report.measurements.every((row) => row.value.state === 'known'), true);
  assert.equal(report.modelContext.state, 'known');
  assert.equal(report.modelContext.lock.version, retained.project.modelLibrary.version);
  assert.equal(report.outcome.reportedAcademicStatus, retained.report.aggregate.academicStatus);
  assert.equal(report.truthBoundary.includes('do not prove measurement truth'), true);
  assert.equal(await page.textContent('#checkable-evidence-state'), '8/8 available');
  assert.match(await page.textContent('#checkable-evidence-summary'), /Hashes bind identity\/integrity, not truth/u);
  assert.match(await page.textContent('#checkable-evidence-identity'), /model known/u);
  assert.equal(await page.locator('#checkable-evidence-rows li').count(), 8);
  assert((await page.locator('#checkable-evidence-limitations li').count()) >= 4);
  assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore,
    'rendering retained evidence created a runtime worker');

  await page.locator('#checkable-evidence > summary').click();
  await page.locator('#checkable-evidence').scrollIntoViewIfNeeded();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#checkable-evidence-download'),
  ]);
  const downloadedPath = await download.path();
  const downloaded = fs.readFileSync(downloadedPath, 'utf8');
  const parsed = JSON.parse(downloaded);
  assert.deepEqual(parsed, report);
  assert.equal(downloaded, `${JSON.stringify(report, null, 2)}\n`);
  assert.match(download.suggestedFilename(), /^checkable-evidence-[a-f0-9]{16}\.json$/u);
  const downloadSha256 = sha256(downloaded);
  assert.match(await page.textContent('#checkable-evidence-identity'), new RegExp(downloadSha256, 'u'));
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, downloaded, { mode: 0o600 });
  }
  if (screenshotPath) {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.locator('#checkable-evidence').screenshot({ path: screenshotPath });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1,
    'checkable evidence disclosure caused horizontal overflow');
  const source = await page.inputValue('#source');
  await page.fill('#source', `${source}\n// X82 lifecycle invalidation probe`);
  await page.waitForFunction(() => window.__CHECKABLE_EVIDENCE__.current() === null);
  assert.equal(await page.isDisabled('#checkable-evidence-download'), true);
  assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore,
    'lifecycle invalidation created a runtime worker');

  assert.deepEqual(errors, []);
  assert.deepEqual(outside, []);
  assert.deepEqual(mutations, []);
  assert.equal((await context.cookies()).length, 0);
  process.stdout.write(`${JSON.stringify({ result: 'pass', browser: 'chromium', producerRuns: 0,
    runtimeWorkerCreations: workersBefore, measurements: report.measurements.length,
    sourceReportSha256: report.integrity.sourceReportSha256,
    reportSha256: report.integrity.reportSha256, downloadSha256,
    downloadedBytes: Buffer.byteLength(downloaded), modelLibraryVersion: report.modelContext.lock.version,
    lifecycleInvalidated: true, externalRequests: 0, mutationRequests: 0, cookies: 0,
    screenshot: screenshotPath, reportOutput: outputPath })}\n`);
  await context.close();
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
