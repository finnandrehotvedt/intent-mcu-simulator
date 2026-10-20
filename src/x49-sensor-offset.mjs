// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import {
  MODEL_RUNTIME_BINDING_SCHEMA,
  MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA,
  runtimeInitBinding,
  validateWorkerRuntimeIdentity,
} from './runtime-identity.mjs';

export const X49_REPORT_SCHEMA = 'intent-mcu-x49-sensor-offset-report@2';
export const X49_CONTRACT_ID = 'x49-avr-temperature-offset-v2';
export const X49_EXPERIMENT_BINDING_SCHEMA = 'intent-mcu-x49-experiment-binding@1';
export const X49_CASE_SCHEMA = 'intent-mcu-x49-native-case@1';
export const X49_INPUT_SCHEMA = 'intent-mcu-x49-cycle-zero-input@1';
export const X49_MODEL_OUTPUT_SCHEMA = 'intent-mcu-x49-model-output@1';
export const X49_ADC_SCHEMA = 'intent-mcu-x49-adc-observation@1';
export const X49_PIN_SCHEMA = 'intent-mcu-x49-pin-observation@1';
export const X49_TIME_SCHEMA = 'intent-mcu-x49-virtual-time@1';
export const X49_RETENTION_SCHEMA = 'intent-mcu-x49-retention@1';
export const X49_EVIDENCE_STATE_SCHEMA = 'intent-mcu-x49-case-evidence-state@1';
export const X49_PROJECTION_SCHEMA = 'intent-mcu-x49-sensor-offset-projection@2';
export const X49_FIXTURE_CLASS = 'instrumented-avr-mailbox-fixture-required';
export const X49_FIRMWARE_PRODUCER_SCHEMA = 'intent-mcu-x34-firmware-producer@1';
export const X49_COMPOSED_MODEL = 'model.temperature-analogue-ideal-v1';
export const X49_PROFILE = 'board.atmega328p-16mhz-v1';
export const X49_OFFSET_LIMITS = Object.freeze({ minimum: -2, maximum: 2, step: 1 });
export const X49_VIRTUAL_WINDOW = Object.freeze({
  minimumMilliseconds: 160, maximumMilliseconds: 350,
  minimumCycles: 2_560_000, maximumCycles: 5_600_000, cpuHertz: 16_000_000,
});
export const X49_INDETERMINATE_REASONS = Object.freeze([
  'missing-evidence', 'dropped-evidence', 'truncated-evidence', 'stale-evidence',
  'infrastructure-failure', 'cancelled', 'window-expired',
]);

const HASH = /^[a-f0-9]{64}$/u;
const GRAPH_IDENTITY = /^sha256:[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const safeInteger = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => (
  Number.isSafeInteger(value) && value >= minimum && value <= maximum
);
const finiteNumber = (value, minimum = -Number.MAX_VALUE, maximum = Number.MAX_VALUE) => (
  Number.isFinite(value) && value >= minimum && value <= maximum
);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function calculateCase(caseId, inputIdentity, referenceTemperatureC, offsetC) {
  const effectiveTemperatureC = referenceTemperatureC + offsetC;
  // Exact composition of model.temperature-analogue-ideal-v1. Keeping this
  // evidence projection outside the locked model closure avoids changing the
  // runtime model or saved-project semantics.
  const modelVoltage = (effectiveTemperatureC + 50) / 40;
  const adcCount = Math.round((modelVoltage / 5) * 1023);
  const firmwareIntegerC = Math.trunc((adcCount * 200) / 1024) - 50;
  return {
    caseId, inputIdentity,
    authored: { referenceTemperatureC, offsetC, effectiveTemperatureC },
    calculated: {
      modelVoltage, adcCount, firmwareIntegerC,
      d13Level: firmwareIntegerC < 30,
    },
  };
}

export const X49_CASES = deepFreeze([
  calculateCase('baseline-offset-0', '4300d360967677c0cd653cb7bf4cd93ab6d8e8235cb76a38d86ae5b43f25679b', 30, 0),
  calculateCase('offset-plus-1', 'ac42be30971461c12d66abda86f45ed28263006e0d85ca3dad6a6c0ed08dff2a', 30, 1),
]);

export function projectX49ExpectedCases() { return clone(X49_CASES); }

export function stableX49Stringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableX49Stringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableX49Stringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function x49Sha256(value, cryptoImpl = globalThis.crypto) {
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export function semanticX49Projection(value) {
  const { semanticSha256: _semanticSha256, ...semantic } = value;
  return clone(semantic);
}

export async function sealX49Report(value, cryptoImpl = globalThis.crypto) {
  const sealed = clone(value);
  sealed.semanticSha256 = await x49Sha256(
    stableX49Stringify(semanticX49Projection(sealed)), cryptoImpl,
  );
  return sealed;
}

export function validateX49AuthoredCase(value) {
  if (!exactKeys(value, ['referenceTemperatureC', 'offsetC', 'effectiveTemperatureC'])
      || !Number.isSafeInteger(value.referenceTemperatureC)
      || !Number.isSafeInteger(value.offsetC)
      || !Number.isSafeInteger(value.effectiveTemperatureC)
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

function validateExperimentBinding(value) {
  if (!exactKeys(value, ['schema', 'profile', 'projectGeneration', 'graphIdentity',
    'sourceSha256', 'artifactIdentity', 'modelImplementationSha256',
    'modelExecutionContextSha256', 'fixtureClass', 'componentId', 'boardPin'])
      || value.schema !== X49_EXPERIMENT_BINDING_SCHEMA || value.profile !== X49_PROFILE
      || !safeInteger(value.projectGeneration, 1) || !GRAPH_IDENTITY.test(value.graphIdentity ?? '')
      || !HASH.test(value.sourceSha256 ?? '') || !HASH.test(value.artifactIdentity ?? '')
      || !HASH.test(value.modelImplementationSha256 ?? '')
      || !HASH.test(value.modelExecutionContextSha256 ?? '')
      || value.fixtureClass !== X49_FIXTURE_CLASS
      || value.componentId !== 'temperature-sensor-1' || value.boardPin !== 'A1') {
    reject('X49_EXPERIMENT_BINDING_INVALID');
  }
  return clone(value);
}

function validateRuntimeBindingShape(value) {
  if (value === null) return null;
  if (value?.schema !== MODEL_RUNTIME_BINDING_SCHEMA) reject('X49_RUNTIME_BINDING_INVALID');
  try { return runtimeInitBinding(value); } catch { return reject('X49_RUNTIME_BINDING_INVALID'); }
}

function validateRuntimeIdentityShape(value) {
  if (value === null) return null;
  if (!exactKeys(value, ['schema', 'projectGeneration', 'runtimeGeneration', 'artifactIdentity',
    'modelImplementationSha256', 'modelExecutionContextSha256', 'workerInitialization',
    'workerInstanceNonce']) || value.schema !== MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA) {
    reject('X49_RUNTIME_IDENTITY_INVALID');
  }
  const selfBinding = {
    schema: MODEL_RUNTIME_BINDING_SCHEMA,
    projectGeneration: value.projectGeneration,
    runtimeGeneration: value.runtimeGeneration,
    artifactIdentity: value.artifactIdentity,
    modelImplementationSha256: value.modelImplementationSha256,
    modelExecutionContextSha256: value.modelExecutionContextSha256,
  };
  try { validateWorkerRuntimeIdentity(value, selfBinding); }
  catch { reject('X49_RUNTIME_IDENTITY_INVALID'); }
  return clone(value);
}

function validateInput(value) {
  if (value === null) return null;
  if (!exactKeys(value, ['schema', 'inputIdentity', 'graphIdentity', 'authored', 'targetCycle',
    'appliedCycle', 'retainedThroughCycle']) || value.schema !== X49_INPUT_SCHEMA
      || !HASH.test(value.inputIdentity ?? '') || !GRAPH_IDENTITY.test(value.graphIdentity ?? '')
      || !safeInteger(value.targetCycle) || !safeInteger(value.appliedCycle)
      || !safeInteger(value.retainedThroughCycle)) reject('X49_INPUT_INVALID');
  validateX49AuthoredCase(value.authored);
  return clone(value);
}

function validateModelOutput(value) {
  if (value === null) return null;
  if (!exactKeys(value, ['schema', 'componentId', 'boardPin', 'voltage'])
      || value.schema !== X49_MODEL_OUTPUT_SCHEMA || typeof value.componentId !== 'string'
      || typeof value.boardPin !== 'string' || !finiteNumber(value.voltage, 0, 5)) {
    reject('X49_MODEL_OUTPUT_INVALID');
  }
  return clone(value);
}

function validateAdc(value) {
  if (value === null) return null;
  if (!exactKeys(value, ['schema', 'channel', 'value', 'startCycle', 'completionCycle'])
      || value.schema !== X49_ADC_SCHEMA || !safeInteger(value.channel, 0, 15)
      || !safeInteger(value.value, 0, 1023) || !safeInteger(value.startCycle)
      || !safeInteger(value.completionCycle)) reject('X49_ADC_INVALID');
  return clone(value);
}

function validateFirmwareTransaction(value) {
  if (value === null) return null;
  if (!exactKeys(value, ['schema', 'fixtureClass', 'sourceSha256', 'artifactIdentity',
    'commit', 'temperatureC', 'd13Level', 'adcChannel', 'adcValue', 'adcCompletionCycle',
    'beginCycle', 'commitCycle']) || value.schema !== X49_FIRMWARE_PRODUCER_SCHEMA
      || value.fixtureClass !== X49_FIXTURE_CLASS || !HASH.test(value.sourceSha256 ?? '')
      || !HASH.test(value.artifactIdentity ?? '') || !safeInteger(value.commit, 1, 255)
      || !safeInteger(value.temperatureC, -50, 150) || ![0, 1].includes(value.d13Level)
      || !safeInteger(value.adcChannel, 0, 15) || !safeInteger(value.adcValue, 0, 1023)
      || !safeInteger(value.adcCompletionCycle) || !safeInteger(value.beginCycle)
      || !safeInteger(value.commitCycle)) reject('X49_FIRMWARE_TRANSACTION_INVALID');
  return clone(value);
}

function validatePin(value) {
  if (value === null) return null;
  if (!exactKeys(value, ['schema', 'pin', 'mode', 'level', 'observedCycle'])
      || value.schema !== X49_PIN_SCHEMA || typeof value.pin !== 'string'
      || typeof value.mode !== 'string' || typeof value.level !== 'boolean'
      || !safeInteger(value.observedCycle)) reject('X49_PIN_INVALID');
  return clone(value);
}

function validateTime(value) {
  if (value === null) return null;
  if (!exactKeys(value, ['schema', 'cpuCycles', 'virtualMilliseconds'])
      || value.schema !== X49_TIME_SCHEMA || !safeInteger(value.cpuCycles)
      || !finiteNumber(value.virtualMilliseconds, 0)) reject('X49_TIME_INVALID');
  return clone(value);
}

function validateRetention(value) {
  if (value === null) return null;
  if (!exactKeys(value, ['schema', 'completeThroughCycle', 'droppedTraceRows',
    'droppedAdcCompletions', 'droppedMailboxTransactions'])
      || value.schema !== X49_RETENTION_SCHEMA || !safeInteger(value.completeThroughCycle)
      || !safeInteger(value.droppedTraceRows) || !safeInteger(value.droppedAdcCompletions)
      || !safeInteger(value.droppedMailboxTransactions)) reject('X49_RETENTION_INVALID');
  return clone(value);
}

function validateEvidenceState(value) {
  if (!exactKeys(value, ['schema', 'state', 'reason'])
      || value.schema !== X49_EVIDENCE_STATE_SCHEMA
      || !['complete', 'incomplete'].includes(value.state)
      || (value.state === 'complete' && value.reason !== null)
      || (value.state === 'incomplete' && !X49_INDETERMINATE_REASONS.includes(value.reason))) {
    reject('X49_EVIDENCE_STATE_INVALID');
  }
  return clone(value);
}

function validateObservationShape(value) {
  if (!exactKeys(value, ['schema', 'caseId', 'profile', 'input', 'modelOutput',
    'runtimeBinding', 'runtimeIdentity', 'adc', 'firmwareTransaction', 'pin', 'time',
    'retention', 'evidence']) || value.schema !== X49_CASE_SCHEMA
      || !X49_CASES.some((entry) => entry.caseId === value.caseId)
      || value.profile !== X49_PROFILE) reject('X49_CASE_SHAPE_INVALID');
  validateInput(value.input);
  validateModelOutput(value.modelOutput);
  validateRuntimeBindingShape(value.runtimeBinding);
  validateRuntimeIdentityShape(value.runtimeIdentity);
  validateAdc(value.adc);
  validateFirmwareTransaction(value.firmwareTransaction);
  validatePin(value.pin);
  validateTime(value.time);
  validateRetention(value.retention);
  validateEvidenceState(value.evidence);
  return clone(value);
}

function runtimeBindingMatches(identity, binding, experiment) {
  return identity && binding
    && identity.projectGeneration === binding.projectGeneration
    && identity.runtimeGeneration === binding.runtimeGeneration
    && identity.artifactIdentity === binding.artifactIdentity
    && identity.modelImplementationSha256 === binding.modelImplementationSha256
    && identity.modelExecutionContextSha256 === binding.modelExecutionContextSha256
    && binding.projectGeneration === experiment.projectGeneration
    && binding.artifactIdentity === experiment.artifactIdentity
    && binding.modelImplementationSha256 === experiment.modelImplementationSha256
    && binding.modelExecutionContextSha256 === experiment.modelExecutionContextSha256;
}

function indeterminate(reason) {
  return { checks: null, academicStatus: 'indeterminate', reason };
}

function evaluateNativeCase(observation, expected, experiment, freshWorkers) {
  if (observation.evidence.state === 'incomplete') return indeterminate(observation.evidence.reason);
  const required = ['input', 'modelOutput', 'runtimeBinding', 'runtimeIdentity', 'adc',
    'firmwareTransaction', 'pin', 'time', 'retention'];
  if (required.some((key) => observation[key] === null)) return indeterminate('missing-evidence');
  const { input, modelOutput, runtimeBinding, runtimeIdentity, adc,
    firmwareTransaction: tx, pin, time, retention } = observation;
  const canonicalInput = observation.caseId === expected.caseId
    && input.inputIdentity === expected.inputIdentity
    && input.graphIdentity === experiment.graphIdentity
    && input.authored.referenceTemperatureC === expected.authored.referenceTemperatureC
    && input.authored.offsetC === expected.authored.offsetC
    && input.authored.effectiveTemperatureC === expected.authored.effectiveTemperatureC
    && input.targetCycle === 0 && input.appliedCycle === 0;
  const commonBinding = observation.profile === experiment.profile
    && runtimeBindingMatches(runtimeIdentity, runtimeBinding, experiment)
    && modelOutput.componentId === experiment.componentId
    && modelOutput.boardPin === experiment.boardPin
    && tx.fixtureClass === experiment.fixtureClass
    && tx.sourceSha256 === experiment.sourceSha256
    && tx.artifactIdentity === experiment.artifactIdentity
    && adc.channel === 1 && tx.adcChannel === adc.channel
    && tx.adcValue === adc.value && tx.adcCompletionCycle === adc.completionCycle
    && pin.pin === 'D13' && pin.mode === 'OUTPUT';
  if (!canonicalInput || !commonBinding || !freshWorkers) return indeterminate('stale-evidence');
  if (retention.droppedTraceRows !== 0 || retention.droppedAdcCompletions !== 0
      || retention.droppedMailboxTransactions !== 0) return indeterminate('dropped-evidence');
  if (time.cpuCycles < X49_VIRTUAL_WINDOW.minimumCycles
      || time.cpuCycles > X49_VIRTUAL_WINDOW.maximumCycles) return indeterminate('window-expired');
  const ordered = input.appliedCycle <= adc.startCycle
    && adc.startCycle <= adc.completionCycle
    && adc.completionCycle <= tx.beginCycle
    && tx.beginCycle <= tx.commitCycle
    && tx.commitCycle <= pin.observedCycle
    && pin.observedCycle <= time.cpuCycles
    && input.retainedThroughCycle >= time.cpuCycles
    && retention.completeThroughCycle >= time.cpuCycles
    && time.virtualMilliseconds === (time.cpuCycles / X49_VIRTUAL_WINDOW.cpuHertz) * 1000
    && tx.commit % 2 === 0;
  if (!ordered) return indeterminate('truncated-evidence');
  const checks = {
    exactModelVoltage: modelOutput.voltage === expected.calculated.modelVoltage,
    exactAdcValue: adc.value === expected.calculated.adcCount,
    committedFirmwareInteger: tx.temperatureC === expected.calculated.firmwareIntegerC,
    firmwareD13: tx.d13Level === (expected.calculated.d13Level ? 1 : 0),
    actualPin: pin.level === expected.calculated.d13Level,
  };
  return {
    checks,
    academicStatus: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
    reason: null,
  };
}

export async function projectX49Report(value, cryptoImpl = globalThis.crypto) {
  if (!exactKeys(value, ['schema', 'contractId', 'experimentBinding', 'cases', 'semanticSha256'])
      || value.schema !== X49_REPORT_SCHEMA || value.contractId !== X49_CONTRACT_ID
      || !HASH.test(value.semanticSha256 ?? '') || !Array.isArray(value.cases)
      || value.cases.length !== X49_CASES.length) reject('X49_REPORT_INVALID');
  const expectedHash = await x49Sha256(
    stableX49Stringify(semanticX49Projection(value)), cryptoImpl,
  );
  if (value.semanticSha256 !== expectedHash) reject('X49_REPORT_HASH_INVALID');
  const experiment = validateExperimentBinding(value.experimentBinding);
  const observations = value.cases.map(validateObservationShape);
  const generations = observations.map((entry) => entry.runtimeIdentity?.runtimeGeneration ?? null);
  const nonces = observations.map((entry) => entry.runtimeIdentity?.workerInstanceNonce ?? null);
  const freshWorkers = generations.every((value) => value !== null)
    && nonces.every((value) => value !== null)
    && new Set(generations).size === X49_CASES.length
    && new Set(nonces).size === X49_CASES.length;
  const cases = observations.map((observation, index) => ({
    ...clone(X49_CASES[index]), native: clone(observation),
    outcome: evaluateNativeCase(observation, X49_CASES[index], experiment, freshWorkers),
  }));
  const outcomes = cases.map((entry) => entry.outcome.academicStatus);
  const academicStatus = outcomes.includes('indeterminate') ? 'indeterminate'
    : outcomes.includes('failed') ? 'failed' : 'passed';
  return {
    schema: X49_PROJECTION_SCHEMA,
    contractId: X49_CONTRACT_ID,
    experimentBinding: experiment,
    cases,
    academicStatus,
    physicalStatus: 'absent',
  };
}

export async function validateX49AcceptedNativeReport(value) {
  const projection = await projectX49Report(value);
  if (projection.academicStatus !== 'passed') reject('X49_NATIVE_ACCEPTANCE_FAILED');
  return projection;
}

export function createX49ProjectionOwner({ cryptoImpl = globalThis.crypto } = {}) {
  let state = { state: 'ready', reason: null, classification: 'calculated-only',
    cases: projectX49ExpectedCases(), academicStatus: 'unavailable', physicalStatus: 'absent' };
  let generation = 0;
  const snapshot = () => clone(state);
  return Object.freeze({
    preview() {
      generation += 1;
      state = { state: 'preview', reason: null, classification: 'calculated-only',
        cases: projectX49ExpectedCases(), academicStatus: 'unavailable', physicalStatus: 'absent' };
      return snapshot();
    },
    async acceptSyntheticReplay(report) {
      const acceptedGeneration = ++generation;
      const projection = await projectX49Report(report, cryptoImpl);
      if (acceptedGeneration !== generation) reject('X49_REPLAY_RETIRED');
      state = { state: 'synthetic-replay', reason: null,
        classification: 'synthetic-browser-replay-not-native-evidence', cases: projection.cases,
        academicStatus: 'unavailable', physicalStatus: 'absent' };
      return snapshot();
    },
    invalidate(reason = 'X49_CLEARED') {
      generation += 1;
      state = { state: 'invalidated', reason, classification: 'calculated-only', cases: [],
        academicStatus: 'unavailable', physicalStatus: 'absent' };
      return snapshot();
    },
    snapshot,
  });
}

export function x49CalculatedCaseIsExact(value, caseId) {
  const expected = X49_CASES.find((entry) => entry.caseId === caseId);
  return Boolean(expected && exactKeys(value, ['caseId', 'inputIdentity', 'authored', 'calculated'])
    && value.caseId === caseId && value.inputIdentity === expected.inputIdentity
    && value.authored.referenceTemperatureC === expected.authored.referenceTemperatureC
    && value.authored.offsetC === expected.authored.offsetC
    && value.authored.effectiveTemperatureC === expected.authored.effectiveTemperatureC
    && exactCalculated(value.calculated, expected.calculated));
}
