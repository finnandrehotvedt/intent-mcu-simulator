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

test('X11 preserves authoritative results while assigning stable disjoint categories', () => {
  const cases = [
    [{ ok: true, code: 'ACTION_CURRENT_RESULT', executed: true }, 'success'],
    [{ ok: false, code: 'ACTION_REQUEST_SHAPE', executed: false }, 'validation-failure'],
    [{ ok: false, code: 'ACTION_STARTER_UNSUPPORTED', executed: true }, 'unsupported'],
    [{ ok: false, code: 'ACTION_BUSY', executed: false }, 'temporarily-busy'],
    [{ ok: false, code: 'ACTION_TIMEOUT', executed: false }, 'timeout'],
    [{ ok: false, code: 'ACTION_CANCELLED', executed: false }, 'cancelled'],
    [{ ok: false, code: 'BROKER_FAILED', executed: true }, 'execution-failure'],
  ];
  for (const [raw, category] of cases) {
    const result = externalClientResult(raw, association, identity);
    assert.equal(result.schema, EXTERNAL_CLIENT_RESULT_SCHEMA);
    assert.equal(result.category, category);
    assert.deepEqual(result.authoritativeResult, raw);
    assert.equal(result.request.requestId, association.requestId);
    assert.equal(result.request.profile, association.profile);
    assert.equal(result.generation.expected, association.expectedGeneration);
    assert.deepEqual(result.source.identity, identity);
    assert.equal(result.retry.recommended, category === 'temporarily-busy');
  }
  assert.deepEqual(new Set(cases.map(([, category]) => category)),
    new Set(EXTERNAL_CLIENT_RESULT_CATEGORIES.filter((category) => category !== 'test-failure')));
});

test('X11 recognizes only an authoritative producer-backed failed verdict as test failure', () => {
  const observation = knownBadObservation();
  assert.equal(observation.status, 'failed');
  assert.equal(observation.checks.primaryExecutedPin, false);
  const raw = {
    ok: true, schema: 'intent-mcu-bounded-action-result@1', code: 'DOMAIN_TEST_EVALUATED',
    action: 'result.read', executed: true,
    result: { ok: true, code: 'DOMAIN_TEST_EVALUATED', observation },
  };
  const result = externalClientResult(raw, association, identity);
  assert.equal(result.ok, false);
  assert.equal(result.category, 'test-failure');
  assert.equal(result.code, 'RESULT_TEST_FAILURE');
  assert.equal(result.testVerdict.status, 'failed');
  assert.deepEqual(result.authoritativeResult.result.observation, observation);

  const bound = externalClientResult({
    ok: false, schema: 'intent-mcu-bounded-action-result@1', code: 'ACTION_TEST_EVALUATED',
    action: 'runtime.run', executed: true,
    result: {
      ok: false, code: 'ACTION_TEST_EVALUATED',
      testEvidence: {
        schema: 'intent-mcu-bounded-test-evidence@1', experimentId: observation.experimentId,
        status: 'failed', artifactIdentity: 'a'.repeat(64), sourceIdentity: 'b'.repeat(64),
        primaryObservation: observation, observations: [observation],
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
