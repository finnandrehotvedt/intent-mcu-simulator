// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const base = process.env.EXTERNAL_CLIENT_TEST_URL || 'http://127.0.0.1:18766';

async function runVariant(firmwareVariant, prefix, expectedCategory) {
  const target = new URL(base);
  const adapterEnv = { ...process.env };
  if (target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname)) {
    adapterEnv.NODE_ENV = 'test';
    adapterEnv.INTENT_MCU_ADAPTER_TEST_ORIGIN = target.origin;
  } else {
    delete adapterEnv.NODE_ENV;
    delete adapterEnv.INTENT_MCU_ADAPTER_TEST_ORIGIN;
  }
  const child = spawn(process.execPath, ['tools/external-client-adapter.mjs'], {
    cwd: process.cwd(), env: adapterEnv, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = ''; let stdout = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const waiters = []; const messages = [];
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    let boundary;
    while ((boundary = stdout.indexOf('\n')) >= 0) {
      const line = stdout.slice(0, boundary); stdout = stdout.slice(boundary + 1);
      if (!line) continue;
      const value = JSON.parse(line); const waiter = waiters.shift();
      if (waiter) waiter(value); else messages.push(value);
    }
  });
  const next = () => messages.length ? Promise.resolve(messages.shift())
    : new Promise((resolve) => waiters.push(resolve));
  const send = async (value) => {
    const response = next(); child.stdin.write(`${JSON.stringify(value)}\n`); return response;
  };
  let operationError = null;
  try {
    const ready = await next();
    assert.equal(ready.resultSchema, 'intent-mcu-external-client-result@1', JSON.stringify(ready));
    let generation = ready.context.generation;
    const call = async (action, payload, suffix, category = 'success') => {
      const now = Date.now(); const requestId = `${prefix}-${suffix}`;
      const response = await send({
        schema: ready.requestSchema, action, requestId, profile: ready.context.profile,
        expectedGeneration: generation, issuedAtMs: now, expiresAtMs: now + 30_000, payload,
      });
      assert.equal(response.category, category, `${requestId}: ${JSON.stringify(response)}`);
      assert.equal(response.request.requestId, requestId);
      assert.equal(response.request.profile, ready.context.profile);
      assert.equal(response.generation.expected, generation);
      generation = response.generation.after ?? generation;
      return response;
    };
    await call('project.create', { starterId: 'avr-thermostat-boundary-v1', firmwareVariant }, 'create');
    const build = await call('firmware.build', {}, 'build');
    const run = await call('runtime.run', { experimentId: 'avr-thermostat-boundary-v1' },
      'test', expectedCategory);
    const read = await call('result.read', {}, 'read', expectedCategory);
    assert(run.testVerdict, `${prefix}: missing run test verdict: ${JSON.stringify(run)}`);
    assert.equal(run.testVerdict.status, expectedCategory === 'success' ? 'passed' : 'failed');
    assert.equal(read.testVerdict.status, run.testVerdict.status);
    assert.equal(run.testVerdict.artifactIdentity, build.authoritativeResult.result.artifactIdentity);
    assert.equal(read.testVerdict.artifactIdentity, run.testVerdict.artifactIdentity);
    assert.equal(run.testVerdict.sourceIdentity, read.testVerdict.sourceIdentity);
    assert.equal(run.authoritativeResult.result.testEvidence.observations.length, 3);
    return { ready, build, run, read };
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    child.stdin.end();
    await new Promise((resolve) => child.once('exit', resolve));
    if (!operationError && child.exitCode !== 0) throw new Error(`adapter exit ${child.exitCode}: ${stderr}`);
  }
}

(async () => {
  const correct = await runVariant('correct', 'x11-real-correct', 'success');
  assert(correct.run.authoritativeResult.result.testEvidence.observations.every(
    (item) => item.status === 'passed'));

  const knownBad = await runVariant('known-bad-equality', 'x11-real-known-bad', 'test-failure');
  assert.equal(knownBad.run.code, 'RESULT_TEST_FAILURE');
  assert.equal(knownBad.run.testVerdict.scenarioId, 'THERM-SCENARIO-EQUALITY-ENABLED');
  assert.notEqual(knownBad.run.testVerdict.artifactIdentity, correct.run.testVerdict.artifactIdentity);
  assert.notEqual(knownBad.run.testVerdict.sourceIdentity, correct.run.testVerdict.sourceIdentity);
  const badEvidence = knownBad.run.authoritativeResult.result.testEvidence;
  assert.equal(badEvidence.firmwareVariant, 'known-bad-equality');
  assert.equal(badEvidence.observations.filter((item) => item.status === 'failed').length, 1);
  assert.equal(badEvidence.primaryObservation.observed.d13, true);
  assert.equal(badEvidence.primaryObservation.checks.primaryExecutedPin, false);
  assert.equal(knownBad.run.source.executed, true);
  assert.equal(knownBad.run.retry.recommended, false);

  process.stdout.write(`${JSON.stringify({
    status: 'pass', transport: correct.ready.transport,
    correct: { category: correct.run.category, artifact: correct.run.testVerdict.artifactIdentity,
      source: correct.run.testVerdict.sourceIdentity, scenarios: 3 },
    knownBad: { category: knownBad.run.category, artifact: knownBad.run.testVerdict.artifactIdentity,
      source: knownBad.run.testVerdict.sourceIdentity, scenario: knownBad.run.testVerdict.scenarioId,
      d13: badEvidence.primaryObservation.observed.d13 },
    fixture: false, productionOverloadUsed: false,
  })}\n`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
