// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { completedExperimentOutcome } from './experiment-outcomes.mjs';
import { DEFAULT_CIRCUIT } from './default-circuit.mjs';

export const UNSUPPORTED_ACCESS_CONTRACT_SCHEMA = 'intent-mcu-unsupported-access-contract@1';
export const UNSUPPORTED_ACCESS_REPORT_SCHEMA = 'intent-mcu-unsupported-access-report@1';
export const X32_SUITE_ID = 'x32-avr-spi-unsupported-access-v1';
export const X32_FAULT_SOURCE = `#include <Arduino.h>\n#include <avr/io.h>\n\nvoid setup() {\n  pinMode(13, OUTPUT);\n  digitalWrite(13, HIGH);\n  SPCR = _BV(SPE);\n}\n\nvoid loop() {}\n`;
export const X32_GOOD_SOURCE = `#include <Arduino.h>\n\nvoid setup() {\n  pinMode(13, OUTPUT);\n  digitalWrite(13, HIGH);\n}\n\nvoid loop() {}\n`;

export const X32_UNSUPPORTED_ACCESS_SUITE = Object.freeze({
  schema: UNSUPPORTED_ACCESS_CONTRACT_SCHEMA,
  suiteId: X32_SUITE_ID,
  suiteVersion: '1.0.0',
  profile: 'board.atmega328p-16mhz-v1',
  fixture: Object.freeze({
    id: 'x32-avr-spi-enable-v1',
    sourceSha256: '1d3ae51f4aebd1e4c15f2eccab00742854dc39ecadee277b46075e91a78f6763',
    goodSourceSha256: 'e4319650540c94669082d07f630478e81da93871fc42a8a94a8cf4aa5022476d',
    projectSha256: '44df07606fd0b1917c7b2c44372a8a6e7b968e400bbb8d7462190b92c1fc6530',
  }),
  detector: Object.freeze({
    id: 'avr8js-atmega328p-unsupported-spi-spcr-v1',
    operation: 'write', peripheral: 'SPI', address: 0x4c, value: 0x40,
  }),
  affectedRequirement: Object.freeze({ id: 'REQ-X32-SPI-MODEL', expectedStatus: 'unsupported' }),
  repeats: Object.freeze(['A', 'B']),
  limits: Object.freeze({
    controller: 'ATmega328P only', exhaustiveRegisterCoverage: false,
    readAccessCoverage: false, aliasAndReservedBitCoverage: false,
    otherProfilesNormalized: false, physicalHardwareFaultClaimed: false,
  }),
});

const clone = (value) => structuredClone(value);
const hashPattern = /^[0-9a-f]{64}$/u;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
function reject(code) { throw Object.assign(new Error(code), { code }); }

export function stableUnsupportedAccessStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableUnsupportedAccessStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableUnsupportedAccessStringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}
export async function unsupportedAccessSha256(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export function validateUnsupportedAccessDetector(value) {
  if (value !== X32_UNSUPPORTED_ACCESS_SUITE.detector.id) reject('UNSUPPORTED_ACCESS_DETECTOR_UNKNOWN');
  return value;
}

export async function validateUnsupportedAccessSuite(value = X32_UNSUPPORTED_ACCESS_SUITE) {
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteVersion', 'profile', 'fixture', 'detector',
    'affectedRequirement', 'repeats', 'limits'])
      || stableUnsupportedAccessStringify(value) !== stableUnsupportedAccessStringify(X32_UNSUPPORTED_ACCESS_SUITE)
      || value.schema !== UNSUPPORTED_ACCESS_CONTRACT_SCHEMA || value.suiteId !== X32_SUITE_ID
      || value.profile !== 'board.atmega328p-16mhz-v1') reject('UNSUPPORTED_ACCESS_CONTRACT_DRIFT');
  const [faultSource, goodSource, project] = await Promise.all([
    unsupportedAccessSha256(X32_FAULT_SOURCE), unsupportedAccessSha256(X32_GOOD_SOURCE),
    unsupportedAccessSha256(JSON.stringify(DEFAULT_CIRCUIT)),
  ]);
  if (faultSource !== value.fixture.sourceSha256 || goodSource !== value.fixture.goodSourceSha256
      || project !== value.fixture.projectSha256) reject('UNSUPPORTED_ACCESS_FIXTURE_HASH_STALE');
  validateUnsupportedAccessDetector(value.detector.id);
  return clone(value);
}
export async function unsupportedAccessSuiteIdentity(value = X32_UNSUPPORTED_ACCESS_SUITE) {
  return unsupportedAccessSha256(stableUnsupportedAccessStringify(await validateUnsupportedAccessSuite(value)));
}

function validAccess(value) {
  return exactKeys(value, ['operation', 'peripheral', 'address', 'value', 'cycle', 'instructionOrdinal'])
    && value.operation === 'write' && typeof value.peripheral === 'string'
    && Number.isInteger(value.address) && Number.isInteger(value.value)
    && Number.isSafeInteger(value.cycle) && value.cycle >= 0
    && Number.isSafeInteger(value.instructionOrdinal) && value.instructionOrdinal > 0;
}
function validObservation(value) {
  return exactKeys(value, ['kind', 'pin', 'level', 'cycle']) && value.kind === 'gpio'
    && value.pin === 'D13' && typeof value.level === 'boolean'
    && Number.isSafeInteger(value.cycle) && value.cycle >= 0;
}
function validStop(value) {
  return exactKeys(value, ['status', 'code', 'cycle', 'instructionOrdinal', 'postFaultAcceptedRecords'])
    && value.status === 'stopped-unsupported' && value.code === 'RUNTIME_CAPABILITY_UNSUPPORTED'
    && Number.isSafeInteger(value.cycle) && value.cycle > 0
    && Number.isSafeInteger(value.instructionOrdinal) && value.instructionOrdinal > 0
    && value.postFaultAcceptedRecords === 0;
}

export function evaluateUnsupportedAccessExecution(execution, suite = X32_UNSUPPORTED_ACCESS_SUITE) {
  const complete = exactKeys(execution, ['executionId', 'repeat', 'sourceSha256', 'artifactSha256',
    'projectSha256', 'detectorId', 'access', 'lastSupportedObservation', 'stop', 'outcome', 'diagnostics'])
    && ['A', 'B'].includes(execution.repeat) && hashPattern.test(execution.sourceSha256 ?? '')
    && hashPattern.test(execution.artifactSha256 ?? '') && hashPattern.test(execution.projectSha256 ?? '')
    && execution.detectorId === suite.detector.id && validAccess(execution.access)
    && validObservation(execution.lastSupportedObservation) && validStop(execution.stop)
    && exactKeys(execution.diagnostics, ['workerMessageKind', 'blockedReplayNoAdvance']);
  if (!complete) return completedExperimentOutcome({ evidence: [
    { code: 'UNSUPPORTED_ACCESS_EVIDENCE_MISSING', complete: false },
  ] });
  const exact = execution.sourceSha256 === suite.fixture.sourceSha256
    && execution.projectSha256 === suite.fixture.projectSha256
    && execution.access.operation === suite.detector.operation
    && execution.access.peripheral === suite.detector.peripheral
    && execution.access.address === suite.detector.address
    && execution.access.value === suite.detector.value
    && execution.lastSupportedObservation.level === true
    && execution.lastSupportedObservation.cycle <= execution.access.cycle
    && execution.stop.cycle >= execution.access.cycle
    && execution.stop.instructionOrdinal === execution.access.instructionOrdinal
    && execution.diagnostics.workerMessageKind === 'stopped-error'
    && execution.diagnostics.blockedReplayNoAdvance === true;
  return exact ? completedExperimentOutcome({ supported: false })
    : completedExperimentOutcome({ evidence: [
      { code: 'UNSUPPORTED_ACCESS_EVIDENCE_MISSING', complete: false },
    ] });
}

export function unsupportedAccessExecutionProjection(execution) {
  return { sourceSha256: execution.sourceSha256, artifactSha256: execution.artifactSha256,
    projectSha256: execution.projectSha256, detectorId: execution.detectorId,
    access: execution.access, lastSupportedObservation: execution.lastSupportedObservation,
    stop: execution.stop, outcome: execution.outcome, diagnostics: execution.diagnostics };
}
export function semanticUnsupportedAccessProjection(report) {
  return { schema: report.schema, suiteId: report.suiteId, suiteSha256: report.suiteSha256,
    profile: report.profile, sourceSha256: report.sourceSha256,
    artifactSha256: report.artifactSha256, projectSha256: report.projectSha256,
    producer: report.producer, detector: report.detector,
    affectedRequirement: report.affectedRequirement,
    executions: report.executions.map(unsupportedAccessExecutionProjection),
    repeatSemanticSha256: report.repeatSemanticSha256,
    goodCompanion: report.goodCompanion, classifications: report.classifications,
    staleRecordProbe: report.staleRecordProbe, limits: report.limits };
}

function validOutcome(value, status) {
  return value?.schema === 'intent-mcu-experiment-outcome@1'
    && value.academicStatus === status && value.jobStatus === 'completed';
}
function validClassifications(value) {
  return exactKeys(value, ['compiler', 'validation', 'runtimeCapability', 'infrastructure', 'academic'])
    && exactKeys(value.compiler, ['status', 'code', 'artifactCreated', 'academicOutcomeCreated'])
    && value.compiler.status === 'rejected-before-runtime' && value.compiler.code === 'COMPILE_FAILED'
    && value.compiler.artifactCreated === false && value.compiler.academicOutcomeCreated === false
    && exactKeys(value.validation, ['status', 'code', 'academicOutcomeCreated'])
    && value.validation.status === 'rejected-before-execution'
    && value.validation.code === 'UNSUPPORTED_ACCESS_DETECTOR_UNKNOWN'
    && value.validation.academicOutcomeCreated === false
    && exactKeys(value.runtimeCapability, ['status', 'code', 'academicStatus'])
    && value.runtimeCapability.status === 'stopped-unsupported'
    && value.runtimeCapability.code === 'RUNTIME_CAPABILITY_UNSUPPORTED'
    && value.runtimeCapability.academicStatus === 'unsupported'
    && exactKeys(value.infrastructure, ['status', 'code', 'academicOutcomeCreated'])
    && value.infrastructure.status === 'classified-without-execution'
    && value.infrastructure.code === 'UNSUPPORTED_ACCESS_WORKER_UNAVAILABLE'
    && value.infrastructure.academicOutcomeCreated === false
    && exactKeys(value.academic, ['status', 'code', 'outcome'])
    && value.academic.status === 'indeterminate-as-expected'
    && value.academic.code === 'UNSUPPORTED_ACCESS_EVIDENCE_MISSING'
    && validOutcome(value.academic.outcome, 'indeterminate');
}

export async function validateUnsupportedAccessReport(value, suite = X32_UNSUPPORTED_ACCESS_SUITE) {
  const accepted = await validateUnsupportedAccessSuite(suite);
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteSha256', 'profile', 'sourceSha256',
    'artifactSha256', 'projectSha256', 'producer', 'detector', 'affectedRequirement',
    'executions', 'repeatSemanticSha256', 'goodCompanion', 'classifications',
    'staleRecordProbe', 'limits', 'semanticSha256'])
      || value.schema !== UNSUPPORTED_ACCESS_REPORT_SCHEMA || value.suiteId !== accepted.suiteId
      || value.suiteSha256 !== await unsupportedAccessSuiteIdentity(accepted)
      || value.profile !== accepted.profile || value.sourceSha256 !== accepted.fixture.sourceSha256
      || value.projectSha256 !== accepted.fixture.projectSha256 || !hashPattern.test(value.artifactSha256 ?? '')
      || stableUnsupportedAccessStringify(value.detector) !== stableUnsupportedAccessStringify(accepted.detector)
      || stableUnsupportedAccessStringify(value.affectedRequirement)
        !== stableUnsupportedAccessStringify(accepted.affectedRequirement)
      || stableUnsupportedAccessStringify(value.limits) !== stableUnsupportedAccessStringify(accepted.limits)
      || !Array.isArray(value.executions) || value.executions.length !== 2) {
    reject('UNSUPPORTED_ACCESS_REPORT_STALE_OR_UNKNOWN');
  }
  const hashes = [];
  for (const execution of value.executions) {
    if (execution.executionId !== `X32-SPI-${execution.repeat}`
        || execution.artifactSha256 !== value.artifactSha256
        || !validOutcome(execution.outcome, 'unsupported')
        || evaluateUnsupportedAccessExecution(execution, accepted).academicStatus !== 'unsupported') {
      reject('UNSUPPORTED_ACCESS_EXECUTION_INVALID');
    }
    hashes.push(await unsupportedAccessSha256(stableUnsupportedAccessStringify(
      unsupportedAccessExecutionProjection(execution))));
  }
  if (hashes[0] !== hashes[1] || value.repeatSemanticSha256 !== hashes[0]) {
    reject('UNSUPPORTED_ACCESS_REPEAT_SEMANTIC_MISMATCH');
  }
  if (!exactKeys(value.goodCompanion, ['sourceSha256', 'artifactSha256', 'status',
    'unsupportedRecords', 'supportedObservation'])
      || value.goodCompanion.sourceSha256 !== accepted.fixture.goodSourceSha256
      || !hashPattern.test(value.goodCompanion.artifactSha256 ?? '')
      || value.goodCompanion.status !== 'completed-supported'
      || value.goodCompanion.unsupportedRecords !== 0
      || value.goodCompanion.supportedObservation !== true) reject('UNSUPPORTED_ACCESS_GOOD_COMPANION_INVALID');
  if (!validClassifications(value.classifications)) reject('UNSUPPORTED_ACCESS_CLASSIFICATION_INVALID');
  if (!exactKeys(value.staleRecordProbe, ['status', 'code', 'priorReportRetained'])
      || value.staleRecordProbe.status !== 'rejected-atomically'
      || value.staleRecordProbe.code !== 'UNSUPPORTED_ACCESS_REPORT_STALE_OR_UNKNOWN'
      || value.staleRecordProbe.priorReportRetained !== true) reject('UNSUPPORTED_ACCESS_STALE_PROBE_INVALID');
  const semantic = await unsupportedAccessSha256(stableUnsupportedAccessStringify(
    semanticUnsupportedAccessProjection(value)));
  if (value.semanticSha256 !== semantic) reject('UNSUPPORTED_ACCESS_REPORT_SEMANTIC_HASH_INVALID');
  return clone(value);
}

export function unsupportedAccessReportPassed(report) {
  return report?.executions?.length === 2
    && report.executions.every((item) => validOutcome(item.outcome, 'unsupported'))
    && report.goodCompanion?.status === 'completed-supported';
}
