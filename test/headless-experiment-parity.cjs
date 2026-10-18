// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));
const base = process.env.X15_UI_URL || 'http://127.0.0.1:18782';

function semanticEvidence(observation) {
  return {
    schema: observation.schema,
    scenarioId: observation.scenarioId,
    status: observation.status,
    outcome: observation.outcome,
    expected: observation.expected,
    observed: observation.observed,
    checks: observation.checks,
  };
}

function assertActualTime(observation, label) {
  assert.equal(Number.isFinite(observation.virtualMilliseconds), true,
    `${label} did not retain an actual observation timestamp`);
  assert.equal(observation.virtualMilliseconds >= observation.expected.observationWindow.startMilliseconds
    && observation.virtualMilliseconds <= observation.expected.observationWindow.endMilliseconds, true,
  `${label} timestamp escaped its authored observation window`);
}

async function browserVariant(browser, firmwareVariant, prefix) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.selectOption('#example-select', 'avr-thermostat-boundary-v1');
    await page.click('#project-demo');
    await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.authoredTimeline?.scenarios.length === 4);
    if (firmwareVariant === 'known-bad-equality') {
      await page.click('#thermostat-load-bad');
      await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.variant === 'known-bad-equality');
    }
    await page.click('#build');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded',
      null, { timeout: 60_000 });
    const build = await page.evaluate(() => ({
      inputIdentity: window.__M6_STATE__.inputIdentity,
      artifactIdentity: window.__M6_STATE__.artifactIdentity,
    }));
    await page.click('#scenario-run');
    await page.waitForFunction(() => {
      const state = window.__M6_STATE__.thermostatExperiment;
      return state && !state.running && state.authoredResults.length === state.authoredTimeline.scenarios.length;
    }, null, { timeout: 40_000 });
    const run = await page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    const savedPath = `/tmp/${prefix}.intent-mcu.json`;
    await download.saveAs(savedPath);
    const savedText = fs.readFileSync(savedPath, 'utf8');
    assert.doesNotMatch(savedText, /authoredResults|runtimeBinding|firmwareHex|"verdict"/u,
      'saved authored experiment restored executable or verdict authority');
    assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
    return { savedText, build, observations: run.authoredResults };
  } finally {
    await context.close();
  }
}

function assertParity(browserRun, headlessRun, expectedStatus, label) {
  assert.equal(headlessRun.ok, true, JSON.stringify(headlessRun));
  assert.equal(headlessRun.status, expectedStatus, JSON.stringify(headlessRun));
  assert.equal(headlessRun.browserUsed, false);
  assert.equal(headlessRun.authorityRestoredFromFile, false);
  assert.equal(headlessRun.association.compilerInputIdentity, browserRun.build.inputIdentity);
  assert.equal(headlessRun.association.artifactIdentity, browserRun.build.artifactIdentity);
  assert.equal(headlessRun.observations.length, browserRun.observations.length);
  for (const [index, browserObservation] of browserRun.observations.entries()) {
    const headlessObservation = headlessRun.observations[index];
    assertActualTime(browserObservation, `${label} browser ${browserObservation.scenarioId}`);
    assertActualTime(headlessObservation, `${label} headless ${headlessObservation.scenarioId}`);
    assert.deepEqual(semanticEvidence(headlessObservation), semanticEvidence(browserObservation),
      `${label} semantic evidence differed for ${browserObservation.scenarioId}`);
  }
}

(async () => {
  const { runSavedHeadlessExperiment } = await import('../src/headless-experiment-runner.mjs');
  const browser = await chromium.launch({ headless: true });
  try {
    const correctBrowser = await browserVariant(browser, 'correct', 'x15-parity-correct');
    const correctHeadless = await runSavedHeadlessExperiment(correctBrowser.savedText);
    assertParity(correctBrowser, correctHeadless, 'passed', 'correct');

    const badBrowser = await browserVariant(browser, 'known-bad-equality', 'x15-parity-known-bad');
    const badHeadless = await runSavedHeadlessExperiment(badBrowser.savedText);
    assertParity(badBrowser, badHeadless, 'failed', 'known-bad');
    assert.equal(badHeadless.primaryObservation.scenarioId, 'THERM-SCENARIO-EQUALITY-ENABLED');
    assert.equal(badHeadless.observations.filter((item) => item.status === 'passed').length, 3);

    process.stdout.write(`${JSON.stringify({
      status: 'pass', runner: 'node-no-browser', profile: correctHeadless.profile,
      browserUsedByRunner: correctHeadless.browserUsed,
      correct: { verdict: correctHeadless.status, artifact: correctHeadless.association.artifactIdentity,
        observations: correctHeadless.observations.map((headless, index) => ({
          scenarioId: headless.scenarioId, status: headless.status,
          browserMilliseconds: correctBrowser.observations[index].virtualMilliseconds,
          headlessMilliseconds: headless.virtualMilliseconds,
          observationWindow: headless.expected.observationWindow,
        })) },
      knownBad: { verdict: badHeadless.status, artifact: badHeadless.association.artifactIdentity,
        primaryScenario: badHeadless.primaryObservation.scenarioId,
        controlPasses: badHeadless.observations.filter((item) => item.status === 'passed').length,
        observations: badHeadless.observations.map((headless, index) => ({
          scenarioId: headless.scenarioId, status: headless.status,
          browserMilliseconds: badBrowser.observations[index].virtualMilliseconds,
          headlessMilliseconds: headless.virtualMilliseconds,
          observationWindow: headless.expected.observationWindow,
        })) },
      sameSavedAuthoredExperiment: true, savedAuthorityRestored: false,
    })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
