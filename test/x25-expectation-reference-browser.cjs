// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X25_UI_URL || 'http://127.0.0.1:18790';
const projectPath = process.env.X25_PROJECT_PATH || '/tmp/x25-thermostat.intent-mcu.json';
const referencePath = process.env.X25_REFERENCE_PATH || '/tmp/x25-thermostat.intent-mcu-expectations.json';
const patchedPath = process.env.X25_PATCHED_PATH || '/tmp/x25-thermostat-patched.intent-mcu.json';
const screenshotPath = process.env.X25_SCREENSHOT || null;

function semanticEvidence(observation) {
  const observed = structuredClone(observation.observed);
  if (observed.actualInputs?.a1) delete observed.actualInputs.a1.sampleCycle;
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

function expectationEvent(envelope) {
  const scenario = envelope.scenarioTimeline.scenarios.find(
    (item) => item.id === 'THERM-SCENARIO-EQUALITY-ENABLED',
  );
  assert.ok(scenario, 'equality scenario missing');
  const event = scenario.events.find((item) => item.kind === 'expect.pin-level');
  assert.ok(event, 'equality expectation missing');
  return event;
}

function patchSource(envelope) {
  const files = envelope.project?.project?.source?.files ?? envelope.project?.source?.files;
  const file = files?.find((item) => item.name === 'main.ino');
  assert.ok(file, 'main.ino missing');
  assert.match(file.content, /temperatureC < SETPOINT_C/u);
  file.content = file.content.replace('temperatureC < SETPOINT_C', 'temperatureC <= SETPOINT_C');
}

async function currentBaseSha(page, description) {
  const prompt = await page.evaluate((request) => window.__PROJECT_PATCH__.prompt(request), description);
  const match = prompt.match(/baseProjectSha256 must be ([a-f0-9]{64})\./u);
  assert.ok(match, prompt);
  return match[1];
}

async function build(page) {
  await page.click('#build');
  await page.waitForFunction(() => {
    const value = document.querySelector('#build-state')?.textContent || '';
    return value === 'Build succeeded' || /failed|error|unavailable/iu.test(value);
  }, null, { timeout: 60_000 });
  assert.equal(await page.locator('#build-state').textContent(), 'Build succeeded',
    await page.locator('#diagnostics').textContent());
  return page.evaluate(() => ({
    inputIdentity: window.__M6_STATE__.inputIdentity,
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
  }));
}

let browser;
(async () => {
  const { runSavedHeadlessExperiment } = await import('../src/headless-experiment-runner.mjs');
  browser = await chromium.launch({ headless: true });
  let context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  let page = await context.newPage();
  const errors = [];
  const thirdPartyRequests = [];
  const monitorPage = (target) => {
    target.on('pageerror', (error) => errors.push(error.stack || String(error)));
    target.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    target.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) thirdPartyRequests.push(request.url());
    });
  };
  monitorPage(page);

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.selectOption('#example-select', 'avr-thermostat-boundary-v1');
  await page.click('#project-demo');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.authoredTimeline?.scenarios.length === 4);

  const [initialDownload] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  await initialDownload.saveAs(projectPath);
  const oneCase = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  oneCase.scenarioTimeline.scenarios = oneCase.scenarioTimeline.scenarios.filter(
    (item) => item.id === 'THERM-SCENARIO-EQUALITY-ENABLED',
  );
  fs.writeFileSync(projectPath, `${JSON.stringify(oneCase, null, 2)}\n`);

  // Actual local project-file Open must clear all executable authority while retaining Build.
  await page.setInputFiles('#project-open-input', projectPath);
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.authoredTimeline?.scenarios.length === 1);
  assert.equal(await page.locator('#build').isEnabled(), true);
  assert.equal(await page.locator('#run').isEnabled(), false);
  assert.equal(await page.locator('#scenario-run').isEnabled(), false);
  assert.equal(await page.evaluate(() => window.__EXPECTATION_REFERENCE__.state()), null);

  // The reference is a separate downloaded file and is reopened through the real file input.
  const [referenceDownload] = await Promise.all([
    page.waitForEvent('download'), page.click('#expectation-reference-lock'),
  ]);
  await referenceDownload.saveAs(referencePath);
  const referenceBytes = fs.readFileSync(referencePath, 'utf8');
  const firstReference = await page.evaluate(() => window.__EXPECTATION_REFERENCE__.state());
  assert.equal(firstReference.matchesCurrent, true);
  assert.equal(firstReference.executableAuthority, false);
  assert.equal(firstReference.verdictAuthority, false);
  await page.setInputFiles('#expectation-reference-input', referencePath);
  await page.waitForFunction((sha) => window.__EXPECTATION_REFERENCE__.state()?.sha256 === sha,
    firstReference.sha256);
  assert.equal((await page.evaluate(() => window.__EXPECTATION_REFERENCE__.state())).canonical, referenceBytes);

  const description = 'Change only the thermostat comparison from less-than to less-than-or-equal.';
  const currentText = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current());
  const proposed = JSON.parse(currentText);
  patchSource(proposed);
  const baseProjectSha256 = await currentBaseSha(page, description);
  const sourcePatch = {
    schema: 'intent-mcu-project-patch@2',
    profile: proposed.profile,
    baseProjectSha256,
    expectationReferenceSha256: firstReference.sha256,
    description,
    proposedProject: proposed,
  };
  await page.locator('#project-patch-input').fill(JSON.stringify(sourcePatch));
  await page.click('#project-patch-review');
  await page.waitForFunction(() => window.__PROJECT_PATCH__.state()
    || document.querySelector('#project-patch-status')?.textContent.includes('rejected'));
  const reviewed = await page.evaluate(() => window.__PROJECT_PATCH__.state());
  assert.ok(reviewed, await page.locator('#project-patch-status').textContent());
  assert.deepEqual(reviewed.implementationChanges.map((item) => item.kind), ['source']);
  assert.deepEqual(reviewed.testExpectationChanges, []);
  assert.equal(reviewed.applyBlocked, false);
  assert.equal(await page.locator('#project-patch-apply').isEnabled(), true);
  assert.match(await page.locator('#project-patch-implementation-changes').textContent(), /source main\.ino changed/iu);
  assert.match(await page.locator('#project-patch-expectation-changes').textContent(), /No test or expectation changes/u);

  await page.click('#project-patch-apply');
  await page.waitForFunction(() => document.querySelector('#project-patch-status')?.textContent
    .includes('fresh Build is required'));
  const afterApplyReference = await page.evaluate(() => window.__EXPECTATION_REFERENCE__.state());
  assert.equal(afterApplyReference.sha256, firstReference.sha256);
  assert.equal(afterApplyReference.canonical, referenceBytes);
  assert.equal(afterApplyReference.matchesCurrent, true);
  assert.equal(await page.locator('#run').isEnabled(), false);
  assert.equal(await page.locator('#scenario-run').isEnabled(), false);

  // Fresh real compiler build and one equality replay: the locked LOW expectation catches <=.
  const browserBuild = await build(page);
  try {
    await page.waitForFunction(() => !document.querySelector('#scenario-run')?.disabled, null,
      { timeout: 30_000 });
  } catch {
    assert.fail(JSON.stringify(await page.evaluate(() => ({
      state: window.__M6_STATE__, scenarioDisabled: document.querySelector('#scenario-run')?.disabled,
      diagnostics: document.querySelector('#diagnostics')?.textContent,
      experimentMessage: document.querySelector('#thermostat-experiment-message')?.textContent,
    }))));
  }
  assert.equal(await page.locator('#scenario-run').isEnabled(), true,
    JSON.stringify(await page.evaluate(() => ({
      variant: window.__M6_STATE__.thermostatExperiment?.variant,
      message: window.__M6_STATE__.thermostatExperiment?.message,
      build: window.__M6_STATE__.buildState,
    }))));
  await page.click('#scenario-run');
  try {
    await page.waitForFunction(() => {
      const state = window.__M6_STATE__.thermostatExperiment;
      return state && !state.running && state.authoredResults.length === 1;
    }, null, { timeout: 90_000 });
  } catch {
    assert.fail(JSON.stringify(await page.evaluate(() => ({
      experiment: window.__M6_STATE__.thermostatExperiment,
      lifecycle: window.__M6_STATE__.lifecycle,
      experimentMessage: document.querySelector('#thermostat-experiment-message')?.textContent,
      editorMessage: document.querySelector('#scenario-editor-message')?.textContent,
    }))));
  }
  const browserRun = await page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
  assert.equal(browserRun.authoredResults[0].scenarioId, 'THERM-SCENARIO-EQUALITY-ENABLED');
  assert.equal(browserRun.authoredResults[0].status, 'failed');
  assert.equal(browserRun.authoredResults[0].expected.level, false);
  assert.equal(browserRun.authoredResults[0].observed.level, true);

  const [patchedDownload] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  await patchedDownload.saveAs(patchedPath);
  const patchedBytes = fs.readFileSync(patchedPath, 'utf8');
  assert.doesNotMatch(patchedBytes, /authoredResults|runtimeBinding|firmwareHex|"verdict"/u);
  const headless = await runSavedHeadlessExperiment(patchedBytes);
  assert.equal(headless.ok, true, JSON.stringify(headless));
  assert.equal(headless.compiledFresh, true);
  assert.equal(headless.status, 'failed');
  assert.equal(headless.observations.length, 1);
  assert.equal(headless.association.compilerInputIdentity, browserBuild.inputIdentity);
  assert.equal(headless.association.artifactIdentity, browserBuild.artifactIdentity);
  const browserObservation = browserRun.authoredResults[0];
  const headlessObservation = headless.observations[0];
  assert.deepEqual(semanticEvidence(headlessObservation), semanticEvidence(browserObservation));
  for (const observation of [browserObservation, headlessObservation]) {
    assert.equal(Number.isFinite(observation.virtualMilliseconds), true);
    assert.equal(observation.virtualMilliseconds >= observation.expected.observationWindow.startMilliseconds
      && observation.virtualMilliseconds <= observation.expected.observationWindow.endMilliseconds, true);
    assert.equal(Number.isSafeInteger(observation.observed.actualInputs.a1.sampleCycle), true);
    assert.equal(observation.checks.inputsComplete, true);
    assert.equal(observation.checks.primaryExecutedPin, false);
  }

  // A combined implementation + LOW-to-HIGH expectation proposal is visible but never applicable.
  const maliciousDescription = 'Change firmware and make the equality expectation HIGH.';
  const maliciousCurrent = JSON.parse(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()));
  const malicious = structuredClone(maliciousCurrent);
  const maliciousFiles = malicious.project?.project?.source?.files ?? malicious.project?.source?.files;
  const maliciousMain = maliciousFiles.find((item) => item.name === 'main.ino');
  maliciousMain.content = maliciousMain.content.replace(
    'bool heating = enabled &&', '// proposed unrelated implementation edit\n  bool heating = enabled &&',
  );
  const changedExpectation = expectationEvent(malicious);
  assert.equal(changedExpectation.level, false);
  changedExpectation.level = true;
  const maliciousBase = await currentBaseSha(page, maliciousDescription);
  const maliciousPatch = {
    schema: 'intent-mcu-project-patch@2', profile: malicious.profile,
    baseProjectSha256: maliciousBase, expectationReferenceSha256: firstReference.sha256,
    description: maliciousDescription, proposedProject: malicious,
  };
  await page.locator('#project-patch-input').fill(JSON.stringify(maliciousPatch));
  await page.click('#project-patch-review');
  await page.waitForFunction(() => window.__PROJECT_PATCH__.state()?.applyBlocked === true);
  const blocked = await page.evaluate(() => window.__PROJECT_PATCH__.state());
  assert.equal(blocked.applyBlockCode, 'PROJECT_PATCH_EXPECTATIONS_CHANGED');
  assert.equal(blocked.implementationChanges.length, 1);
  assert.equal(blocked.testExpectationChanges.some((item) => /LOW to HIGH/u.test(item.summary)), true);
  assert.equal(await page.locator('#project-patch-apply').isEnabled(), false);
  const directApply = await page.evaluate(() => window.__PROJECT_PATCH__.apply());
  assert.equal(directApply.code, 'PROJECT_PATCH_EXPECTATIONS_CHANGED');
  assert.equal(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()), patchedBytes);
  const finalReference = await page.evaluate(() => window.__EXPECTATION_REFERENCE__.state());
  assert.equal(finalReference.canonical, referenceBytes);
  assert.equal(finalReference.sha256, firstReference.sha256);

  if (screenshotPath) {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.locator('.project-patch').screenshot({ path: screenshotPath, animations: 'disabled' });
  }

  // Browser reload plus ordinary project Open restore no reference, artifact, result or verdict.
  await context.close();
  context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  page = await context.newPage();
  monitorPage(page);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  assert.equal(await page.evaluate(() => window.__EXPECTATION_REFERENCE__.state()), null);
  await page.setInputFiles('#project-open-input', patchedPath);
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.authoredTimeline?.scenarios.length === 1);
  const reopenedState = await page.evaluate(() => ({
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
    authoredResults: window.__M6_STATE__.thermostatExperiment.authoredResults,
    freshBuildReady: window.__M6_STATE__.thermostatExperiment.freshBuildReady,
  }));
  assert.equal(reopenedState.artifactIdentity, null);
  assert.deepEqual(reopenedState.authoredResults, []);
  assert.equal(reopenedState.freshBuildReady, false);
  assert.equal(await page.locator('#build').isEnabled(), true);
  assert.equal(await page.locator('#run').isEnabled(), false);
  assert.equal(await page.locator('#scenario-run').isEnabled(), false);
  assert.equal(await page.evaluate(() => window.__EXPECTATION_REFERENCE__.state()), null);

  await page.setInputFiles('#expectation-reference-input', referencePath);
  await page.waitForFunction((sha) => window.__EXPECTATION_REFERENCE__.state()?.sha256 === sha,
    firstReference.sha256);
  const reopenedBuild = await build(page);
  assert.deepEqual(reopenedBuild, browserBuild);
  await page.waitForFunction(() => !document.querySelector('#scenario-run')?.disabled, null,
    { timeout: 30_000 });
  await page.click('#scenario-run');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.authoredResults.length === 1;
  }, null, { timeout: 90_000 });
  const reopenedObservation = await page.evaluate(() => structuredClone(
    window.__M6_STATE__.thermostatExperiment.authoredResults[0],
  ));
  assert.equal(reopenedObservation.status, 'failed');
  assert.equal(reopenedObservation.expected.level, false);
  assert.equal(reopenedObservation.observed.level, true);
  assert.deepEqual(semanticEvidence(reopenedObservation), semanticEvidence(browserObservation));

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth
    <= document.documentElement.clientWidth), true);
  assert.deepEqual(errors, [], JSON.stringify(errors));
  assert.deepEqual(thirdPartyRequests, [], JSON.stringify(thirdPartyRequests));
  assert.equal((await context.cookies()).length, 0);

  console.log(JSON.stringify({
    result: 'pass', projectFileRoundtrip: true, independentReferenceRoundtrip: true,
    sourceOnlyApplied: true, freshBuild: true, equalityCaughtAgainstLockedLow: true,
    combinedExpectationChangeBlocked: 'PROJECT_PATCH_EXPECTATIONS_CHANGED',
    browserHeadlessRawProducerTimeParity: true, scenariosExecuted: 1,
    referenceSha256: firstReference.sha256,
    inputIdentity: browserBuild.inputIdentity, artifactIdentity: browserBuild.artifactIdentity,
    browserVirtualMilliseconds: browserObservation.virtualMilliseconds,
    browserA1SampleCycle: browserObservation.observed.actualInputs.a1.sampleCycle,
    headlessVirtualMilliseconds: headlessObservation.virtualMilliseconds,
    headlessA1SampleCycle: headlessObservation.observed.actualInputs.a1.sampleCycle,
    reloadAuthorityRestored: false, freshReloadFailureReproduced: true, screenshot: screenshotPath,
  }));
  await context.close(); await browser.close(); browser = null;
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
