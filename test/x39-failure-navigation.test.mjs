// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { RUNTIME_BINDING_SCHEMA, WORKER_RUNTIME_IDENTITY_SCHEMA } from '../src/runtime-identity.mjs';
import {
  X39_FAILURE_LOCATION_SCHEMA, X39_SOURCE_SHA256, createX39FailureLocator,
  validateX39FailureLocator,
} from '../src/x39-failure-navigation.mjs';
import { THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE } from '../src/thermostat-source.mjs';
import { createThermostatExperiment, openThermostatExperiment } from '../src/thermostat-experiment.mjs';
import { defaultThermostatScenarioTimeline } from '../src/scenario-timeline.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const artifactIdentity = 'a'.repeat(64);
const inputIdentity = 'c4d8ca8c6040529f4bacdbc2e451e66d9640db7f0c97e5f1acca806c1023d431';
const generation = 7;

function failedResult() {
  return {
    schema: 'intent-mcu-thermostat-observation-result@1', experimentId: 'avr-thermostat-boundary-v1',
    scenarioId: 'THERM-SCENARIO-EQUALITY-ENABLED',
    requirementIds: ['THERM-REQ-02', 'THERM-REQ-04', 'THERM-REQ-05'], status: 'failed',
    outcome: { academicStatus: 'failed', jobStatus: 'completed', evidenceStatus: 'complete' },
    virtualMilliseconds: 210.306,
    expected: { d13: false, serialLine: 'TEMP_C=30 BUTTON=PRESSED HEATER=OFF STATE=HOLD' },
    observed: { d13Mode: 'OUTPUT', d13: true,
      serialText: 'TEMP_C=30 BUTTON=PRESSED HEATER=ON STATE=HEAT\r\n',
      inputControls: [
        { componentId: 'temperature-sensor-1', key: 'position', value: 0.405, targetCycle: 0 },
        { componentId: 'enable-button-1', key: 'pressed', value: true, targetCycle: 0 },
      ] },
    checks: { timeInWindow: true, inputsComplete: true, pinObserved: true, serialObserved: true,
      primaryExecutedPin: false, corroboratingSerial: false },
  };
}

function context() {
  const created = createThermostatExperiment('known-bad-equality');
  const graph = openThermostatExperiment(created.text).session.project.circuit;
  const runtimeBinding = { schema: RUNTIME_BINDING_SCHEMA, projectGeneration: generation,
    runtimeGeneration: 11, artifactIdentity };
  return {
    profile: 'board.atmega328p-16mhz-v1', projectGeneration: generation,
    runtimeBinding,
    runtimeIdentity: { schema: WORKER_RUNTIME_IDENTITY_SCHEMA, projectGeneration: generation,
      runtimeGeneration: 11, artifactIdentity, workerInitialization: 1,
      workerInstanceNonce: 'c'.repeat(32) },
    inputIdentity, artifactIdentity,
    source: { file: 'main.ino', text: THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE },
    graph, result: failedResult(), timeline: defaultThermostatScenarioTimeline(),
    retention: { inputDrops: 0, serialDrops: 0 },
  };
}

test('X39 creates one exact transient identity-bound locator', async () => {
  const current = context();
  const locator = await createX39FailureLocator(current);
  assert.equal(locator.schema, X39_FAILURE_LOCATION_SCHEMA);
  assert.equal(locator.source.sha256, X39_SOURCE_SHA256);
  assert.deepEqual(locator.net.endpoints, ['board-1.D13', 'heater-resistor-1.A']);
  assert.equal(locator.observation.actualMilliseconds, 210.306);
  assert.deepEqual(await validateX39FailureLocator(locator, current), locator);
});

test('X39 rejects every stale identity, incomplete producer and topology drift', async (suite) => {
  for (const [name, mutate] of [
    ['profile', (value) => { value.profile = 'board.rp2040-pico-v1'; }],
    ['generation', (value) => { value.projectGeneration += 1; }],
    ['runtime generation', (value) => { value.runtimeIdentity.runtimeGeneration += 1; }],
    ['worker nonce', (value) => { value.runtimeIdentity.workerInstanceNonce = 'z'.repeat(32); }],
    ['input identity', (value) => { value.inputIdentity = 'd'.repeat(64); }],
    ['artifact identity', (value) => { value.artifactIdentity = 'e'.repeat(64); }],
    ['source', (value) => { value.source.text = value.source.text.replace('<=', '<'); }],
    ['net id', (value) => { value.graph.nets.find((net) => net.id === 'net-thermostat-heater-drive').id = 'renamed'; }],
    ['endpoint', (value) => { value.graph.nets.find((net) => net.id === 'net-thermostat-heater-drive').endpoints[1].pin = 'B'; }],
    ['time missing', (value) => { value.result.virtualMilliseconds = null; }],
    ['time outside', (value) => { value.result.virtualMilliseconds = 351; }],
    ['window', (value) => { value.timeline.scenarios[1].events.at(-1).throughMilliseconds = 349; }],
    ['passed', (value) => { value.result.status = 'passed'; }],
    ['job', (value) => { value.result.outcome.jobStatus = 'timed-out'; }],
    ['mode', (value) => { value.result.observed.d13Mode = 'INPUT'; }],
    ['actual level', (value) => { value.result.observed.d13 = false; }],
    ['input drops', (value) => { value.retention.inputDrops = 1; }],
    ['serial drops', (value) => { value.retention.serialDrops = 1; }],
    ['serial-only', (value) => { value.result.checks.pinObserved = false; }],
  ]) await suite.test(name, async () => {
    const value = context(); mutate(value);
    await assert.rejects(createX39FailureLocator(value));
  });
});

test('X39 rejects mutation of an already issued locator against current state', async (suite) => {
  const current = context();
  for (const [name, mutate] of [
    ['source line', (value) => { value.source.startLine = 19; }],
    ['pin', (value) => { value.pin.id = 'D12'; }],
    ['net', (value) => { value.net.endpoints.reverse(); }],
    ['time', (value) => { value.observation.actualMilliseconds += 1; }],
    ['hash', (value) => { value.semanticSha256 = '0'.repeat(64); }],
    ['extra field', (value) => { value.extra = true; }],
  ]) await suite.test(name, async () => {
    const locator = await createX39FailureLocator(current); mutate(locator);
    await assert.rejects(validateX39FailureLocator(locator, current));
  });
});
