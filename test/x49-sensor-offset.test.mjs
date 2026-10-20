// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createX49ProjectionOwner,
  projectX49ExpectedCases,
  projectX49Report,
  validateX49AcceptedNativeReport,
  validateX49AuthoredCase,
  x49CalculatedCaseIsExact,
  X49_CASES,
  X49_CONTRACT_ID,
  X49_FIRMWARE_PRODUCER_SCHEMA,
  X49_FIXTURE_CLASS,
  X49_REPORT_SCHEMA,
} from '../src/x49-sensor-offset.mjs';

const sourceSha256 = '1'.repeat(64);
const artifactIdentity = '2'.repeat(64);
const modelImplementationSha256 = '3'.repeat(64);
const modelExecutionContextSha256 = '4'.repeat(64);

function observation(entry, index) {
  const runtimeBinding = {
    schema: 'intent-mcu-runtime-binding@2', projectGeneration: 9,
    runtimeGeneration: 40 + index, artifactIdentity,
    modelImplementationSha256, modelExecutionContextSha256,
  };
  return {
    caseId: entry.caseId,
    input: { authored: structuredClone(entry.authored), targetCycle: 0, appliedCycle: 0,
      retainedThroughCycle: 3_000_000 },
    modelOutput: { componentId: 'temperature-sensor-1', boardPin: 'A1',
      voltage: entry.calculated.modelVoltage },
    runtimeBinding,
    runtimeIdentity: {
      schema: 'intent-mcu-worker-runtime-identity@2', projectGeneration: 9,
      runtimeGeneration: 40 + index, artifactIdentity,
      modelImplementationSha256, modelExecutionContextSha256,
      workerInitialization: index + 1, workerInstanceNonce: String(index + 5).repeat(32),
    },
    adc: { channel: 1, value: entry.calculated.adcCount,
      startCycle: 2_600_000, completionCycle: 2_700_000 },
    firmwareTransaction: {
      schema: X49_FIRMWARE_PRODUCER_SCHEMA, fixtureClass: X49_FIXTURE_CLASS,
      sourceSha256, artifactIdentity, commit: 2,
      temperatureC: entry.calculated.firmwareIntegerC,
      d13Level: entry.calculated.d13Level ? 1 : 0,
      adcChannel: 1, adcValue: entry.calculated.adcCount, adcCompletionCycle: 2_700_000,
      beginCycle: 2_800_000, commitCycle: 2_900_000,
    },
    pin: { pin: 'D13', mode: 'OUTPUT', level: entry.calculated.d13Level,
      observedCycle: 2_900_000 },
    time: { cpuCycles: 3_000_000, virtualMilliseconds: 187.5 },
    retention: { droppedTraceRows: 0, droppedAdcCompletions: 0,
      droppedMailboxTransactions: 0 },
  };
}

function report() {
  return {
    schema: X49_REPORT_SCHEMA, contractId: X49_CONTRACT_ID,
    fixtureClass: X49_FIXTURE_CLASS, sourceSha256, artifactIdentity,
    cases: X49_CASES.map(observation),
  };
}

test('fixed authored cases compose the current ideal model into exact expected firmware values', () => {
  assert.deepEqual(projectX49ExpectedCases(), [
    { caseId: 'baseline-offset-0',
      authored: { referenceTemperatureC: 30, offsetC: 0, effectiveTemperatureC: 30 },
      calculated: { modelVoltage: 2, adcCount: 409, firmwareIntegerC: 29, d13Level: true } },
    { caseId: 'offset-plus-1',
      authored: { referenceTemperatureC: 30, offsetC: 1, effectiveTemperatureC: 31 },
      calculated: { modelVoltage: 2.025, adcCount: 414, firmwareIntegerC: 30, d13Level: false } },
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

test('native acceptance requires two fresh joined case-specific mailbox observations', () => {
  const projection = validateX49AcceptedNativeReport(report());
  assert.equal(projection.academicStatus, 'passed');
  assert.equal(projection.physicalStatus, 'absent');
  assert.deepEqual(projection.cases.map((entry) => entry.outcome.academicStatus), ['passed', 'passed']);
  assert.equal(projection.cases[0].native.firmwareTransaction.temperatureC, 29);
  assert.equal(projection.cases[1].native.firmwareTransaction.temperatureC, 30);
});

test('every single-field producer, model, worker, input, time and output mutation fails acceptance', () => {
  const mutations = [
    (value) => { value.cases[0].input.targetCycle = 1; },
    (value) => { value.cases[0].input.retainedThroughCycle = 2_699_999; },
    (value) => { value.cases[0].modelOutput.voltage = 2.001; },
    (value) => { value.cases[0].adc.value = 410; },
    (value) => { value.cases[0].firmwareTransaction.sourceSha256 = '9'.repeat(64); },
    (value) => { value.cases[0].firmwareTransaction.temperatureC = 30; },
    (value) => { value.cases[0].firmwareTransaction.adcCompletionCycle = 2_700_001; },
    (value) => { value.cases[0].pin.level = false; },
    (value) => { value.cases[0].retention.droppedAdcCompletions = 1; },
    (value) => { value.cases[0].time.cpuCycles = 2_559_999; },
    (value) => { value.cases[0].runtimeBinding.modelImplementationSha256 = '8'.repeat(64); },
    (value) => { value.cases[1].runtimeIdentity.workerInstanceNonce = value.cases[0].runtimeIdentity.workerInstanceNonce; },
  ];
  for (const mutate of mutations) {
    const value = report(); mutate(value);
    assert.throws(() => validateX49AcceptedNativeReport(value));
  }
});

test('strict shapes reject extra fields and case ordering; projection can expose failed evidence without passing it', () => {
  const extra = report(); extra.savedOffsetC = 1;
  assert.throws(() => projectX49Report(extra), { code: 'X49_REPORT_INVALID' });
  const reordered = report(); reordered.cases.reverse();
  assert.throws(() => projectX49Report(reordered), { code: 'X49_CASE_JOIN_INVALID' });
  const failed = report(); failed.cases[0].adc.value = 410;
  assert.equal(projectX49Report(failed).academicStatus, 'failed');
});

test('UI owner labels replay synthetic, never upgrades academic status, and clears without persistence', () => {
  const owner = createX49ProjectionOwner();
  assert.equal(owner.preview().classification, 'calculated-only');
  const replay = owner.acceptSyntheticReplay(report());
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
  for (const code of ['X49_SOURCE_EDITED', 'X49_BUILD_STARTED', 'X49_RUN_STARTED', 'X49_RESET',
    'X49_RUNTIME_RETIRED', 'X49_NEW_PROJECT', 'X49_EXAMPLE_OPENED', 'X49_OPEN_STARTED',
    'X49_PROJECT_OPENED', 'X49_PROFILE_CHANGED']) assert.match(shell, new RegExp(code, 'u'));
  assert.match(shell, /Authored, calculated and observed evidence remain separate/u);
  assert.match(shell, /ordinary thermostat snapshots and UART text are not authoritative/u);
  assert.match(shell, /Synthetic replay · not native/u);
  assert.doesNotMatch(`${owner}\n${shell}`, /localStorage|sessionStorage|indexedDB|serviceWorker/u);
  assert.doesNotMatch(`${owner}\n${shell}`, /fetch\(|postMessage\(|\/api\/build|\/api\/run|scenario/u);
  assert.doesNotMatch(modelClosure, /x49-sensor-offset|shared-workbench-shell/u);
});
