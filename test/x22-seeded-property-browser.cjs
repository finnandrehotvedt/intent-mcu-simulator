// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));
const base = process.env.X22_UI_URL || 'http://127.0.0.1:18783';
const savedPath = process.env.X22_SAVED_PATH || '/tmp/x22-seeded-property.intent-mcu.json';
const seedA = 0x12345678;
const seedB = 0x87654321;

async function build(page) {
  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded',
    null, { timeout: 60_000 });
  return page.evaluate(() => ({
    inputIdentity: window.__M6_STATE__.inputIdentity,
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
  }));
}

async function runAuthored(page) {
  await page.click('#scenario-run');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.authoredResults.length === state.authoredTimeline.scenarios.length;
  }, null, { timeout: 60_000 });
  return page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
}

async function runFixed(page) {
  await page.click('#thermostat-run-tests');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.results.length === 4;
  }, null, { timeout: 40_000 });
  return page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
}

function semanticEvidence(observation) {
  const observed = structuredClone(observation.observed);
  if (observed.actualInputs?.a1) delete observed.actualInputs.a1.sampleCycle;
  if (observed.actualInputs?.d2) delete observed.actualInputs.d2.sampleCycle;
  return {
    schema: observation.schema,
    scenarioId: observation.scenarioId,
    status: observation.status,
    outcome: observation.outcome,
    expected: observation.expected,
    observed,
    checks: observation.checks,
  };
}

function assertActualTime(observation, label) {
  const window = observation.expected.observationWindow;
  assert.equal(Number.isFinite(observation.virtualMilliseconds), true, `${label} timestamp missing`);
  assert.equal(observation.virtualMilliseconds >= window.startMilliseconds
    && observation.virtualMilliseconds <= window.endMilliseconds, true, `${label} timestamp outside window`);
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

  await page.locator('#seeded-property-seed').fill(String(seedA));
  await page.click('#seeded-property-generate');
  await page.waitForFunction((seed) => window.__M6_STATE__.thermostatExperiment
    ?.authoredTimeline?.propertySuite?.seed === seed, seedA);
  const firstSequence = await page.evaluate(() => structuredClone(
    window.__M6_STATE__.thermostatExperiment.authoredTimeline,
  ));
  assert.equal(firstSequence.scenarios.length, 8);
  assert.equal(firstSequence.propertySuite.algorithm, 'lcg32-1664525-1013904223-v1');
  assert.equal(firstSequence.propertySuite.resourceBudget.generatorSteps, 15);
  assert.deepEqual(firstSequence.propertySuite.validInputs.temperatureC,
    { minimum: -50, maximum: 150, integer: true });

  await page.click('#seeded-property-replay');
  assert.deepEqual(await page.evaluate(() => structuredClone(
    window.__M6_STATE__.thermostatExperiment.authoredTimeline,
  )), firstSequence, 'stored seed did not replay the identical sequence');

  await page.locator('#seeded-property-seed').fill(String(seedB));
  await page.click('#seeded-property-generate');
  const secondSequence = await page.evaluate(() => structuredClone(
    window.__M6_STATE__.thermostatExperiment.authoredTimeline,
  ));
  assert.notDeepEqual(secondSequence.scenarios, firstSequence.scenarios,
    'different seed did not meaningfully change the valid input sequence');
  await page.locator('#seeded-property-seed').fill(String(seedA));
  await page.click('#seeded-property-generate');
  assert.deepEqual(await page.evaluate(() => structuredClone(
    window.__M6_STATE__.thermostatExperiment.authoredTimeline,
  )), firstSequence, 'seed A did not regenerate identically after seed B');

  const correctBuild = await build(page);
  const correctFixed = await runFixed(page);
  assert.equal(correctFixed.results.every((item) => item.status === 'passed'), true,
    'correct fixed M1 did not remain 4/4');
  const correct = await runAuthored(page);
  assert.equal(correct.authoredResults.length, 8);
  assert.equal(correct.authoredResults.every((item) => item.status === 'passed'), true,
    `correct seeded suite failed: ${JSON.stringify(correct.authoredResults)}`);
  correct.authoredResults.forEach((item) => assertActualTime(item, `correct ${item.scenarioId}`));

  const missingEvidence = await page.evaluate(async () => {
    const prior = window.__SHARED_DOMAIN_ENGINE__.lastTest();
    const request = JSON.parse(prior.request);
    request.snapshot.pins = [];
    return window.__AGENT_DOMAIN_ENGINE__.execute(JSON.stringify(request), 'board.atmega328p-16mhz-v1');
  });
  assert.equal(missingEvidence.observation.status, 'indeterminate');
  assert.equal(missingEvidence.observation.outcome.reasons.includes('OBSERVATION_PIN_MISSING'), true);

  const [correctDownload] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  await correctDownload.saveAs(savedPath);
  const savedText = fs.readFileSync(savedPath, 'utf8');
  const saved = JSON.parse(savedText);
  assert.equal(saved.schema, 'intent-mcu-project-envelope@6');
  assert.equal(saved.scenarioTimeline.schema, 'intent-mcu-scenario-timeline@2');
  assert.equal(saved.scenarioTimeline.propertySuite.seed, seedA);
  assert.deepEqual(saved.scenarioTimeline.scenarios, firstSequence.scenarios);
  assert.doesNotMatch(savedText, /authoredResults|runtimeBinding|firmwareHex|"verdict"/u);

  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.setInputFiles('#project-open-input', savedPath);
  await page.waitForFunction((seed) => window.__M6_STATE__.thermostatExperiment
    ?.authoredTimeline?.propertySuite?.seed === seed, seedA);
  const opened = await page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
  assert.deepEqual(opened.authoredTimeline, firstSequence);
  assert.deepEqual(opened.authoredResults, []);
  assert.equal(opened.freshBuildReady, false, 'Open restored executable authority');
  const reopenedBuild = await build(page);
  assert.deepEqual(reopenedBuild, correctBuild, 'same saved source did not rebuild to the same identities');
  const reopened = await runAuthored(page);
  assert.equal(reopened.authoredResults.every((item) => item.status === 'passed'), true);

  await page.click('#thermostat-load-bad');
  const badBuild = await build(page);
  assert.notEqual(badBuild.artifactIdentity, correctBuild.artifactIdentity);
  const badFixed = await runFixed(page);
  assert.equal(badFixed.knownBadCaught, true, 'fixed M1 known-bad regression was not caught');
  assert.equal(badFixed.results.filter((item) => item.status === 'passed').length, 3);
  const bad = await runAuthored(page);
  const browserFailures = bad.authoredResults.filter((item) => item.status === 'failed');
  assert.equal(browserFailures.length, 1, JSON.stringify(bad.authoredResults));
  const browserCounterexample = browserFailures[0];
  const counterexampleScenario = bad.authoredTimeline.scenarios.find(
    (item) => item.id === browserCounterexample.scenarioId,
  );
  assert.equal(counterexampleScenario.events.find((item) => item.kind === 'input.temperature-c').valueC, 31);
  assert.equal(counterexampleScenario.events.find((item) => item.kind === 'input.button-pressed').pressed, true);
  assertActualTime(browserCounterexample, 'browser counterexample');
  assert.match(await page.locator('#seeded-property-summary').textContent(),
    new RegExp(`observed counterexample ${browserCounterexample.scenarioId}`));

  const [badDownload] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  await badDownload.saveAs(savedPath);
  const badSavedText = fs.readFileSync(savedPath, 'utf8');
  assert.doesNotMatch(badSavedText, /authoredResults|runtimeBinding|firmwareHex|"verdict"/u);
  const headless = await runSavedHeadlessExperiment(badSavedText);
  assert.equal(headless.ok, true, JSON.stringify(headless));
  assert.equal(headless.compiledFresh, true);
  assert.equal(headless.status, 'failed');
  assert.equal(headless.association.compilerInputIdentity, badBuild.inputIdentity);
  assert.equal(headless.association.artifactIdentity, badBuild.artifactIdentity);
  assert.equal(headless.observations.length, bad.authoredResults.length);
  for (const [index, browserObservation] of bad.authoredResults.entries()) {
    const headlessObservation = headless.observations[index];
    assertActualTime(browserObservation, `browser ${browserObservation.scenarioId}`);
    assertActualTime(headlessObservation, `headless ${headlessObservation.scenarioId}`);
    assert.deepEqual(semanticEvidence(headlessObservation), semanticEvidence(browserObservation));
  }
  assert.equal(headless.primaryObservation.scenarioId, browserCounterexample.scenarioId);

  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({
    result: 'pass', seed: seedA, algorithm: firstSequence.propertySuite.algorithm,
    cases: 8, generatorSteps: 15, correctPasses: 8,
    differentSeedDiffers: true, savedSeedReplayExact: true,
    counterexample: {
      scenarioId: browserCounterexample.scenarioId,
      browserMilliseconds: browserCounterexample.virtualMilliseconds,
      headlessMilliseconds: headless.primaryObservation.virtualMilliseconds,
      observationWindow: browserCounterexample.expected.observationWindow,
    },
    correctM1Passes: 4, knownBadM1ControlPasses: 3,
    missingEvidenceIndeterminate: true, authorityRestored: false,
    correctArtifact: correctBuild.artifactIdentity, knownBadArtifact: badBuild.artifactIdentity,
  }));
  await context.close(); await browser.close(); browser = null;
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
