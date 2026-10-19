// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { completedExperimentOutcome } from './experiment-outcomes.mjs';
import { X29_FIXTURE_SOURCE } from './time-invariance-contract.mjs';

export const RESET_CLASS_CONTRACT_SCHEMA = 'intent-mcu-reset-class-contract@1';
export const RESET_CLASS_REPORT_SCHEMA = 'intent-mcu-reset-class-report@1';
export const RESET_CLASSES = Object.freeze(['cpu-reset', 'experiment-restart', 'power-on']);
export const X31_SUITE_ID = 'x31-avr-reset-classes-v1';

const retention = Object.freeze({
  'cpu-reset': Object.freeze({ artifact: 'retained', volatileMemory: 'cleared', cpuPeripherals: 'cleared',
    modelControls: 'retained-current', inputs: 'cleared', tracesAndResults: 'cleared', worker: 'same-generation-barrier' }),
  'experiment-restart': Object.freeze({ artifact: 'retained', volatileMemory: 'cleared', cpuPeripherals: 'cleared',
    modelControls: 'replaced-by-declared-scenario', inputs: 'declared-scenario-only', tracesAndResults: 'cleared',
    worker: 'fresh-kernel' }),
  'power-on': Object.freeze({ artifact: 'retained', volatileMemory: 'cleared', cpuPeripherals: 'cleared',
    modelControls: 'canonical-project-power-on', inputs: 'cleared', tracesAndResults: 'cleared',
    worker: 'fresh-worker-generation' }),
});

export const X31_RESET_CLASS_SUITE = Object.freeze({
  schema: RESET_CLASS_CONTRACT_SCHEMA, suiteId: X31_SUITE_ID, suiteVersion: '1.0.0',
  profile: 'board.atmega328p-16mhz-v1',
  fixture: { id: 'x31-avr-reset-fixture-v1',
    sourceSha256: '9d1730ec4ed1a0dbf23ac6638ba8ba99264dfb8041e222bca4d240345978c76d',
    volatileAddress: 0x100, dirtyValue: 0xa5 },
  classes: [...RESET_CLASSES], repeats: ['A', 'B'], retention,
  limits: { controller: 'ATmega328P only', simulatorSemanticsOnly: true,
    physicalResetTimingClaimed: false, physicalSramRetentionClaimed: false,
    eepromFlashFusesClaimed: false, watchdogBrownoutClaimed: false,
    otherProfilesNormalized: false },
});

const clone = (value) => structuredClone(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const hashPattern = /^[0-9a-f]{64}$/u;
function reject(code) { throw Object.assign(new Error(code), { code }); }

export function stableResetStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableResetStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableResetStringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}
export async function resetClassSha256(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export function validateResetClass(value) {
  if (!RESET_CLASSES.includes(value)) reject('RESET_CLASS_UNKNOWN');
  return value;
}

export async function validateResetClassSuite(value = X31_RESET_CLASS_SUITE) {
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteVersion', 'profile', 'fixture', 'classes',
    'repeats', 'retention', 'limits'])
      || stableResetStringify(value) !== stableResetStringify(X31_RESET_CLASS_SUITE)
      || value.schema !== RESET_CLASS_CONTRACT_SCHEMA || value.suiteId !== X31_SUITE_ID
      || value.profile !== 'board.atmega328p-16mhz-v1') reject('RESET_CLASS_CONTRACT_DRIFT');
  if (await resetClassSha256(X29_FIXTURE_SOURCE) !== value.fixture.sourceSha256) {
    reject('RESET_CLASS_FIXTURE_HASH_STALE');
  }
  for (const resetClass of value.classes) validateResetClass(resetClass);
  return clone(value);
}
export async function resetClassSuiteIdentity(value = X31_RESET_CLASS_SUITE) {
  return resetClassSha256(stableResetStringify(await validateResetClassSuite(value)));
}

function validControls(value) {
  return exactKeys(value, ['potPosition', 'buttonPressed'])
    && typeof value.potPosition === 'number' && typeof value.buttonPressed === 'boolean';
}
function validState(value) {
  return exactKeys(value, ['artifactSha256', 'cpuCycles', 'instructions', 'volatileByte', 'controls',
    'pending', 'inputLog', 'trace', 'serial', 'faults', 'priorResultPresent'])
    && hashPattern.test(value.artifactSha256) && Number.isSafeInteger(value.cpuCycles)
    && Number.isSafeInteger(value.instructions) && Number.isInteger(value.volatileByte)
    && validControls(value.controls) && ['pending', 'inputLog', 'trace', 'serial', 'faults']
      .every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0)
    && typeof value.priorResultPresent === 'boolean';
}

export function evaluateResetClassExecution(execution, suite = X31_RESET_CLASS_SUITE) {
  const shape = exactKeys(execution, ['executionId', 'resetClass', 'repeat', 'before', 'after',
    'workerGenerationRetired', 'outcome', 'diagnostics'])
    && RESET_CLASSES.includes(execution.resetClass) && ['A', 'B'].includes(execution.repeat)
    && validState(execution.before) && validState(execution.after)
    && typeof execution.workerGenerationRetired === 'boolean';
  if (!shape) return completedExperimentOutcome({ evidence: [
    { code: 'RESET_CLASS_EVIDENCE_COMPLETE', complete: false },
  ] });
  const { before, after, resetClass } = execution;
  const base = before.artifactSha256 === after.artifactSha256
    && before.volatileByte === suite.fixture.dirtyValue && after.volatileByte === 0
    && after.cpuCycles === 0 && after.instructions === 0
    && before.pending > 0 && before.trace > 0 && before.serial > 0 && before.faults > 0
    && after.trace === 0 && after.serial === 0 && after.faults === 0
    && before.priorResultPresent && !after.priorResultPresent;
  const classPassed = resetClass === 'cpu-reset'
    ? after.controls.potPosition === 0.75 && after.controls.buttonPressed === true
      && after.pending === 0 && after.inputLog === 0 && !execution.workerGenerationRetired
    : resetClass === 'experiment-restart'
      ? after.controls.potPosition === 0.25 && after.controls.buttonPressed === false
        && after.pending === 0 && after.inputLog === 2 && !execution.workerGenerationRetired
      : after.controls.potPosition === 0.5 && after.controls.buttonPressed === false
        && after.pending === 0 && after.inputLog === 0 && execution.workerGenerationRetired;
  return completedExperimentOutcome({ evidence: [
    { code: 'RESET_CLASS_EVIDENCE_COMPLETE', complete: true },
  ], assertions: [
    { code: 'RESET_VOLATILE_MEMORY_CLEARED', passed: base },
    { code: 'RESET_CLASS_RETENTION_EXACT', passed: classPassed },
  ] });
}

export function resetExecutionProjection(execution) {
  return { resetClass: execution.resetClass, before: execution.before, after: execution.after,
    workerGenerationRetired: execution.workerGenerationRetired, outcome: execution.outcome };
}
export function semanticResetClassProjection(report) {
  return { schema: report.schema, suiteId: report.suiteId, suiteSha256: report.suiteSha256,
    profile: report.profile, sourceSha256: report.sourceSha256, artifactSha256: report.artifactSha256,
    producer: report.producer, retention: report.retention, executions: report.executions.map(resetExecutionProjection),
    classSemanticSha256: report.classSemanticSha256, validationProbe: report.validationProbe,
    infrastructureProbe: report.infrastructureProbe, evidenceFailureProbe: report.evidenceFailureProbe,
    limits: report.limits };
}
function validOutcome(value, status) {
  return value?.schema === 'intent-mcu-experiment-outcome@1'
    && value.academicStatus === status && value.jobStatus === 'completed';
}

export async function validateResetClassReport(value, suite = X31_RESET_CLASS_SUITE) {
  const accepted = await validateResetClassSuite(suite);
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteSha256', 'profile', 'sourceSha256',
    'artifactSha256', 'producer', 'retention', 'executions', 'classSemanticSha256',
    'validationProbe', 'infrastructureProbe', 'evidenceFailureProbe', 'limits', 'semanticSha256'])
      || value.schema !== RESET_CLASS_REPORT_SCHEMA || value.suiteId !== accepted.suiteId
      || value.suiteSha256 !== await resetClassSuiteIdentity(accepted)
      || value.profile !== accepted.profile || value.sourceSha256 !== accepted.fixture.sourceSha256
      || !hashPattern.test(value.artifactSha256)
      || stableResetStringify(value.retention) !== stableResetStringify(accepted.retention)
      || stableResetStringify(value.limits) !== stableResetStringify(accepted.limits)
      || !Array.isArray(value.executions) || value.executions.length !== 6) {
    reject('RESET_CLASS_REPORT_STALE_OR_UNKNOWN');
  }
  const hashes = Object.fromEntries(RESET_CLASSES.map((item) => [item, []]));
  for (const execution of value.executions) {
    if (execution.executionId !== `X31-${execution.resetClass.toUpperCase()}-${execution.repeat}`
        || !validOutcome(execution.outcome, 'passed')
        || evaluateResetClassExecution(execution, accepted).academicStatus !== 'passed') {
      reject('RESET_CLASS_EXECUTION_INVALID');
    }
    hashes[execution.resetClass].push(await resetClassSha256(
      stableResetStringify(resetExecutionProjection(execution))));
  }
  for (const resetClass of RESET_CLASSES) {
    if (hashes[resetClass].length !== 2 || hashes[resetClass][0] !== hashes[resetClass][1]
        || value.classSemanticSha256[resetClass] !== hashes[resetClass][0]) {
      reject('RESET_CLASS_REPEAT_SEMANTIC_MISMATCH');
    }
  }
  if (value.validationProbe.status !== 'rejected-before-execution'
      || value.validationProbe.code !== 'RESET_CLASS_UNKNOWN'
      || value.validationProbe.academicOutcomeCreated !== false) reject('RESET_CLASS_VALIDATION_PROBE_INVALID');
  if (value.infrastructureProbe.status !== 'classified-without-execution'
      || value.infrastructureProbe.code !== 'RESET_WORKER_UNAVAILABLE'
      || value.infrastructureProbe.academicOutcomeCreated !== false) reject('RESET_CLASS_INFRASTRUCTURE_PROBE_INVALID');
  if (value.evidenceFailureProbe.status !== 'failed-as-expected'
      || !validOutcome(value.evidenceFailureProbe.outcome, 'failed')
      || !value.evidenceFailureProbe.outcome.reasons.includes('RESET_VOLATILE_MEMORY_CLEARED')) {
    reject('RESET_CLASS_EVIDENCE_FAILURE_PROBE_INVALID');
  }
  const semantic = await resetClassSha256(stableResetStringify(semanticResetClassProjection(value)));
  if (value.semanticSha256 !== semantic) reject('RESET_CLASS_REPORT_SEMANTIC_HASH_INVALID');
  return clone(value);
}
export function resetClassReportPassed(report) {
  return report?.executions?.length === 6
    && report.executions.every((item) => validOutcome(item.outcome, 'passed'));
}
