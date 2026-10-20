// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X41_URL || 'http://host.docker.internal:18859';
const beforePath = process.env.X41_BEFORE_PACKAGE;
const afterPath = process.env.X41_AFTER_PACKAGE;
const screenshotPath = process.env.X41_SCREENSHOT || null;
assert(beforePath && afterPath, 'X41_BEFORE_PACKAGE and X41_AFTER_PACKAGE are required');
const beforeText = fs.readFileSync(beforePath, 'utf8');
const afterText = fs.readFileSync(afterPath, 'utf8');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function syntheticRetainedPackage() {
  const [{ parseExperimentPackage, createExperimentPackage },
    { createExpectationReference }, { THERMOSTAT_PROJECT_ADAPTER },
    { RETAINED_MODEL_LIBRARY_LOCK }, { completedExperimentOutcome }] = await Promise.all([
    import('../src/experiment-package.mjs'), import('../src/expectation-reference.mjs'),
    import('../src/thermostat-experiment.mjs'), import('../src/model-library.mjs'),
    import('../src/experiment-outcomes.mjs'),
  ]);
  const profile = 'board.atmega328p-16mhz-v1';
  const adapters = Object.freeze({ [profile]: THERMOSTAT_PROJECT_ADAPTER });
  const parsed = await parseExperimentPackage(beforeText, adapters);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  const project = structuredClone(parsed.value.project);
  project.modelLibrary = structuredClone(RETAINED_MODEL_LIBRARY_LOCK);
  const projectText = `${JSON.stringify(project, null, 2)}\n`;
  const reference = await createExpectationReference(projectText, adapters, profile);
  assert.equal(reference.ok, true, JSON.stringify(reference));
  const scenarios = project.scenarioTimeline.scenarios;
  const results = parsed.value.report.results.map((result, index) => {
    const event = scenarios[index].events.at(-1);
    return {
      schema: 'intent-mcu-scenario-observation-result@1', scenarioId: result.scenarioId,
      status: result.academicStatus,
      outcome: completedExperimentOutcome({
        evidence: [{ code: 'EVIDENCE_COMPLETE', complete: true }],
        assertions: [{ code: 'EXPECTED_PIN_LEVEL_MISMATCH',
          passed: result.academicStatus === 'passed' }],
      }),
      virtualMilliseconds: result.virtualMilliseconds,
      expected: { eventId: event.id, pin: result.expected.pin, level: result.expected.level,
        observationWindow: { startMilliseconds: result.expected.windowStartMilliseconds,
          endMilliseconds: result.expected.windowEndMilliseconds } },
      observed: { pin: result.observed.pin, mode: result.observed.mode, level: result.observed.level,
        captureWindow: { minimumMilliseconds: result.observed.windowStartMilliseconds,
          maximumMilliseconds: result.observed.windowEndMilliseconds } },
      checks: structuredClone(result.checks), retention: structuredClone(result.retention),
    };
  });
  const artifactIdentitySha256 = parsed.value.report.artifactIdentitySha256;
  const modelImplementationSha256 = RETAINED_MODEL_LIBRARY_LOCK.implementationSha256;
  const modelExecutionContextSha256 = parsed.value.manifest.modelExecutionContextSha256;
  const producer = {
    artifactIdentitySha256, inputIdentitySha256: '1'.repeat(64),
    toolchainImageId: parsed.value.manifest.tools.compiler.imageId,
    toolchainIdentitySha256: parsed.value.manifest.tools.compiler.manifestSha256,
    projectGeneration: 1, buildGeneration: 1, runtimeGeneration: 1,
    runtimeIdentity: { schema: parsed.value.manifest.tools.runtime.identitySchema,
      projectGeneration: 1, runtimeGeneration: 1, artifactIdentity: artifactIdentitySha256,
      modelImplementationSha256, modelExecutionContextSha256,
      workerInitialization: 1, workerInstanceNonce: '1'.repeat(32) },
    modelImplementationSha256, modelExecutionContextSha256,
  };
  const created = await createExperimentPackage({ projectText, adapters, activeProfile: profile,
    expectationText: reference.canonical, artifactIdentitySha256,
    sourceVariant: parsed.value.report.sourceVariant, results, producer });
  assert.equal(created.ok, true, JSON.stringify(created));
  return created.canonical;
}

async function keyboardChoose(page, button, file) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator(button).press('Enter');
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
}

let browser;
(async () => {
  const retainedText = await syntheticRetainedPackage();
  browser = await chromium.launch({ headless: true });
  let context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let page = await context.newPage();
  const errors = []; const outside = []; const mutations = [];
  const monitor = (target) => {
    target.on('pageerror', (error) => errors.push(error.stack || String(error)));
    target.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    target.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    });
  };
  monitor(page);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true
    && window.__EXPERIMENT_PACKAGE_COMPARISON__);
  const initial = await page.evaluate(async () => ({
    project: window.__COMMON_PROJECT_FILES__.current(),
    native: window.__NATIVE_PROJECT_FILES__.status(),
    history: await window.__LOCAL_VERSION_HISTORY__.list(),
    workers: window.__M6_STATE__.runtimeWorkerCreations,
    buildState: window.__M6_STATE__.buildState,
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
    inputIdentity: window.__M6_STATE__.inputIdentity,
    runtime: window.__M6_STATE__.runtime,
  }));
  assert.deepEqual(await page.evaluate(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state()),
    { before: null, after: null, comparison: null });

  await page.locator('#experiment-package-comparison > summary').click();
  await keyboardChoose(page, '#experiment-package-before-open', beforePath);
  await page.waitForFunction(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state().before?.sha256
    === '4b7d85dd0d0fce4d5b521c16c798730af6547d554f32c5f8895668f887530fc5');
  await keyboardChoose(page, '#experiment-package-after-open', afterPath);
  await page.waitForFunction(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state().after?.sha256
    === 'a0f6d2d40e8ade683e860a7d9767cd8ebd2109b6acdd0df7fd38081e2278b521');
  await page.locator('#experiment-package-compare').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state().comparison?.schema
    === 'intent-mcu-experiment-package-comparison@1');
  const accepted = await page.evaluate(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state());
  assert.equal(accepted.comparison.before.identities.packageSha256, sha256(beforeText));
  assert.equal(accepted.comparison.after.identities.packageSha256, sha256(afterText));
  assert.equal(accepted.comparison.results.filter((row) => row.changed).length, 1);
  assert.equal(await page.locator('#experiment-package-comparison-review > section').count(), 4);
  for (const id of ['identity', 'source', 'circuit', 'results']) {
    await page.locator(`#experiment-package-comparison-${id}-title`).focus();
    assert.equal(await page.locator(`#experiment-package-comparison-${id}-title`).isVisible(), true);
  }
  const sourceText = await page.locator('#experiment-package-comparison-source').textContent();
  assert.match(sourceText, /temperatureC < SETPOINT_C/u);
  assert.match(sourceText, /temperatureC <= SETPOINT_C/u);
  assert.match(await page.locator('#experiment-package-comparison-circuit').textContent(), /red.*green/su);
  assert.match(await page.locator('#experiment-package-comparison-results').textContent(),
    /THERM-SCENARIO-EQUALITY-ENABLED.*Before LOW.*After HIGH/su);
  assert.match(await page.locator('#experiment-package-comparison-status').textContent(),
    /no new verdict or causal claim/u);

  // Replacing a slot synchronously clears the accepted view; a canonical retained-model
  // synthetic negative reaches the explicit model compatibility gate.
  await page.setInputFiles('#experiment-package-after-input', {
    name: 'synthetic-retained-model.intent-mcu-experiment.json',
    mimeType: 'application/json', buffer: Buffer.from(retainedText),
  });
  await page.waitForFunction(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state().after
    && window.__EXPERIMENT_PACKAGE_COMPARISON__.state().comparison === null);
  await page.click('#experiment-package-compare');
  await page.waitForFunction(() => document.querySelector('#experiment-package-comparison-status')
    .textContent.includes('X41_MODEL_MISMATCH'));

  // A tampered replacement is rejected as a slot and cannot revive old authority.
  const tampered = afterText.replace('2.0.0-x56-current', '2.0.0-x56-forged');
  await page.setInputFiles('#experiment-package-after-input', {
    name: 'synthetic-tampered.intent-mcu-experiment.json',
    mimeType: 'application/json', buffer: Buffer.from(tampered),
  });
  await page.waitForFunction(() => document.querySelector('#experiment-package-comparison-status')
    .textContent.includes('Package rejected'));
  assert.equal((await page.evaluate(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state())).after, null);

  // Restore, compare, then cancel a keyboard-opened chooser: old authority clears immediately.
  await page.setInputFiles('#experiment-package-after-input', afterPath);
  await page.waitForFunction(() => !document.querySelector('#experiment-package-compare').disabled);
  await page.click('#experiment-package-compare');
  await page.waitForFunction(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state().comparison !== null);
  const cancelPromise = page.waitForEvent('filechooser');
  await page.locator('#experiment-package-after-open').press('Enter');
  const cancelChooser = await cancelPromise;
  await cancelChooser.setFiles([]);
  const cancelled = await page.evaluate(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state());
  assert.equal(cancelled.comparison, null);
  assert.equal(cancelled.after, null);
  assert.notEqual(cancelled.before, null);
  assert.equal(await page.locator('#experiment-package-compare').isDisabled(), true);
  assert.equal(await page.locator('#experiment-package-comparison-review').isHidden(), true);
  await page.setInputFiles('#experiment-package-after-input', afterPath);
  await page.waitForFunction(() => !document.querySelector('#experiment-package-compare').disabled);
  await page.click('#experiment-package-compare');
  await page.waitForFunction(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state().comparison !== null);

  const finalState = await page.evaluate(async () => ({
    project: window.__COMMON_PROJECT_FILES__.current(), native: window.__NATIVE_PROJECT_FILES__.status(),
    history: await window.__LOCAL_VERSION_HISTORY__.list(), workers: window.__M6_STATE__.runtimeWorkerCreations,
    buildState: window.__M6_STATE__.buildState, artifactIdentity: window.__M6_STATE__.artifactIdentity,
    inputIdentity: window.__M6_STATE__.inputIdentity, runtime: window.__M6_STATE__.runtime,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.deepEqual({ ...finalState, overflow: undefined }, { ...initial, overflow: undefined });
  assert(finalState.overflow <= 1, `horizontal overflow ${finalState.overflow}`);
  assert.equal(mutations.length, 0, JSON.stringify(mutations));
  assert.equal(outside.length, 0, JSON.stringify(outside));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal((await context.cookies()).length, 0);

  // Reload creates an empty, authority-free comparison surface.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__EXPERIMENT_PACKAGE_COMPARISON__);
  assert.deepEqual(await page.evaluate(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state()),
    { before: null, after: null, comparison: null });
  if (screenshotPath) {
    // Reopen the real pair for a settled private desktop review image.
    await page.locator('#experiment-package-comparison > summary').click();
    await page.setInputFiles('#experiment-package-before-input', beforePath);
    await page.waitForFunction(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state().before !== null);
    await page.setInputFiles('#experiment-package-after-input', afterPath);
    await page.waitForFunction(() => !document.querySelector('#experiment-package-compare').disabled);
    await page.click('#experiment-package-compare');
    await page.waitForFunction(() => window.__EXPERIMENT_PACKAGE_COMPARISON__.state().comparison !== null);
    await page.locator('#experiment-package-comparison').screenshot({ path: screenshotPath, animations: 'disabled' });
  }
  process.stdout.write(`${JSON.stringify({ status: 'pass', browser: 'chromium',
    beforeSha256: sha256(beforeText), afterSha256: sha256(afterText), groups: 4,
    modelMismatchRejected: true, tamperedRejected: true, replacementCleared: true,
    cancelCleared: true, reloadEmpty: true, projectMutation: false, nativeFileMutation: false,
    historyMutation: false, artifactMutation: false, runtimeMutation: false,
    workerCreations: initial.workers, externalRequests: 0, mutationRequests: 0,
    cookies: 0, horizontalOverflow: finalState.overflow, screenshot: screenshotPath })}\n`);
  await context.close();
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
