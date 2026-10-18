// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));
const base = process.env.X23_UI_URL || 'http://127.0.0.1:18784';
const savedPath = process.env.X23_SAVED_PATH || '/tmp/x23-input-faults.intent-mcu.json';

async function build(page) {
  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded',
    null, { timeout: 60_000 });
  return page.evaluate(() => ({ inputIdentity: window.__M6_STATE__.inputIdentity,
    artifactIdentity: window.__M6_STATE__.artifactIdentity }));
}

async function runAuthored(page) {
  await page.click('#scenario-run');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.authoredResults.length === state.authoredTimeline.scenarios.length;
  }, null, { timeout: 60_000 });
  return page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
}

function semanticEvidence(observation) {
  const observed = structuredClone(observation.observed);
  observed.actualFaults = observed.actualFaults.map(({ appliedCycle, requestedCycle, ...event }) => event);
  observed.requestedFaults = observed.requestedFaults.map(({ sequence, ...event }) => event);
  if (observed.actualInputs?.a1) delete observed.actualInputs.a1.sampleCycle;
  return { schema: observation.schema, scenarioId: observation.scenarioId,
    status: observation.status, outcome: observation.outcome, expected: observation.expected,
    observed, checks: observation.checks };
}

function assertFaultCycles(observation) {
  for (const event of observation.observed.actualFaults) {
    assert.equal(Number.isSafeInteger(event.appliedCycle), true);
    assert.equal(event.appliedCycle >= event.requestedCycle, true);
    assert.equal(event.appliedCycle <= observation.expected.observationWindow.endMilliseconds * 16_000, true);
  }
}

let browser;
(async () => {
  const { runSavedHeadlessExperiment } = await import('../src/headless-experiment-runner.mjs');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.selectOption('#example-select', 'avr-thermostat-boundary-v1');
  await page.click('#project-demo');
  assert.match(await page.locator('#fault-suite-summary').textContent(), /bus response is unsupported/iu);

  await page.click('#fault-suite-load');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment
    ?.authoredTimeline?.schema === 'intent-mcu-scenario-timeline@3');
  const timeline = await page.evaluate(() => structuredClone(
    window.__M6_STATE__.thermostatExperiment.authoredTimeline,
  ));
  assert.equal(timeline.scenarios.length, 3);
  assert.deepEqual(timeline.faultSuite.supportedFaults, [
    'fault.button-bounce-v1', 'fault.temperature-stuck-v1', 'fault.button-open-circuit-v1',
  ]);
  assert.equal(timeline.faultSuite.unsupportedFaults[0].id, 'fault.bus-response-v1');
  await page.click('#fault-suite-replay');
  assert.deepEqual(await page.evaluate(() => structuredClone(
    window.__M6_STATE__.thermostatExperiment.authoredTimeline,
  )), timeline);

  const firstBuild = await build(page);
  const browserRun = await runAuthored(page);
  assert.equal(browserRun.authoredResults.length, 3);
  assert.equal(browserRun.authoredResults.every((item) => item.status === 'passed'), true,
    JSON.stringify(browserRun.authoredResults));
  const bounce = browserRun.authoredResults.find((item) => item.scenarioId === 'FAULT-BUTTON-BOUNCE');
  const stuck = browserRun.authoredResults.find((item) => item.scenarioId === 'FAULT-TEMPERATURE-STUCK');
  const opened = browserRun.authoredResults.find((item) => item.scenarioId === 'FAULT-D2-OPEN');
  assert.equal(bounce.observed.actualFaults.filter((item) => item.kind === 'button-bounce-transition').length, 5);
  assert.equal(stuck.observed.actualInputs.a1.faultState, 'STUCK');
  assert.equal(stuck.observed.actualFaults.some((item) => item.kind === 'temperature-stuck-held'), true);
  assert.deepEqual({ drive: opened.observed.actualInputs.d2.externalDrive,
    mode: opened.observed.actualInputs.d2.mode, level: opened.observed.actualInputs.d2.level },
  { drive: 'RELEASED', mode: 'INPUT_PULLUP', level: true });
  assert.equal(opened.observed.actualFaults.some((item) => item.kind === 'button-open-circuit'
    && item.externalDrive === 'RELEASED'), true);

  const missing = await page.evaluate(async () => {
    const prior = window.__SHARED_DOMAIN_ENGINE__.lastTest();
    const request = JSON.parse(prior.request);
    request.snapshot.faultEvents = [];
    return window.__AGENT_DOMAIN_ENGINE__.execute(JSON.stringify(request), 'board.atmega328p-16mhz-v1');
  });
  assert.equal(missing.observation.status, 'indeterminate');
  assert.equal(missing.observation.outcome.reasons.includes('FAULT_PRODUCER_EVIDENCE_INCOMPLETE'), true);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  await download.saveAs(savedPath);
  const savedText = fs.readFileSync(savedPath, 'utf8');
  const saved = JSON.parse(savedText);
  assert.equal(saved.scenarioTimeline.schema, 'intent-mcu-scenario-timeline@3');
  assert.deepEqual(saved.scenarioTimeline.scenarios, timeline.scenarios);
  assert.doesNotMatch(savedText, /authoredResults|runtimeBinding|firmwareHex|"verdict"/u);

  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.setInputFiles('#project-open-input', savedPath);
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment
    ?.authoredTimeline?.schema === 'intent-mcu-scenario-timeline@3');
  const afterOpen = await page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
  assert.deepEqual(afterOpen.authoredTimeline, timeline);
  assert.deepEqual(afterOpen.authoredResults, []);
  assert.equal(afterOpen.freshBuildReady, false);
  const reopenedBuild = await build(page);
  assert.deepEqual(reopenedBuild, firstBuild);
  const reopened = await runAuthored(page);
  assert.equal(reopened.authoredResults.every((item) => item.status === 'passed'), true);

  const headless = await runSavedHeadlessExperiment(savedText);
  assert.equal(headless.ok, true, JSON.stringify(headless));
  assert.equal(headless.compiledFresh, true);
  assert.equal(headless.status, 'passed', JSON.stringify(headless));
  assert.equal(headless.association.compilerInputIdentity, firstBuild.inputIdentity);
  assert.equal(headless.association.artifactIdentity, firstBuild.artifactIdentity);
  assert.equal(headless.observations.length, reopened.authoredResults.length);
  for (const [index, browserObservation] of reopened.authoredResults.entries()) {
    assertFaultCycles(browserObservation);
    assertFaultCycles(headless.observations[index]);
    assert.deepEqual(semanticEvidence(headless.observations[index]), semanticEvidence(browserObservation));
  }
  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({ result: 'pass', cases: 3, allPassed: true,
    bounceTransitions: 5, stuckA1: 'STUCK', d2ExternalDrive: 'RELEASED',
    d2Resolution: 'INPUT_PULLUP HIGH', busResponse: 'unsupported',
    missingEvidence: 'indeterminate', authorityRestored: false,
    artifactIdentity: firstBuild.artifactIdentity }));
  await context.close(); await browser.close(); browser = null;
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
