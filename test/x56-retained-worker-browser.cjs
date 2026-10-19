// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.X56_RETAINED_URL || 'http://127.0.0.1:18845';
const packageOutput = process.env.X56_RETAINED_PACKAGE_OUTPUT;
const projectOutput = process.env.X56_RETAINED_PROJECT_OUTPUT;
const evidenceOutput = process.env.X56_RETAINED_EVIDENCE_OUTPUT;

const retainedLock = Object.freeze({
  schema: 'intent-mcu-model-library-lock@2',
  libraryId: 'intent-mcu-public-models',
  version: '2.0.0-rc.72-retained',
  manifestSha256: 'ad29ff5b33379481e0a367bb0f51381682acee8a23ae58f39f3b409fb406ce47',
  implementationSha256: '75122b1ac20815fd848243270da601a219b668de1ab73207366b1effbbe1be58',
});

function sha256(source) {
  return crypto.createHash('sha256').update(source).digest('hex');
}

function durableCopy(source, destination) {
  assert(destination, 'X56_RETAINED_PACKAGE_OUTPUT is required');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  const descriptor = fs.openSync(destination, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function durableWrite(source, destination) {
  assert(destination, 'X56_RETAINED_PROJECT_OUTPUT is required');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, source, { mode: 0o600 });
  const descriptor = fs.openSync(destination, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.showOpenFilePicker = undefined;
    window.showSaveFilePicker = undefined;
  });
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  const mutations = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      mutations.push({ method: request.method(), path: url.pathname });
    }
  });

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('#project-demo');
  await page.waitForFunction(() => document.querySelector('#example-picker-dialog').open === true);
  await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);

  const legacyProject = await page.evaluate(() => {
    const value = JSON.parse(window.__COMMON_PROJECT_FILES__.current());
    value.schema = 'intent-mcu-project-envelope@6';
    delete value.modelLibrary;
    return JSON.stringify(value);
  });
  await page.setInputFiles('#project-open-input', {
    name: 'thermostat-retained-pre-x56.intent-mcu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(legacyProject),
  });
  await page.waitForFunction(() => document.querySelector('#unsaved-change-dialog').open === true);
  await page.click('#unsaved-discard');
  await page.waitForFunction(() => document.querySelector('#model-library-summary').textContent.includes('retained'));

  // This is the fail-closed producer gate. No Build click occurs before all
  // visible, canonical-project and runtime-selection identities agree.
  const preBuild = await page.evaluate(() => {
    const projectText = window.__COMMON_PROJECT_FILES__.current();
    return {
      summary: document.querySelector('#model-library-summary').textContent,
      status: document.querySelector('#model-library-status').textContent,
      projectText,
      project: JSON.parse(projectText),
      selectedLock: window.__COMMON_PROJECT_FILES__.modelLibraryLock(),
      buildState: window.__M6_STATE__.buildState,
      artifactIdentity: window.__M6_STATE__.artifactIdentity,
      runtime: window.__M6_STATE__.runtime,
    };
  });
  durableWrite(preBuild.projectText, projectOutput);
  assert.match(preBuild.summary, /retained/u);
  assert.match(preBuild.status, /retained, immutable pre-X56/u);
  assert.equal(preBuild.project.schema, 'intent-mcu-project-envelope@8');
  assert.deepEqual(preBuild.project.modelLibrary, retainedLock);
  assert.deepEqual(preBuild.selectedLock, retainedLock);
  assert.equal(preBuild.artifactIdentity, null);
  assert.equal(preBuild.runtime, null);

  const [expectationDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#expectation-reference-lock'),
  ]);
  assert.match(expectationDownload.suggestedFilename(), /\.intent-mcu-expectations\.json$/u);

  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null,
    { timeout: 40_000 });
  await page.waitForFunction(() => {
    const identity = window.__M6_STATE__.runtime?.runtimeIdentity;
    return identity?.modelImplementationSha256 && window.__M6_STATE__.runtime?.modelExecutionContextSha256;
  }, null, { timeout: 15_000 });
  await page.waitForFunction(() => !document.querySelector('#scenario-run').disabled, null, { timeout: 10_000 });

  const worker = await page.evaluate(() => ({
    project: JSON.parse(window.__COMMON_PROJECT_FILES__.current()),
    selectedLock: window.__COMMON_PROJECT_FILES__.modelLibraryLock(),
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
    runtimeIdentity: window.__M6_STATE__.runtime.runtimeIdentity,
    runtimeModelExecutionContextSha256: window.__M6_STATE__.runtime.modelExecutionContextSha256,
  }));
  assert.deepEqual(worker.project.modelLibrary, retainedLock);
  assert.deepEqual(worker.selectedLock, retainedLock);
  assert.match(worker.artifactIdentity, /^[a-f0-9]{64}$/u);
  assert.equal(worker.runtimeIdentity.artifactIdentity, worker.artifactIdentity);
  assert.equal(worker.runtimeIdentity.modelImplementationSha256, retainedLock.implementationSha256);
  assert.match(worker.runtimeIdentity.modelExecutionContextSha256, /^[a-f0-9]{64}$/u);
  assert.equal(worker.runtimeModelExecutionContextSha256, worker.runtimeIdentity.modelExecutionContextSha256);

  await page.click('#scenario-run');
  await page.waitForFunction(() => {
    const state = window.__M6_STATE__.thermostatExperiment;
    return state && !state.running && state.authoredResults.length === 4;
  }, null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#experiment-package-download').disabled);

  const [packageDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#experiment-package-download'),
  ]);
  const temporaryPath = await packageDownload.path();
  durableCopy(temporaryPath, packageOutput);

  // Assertions intentionally happen after the downloaded bytes are durably
  // preserved, so any later failure still leaves the exact producer artifact.
  const source = fs.readFileSync(packageOutput, 'utf8');
  const value = JSON.parse(source);
  assert.equal(value.schema, 'intent-mcu-experiment-package@3');
  assert.equal(value.project.schema, 'intent-mcu-project-envelope@8');
  assert.deepEqual(value.project.modelLibrary, retainedLock);
  assert.deepEqual(value.manifest.modelLibrary, retainedLock);
  assert.equal(value.manifest.modelExecutionContextSha256,
    worker.runtimeIdentity.modelExecutionContextSha256);
  assert.equal(value.manifest.artifactSha256, worker.artifactIdentity);
  assert.equal(value.report.artifactIdentitySha256, worker.artifactIdentity);
  assert.equal(value.report.results.length, 4);
  assert.equal(value.report.aggregate.academicStatus, 'passed');
  assert.equal(value.report.aggregate.jobStatus, 'completed');
  assert.equal(value.report.aggregate.evidenceStatus, 'complete');
  assert.equal(value.report.completeness.allEvidenceComplete, true);
  assert.equal(value.report.results.every((result) => result.retention.inputEventsDropped === 0), true);
  assert.deepEqual(mutations, [{ method: 'POST', path: '/api/build' }]);
  assert.deepEqual(outside, []);
  assert.deepEqual(errors, []);
  assert.equal((await context.cookies()).length, 0);

  const evidence = {
    schema: 'intent-mcu-x56-retained-worker-evidence@1',
    result: 'pass',
    sourceUrl: base,
    preBuild: {
      visibleSummary: preBuild.summary,
      visibleStatus: preBuild.status,
      projectSchema: preBuild.project.schema,
      modelLibrary: preBuild.project.modelLibrary,
      buildState: preBuild.buildState,
      artifactIdentity: preBuild.artifactIdentity,
      runtime: preBuild.runtime,
    },
    worker: {
      artifactIdentity: worker.artifactIdentity,
      runtimeIdentity: worker.runtimeIdentity,
      modelLibrary: worker.project.modelLibrary,
    },
    package: {
      path: packageOutput,
      sha256: sha256(source),
      bytes: Buffer.byteLength(source),
      schema: value.schema,
      projectSchema: value.project.schema,
      modelLibrary: value.project.modelLibrary,
      manifestSha256: value.manifest.manifestSha256,
      modelExecutionContextSha256: value.manifest.modelExecutionContextSha256,
      scenarios: value.report.results.length,
      aggregate: value.report.aggregate,
    },
    project: {
      path: projectOutput,
      sha256: sha256(preBuild.projectText),
      bytes: Buffer.byteLength(preBuild.projectText),
    },
    requests: { buildPosts: 1, authoredScenarios: 4, outside: 0 },
    cookies: 0,
  };
  if (evidenceOutput) {
    fs.mkdirSync(path.dirname(evidenceOutput), { recursive: true });
    fs.writeFileSync(evidenceOutput, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  await context.close();
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
