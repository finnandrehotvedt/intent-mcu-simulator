// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import { validateWorkerRuntimeIdentity } from './runtime-identity.mjs';

export const X49_REPORT_SCHEMA = 'intent-mcu-x49-sensor-offset-report@1';
export const X49_CONTRACT_ID = 'x49-avr-temperature-offset-v1';
export const X49_FIXTURE_CLASS = 'instrumented-avr-mailbox-fixture-required';
export const X49_FIRMWARE_PRODUCER_SCHEMA = 'intent-mcu-x34-firmware-producer@1';
export const X49_COMPOSED_MODEL = 'model.temperature-analogue-ideal-v1';
export const X49_OFFSET_LIMITS = Object.freeze({ minimum: -2, maximum: 2, step: 1 });
export const X49_VIRTUAL_WINDOW = Object.freeze({
  minimumMilliseconds: 160, maximumMilliseconds: 350,
  minimumCycles: 2_560_000, maximumCycles: 5_600_000, cpuHertz: 16_000_000,
});

const HASH = /^[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function calculateCase(caseId, referenceTemperatureC, offsetC) {
  const effectiveTemperatureC = referenceTemperatureC + offsetC;
  // Exact composition of model.temperature-analogue-ideal-v1. Keeping the
  // projection outside the locked model closure prevents an X49 UI feature
  // from changing runtime membership or saved-project semantics.
  const modelVoltage = (effectiveTemperatureC + 50) / 40;
  const adcCount = Math.round((modelVoltage / 5) * 1023);
  const firmwareIntegerC = Math.trunc((adcCount * 200) / 1024) - 50;
  return {
    caseId,
    authored: { referenceTemperatureC, offsetC, effectiveTemperatureC },
    calculated: {
      modelVoltage, adcCount, firmwareIntegerC,
      d13Level: firmwareIntegerC < 30,
    },
  };
}

export const X49_CASES = deepFreeze([
  calculateCase('baseline-offset-0', 30, 0),
  calculateCase('offset-plus-1', 30, 1),
]);

export function projectX49ExpectedCases() { return clone(X49_CASES); }

export function validateX49AuthoredCase(value) {
  if (!exactKeys(value, ['referenceTemperatureC', 'offsetC', 'effectiveTemperatureC'])
      || !Number.isInteger(value.referenceTemperatureC)
      || !Number.isInteger(value.offsetC)
      || value.offsetC < X49_OFFSET_LIMITS.minimum || value.offsetC > X49_OFFSET_LIMITS.maximum
      || value.effectiveTemperatureC !== value.referenceTemperatureC + value.offsetC) {
    reject('X49_AUTHORED_INPUT_INVALID');
  }
  return clone(value);
}

function exactCalculated(actual, expected) {
  return exactKeys(actual, ['modelVoltage', 'adcCount', 'firmwareIntegerC', 'd13Level'])
    && actual.modelVoltage === expected.modelVoltage
    && actual.adcCount === expected.adcCount
    && actual.firmwareIntegerC === expected.firmwareIntegerC
    && actual.d13Level === expected.d13Level;
}

function evaluateNativeCase(observation, expected, report) {
  const { input, modelOutput, adc, firmwareTransaction: tx, pin, time, retention } = observation;
  const checks = {
    exactCase: observation.caseId === expected.caseId
      && input.authored.referenceTemperatureC === expected.authored.referenceTemperatureC
      && input.authored.offsetC === expected.authored.offsetC
      && input.authored.effectiveTemperatureC === expected.authored.effectiveTemperatureC,
    cycleZeroInput: input.targetCycle === 0 && input.appliedCycle === 0
      && input.retainedThroughCycle >= adc.completionCycle,
    modelOutput: modelOutput.componentId === 'temperature-sensor-1'
      && modelOutput.boardPin === 'A1' && modelOutput.voltage === expected.calculated.modelVoltage,
    adcCompletion: adc.channel === 1 && adc.value === expected.calculated.adcCount
      && Number.isSafeInteger(adc.startCycle) && Number.isSafeInteger(adc.completionCycle)
      && adc.startCycle >= 0 && adc.completionCycle >= adc.startCycle,
    sourceArtifact: tx.schema === X49_FIRMWARE_PRODUCER_SCHEMA
      && tx.fixtureClass === X49_FIXTURE_CLASS
      && tx.sourceSha256 === report.sourceSha256
      && tx.artifactIdentity === report.artifactIdentity,
    committedFirmwareInteger: Number.isSafeInteger(tx.commit) && tx.commit > 0 && tx.commit % 2 === 0
      && tx.temperatureC === expected.calculated.firmwareIntegerC,
    joinedOrder: tx.adcChannel === adc.channel && tx.adcValue === adc.value
      && tx.adcCompletionCycle === adc.completionCycle
      && adc.completionCycle <= tx.beginCycle && tx.beginCycle <= tx.commitCycle,
    firmwareD13: tx.d13Level === (expected.calculated.d13Level ? 1 : 0),
    actualPin: pin.pin === 'D13' && pin.mode === 'OUTPUT'
      && pin.level === expected.calculated.d13Level && pin.observedCycle >= tx.commitCycle,
    noDrops: retention.droppedTraceRows === 0 && retention.droppedAdcCompletions === 0
      && retention.droppedMailboxTransactions === 0,
    virtualWindow: time.cpuCycles >= X49_VIRTUAL_WINDOW.minimumCycles
      && time.cpuCycles <= X49_VIRTUAL_WINDOW.maximumCycles
      && time.virtualMilliseconds === (time.cpuCycles / X49_VIRTUAL_WINDOW.cpuHertz) * 1000,
  };
  return { checks, academicStatus: Object.values(checks).every(Boolean) ? 'passed' : 'failed' };
}

function validateObservationShape(value) {
  if (!exactKeys(value, ['caseId', 'input', 'modelOutput', 'runtimeBinding', 'runtimeIdentity',
    'adc', 'firmwareTransaction', 'pin', 'time', 'retention'])
      || !exactKeys(value.input, ['authored', 'targetCycle', 'appliedCycle', 'retainedThroughCycle'])
      || !exactKeys(value.modelOutput, ['componentId', 'boardPin', 'voltage'])
      || !exactKeys(value.adc, ['channel', 'value', 'startCycle', 'completionCycle'])
      || !exactKeys(value.firmwareTransaction, ['schema', 'fixtureClass', 'sourceSha256',
        'artifactIdentity', 'commit', 'temperatureC', 'd13Level', 'adcChannel', 'adcValue',
        'adcCompletionCycle', 'beginCycle', 'commitCycle'])
      || !exactKeys(value.pin, ['pin', 'mode', 'level', 'observedCycle'])
      || !exactKeys(value.time, ['cpuCycles', 'virtualMilliseconds'])
      || !exactKeys(value.retention, ['droppedTraceRows', 'droppedAdcCompletions',
        'droppedMailboxTransactions'])
      || !Object.values(value.retention).every((count) => Number.isSafeInteger(count) && count >= 0)) {
    reject('X49_CASE_SHAPE_INVALID');
  }
  validateX49AuthoredCase(value.input.authored);
  validateWorkerRuntimeIdentity(value.runtimeIdentity, value.runtimeBinding);
}

export function projectX49Report(value) {
  if (!exactKeys(value, ['schema', 'contractId', 'fixtureClass', 'sourceSha256',
    'artifactIdentity', 'cases'])
      || value.schema !== X49_REPORT_SCHEMA || value.contractId !== X49_CONTRACT_ID
      || value.fixtureClass !== X49_FIXTURE_CLASS
      || !HASH.test(value.sourceSha256 ?? '') || !HASH.test(value.artifactIdentity ?? '')
      || !Array.isArray(value.cases) || value.cases.length !== X49_CASES.length) {
    reject('X49_REPORT_INVALID');
  }
  const runtimeGenerations = new Set();
  const workerNonces = new Set();
  const cases = value.cases.map((observation, index) => {
    validateObservationShape(observation);
    const expected = X49_CASES[index];
    if (observation.caseId !== expected.caseId
        || observation.runtimeBinding.artifactIdentity !== value.artifactIdentity
        || observation.runtimeIdentity.artifactIdentity !== value.artifactIdentity) {
      reject('X49_CASE_JOIN_INVALID');
    }
    runtimeGenerations.add(observation.runtimeIdentity.runtimeGeneration);
    workerNonces.add(observation.runtimeIdentity.workerInstanceNonce);
    return { ...clone(expected), native: clone(observation), outcome: evaluateNativeCase(observation, expected, value) };
  });
  if (runtimeGenerations.size !== X49_CASES.length || workerNonces.size !== X49_CASES.length) {
    reject('X49_FRESH_WORKERS_REQUIRED');
  }
  return {
    schema: 'intent-mcu-x49-sensor-offset-projection@1',
    contractId: X49_CONTRACT_ID,
    fixtureClass: X49_FIXTURE_CLASS,
    cases,
    academicStatus: cases.every((entry) => entry.outcome.academicStatus === 'passed') ? 'passed' : 'failed',
    physicalStatus: 'absent',
  };
}

export function validateX49AcceptedNativeReport(value) {
  const projection = projectX49Report(value);
  if (projection.academicStatus !== 'passed') reject('X49_NATIVE_ACCEPTANCE_FAILED');
  return projection;
}

export function createX49ProjectionOwner() {
  let state = { state: 'ready', reason: null, classification: 'calculated-only',
    cases: projectX49ExpectedCases(), academicStatus: 'unavailable', physicalStatus: 'absent' };
  const snapshot = () => clone(state);
  return Object.freeze({
    preview() {
      state = { state: 'preview', reason: null, classification: 'calculated-only',
        cases: projectX49ExpectedCases(), academicStatus: 'unavailable', physicalStatus: 'absent' };
      return snapshot();
    },
    acceptSyntheticReplay(report) {
      const projection = projectX49Report(report);
      state = { state: 'synthetic-replay', reason: null,
        classification: 'synthetic-browser-replay-not-native-evidence', cases: projection.cases,
        academicStatus: 'unavailable', physicalStatus: 'absent' };
      return snapshot();
    },
    invalidate(reason = 'X49_CLEARED') {
      state = { state: 'invalidated', reason, classification: 'calculated-only', cases: [],
        academicStatus: 'unavailable', physicalStatus: 'absent' };
      return snapshot();
    },
    snapshot,
  });
}

export function x49CalculatedCaseIsExact(value, caseId) {
  const expected = X49_CASES.find((entry) => entry.caseId === caseId);
  return Boolean(expected && exactKeys(value, ['caseId', 'authored', 'calculated'])
    && value.caseId === caseId
    && JSON.stringify(validateX49AuthoredCase(value.authored)) === JSON.stringify(expected.authored)
    && exactCalculated(value.calculated, expected.calculated));
}
