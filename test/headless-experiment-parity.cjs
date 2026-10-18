// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

function browserVariant(firmwareVariant, prefix) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/external-client-adapter.mjs'], {
      cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = ''; let stderr = ''; let ready; let generation; let sequence = 0;
    const waiters = new Map();
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => {
      buffer += chunk; let boundary;
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
        if (!line) continue;
        const value = JSON.parse(line);
        if (value.schema === 'intent-mcu-external-client-ready@1') {
          ready = value; generation = value.context.generation; void run(); continue;
        }
        const id = value.request?.requestId ?? value.requestId;
        const waiter = waiters.get(id); if (waiter) { waiters.delete(id); waiter(value); }
      }
    });
    const call = (action, payload = {}) => new Promise((done) => {
      sequence += 1; const requestId = `${prefix}-${String(sequence).padStart(2, '0')}`;
      const now = Date.now(); waiters.set(requestId, done);
      child.stdin.write(`${JSON.stringify({
        schema: ready.requestSchema, action, requestId, profile: ready.context.profile,
        expectedGeneration: generation, issuedAtMs: now, expiresAtMs: now + 30_000, payload,
      })}\n`);
    }).then((result) => { generation = result.generation?.after ?? generation; return result; });
    const run = async () => {
      try {
        const created = await call('project.create', { starterId: 'avr-thermostat-boundary-v1', firmwareVariant });
        assert.equal(created.category, 'success');
        const exported = await call('project.export');
        assert.equal(exported.category, 'success');
        const built = await call('firmware.build');
        assert.equal(built.category, 'success');
        const ran = await call('runtime.run', { experimentId: 'avr-thermostat-boundary-v1' });
        resolve({ savedText: exported.authoritativeResult.result.projectText, built, ran });
      } catch (error) { reject(error); }
      finally { child.stdin.end(); }
    };
    child.once('error', reject);
    child.once('exit', (code) => { if (code !== 0) reject(new Error(`adapter exit ${code}: ${stderr}`)); });
  });
}

const boundary = (observations) => observations.map((item) => ({
  scenarioId: item.scenarioId, status: item.status,
  expectedD13: item.expected.d13, observedD13: item.observed.d13,
  primaryExecutedPin: item.checks.primaryExecutedPin,
  corroboratingSerial: item.checks.corroboratingSerial,
  inputsComplete: item.checks.inputsComplete,
}));

(async () => {
  const { runSavedHeadlessExperiment } = await import('../src/headless-experiment-runner.mjs');
  const correctBrowser = await browserVariant('correct', 'x15-browser-correct');
  const correctHeadless = await runSavedHeadlessExperiment(correctBrowser.savedText);
  assert.equal(correctHeadless.ok, true, JSON.stringify(correctHeadless));
  assert.equal(correctHeadless.status, 'passed', JSON.stringify(correctHeadless));
  assert.equal(correctHeadless.browserUsed, false); assert.equal(correctHeadless.authorityRestoredFromFile, false);
  assert.equal(correctHeadless.association.artifactIdentity,
    correctBrowser.ran.testVerdict.artifactIdentity);
  assert.deepEqual(boundary(correctHeadless.observations),
    boundary(correctBrowser.ran.authoritativeResult.result.testEvidence.observations));

  const badBrowser = await browserVariant('known-bad-equality', 'x15-browser-known-bad');
  const badHeadless = await runSavedHeadlessExperiment(badBrowser.savedText);
  assert.equal(badHeadless.ok, true, JSON.stringify(badHeadless));
  assert.equal(badHeadless.status, 'failed', JSON.stringify(badHeadless));
  assert.equal(badHeadless.primaryObservation.scenarioId, 'THERM-SCENARIO-EQUALITY-ENABLED');
  assert.equal(badHeadless.association.artifactIdentity, badBrowser.ran.testVerdict.artifactIdentity);
  assert.deepEqual(boundary(badHeadless.observations),
    boundary(badBrowser.ran.authoritativeResult.result.testEvidence.observations));

  process.stdout.write(`${JSON.stringify({
    status: 'pass', runner: 'node-no-browser', profile: correctHeadless.profile,
    browserUsedByRunner: correctHeadless.browserUsed,
    correct: { verdict: correctHeadless.status, artifact: correctHeadless.association.artifactIdentity,
      boundary: boundary(correctHeadless.observations) },
    knownBad: { verdict: badHeadless.status, artifact: badHeadless.association.artifactIdentity,
      primaryScenario: badHeadless.primaryObservation.scenarioId,
      boundary: boundary(badHeadless.observations) },
    savedAuthorityRestored: false,
  })}\n`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
