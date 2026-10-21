// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  EXTERNAL_CLIENT_RESULT_CATEGORIES, EXTERNAL_CLIENT_RESULT_SCHEMA,
  externalClientResult,
} from '../src/external-client-results.mjs';
import {
  THERMOSTAT_SCENARIOS, evaluateThermostatObservation,
  thermostatScenarioControls,
} from '../src/thermostat-experiment-contract.mjs';
import { completedExperimentOutcome } from '../src/experiment-outcomes.mjs';
import {
  SAVED_M2_NATIVE_RAW_SHA256, contractCompleteM2Failure, savedM2NativeFailure,
  savedM2NativePass,
} from './fixtures/m2-saved-native-failure.mjs';

const association = {
  requestId: 'x11-result-request-01', action: 'result.read',
  profile: 'board.atmega328p-16mhz-v1', expectedGeneration: 4,
};
const identity = { product: 'Intent MCU Simulator', version: 'test-fixture',
  source: 'https://github.com/finnandrehotvedt/intent-mcu-simulator', license: 'Apache-2.0', generated: false };

function knownBadObservation() {
  const scenario = THERMOSTAT_SCENARIOS.scenarios[1];
  const controls = thermostatScenarioControls(scenario.id).map((control, index) => ({
    sequence: index + 1, targetCycle: 0, type: 'control',
    componentId: control.componentId, key: control.key, value: control.value,
  }));
  return evaluateThermostatObservation(scenario.id, {
    cycle: 2_560_000,
    pins: [{ pin: 'D13', mode: 'OUTPUT', level: true }],
    eventLog: { pending: [], log: controls, dropped: 0 },
    instruments: { serial: { text: 'TEMP_C=30 BUTTON=PRESSED HEATER=ON STATE=HEAT\n', dropped: 0 } },
  });
}

function completeFailedScenarioObservation() {
  const outcome = completedExperimentOutcome({ assertions: [
    { code: 'EXPECTED_PIN_LEVEL_MISMATCH', passed: false },
  ] });
  return {
    schema: 'intent-mcu-scenario-observation-result@1',
    sourceSha256: 'b'.repeat(64), artifactSha256: 'a'.repeat(64),
    scenarioId: 'THERM-SCENARIO-EQUALITY-ENABLED', status: 'failed', outcome,
    expected: { observationWindow: { startMilliseconds: 160, endMilliseconds: 350 } },
    observed: { level: false, captureWindow: { minimumMilliseconds: 160, maximumMilliseconds: 350 },
      inputControls: [{ componentId: 'enable-button-1', key: 'pressed', value: true, targetCycle: 0 }] },
    checks: { pinObserved: true }, retention: { inputEventsDropped: 0, serialEventsDropped: 0 },
  };
}

test('X11 preserves authoritative results while assigning stable disjoint categories', () => {
  const cases = [
    [{ ok: true, code: 'ACTION_CURRENT_RESULT', executed: true }, 'success', 'completed'],
    [{ ok: false, code: 'ACTION_REQUEST_SHAPE', executed: false }, 'validation-failure', 'not-started'],
    [{ ok: false, code: 'ACTION_STARTER_UNSUPPORTED', executed: true }, 'unsupported', 'not-started'],
    [{ ok: false, code: 'ACTION_BUSY', executed: false }, 'temporarily-busy', 'not-started'],
    [{ ok: false, code: 'ACTION_TIMEOUT', executed: false }, 'timeout', 'timeout'],
    [{ ok: false, code: 'ACTION_CANCELLED', executed: false }, 'cancelled', 'cancelled'],
    [{ ok: false, code: 'BROKER_FAILED', executed: true }, 'execution-failure', 'infrastructure-error'],
  ];
  for (const [raw, category, jobStatus] of cases) {
    const result = externalClientResult(raw, association, identity);
    assert.equal(result.schema, EXTERNAL_CLIENT_RESULT_SCHEMA);
    assert.equal(result.category, category);
    assert.equal(result.jobStatus, jobStatus);
    assert.deepEqual(result.authoritativeResult, raw);
    assert.equal(result.request.requestId, association.requestId);
    assert.equal(result.request.profile, association.profile);
    assert.equal(result.generation.expected, association.expectedGeneration);
    assert.deepEqual(result.source.identity, identity);
    assert.equal(result.retry.recommended, false);
    assert.equal(result.retry.requiresNewRequestId,
      ['temporarily-busy', 'timeout'].includes(category));
  }
  assert.deepEqual(new Set(cases.map(([, category]) => category)),
    new Set(EXTERNAL_CLIENT_RESULT_CATEGORIES.filter((category) => category !== 'test-failure')));
});

test('X18 external results keep academic indeterminate and unsupported separate from job lifecycle', () => {
  const incomplete = completedExperimentOutcome({
    evidence: [{ code: 'OBSERVATION_PIN_MISSING', complete: false }],
  });
  const raw = { ok: true, code: 'ACTION_TEST_EVALUATED', executed: true, result: {
    testEvidence: {
      schema: 'intent-mcu-bounded-test-evidence@1', experimentId: 'TEST',
      status: 'indeterminate', outcome: incomplete,
      artifactIdentity: 'a'.repeat(64), sourceIdentity: 'b'.repeat(64),
      primaryObservation: { scenarioId: 'S1' }, observations: [],
    },
  } };
  const classified = externalClientResult(raw, association, identity);
  assert.equal(classified.category, 'success');
  assert.equal(classified.jobStatus, 'completed');
  assert.equal(classified.testVerdict.status, 'indeterminate');
  assert.equal(classified.testVerdict.outcome.evidenceStatus, 'incomplete');

  const unsupported = externalClientResult({ ok: false, code: 'ACTION_TEST_UNSUPPORTED', executed: false },
    { ...association, action: 'test.run' }, identity);
  assert.equal(unsupported.category, 'unsupported');
  assert.equal(unsupported.jobStatus, 'not-started');
  assert.equal(unsupported.testVerdict.status, 'unsupported');
  assert.equal(unsupported.testVerdict.outcome.academicStatus, 'unsupported');
});

test('X11 fails closed for incomplete producer verdicts and retains complete failures', () => {
  const observation = knownBadObservation();
  assert.equal(observation.status, 'failed');
  assert.equal(observation.checks.primaryExecutedPin, false);
  const raw = {
    ok: true, schema: 'intent-mcu-bounded-action-result@1', code: 'DOMAIN_TEST_EVALUATED',
    action: 'result.read', executed: true,
    result: { ok: true, code: 'DOMAIN_TEST_EVALUATED', observation },
  };
  const result = externalClientResult(raw, association, identity);
  assert.equal(result.ok, true);
  assert.equal(result.category, 'success');
  assert.equal(result.testVerdict.status, 'indeterminate');
  assert.deepEqual(result.authoritativeResult.result.observation, observation);

  const completeFailure = completeFailedScenarioObservation();
  const bound = externalClientResult({
    ok: false, schema: 'intent-mcu-bounded-action-result@1', code: 'ACTION_TEST_EVALUATED',
    action: 'runtime.run', executed: true,
    result: {
      ok: false, code: 'ACTION_TEST_EVALUATED',
      artifactIdentity: 'a'.repeat(64), sourceIdentity: 'b'.repeat(64),
      testEvidence: {
        schema: 'intent-mcu-bounded-test-evidence@1', experimentId: observation.experimentId,
        status: 'failed', outcome: completeFailure.outcome,
        artifactIdentity: 'a'.repeat(64), sourceIdentity: 'b'.repeat(64),
        primaryObservation: completeFailure, observations: [completeFailure],
      },
    },
  }, association, identity);
  assert.equal(bound.category, 'test-failure');
  assert.equal(bound.testVerdict.scenarioId, 'THERM-SCENARIO-EQUALITY-ENABLED');
  assert.equal(bound.testVerdict.artifactIdentity, 'a'.repeat(64));
  assert.equal(bound.testVerdict.sourceIdentity, 'b'.repeat(64));

  const untrusted = externalClientResult({ ok: true, executed: true,
    code: 'TEXT_ONLY', result: { status: 'failed' } }, association, identity);
  assert.equal(untrusted.category, 'success');
  assert.equal(untrusted.testVerdict, null);
});

test('M2 immutable saved native suite remains indeterminate when producer proof fields are absent', () => {
  const native = savedM2NativeFailure();
  const projected = externalClientResult(native, { ...association, action: 'runtime.run' }, identity);
  assert.equal(SAVED_M2_NATIVE_RAW_SHA256,
    '2873c378c89022631d8f04f15c2cd51165bb97db3c0bffedc6e1d93ed6da6ea5');
  assert.equal(projected.category, 'success');
  assert.equal(projected.ok, true);
  assert.equal(projected.jobStatus, 'completed');
  assert.equal(projected.testVerdict.status, 'indeterminate');
  assert.equal(projected.testVerdict.outcome.evidenceStatus, 'incomplete');
  assert.ok(projected.testVerdict.outcome.reasons.includes('MEASUREMENT_COMPLETENESS_REQUIRED'));
  assert.equal(projected.testVerdict.scenarioId, 'THERM-SCENARIO-EQUALITY-ENABLED');
  assert.equal(projected.authoritativeResult.result.testEvidence.observations.length, 4);
});

test('M2 bounded suite accepts a fully joined source-backed failed producer contract', () => {
  const projected = externalClientResult(contractCompleteM2Failure(),
    { ...association, action: 'runtime.run' }, identity);
  assert.equal(projected.category, 'test-failure');
  assert.equal(projected.ok, false);
  assert.equal(projected.testVerdict.status, 'failed');
  assert.equal(projected.testVerdict.outcome.evidenceStatus, 'complete');
});

test('M2 bounded suite fails closed for wrong IDs/generation or incomplete retention, Serial and window proof', () => {
  const mutations = [
    ['missing input', (value) => { value.result.testEvidence.observations[0].observed.inputControls = []; }],
    ['wrong scenario ID', (value) => { value.result.testEvidence.observations[0].scenarioId = 'THERM-SCENARIO-OTHER'; }],
    ['wrong parent generation', (value) => { value.result.runtimeGeneration += 1; }],
    ['missing retention', (value) => { delete value.result.testEvidence.observations[0].retention; }],
    ['dropped input', (value) => { value.result.testEvidence.observations[0].retention.inputEventsDropped = 1; }],
    ['partial serial', (value) => { value.result.testEvidence.observations[0].observed.serialText = 'TEMP_C=29 BUTTON='; }],
    ['out of window with true wrapper flag', (value) => {
      value.result.testEvidence.observations[0].virtualMilliseconds = 159;
    }],
    ['missing pin', (value) => { value.result.testEvidence.observations[0].observed.d13 = null; }],
    ['identity mismatch', (value) => { value.result.artifactIdentity = 'f'.repeat(64); }],
    ['generation missing', (value) => { delete value.result.testEvidence.runtimeGeneration; }],
    ['row aggregate mismatch', (value) => { value.result.testEvidence.status = 'passed'; }],
  ];
  for (const [name, mutate] of mutations) {
    const native = contractCompleteM2Failure(); mutate(native);
    const projected = externalClientResult(native, { ...association, action: 'runtime.run' }, identity);
    assert.equal(projected.testVerdict.status, 'indeterminate', name);
    assert.equal(projected.testVerdict.outcome.evidenceStatus, 'incomplete', name);
    assert.ok(projected.testVerdict.outcome.reasons.includes('MEASUREMENT_COMPLETENESS_REQUIRED'), name);
    assert.notEqual(projected.category, 'test-failure', name);
  }
});

test('M2 complete passing suite and result.read preserve identical completed evidence', () => {
  const native = savedM2NativePass();
  const run = externalClientResult(native, { ...association, action: 'runtime.run' }, identity);
  const readRaw = structuredClone(native); readRaw.action = 'result.read';
  const read = externalClientResult(readRaw, { ...association, action: 'result.read' }, identity);
  assert.equal(run.category, 'success'); assert.equal(run.testVerdict.status, 'passed');
  assert.equal(run.jobStatus, 'completed'); assert.equal(read.jobStatus, 'completed');
  assert.deepEqual(read.testVerdict, run.testVerdict);
  assert.deepEqual(read.authoritativeResult.result.testEvidence,
    run.authoritativeResult.result.testEvidence);
});

test('X91 external projection cannot expose pass when current measurement evidence is incomplete', () => {
  const observation = knownBadObservation();
  observation.status = 'passed';
  observation.outcome = completedExperimentOutcome();
  observation.checks.serialObserved = false;
  const result = externalClientResult({
    ok: true, schema: 'intent-mcu-bounded-action-result@1', code: 'DOMAIN_TEST_EVALUATED',
    action: 'result.read', executed: true,
    result: { ok: true, code: 'DOMAIN_TEST_EVALUATED', observation },
  }, association, identity);
  assert.equal(result.category, 'success');
  assert.equal(result.testVerdict.status, 'indeterminate');
  assert.equal(result.testVerdict.outcome.evidenceStatus, 'incomplete');
  assert.ok(result.testVerdict.outcome.reasons.includes('MEASUREMENT_COMPLETENESS_REQUIRED'));
});

test('X11 separate fixture process proves success and every failure category deterministically', async () => {
  const fixture = fileURLToPath(new URL('fixtures/x11-result-process.mjs', import.meta.url));
  const child = spawn(process.execPath, [fixture], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', resolve);
  });
  assert.equal(exitCode, 0, stderr);
  const result = JSON.parse(stdout);
  assert.equal(result.fixture, true);
  assert.deepEqual(result.categories.sort(), [...EXTERNAL_CLIENT_RESULT_CATEGORIES].sort());
  assert.equal(result.busySourceCode, 'ACTION_BUSY');
  assert.equal(result.timeoutSourceCode, 'ACTION_TIMEOUT');
  assert.equal(result.cancelSourceCode, 'ACTION_CANCELLED');
  assert.equal(result.knownBadProducerStatus, 'failed');
  assert.equal(result.knownBadEvidenceKind, 'deterministic-evaluator-fixture');
  assert.equal(result.productionOverloadUsed, false);
  assert.equal(result.productionRuntimeClaimed, false);
});
