// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.X67_UI_URL || 'http://127.0.0.1:18837';
const screenshotPath = process.env.X67_UI_SCREENSHOT || null;

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; const outside = []; const mutations = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      mutations.push({ method: request.method(), path: url.pathname });
    }
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('#project-demo');
  await page.waitForFunction(() => document.querySelector('#example-picker-dialog').open === true);
  await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);

  const initial = await page.evaluate(() => ({
    disabled: document.querySelector('#experiment-package-download').disabled,
    reason: document.querySelector('#experiment-package-state').textContent,
    detailOpen: document.querySelector('#experiment-package-detail').open,
  }));
  assert.equal(initial.disabled, true);
  assert.match(initial.reason, /Lock or open/u);
  assert.equal(initial.detailOpen, false, 'package explanation must stay compact by default');

  const [expectationDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#expectation-reference-lock'),
  ]);
  assert.match(expectationDownload.suggestedFilename(), /\.intent-mcu-expectations\.json$/u);
  assert.match(await page.textContent('#experiment-package-state'), /Build this exact project/u);

  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#scenario-run').disabled, null, { timeout: 10_000 });
  assert.match(await page.textContent('#experiment-package-state'), /Run the authored scenarios/u);

  await page.click('#scenario-run');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.authoredResults.length === 4;
  }, null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#experiment-package-download').disabled);
  assert.match(await page.textContent('#experiment-package-state'), /local download ready/u);

  const [packageDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#experiment-package-download'),
  ]);
  const downloadPath = await packageDownload.path();
  const source = fs.readFileSync(downloadPath, 'utf8');
  const value = JSON.parse(source);
  assert.match(packageDownload.suggestedFilename(), /\.intent-mcu-experiment\.json$/u);
  assert.equal(value.schema, 'intent-mcu-experiment-package@1');
  assert.equal(value.profile, 'board.atmega328p-16mhz-v1');
  assert.equal(value.project.schema, 'intent-mcu-project-envelope@6');
  const authored = value.project.project.project ?? value.project.project;
  const circuit = value.project.project.candidateCircuit ?? authored.circuit;
  assert.equal(authored.source.files.some((file) => file.name === 'main.ino'), true);
  assert(circuit.components.length >= 5);
  assert.equal(value.project.scenarioTimeline.scenarios.length, 4);
  assert.equal(value.expectation.schema, 'intent-mcu-expectation-reference@1');
  assert.equal(value.report.schema, 'intent-mcu-authored-scenario-report@1');
  assert.equal(value.report.results.length, 4);
  assert.equal(value.report.completeness.allEvidenceComplete, true);
  assert.equal(value.report.results.every((result) => result.retention.inputEventsDropped === 0), true);
  assert.deepEqual(value.report.authority, { executable: false, runtime: false, verdict: false });
  assert.equal(Object.values(value.bindings).every((item) => /^[a-f0-9]{64}$/u.test(item)), true);
  assert.equal(/firmwareHex|elfBase64|uf2|runtimeState|sessionId|"capability"\s*:|"token"\s*:/u.test(source), false);
  const stateAfterDownload = await page.evaluate(() => window.__X67_EXPERIMENT_PACKAGE__.state());
  assert.equal(stateAfterDownload.ready, true);
  assert.equal(stateAfterDownload.sha256, sha256(source));

  await page.click('#experiment-package-detail summary');
  assert.equal(await page.$eval('#experiment-package-detail', (node) => node.open), true);
  assert.match(await page.textContent('#experiment-package-detail'), /cannot recognize every secret/u);
  if (screenshotPath) {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.locator('.expectation-reference').screenshot({ path: screenshotPath });
  }

  await page.click('#reset');
  await page.waitForFunction(() => document.querySelector('#experiment-package-download').disabled);
  assert.match(await page.textContent('#experiment-package-state'), /Run the authored scenarios/u);
  await page.selectOption('#board-select', 'board.rp2040-pico-v1');
  await page.waitForFunction(() => document.querySelector('#experiment-package-state').textContent.includes('AVR thermostat'));
  assert.equal(await page.isDisabled('#experiment-package-download'), true);

  assert.equal(errors.length, 0, `browser errors: ${JSON.stringify(errors)}`);
  assert.equal(outside.length, 0, `third-party requests: ${JSON.stringify(outside)}`);
  assert.deepEqual(mutations, [{ method: 'POST', path: '/api/build' }]);
  assert.equal((await context.cookies()).length, 0);
  console.log(JSON.stringify({ result: 'pass', browser: 'chromium', viewport: '1440x1000',
    packageFilename: packageDownload.suggestedFilename(), packageSha256: sha256(source),
    packageBytes: Buffer.byteLength(source), scenarios: value.report.results.length,
    aggregate: value.report.aggregate.academicStatus, resetInvalidated: true,
    unsupportedProfileExplained: true, buildRequests: 1, outsideRequests: 0, cookies: 0 }));
  await context.close();
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
