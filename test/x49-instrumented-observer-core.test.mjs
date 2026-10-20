// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectX49Report, sealX49Report, X49_ADC_SCHEMA, X49_CASES, X49_CONTRACT_ID,
  X49_EXPERIMENT_BINDING_SCHEMA, X49_FIXTURE_CLASS, X49_INPUT_SCHEMA,
  X49_MODEL_OUTPUT_SCHEMA, X49_PROFILE, X49_REPORT_SCHEMA, X49_RETENTION_SCHEMA,
  X49_TIME_SCHEMA,
} from '../src/x49-sensor-offset.mjs';
import {
  X49_INSTRUMENTED_FIXTURE_ID, X49_INSTRUMENTED_SOURCE_SHA256, X49_PROBE_BYTES,
  X49_PROBE_SYMBOL, X49_RUNTIME_PROBE_SCHEMA,
} from '../src/x49-instrumented-fixture-contract.mjs';
import { X49InstrumentedObserverCore, X49_OBSERVER_LIMITS } from '../src/x49-instrumented-observer-core.mjs';

const artifactIdentity = '2'.repeat(64);
const modelImplementationSha256 = '3'.repeat(64);
const modelExecutionContextSha256 = '4'.repeat(64);
const graphIdentity = `sha256:${'5'.repeat(64)}`;
const probe = () => ({
  schema: X49_RUNTIME_PROBE_SCHEMA, fixtureId: X49_INSTRUMENTED_FIXTURE_ID,
  sourceSha256: X49_INSTRUMENTED_SOURCE_SHA256, artifactIdentity,
  symbol: { symbol: X49_PROBE_SYMBOL, dataAddress: 0x100, size: X49_PROBE_BYTES,
    elfSha256: '6'.repeat(64), binding: 'global', type: 'object' },
});
const experimentBinding = () => ({
  schema: X49_EXPERIMENT_BINDING_SCHEMA, profile: X49_PROFILE, projectGeneration: 9,
  graphIdentity, sourceSha256: X49_INSTRUMENTED_SOURCE_SHA256, artifactIdentity,
  modelImplementationSha256, modelExecutionContextSha256, fixtureClass: X49_FIXTURE_CLASS,
  componentId: 'temperature-sensor-1', boardPin: 'A1',
});

function context(entry, index) {
  const runtimeBinding = { schema: 'intent-mcu-runtime-binding@2', projectGeneration: 9,
    runtimeGeneration: 40 + index, artifactIdentity,
    modelImplementationSha256, modelExecutionContextSha256 };
  return {
    input: { schema: X49_INPUT_SCHEMA, inputIdentity: entry.inputIdentity, graphIdentity,
      authored: structuredClone(entry.authored), targetCycle: 0, appliedCycle: 0,
      retainedThroughCycle: 3_000_000 },
    modelOutput: { schema: X49_MODEL_OUTPUT_SCHEMA, componentId: 'temperature-sensor-1',
      boardPin: 'A1', voltage: entry.calculated.modelVoltage },
    runtimeBinding,
    runtimeIdentity: { schema: 'intent-mcu-worker-runtime-identity@2', projectGeneration: 9,
      runtimeGeneration: 40 + index, artifactIdentity,
      modelImplementationSha256, modelExecutionContextSha256,
      workerInitialization: index + 1, workerInstanceNonce: String(index + 5).repeat(32) },
    time: { schema: X49_TIME_SCHEMA, cpuCycles: 3_000_000, virtualMilliseconds: 187.5 },
    retention: { schema: X49_RETENTION_SCHEMA, completeThroughCycle: 3_000_000,
      droppedTraceRows: 0, droppedAdcCompletions: 0, droppedMailboxTransactions: 0 },
    incompleteReason: null,
  };
}

function observeComplete(entry, index, override = {}) {
  const observer = new X49InstrumentedObserverCore({ probe: probe(), caseId: entry.caseId });
  const adc = { schema: X49_ADC_SCHEMA, channel: 1, value: entry.calculated.adcCount,
    startCycle: 2_600_000, completionCycle: 2_700_000 };
  const level = override.level ?? entry.calculated.d13Level;
  const temperature = override.temperature ?? entry.calculated.firmwareIntegerC;
  const unsigned = temperature < 0 ? temperature + 0x10000 : temperature;
  const states = [
    [[0, 0, 128, 255], [1, 0, 128, 255], 2_800_000],
    [[1, 0, 128, 255], [1, unsigned & 0xff, 128, 255], 2_810_000],
    [[1, unsigned & 0xff, 128, 255], [1, unsigned & 0xff, unsigned >> 8, 255], 2_820_000],
    [[1, unsigned & 0xff, unsigned >> 8, 255], [1, unsigned & 0xff, unsigned >> 8, level ? 1 : 0], 2_830_000],
    [[1, unsigned & 0xff, unsigned >> 8, level ? 1 : 0],
      [2, unsigned & 0xff, unsigned >> 8, level ? 1 : 0], 2_900_000],
  ];
  for (const [before, after, cycle] of states) observer.observe({
    before, after, cycle, pcBefore: cycle, pcAfter: cycle + 1, latestAdc: adc,
    d13: { schema: 'intent-mcu-x49-pin-observation@1', pin: 'D13', mode: 'OUTPUT',
      level, observedCycle: cycle },
  });
  return { observer, observation: observer.observation(context(entry, index)) };
}

async function report(observations = X49_CASES.map((entry, index) => observeComplete(entry, index).observation)) {
  return sealX49Report({ schema: X49_REPORT_SCHEMA, contractId: X49_CONTRACT_ID,
    experimentBinding: experimentBinding(), cases: observations, semanticSha256: '' });
}

async function mutate(mutation) {
  const value = await report(); mutation(value); return sealX49Report(value);
}

test('pure observer joins canonical ADC409/414, odd/even mailbox commits and actual D13', async () => {
  const complete = X49_CASES.map((entry, index) => observeComplete(entry, index));
  assert.deepEqual(complete.map(({ observer }) => observer.snapshot().expectedAdcValue), [409, 414]);
  assert.deepEqual(complete.map(({ observation }) => observation.firmwareTransaction.commit), [2, 2]);
  assert.deepEqual(complete.map(({ observation }) => observation.pin.level), [true, false]);
  assert.equal((await projectX49Report(await report(complete.map((item) => item.observation)))).academicStatus,
    'passed');
  assert.equal(X49_OBSERVER_LIMITS.syntheticTraceIsNativeEvidence, false);
  assert.equal(X49_OBSERVER_LIMITS.adapterImported, false);
});

test('missing commits and ADC completion loss remain incomplete, never measured failures', async () => {
  const missing = new X49InstrumentedObserverCore({ probe: probe(), caseId: X49_CASES[0].caseId });
  const observations = X49_CASES.map((entry, index) => observeComplete(entry, index).observation);
  observations[0] = missing.observation(context(X49_CASES[0], 0));
  let projection = await projectX49Report(await report(observations));
  assert.equal(projection.cases[0].outcome.reason, 'missing-evidence');

  const lost = new X49InstrumentedObserverCore({ probe: probe(), caseId: X49_CASES[0].caseId });
  lost.observe({ before: [0, 0, 128, 255], after: [1, 0, 128, 255], cycle: 2_800_000,
    pcBefore: 1, pcAfter: 2, latestAdc: null, d13: null });
  observations[0] = lost.observation(context(X49_CASES[0], 0));
  projection = await projectX49Report(await report(observations));
  assert.equal(projection.cases[0].outcome.reason, 'missing-evidence');

  const even = new X49InstrumentedObserverCore({ probe: probe(), caseId: X49_CASES[0].caseId });
  even.observe({ before: [1, 29, 0, 1], after: [2, 29, 0, 1], cycle: 2_900_000,
    pcBefore: 1, pcAfter: 2, latestAdc: null, d13: null });
  observations[0] = even.observation(context(X49_CASES[0], 0));
  projection = await projectX49Report(await report(observations));
  assert.equal(projection.cases[0].outcome.reason, 'truncated-evidence');
});

test('binding, retention, time and lifecycle defects remain indeterminate', async () => {
  const defects = [
    [(value) => { value.experimentBinding.sourceSha256 = '8'.repeat(64); }, 'stale-evidence'],
    [(value) => { value.experimentBinding.artifactIdentity = '8'.repeat(64); }, 'stale-evidence'],
    [(value) => { value.cases[0].input.graphIdentity = `sha256:${'8'.repeat(64)}`; }, 'stale-evidence'],
    [(value) => { value.cases[0].input.inputIdentity = '8'.repeat(64); }, 'stale-evidence'],
    [(value) => { value.cases[0].runtimeBinding.artifactIdentity = '8'.repeat(64); }, 'stale-evidence'],
    [(value) => { value.cases[0].runtimeBinding.modelImplementationSha256 = '8'.repeat(64); }, 'stale-evidence'],
    [(value) => { value.cases[0].runtimeBinding.modelExecutionContextSha256 = '8'.repeat(64); }, 'stale-evidence'],
    [(value) => { value.cases[0].runtimeBinding.projectGeneration = 10; }, 'stale-evidence'],
    [(value) => { value.cases[1].runtimeIdentity.workerInstanceNonce = value.cases[0].runtimeIdentity.workerInstanceNonce; }, 'stale-evidence'],
    [(value) => { value.cases[0].retention.droppedMailboxTransactions = 1; }, 'dropped-evidence'],
    [(value) => { value.cases[0].retention.completeThroughCycle = 2_900_000; }, 'truncated-evidence'],
    [(value) => { value.cases[0].time.cpuCycles = 5_600_001;
      value.cases[0].time.virtualMilliseconds = 350.0000625;
      value.cases[0].input.retainedThroughCycle = 5_600_001;
      value.cases[0].retention.completeThroughCycle = 5_600_001; }, 'window-expired'],
    [(value) => { value.cases[0].evidence = { ...value.cases[0].evidence,
      state: 'incomplete', reason: 'cancelled' }; }, 'cancelled'],
    [(value) => { value.cases[0].evidence = { ...value.cases[0].evidence,
      state: 'incomplete', reason: 'infrastructure-failure' }; }, 'infrastructure-failure'],
  ];
  for (const [change, reason] of defects) {
    const projection = await projectX49Report(await mutate(change));
    assert.equal(projection.academicStatus, 'indeterminate');
    assert.equal(projection.cases[0].outcome.reason, reason);
  }
});

test('only a complete joined observation can produce a measured contradiction', async () => {
  const contradictory = X49_CASES.map((entry, index) => observeComplete(
    entry, index, index === 0 ? { temperature: 30 } : {},
  ).observation);
  const projection = await projectX49Report(await report(contradictory));
  assert.equal(projection.academicStatus, 'failed');
  assert.equal(projection.cases[0].outcome.checks.committedFirmwareInteger, false);
  assert.equal(projection.cases[0].outcome.reason, null);
});
