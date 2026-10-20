// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createX49ProjectionOwner,
  projectX49ExpectedCases,
  projectX49Report,
  sealX49Report,
  validateX49AcceptedNativeReport,
  validateX49AuthoredCase,
  x49CalculatedCaseIsExact,
  X49_ADC_SCHEMA,
  X49_CASES,
  X49_CASE_SCHEMA,
  X49_CONTRACT_ID,
  X49_EVIDENCE_STATE_SCHEMA,
  X49_EXPERIMENT_BINDING_SCHEMA,
  X49_FIRMWARE_PRODUCER_SCHEMA,
  X49_FIXTURE_CLASS,
  X49_INPUT_SCHEMA,
  X49_MODEL_OUTPUT_SCHEMA,
  X49_PIN_SCHEMA,
  X49_PROFILE,
  X49_REPORT_SCHEMA,
  X49_RETENTION_SCHEMA,
  X49_TIME_SCHEMA,
} from '../src/x49-sensor-offset.mjs';

const sourceSha256 = '1'.repeat(64);
const artifactIdentity = '2'.repeat(64);
const modelImplementationSha256 = '3'.repeat(64);
const modelExecutionContextSha256 = '4'.repeat(64);
const graphIdentity = `sha256:${'5'.repeat(64)}`;

function experimentBinding() {
  return {
    schema: X49_EXPERIMENT_BINDING_SCHEMA, profile: X49_PROFILE, projectGeneration: 9,
    graphIdentity, sourceSha256, artifactIdentity, modelImplementationSha256,
    modelExecutionContextSha256, fixtureClass: X49_FIXTURE_CLASS,
    componentId: 'temperature-sensor-1', boardPin: 'A1',
  };
}

function observation(entry, index) {
  const runtimeBinding = {
    schema: 'intent-mcu-runtime-binding@2', projectGeneration: 9,
    runtimeGeneration: 40 + index, artifactIdentity,
    modelImplementationSha256, modelExecutionContextSha256,
  };
  return {
    schema: X49_CASE_SCHEMA, caseId: entry.caseId, profile: X49_PROFILE,
    input: {
      schema: X49_INPUT_SCHEMA, inputIdentity: entry.inputIdentity, graphIdentity,
      authored: structuredClone(entry.authored), targetCycle: 0, appliedCycle: 0,
      retainedThroughCycle: 3_000_000,
    },
    modelOutput: { schema: X49_MODEL_OUTPUT_SCHEMA, componentId: 'temperature-sensor-1',
      boardPin: 'A1', voltage: entry.calculated.modelVoltage },
    runtimeBinding,
    runtimeIdentity: {
      schema: 'intent-mcu-worker-runtime-identity@2', projectGeneration: 9,
      runtimeGeneration: 40 + index, artifactIdentity,
      modelImplementationSha256, modelExecutionContextSha256,
      workerInitialization: index + 1, workerInstanceNonce: String(index + 5).repeat(32),
    },
    adc: { schema: X49_ADC_SCHEMA, channel: 1, value: entry.calculated.adcCount,
      startCycle: 2_600_000, completionCycle: 2_700_000 },
    firmwareTransaction: {
      schema: X49_FIRMWARE_PRODUCER_SCHEMA, fixtureClass: X49_FIXTURE_CLASS,
      sourceSha256, artifactIdentity, commit: 2,
      temperatureC: entry.calculated.firmwareIntegerC,
      d13Level: entry.calculated.d13Level ? 1 : 0,
      adcChannel: 1, adcValue: entry.calculated.adcCount, adcCompletionCycle: 2_700_000,
      beginCycle: 2_800_000, commitCycle: 2_900_000,
    },
    pin: { schema: X49_PIN_SCHEMA, pin: 'D13', mode: 'OUTPUT',
      level: entry.calculated.d13Level, observedCycle: 2_950_000 },
    time: { schema: X49_TIME_SCHEMA, cpuCycles: 3_000_000, virtualMilliseconds: 187.5 },
    retention: { schema: X49_RETENTION_SCHEMA, completeThroughCycle: 3_000_000,
      droppedTraceRows: 0, droppedAdcCompletions: 0, droppedMailboxTransactions: 0 },
    evidence: { schema: X49_EVIDENCE_STATE_SCHEMA, state: 'complete', reason: null },
  };
}

async function report() {
  return sealX49Report({
    schema: X49_REPORT_SCHEMA, contractId: X49_CONTRACT_ID,
    experimentBinding: experimentBinding(), cases: X49_CASES.map(observation), semanticSha256: '',
  });
}

async function mutateReport(mutate) {
  const value = await report(); mutate(value);
  return sealX49Report(value);
}

test('fixed authored cases compose the ideal model with immutable canonical input identities', () => {
  const cases = projectX49ExpectedCases();
  assert.deepEqual(cases.map(({ caseId, authored, calculated }) => ({ caseId, authored, calculated })), [
    { caseId: 'baseline-offset-0',
      authored: { referenceTemperatureC: 30, offsetC: 0, effectiveTemperatureC: 30 },
      calculated: { modelVoltage: 2, adcCount: 409, firmwareIntegerC: 29, d13Level: true } },
    { caseId: 'offset-plus-1',
      authored: { referenceTemperatureC: 30, offsetC: 1, effectiveTemperatureC: 31 },
      calculated: { modelVoltage: 2.025, adcCount: 414, firmwareIntegerC: 30, d13Level: false } },
  ]);
  assert.deepEqual(cases.map((entry) => entry.inputIdentity), [
    '4300d360967677c0cd653cb7bf4cd93ab6d8e8235cb76a38d86ae5b43f25679b',
    'ac42be30971461c12d66abda86f45ed28263006e0d85ca3dad6a6c0ed08dff2a',
  ]);
  assert.equal(x49CalculatedCaseIsExact(X49_CASES[0], 'baseline-offset-0'), true);
  assert.equal(x49CalculatedCaseIsExact(X49_CASES[1], 'offset-plus-1'), true);
});

test('offset input is integer, bounded -2 through 2 and internally consistent', () => {
  for (const offsetC of [-2, -1, 0, 1, 2]) assert.deepEqual(validateX49AuthoredCase({
    referenceTemperatureC: 30, offsetC, effectiveTemperatureC: 30 + offsetC,
  }), { referenceTemperatureC: 30, offsetC, effectiveTemperatureC: 30 + offsetC });
  for (const value of [
    { referenceTemperatureC: 30, offsetC: 3, effectiveTemperatureC: 33 },
    { referenceTemperatureC: 30, offsetC: -3, effectiveTemperatureC: 27 },
    { referenceTemperatureC: 30, offsetC: 0.5, effectiveTemperatureC: 30.5 },
    { referenceTemperatureC: 30, offsetC: 1, effectiveTemperatureC: 30 },
    { referenceTemperatureC: 30, offsetC: 1, effectiveTemperatureC: 31, saved: true },
  ]) assert.throws(() => validateX49AuthoredCase(value), { code: 'X49_AUTHORED_INPUT_INVALID' });
});

test('native pass requires two fresh complete reports joined to one immutable experiment binding', async () => {
  const projection = await validateX49AcceptedNativeReport(await report());
  assert.equal(projection.academicStatus, 'passed');
  assert.equal(projection.physicalStatus, 'absent');
  assert.deepEqual(projection.cases.map((entry) => entry.outcome.academicStatus), ['passed', 'passed']);
  assert.equal(projection.experimentBinding.graphIdentity, graphIdentity);
});

test('a complete valid-provenance measured contradiction is academic failed, not indeterminate', async () => {
  const value = await mutateReport((candidate) => {
    candidate.cases[0].firmwareTransaction.temperatureC = 30;
  });
  const projection = await projectX49Report(value);
  assert.equal(projection.academicStatus, 'failed');
  assert.equal(projection.cases[0].outcome.academicStatus, 'failed');
  assert.equal(projection.cases[0].outcome.checks.committedFirmwareInteger, false);
  await assert.rejects(() => validateX49AcceptedNativeReport(value), { code: 'X49_NATIVE_ACCEPTANCE_FAILED' });
});

test('missing, dropped, stale, cancelled, infrastructure and expired evidence stay indeterminate', async () => {
  const cases = [
    [(value) => { value.cases[0].adc = null; }, 'missing-evidence'],
    [(value) => { value.cases[0].retention.droppedTraceRows = 1; }, 'dropped-evidence'],
    [(value) => { value.cases[0].runtimeBinding.modelImplementationSha256 = '8'.repeat(64); }, 'stale-evidence'],
    [(value) => { value.cases[0].evidence = { schema: X49_EVIDENCE_STATE_SCHEMA,
      state: 'incomplete', reason: 'cancelled' }; }, 'cancelled'],
    [(value) => { value.cases[0].evidence = { schema: X49_EVIDENCE_STATE_SCHEMA,
      state: 'incomplete', reason: 'infrastructure-failure' }; }, 'infrastructure-failure'],
    [(value) => { value.cases[0].time.cpuCycles = 5_600_001;
      value.cases[0].time.virtualMilliseconds = 350.0000625;
      value.cases[0].input.retainedThroughCycle = 5_600_001;
      value.cases[0].retention.completeThroughCycle = 5_600_001; }, 'window-expired'],
  ];
  for (const [mutate, reason] of cases) {
    const value = await mutateReport(mutate);
    const projection = await projectX49Report(value);
    assert.equal(projection.academicStatus, 'indeterminate', reason);
    assert.equal(projection.cases[0].outcome.reason, reason);
    await assert.rejects(() => validateX49AcceptedNativeReport(value), { code: 'X49_NATIVE_ACCEPTANCE_FAILED' });
  }
});

test('unsafe, null-coercible and non-integer numeric fields are malformed report rejection', async () => {
  const cases = [
    [(value) => { value.cases[0].firmwareTransaction.beginCycle = Number.MAX_SAFE_INTEGER + 1; }, 'X49_FIRMWARE_TRANSACTION_INVALID'],
    [(value) => { value.cases[0].firmwareTransaction.commitCycle = null; }, 'X49_FIRMWARE_TRANSACTION_INVALID'],
    [(value) => { value.cases[0].time.cpuCycles = 3_000_000.5; }, 'X49_TIME_INVALID'],
    [(value) => { value.cases[0].pin.observedCycle = '2950000'; }, 'X49_PIN_INVALID'],
    [(value) => { value.cases[0].adc.startCycle = -1; }, 'X49_ADC_INVALID'],
    [(value) => { value.cases[0].input.retainedThroughCycle = null; }, 'X49_INPUT_INVALID'],
    [(value) => { value.cases[0].input.authored.referenceTemperatureC = Number.MAX_SAFE_INTEGER + 1; }, 'X49_AUTHORED_INPUT_INVALID'],
    [(value) => { value.cases[0].retention.droppedMailboxTransactions = 0.5; }, 'X49_RETENTION_INVALID'],
  ];
  for (const [mutate, code] of cases) {
    const value = await mutateReport(mutate);
    await assert.rejects(() => projectX49Report(value), { code });
  }
  const extra = await mutateReport((value) => { value.cases[0].adc.coerced = false; });
  await assert.rejects(() => projectX49Report(extra), { code: 'X49_ADC_INVALID' });
});

test('causal future cycles and retention ending before the sample are incomplete, never failed or passed', async () => {
  const cases = [
    (value) => { value.cases[0].pin.observedCycle = 3_000_001; },
    (value) => { value.cases[0].adc.completionCycle = 3_000_001;
      value.cases[0].firmwareTransaction.adcCompletionCycle = 3_000_001;
      value.cases[0].firmwareTransaction.beginCycle = 3_000_002;
      value.cases[0].firmwareTransaction.commitCycle = 3_000_003;
      value.cases[0].pin.observedCycle = 3_000_004; },
    (value) => { value.cases[0].input.retainedThroughCycle = 2_700_000; },
    (value) => { value.cases[0].retention.completeThroughCycle = 2_950_000; },
    (value) => { value.cases[0].firmwareTransaction.beginCycle = 2_699_999; },
  ];
  for (const mutate of cases) {
    const projection = await projectX49Report(await mutateReport(mutate));
    assert.equal(projection.academicStatus, 'indeterminate');
    assert.equal(projection.cases[0].outcome.reason, 'truncated-evidence');
  }
});

test('recomputed hashes cannot rescue model, context, project, graph, source, artifact or input join drift', async () => {
  const mutations = [
    (value) => { value.experimentBinding.modelImplementationSha256 = '8'.repeat(64); },
    (value) => { value.experimentBinding.modelExecutionContextSha256 = '8'.repeat(64); },
    (value) => { value.experimentBinding.projectGeneration = 10; },
    (value) => { value.experimentBinding.graphIdentity = `sha256:${'8'.repeat(64)}`; },
    (value) => { value.experimentBinding.sourceSha256 = '8'.repeat(64); },
    (value) => { value.experimentBinding.artifactIdentity = '8'.repeat(64); },
    (value) => { value.cases[0].input.inputIdentity = '8'.repeat(64); },
    (value) => { value.cases[1].runtimeIdentity.workerInstanceNonce = value.cases[0].runtimeIdentity.workerInstanceNonce; },
    (value) => { value.cases.reverse(); },
  ];
  for (const mutate of mutations) {
    const value = await mutateReport(mutate);
    const projection = await projectX49Report(value);
    assert.equal(projection.academicStatus, 'indeterminate');
    await assert.rejects(() => validateX49AcceptedNativeReport(value), { code: 'X49_NATIVE_ACCEPTANCE_FAILED' });
  }
});

test('semantic hash detects mutation before any academic projection', async () => {
  const value = await report();
  value.cases[0].adc.value = 410;
  await assert.rejects(() => projectX49Report(value), { code: 'X49_REPORT_HASH_INVALID' });
});

test('UI owner labels replay synthetic, never upgrades academic status, and clears without persistence', async () => {
  const owner = createX49ProjectionOwner();
  assert.equal(owner.preview().classification, 'calculated-only');
  const replay = await owner.acceptSyntheticReplay(await report());
  assert.equal(replay.state, 'synthetic-replay');
  assert.equal(replay.classification, 'synthetic-browser-replay-not-native-evidence');
  assert.equal(replay.academicStatus, 'unavailable');
  const cleared = owner.invalidate('X49_SOURCE_EDITED');
  assert.deepEqual(cleared.cases, []);
  assert.equal(cleared.reason, 'X49_SOURCE_EDITED');
});

test('shared UI remains outside locked model closure and has zero producer or persistence authority', async () => {
  const [shell, owner, modelClosure] = await Promise.all([
    readFile(new URL('../src/shared-workbench-shell.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/x49-sensor-offset.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/generate-model-library-snapshots.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(shell, /Authored, calculated and observed evidence remain separate/u);
  assert.match(shell, /ordinary thermostat snapshots and UART text are not authoritative/u);
  assert.match(shell, /Synthetic replay · not native/u);
  assert.doesNotMatch(`${owner}\n${shell}`, /localStorage|sessionStorage|indexedDB|serviceWorker/u);
  assert.doesNotMatch(`${owner}\n${shell}`, /fetch\(|postMessage\(|\/api\/build|\/api\/run|scenario/u);
  assert.doesNotMatch(modelClosure, /x49-sensor-offset|shared-workbench-shell/u);
});
