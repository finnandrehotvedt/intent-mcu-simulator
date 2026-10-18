// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X24_UI_URL || 'http://127.0.0.1:18786';
const fullPath = process.env.X24_FULL_PATH || '/tmp/x24-full.intent-mcu.json';
const reducedPath = process.env.X24_REDUCED_PATH || '/tmp/x24-reduced.intent-mcu.json';
const screenshot = process.env.X24_SCREENSHOT || null;
const seed = 305419896;

async function build(page) {
  await page.click('#build');
  await page.waitForFunction(() => {
    const text = document.querySelector('#build-state')?.textContent || '';
    return text === 'Build succeeded' || /failed|error|unavailable/iu.test(text);
  }, null, { timeout: 60_000 });
  const buildState = await page.locator('#build-state').textContent();
  const buildDetail = await page.locator('#diagnostics').textContent();
  assert.equal(buildState, 'Build succeeded', buildDetail);
  return page.evaluate(() => ({
    inputIdentity: window.__M6_STATE__.inputIdentity,
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
  }));
}

async function runAuthored(page, count) {
  await page.click('#scenario-run');
  await page.waitForFunction((expected) => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.authoredResults.length === expected;
  }, count, { timeout: 90_000 });
  return page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
}

function reductionSemantics(result) {
  return {
    schema: result.schema,
    reducerId: result.reducerId,
    profile: result.profile,
    experimentId: result.experimentId,
    seed: result.seed,
    limits: result.limits,
    association: result.association,
    failureSignature: result.failureSignature,
    original: result.original,
    reduced: result.reduced,
    attempts: result.attempts,
    oneMinimality: result.oneMinimality,
    stopReason: result.stopReason,
    reducedTimeline: result.reducedTimeline,
  };
}

let browser;
(async () => {
  const {
    runSavedHeadlessCounterexampleReduction, runSavedHeadlessExperiment,
  } = await import('../src/headless-experiment-runner.mjs');
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
  await page.locator('#seeded-property-seed').fill(String(seed));
  await page.click('#seeded-property-generate');
  await page.waitForFunction((expected) => window.__M6_STATE__.thermostatExperiment
    ?.authoredTimeline?.propertySuite?.seed === expected, seed);

  const correctBuild = await build(page);
  const correct = await runAuthored(page, 8);
  assert.equal(correct.authoredResults.every((item) => item.status === 'passed'), true,
    JSON.stringify(correct.authoredResults));

  await page.click('#thermostat-load-bad');
  const badBuild = await build(page);
  assert.notEqual(badBuild.artifactIdentity, correctBuild.artifactIdentity);
  const baseline = await runAuthored(page, 8);
  const failures = baseline.authoredResults.filter((item) => item.status === 'failed');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].scenarioId, 'PROPERTY-CASE-08');
  assert.equal(failures[0].outcome.reasons.includes('EXPECTED_PIN_LEVEL_MISMATCH'), true);
  assert.equal(failures[0].observed.level, true);
  assert.equal(failures[0].expected.level, false);
  assert.equal(await page.locator('#counterexample-reduce').isEnabled(), true);

  const [fullDownload] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  await fullDownload.saveAs(fullPath);
  const fullText = fs.readFileSync(fullPath, 'utf8');

  await page.click('#counterexample-reduce');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.counterexampleReductionActive;
  }, null, { timeout: 420_000 });
  const reductionMessage = await page.locator('#scenario-editor-message').textContent();
  assert.ok(await page.evaluate(() => Boolean(
    window.__M6_STATE__.thermostatExperiment.counterexampleReduction,
  )), reductionMessage);
  const browserResult = await page.evaluate(() => structuredClone(
    window.__M6_STATE__.thermostatExperiment.counterexampleReduction,
  ));
  assert.equal(browserResult.original.scenarioCount, 8);
  assert.equal(browserResult.original.eventCount, 24);
  assert.equal(browserResult.reduced.scenarioCount, 1);
  assert.equal(browserResult.reduced.eventCount, 3);
  assert.equal(browserResult.attempts.filter((item) => item.replayed).length, 7);
  assert.equal(browserResult.oneMinimality.length, 3);
  assert.equal(browserResult.failureSignature.sourceBuildInputSha256, badBuild.inputIdentity);
  assert.equal(browserResult.failureSignature.artifactSha256, badBuild.artifactIdentity);
  assert.match(await page.locator('#counterexample-reduction-summary').textContent(), /8 scenarios \/ 24 events → 1 scenario \/ 3 necessary events/u);
  if (screenshot) {
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    await page.locator('#thermostat-experiment').screenshot({ path: screenshot, animations: 'disabled' });
  }

  const [reducedDownload] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  await reducedDownload.saveAs(reducedPath);
  const reducedText = fs.readFileSync(reducedPath, 'utf8');
  const reduced = JSON.parse(reducedText);
  assert.equal(reduced.scenarioTimeline.schema, 'intent-mcu-scenario-timeline@4');
  assert.equal(reduced.scenarioTimeline.scenarios.length, 1);
  assert.equal(reduced.scenarioTimeline.scenarios[0].events.length, 3);
  assert.equal(reduced.scenarioTimeline.reductionProvenance.authority,
    'inert-provenance-fresh-build-and-replay-required');
  assert.doesNotMatch(reducedText, /authoredResults|experimentResults|runtimeBinding|firmwareHex|"verdict"/u);

  const headlessReduction = await runSavedHeadlessCounterexampleReduction(fullText);
  assert.equal(headlessReduction.ok, true, JSON.stringify(headlessReduction));
  assert.equal(headlessReduction.compiledFresh, true);
  assert.deepEqual(reductionSemantics(headlessReduction.reduction), reductionSemantics(browserResult));

  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.setInputFiles('#project-open-input', reducedPath);
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment
    ?.authoredTimeline?.schema === 'intent-mcu-scenario-timeline@4');
  const opened = await page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
  assert.equal(opened.freshBuildReady, false);
  assert.equal(opened.counterexampleReduction, null);
  assert.deepEqual(opened.authoredResults, []);
  assert.match(await page.locator('#counterexample-reduction-summary').textContent(), /Fresh Build and replay are required/u);
  const reopenedBuild = await build(page);
  assert.deepEqual(reopenedBuild, badBuild);
  const replayed = await runAuthored(page, 1);
  assert.equal(replayed.authoredResults[0].status, 'failed');
  assert.equal(replayed.authoredResults[0].scenarioId, 'PROPERTY-CASE-08');

  const headlessReplay = await runSavedHeadlessExperiment(reducedText);
  assert.equal(headlessReplay.ok, true, JSON.stringify(headlessReplay));
  assert.equal(headlessReplay.compiledFresh, true);
  assert.equal(headlessReplay.status, 'failed');
  assert.equal(headlessReplay.observations.length, 1);
  assert.equal(headlessReplay.primaryObservation.scenarioId, 'PROPERTY-CASE-08');
  assert.deepEqual(errors, [], JSON.stringify(errors));
  assert.equal((await context.cookies()).length, 0);

  console.log(JSON.stringify({
    result: 'pass', seed, original: '8 scenarios / 24 events', reduced: '1 scenario / 3 events',
    candidateReplays: 7, oneMinimalityChecks: 3, correctPasses: 8,
    browserHeadlessParity: true, savedAuthorityRestored: false, freshReplayFailure: true,
    inputIdentity: badBuild.inputIdentity, artifactIdentity: badBuild.artifactIdentity, screenshot,
  }));
  await context.close(); await browser.close(); browser = null;
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
