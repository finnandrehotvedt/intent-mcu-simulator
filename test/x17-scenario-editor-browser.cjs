// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');

const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));
const base = process.env.X17_UI_URL || 'http://127.0.0.1:18779';
const compilerOrigin = process.env.X17_COMPILER_ORIGIN || null;
const savedPath = process.env.X17_SAVED_PATH || '/tmp/x17-authored.intent-mcu.json';

async function installCompilerRoute(page) {
  if (!compilerOrigin) return;
  await page.route(`${base}/api/**`, async (route) => {
    const request = route.request();
    const incoming = new URL(request.url());
    const upstream = new URL(`${incoming.pathname}${incoming.search}`, compilerOrigin);
    const headers = { ...request.headers(), origin: compilerOrigin, referer: `${compilerOrigin}/` };
    delete headers.host; delete headers['content-length'];
    const response = await fetch(upstream, {
      method: request.method(), headers, body: request.postDataBuffer(),
    });
    const body = Buffer.from(await response.arrayBuffer());
    const responseHeaders = Object.fromEntries([...response.headers].filter(
      ([key]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(key),
    ));
    await route.fulfill({ status: response.status, headers: responseHeaders, body });
  });
}

async function build(page) {
  await page.click('#build');
  try {
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded',
      null, { timeout: 60_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      buildState: document.querySelector('#build-state')?.textContent,
      compilerOutput: document.querySelector('#compiler-output')?.textContent,
      projectMessage: document.querySelector('#project-message')?.textContent,
    }));
    throw new Error(`${error.message}; X17_BUILD=${JSON.stringify(diagnostic)}`);
  }
}

async function runAuthored(page) {
  await page.click('#scenario-run');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.authoredResults.length === state.authoredTimeline.scenarios.length;
  }, null, { timeout: 40_000 });
  return page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
}

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await installCompilerRoute(page);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.selectOption('#example-select', 'avr-thermostat-boundary-v1');
  await page.click('#project-demo');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.authoredTimeline?.scenarios.length === 4);
  await build(page);

  await page.click('#thermostat-run-tests');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.results.length === 4;
  }, null, { timeout: 40_000 });
  assert.equal(await page.evaluate(() => window.__M6_STATE__.thermostatExperiment.results
    .every((result) => result.status === 'passed')), true, 'correct M1 regression did not pass 4/4');
  const missingEvidence = await page.evaluate(async () => {
    const prior = window.__SHARED_DOMAIN_ENGINE__.lastTest();
    const request = JSON.parse(prior.request);
    request.snapshot.pins = [];
    return window.__AGENT_DOMAIN_ENGINE__.execute(JSON.stringify(request), 'board.atmega328p-16mhz-v1');
  });
  assert.equal(missingEvidence.observation.status, 'indeterminate');
  assert.equal(missingEvidence.observation.outcome.jobStatus, 'completed');
  assert.equal(missingEvidence.observation.outcome.reasons.includes('OBSERVATION_PIN_MISSING'), true);

  const firmwareBefore = await page.evaluate(() => ({
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
    inputIdentity: window.__M6_STATE__.inputIdentity,
    source: window.__M6_PROJECT__().project.source.files.find((file) => file.name === 'main.ino').content,
  }));

  await page.click('#scenario-add');
  assert.equal(await page.locator('.scenario-card').count(), 5, 'keyboard-editable scenario was not added');
  const authoredCard = page.locator('.scenario-card').last();
  const name = authoredCard.locator('input[aria-label="Scenario 5 name"]');
  await name.focus(); await name.press('Control+A'); await name.type('Hot enabled authored case'); await name.press('Tab');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment.authoredTimeline.scenarios.at(-1).name === 'Hot enabled authored case');

  const addTemperature = authoredCard.getByRole('button', { name: 'Add temperature event' });
  await addTemperature.focus(); await addTemperature.press('Enter');
  assert.equal(await authoredCard.locator('.input-temperature-c').count(), 2, 'keyboard Add did not create a row');
  await page.locator('#scenario-undo').focus(); await page.locator('#scenario-undo').press('Enter');
  assert.equal(await authoredCard.locator('.input-temperature-c').count(), 1, 'keyboard Undo did not remove the row');
  await page.locator('#scenario-redo').focus(); await page.locator('#scenario-redo').press('Enter');
  assert.equal(await authoredCard.locator('.input-temperature-c').count(), 2, 'keyboard Redo did not restore the row');
  await page.locator('#scenario-undo').focus(); await page.locator('#scenario-undo').press('Enter');
  assert.equal(await authoredCard.locator('.input-temperature-c').count(), 1,
    'second keyboard Undo did not restore the intended authored state');

  const addButton = authoredCard.getByRole('button', { name: 'Add button event' });
  await addButton.focus(); await addButton.press('Enter');
  assert.equal(await authoredCard.locator('.input-button-pressed').count(), 2,
    'keyboard Add did not create the temporary button event');
  await authoredCard.locator('.input-button-pressed').last().getByRole('button', { name: 'Delete event' }).click();
  assert.equal(await authoredCard.locator('.input-button-pressed').count(), 1,
    'Delete did not remove the temporary button event');
  await page.locator('#scenario-undo').click();
  assert.equal(await authoredCard.locator('.input-button-pressed').count(), 2,
    'Undo did not restore the deleted button event');
  await page.locator('#scenario-redo').click();
  assert.equal(await authoredCard.locator('.input-button-pressed').count(), 1,
    'Redo did not reapply the button-event deletion');

  const temperature = authoredCard.locator('.input-temperature-c input[type="number"]').last();
  await temperature.focus(); await temperature.press('Control+A'); await temperature.type('151'); await temperature.press('Tab');
  await page.waitForFunction(() => document.querySelector('#scenario-editor-message').textContent.includes('SCENARIO_TEMPERATURE_EVENT'));
  assert.equal(await authoredCard.locator('.input-temperature-c input[type="number"]').last().inputValue(), '31',
    'invalid row edit was not rejected atomically');
  assert.match(await page.locator('#scenario-editor-message').textContent(), /Location:/u,
    'rejection did not identify an error location');
  assert.match(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || ''), /temperature/u,
    'invalid row did not restore keyboard focus');

  const firmwareAfterEdit = await page.evaluate(() => ({
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
    inputIdentity: window.__M6_STATE__.inputIdentity,
    freshBuildReady: window.__M6_STATE__.thermostatExperiment.freshBuildReady,
    authoredResults: window.__M6_STATE__.thermostatExperiment.authoredResults,
  }));
  assert.deepEqual(firmwareAfterEdit, {
    artifactIdentity: firmwareBefore.artifactIdentity,
    inputIdentity: firmwareBefore.inputIdentity,
    freshBuildReady: true,
    authoredResults: [],
  }, 'timeline edit changed firmware identity or retained a prior verdict');

  const passing = await runAuthored(page);
  assert.equal(passing.authoredResults.length, 5);
  assert.equal(passing.authoredResults.every((result) => result.status === 'passed'), true,
    `meaningful authored boundary did not pass: ${JSON.stringify(passing.authoredResults)}`);

  const expectation = authoredCard.locator('.expect-pin-level select');
  await expectation.selectOption('true');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment.authoredResults.length === 0);
  const wrong = await runAuthored(page);
  const caught = wrong.authoredResults.at(-1);
  assert.equal(caught.status, 'failed');
  assert.equal(caught.expected.level, true);
  assert.equal(caught.observed.level, false);
  assert.equal(caught.checks.primaryExecutedPin, false);
  assert.equal(caught.outcome.academicStatus, 'failed');
  assert.equal(caught.outcome.jobStatus, 'completed');
  assert.equal(caught.outcome.evidenceStatus, 'complete');

  await page.click('#project-reload');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.authoredTimeline?.scenarios.length === 5
      && state.authoredResults.length === 0 && !state.freshBuildReady;
  });
  assert.equal(await page.evaluate(() => window.__M6_STATE__.thermostatExperiment
    .authoredTimeline.scenarios.at(-1).events.at(-1).level), true,
  'browser recovery did not retain the accepted timeline edit');
  assert.equal(await page.isDisabled('#scenario-run'), true,
    'browser recovery allowed a stale artifact to run');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true
    && window.__M6_STATE__.thermostatExperiment?.authoredTimeline?.scenarios.length === 5);
  assert.equal(await page.evaluate(() => window.__M6_STATE__.thermostatExperiment
    .authoredTimeline.scenarios.at(-1).events.at(-1).level), true,
  'full page reload did not retain the accepted timeline edit');
  assert.equal(await page.isDisabled('#scenario-run'), true,
    'full page reload restored stale executable authority');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  await download.saveAs(savedPath);
  const savedText = fs.readFileSync(savedPath, 'utf8');
  const saved = JSON.parse(savedText);
  assert.equal(saved.schema, 'intent-mcu-project-envelope@8');
  assert.equal(saved.scenarioTimeline.scenarios.length, 5);
  assert.doesNotMatch(savedText, /authoredResults|runtimeBinding|firmwareHex|"verdict"/u);
  const sourceHash = crypto.createHash('sha256').update(firmwareBefore.source).digest('hex');
  const savedSourceHash = crypto.createHash('sha256').update(
    saved.project.project.source.files.find((file) => file.name === 'main.ino').content,
  ).digest('hex');
  assert.equal(savedSourceHash, sourceHash, 'timeline editing changed the full firmware source hash');

  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.setInputFiles('#project-open-input', savedPath);
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.authoredTimeline?.scenarios.length === 5);
  const opened = await page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
  assert.deepEqual(opened.authoredResults, [], 'Open restored a prior authored verdict');
  assert.equal(opened.freshBuildReady, false, 'Open restored stale firmware authority');
  assert.equal(opened.authoredTimeline.scenarios.at(-1).events.at(-1).level, true,
    'Open did not round-trip the intentionally wrong expectation');

  await page.click('#thermostat-load-bad');
  await build(page);
  await page.click('#thermostat-run-tests');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.results.length === 4;
  }, null, { timeout: 40_000 });
  const knownBad = await page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
  assert.equal(knownBad.knownBadCaught, true, 'known-bad M1 equality defect was not caught');
  assert.equal(knownBad.results.find((result) => result.scenarioId === 'THERM-SCENARIO-EQUALITY-ENABLED').status,
    'failed', 'known-bad equality scenario did not retain timing-bound failure detection');
  assert.equal(knownBad.results.every((result) => result.outcome.jobStatus === 'completed'), true);

  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({ result: 'pass', scenarios: 5, authoredPasses: 5,
    editorAddEditDeleteUndoRedo: true,
    wrongExpectationCaught: true, sourceHashPreserved: true, browserRecoveryClearedVerdict: true,
    fileOpenClearedVerdict: true,
    artifactIdentityPreservedAcrossTimelineEdit: true, correctM1Passes: 4,
    knownBadM1Caught: true, missingEvidenceRefused: true,
    academicAndJobStatusSeparated: true, wrongObservedAtMilliseconds: caught.virtualMilliseconds,
    observationWindow: caught.expected.observationWindow, savedPath }));
  await context.close(); await browser.close(); browser = null;
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
