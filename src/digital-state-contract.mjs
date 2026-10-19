// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { completedExperimentOutcome } from './experiment-outcomes.mjs';

export const DIGITAL_STATE_CONTRACT_SCHEMA = 'intent-mcu-digital-state-contract@1';
export const DIGITAL_STATE_REPORT_SCHEMA = 'intent-mcu-digital-state-report@1';
export const X33_SUITE_ID = 'x33-static-avr-digital-state-v1';
export const DIGITAL_DRIVER_LEVELS = Object.freeze(['HIGH', 'LOW', 'HIGH_Z', 'PULLED_HIGH']);

export const X33_DIGITAL_STATE_SUITE = Object.freeze({
  schema: DIGITAL_STATE_CONTRACT_SCHEMA,
  suiteId: X33_SUITE_ID,
  suiteVersion: '1.0.0',
  profile: 'board.atmega328p-16mhz-v1',
  fixtureId: 'x33-static-synthetic-digital-net-v1',
  label: 'STATIC SYNTHETIC CIRCUIT-MODEL CHECK',
  cases: Object.freeze([
    Object.freeze({ caseId: 'X33-LOW', netId: 'net-x33-low', requirementId: 'REQ-X33-LOW',
      producers: Object.freeze([Object.freeze({ producerId: 'input-high-z', level: 'HIGH_Z' }),
        Object.freeze({ producerId: 'ground-low', level: 'LOW' })]),
      observedProducerIds: Object.freeze(['input-high-z', 'ground-low']), expectedState: 'LOW' }),
    Object.freeze({ caseId: 'X33-HIGH-Z', netId: 'net-x33-high-z', requirementId: 'REQ-X33-LOW',
      producers: Object.freeze([Object.freeze({ producerId: 'input-high-z', level: 'HIGH_Z' })]),
      observedProducerIds: Object.freeze(['input-high-z']), expectedState: 'HIGH_Z' }),
    Object.freeze({ caseId: 'X33-CONFLICT', netId: 'net-x33-conflict', requirementId: 'REQ-X33-LOW',
      producers: Object.freeze([Object.freeze({ producerId: 'output-high', level: 'HIGH' }),
        Object.freeze({ producerId: 'output-low', level: 'LOW' })]),
      observedProducerIds: Object.freeze(['output-high', 'output-low']), expectedState: 'CONFLICT' }),
    Object.freeze({ caseId: 'X33-UNKNOWN-EVIDENCE', netId: 'net-x33-missing', requirementId: 'REQ-X33-LOW',
      producers: Object.freeze([Object.freeze({ producerId: 'required-low', level: 'LOW' })]),
      observedProducerIds: Object.freeze([]), expectedState: null }),
  ]),
  pullupCompanion: Object.freeze({ caseId: 'X33-PULLUP-COMPANION', netId: 'net-x33-pullup',
    producers: Object.freeze([Object.freeze({ producerId: 'input-high-z', level: 'HIGH_Z' }),
      Object.freeze({ producerId: 'pullup', level: 'PULLED_HIGH' })]), expectedState: 'PULLED_HIGH' }),
  repeats: Object.freeze(['A', 'B']),
  limits: Object.freeze({ staticSyntheticOnly: true, compiledFirmware: false, runtimeExecution: false,
    physicalProof: false, analogueSolver: false, dynamicNetTiming: false,
    spdtProjectionChanged: false, sharedIoSupportExpanded: false, otherProfilesNormalized: false }),
});

const clone = (value) => structuredClone(value);
const hashPattern = /^[0-9a-f]{64}$/u;
const idPattern = /^[A-Za-z][A-Za-z0-9-]{0,63}$/u;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
function reject(code) { throw Object.assign(new Error(code), { code }); }

export function stableDigitalStateStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableDigitalStateStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableDigitalStateStringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}
export async function digitalStateSha256(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export function validateDigitalStateAnnotations(value) {
  if (!Array.isArray(value)) reject('DIGITAL_STATE_ANNOTATIONS_INVALID');
  const ids = new Set();
  const result = value.map((item) => {
    if (!exactKeys(item, ['producerId', 'level']) || !idPattern.test(item.producerId ?? '')
        || !DIGITAL_DRIVER_LEVELS.includes(item.level)) reject('DIGITAL_STATE_ANNOTATION_UNKNOWN');
    if (ids.has(item.producerId)) reject('DIGITAL_STATE_PRODUCER_DUPLICATE');
    ids.add(item.producerId);
    return { producerId: item.producerId, level: item.level };
  });
  return result;
}

export function validateDigitalStateSuite(value = X33_DIGITAL_STATE_SUITE) {
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteVersion', 'profile', 'fixtureId', 'label',
    'cases', 'pullupCompanion', 'repeats', 'limits'])
      || value.schema !== DIGITAL_STATE_CONTRACT_SCHEMA || value.suiteId !== X33_SUITE_ID
      || stableDigitalStateStringify(value) !== stableDigitalStateStringify(X33_DIGITAL_STATE_SUITE)) {
    reject('DIGITAL_STATE_CONTRACT_DRIFT');
  }
  for (const item of value.cases) validateDigitalStateAnnotations(item.producers);
  validateDigitalStateAnnotations(value.pullupCompanion.producers);
  return clone(value);
}
export async function digitalStateSuiteIdentity(value = X33_DIGITAL_STATE_SUITE) {
  return digitalStateSha256(stableDigitalStateStringify(validateDigitalStateSuite(value)));
}

export function prepareDigitalStateEvidence(plan, annotations) {
  if (!X33_DIGITAL_STATE_SUITE.cases.some((item) => item.caseId === plan?.caseId)) {
    reject('DIGITAL_STATE_CASE_UNKNOWN');
  }
  const normalized = validateDigitalStateAnnotations(annotations);
  const declared = new Map(plan.producers.map((item) => [item.producerId, item.level]));
  for (const item of normalized) {
    if (declared.get(item.producerId) !== item.level) reject('DIGITAL_STATE_ANNOTATION_MISMATCH');
  }
  const observed = new Set(normalized.map((item) => item.producerId));
  const missingProducerIds = plan.producers.map((item) => item.producerId).filter((id) => !observed.has(id));
  return { annotations: normalized, missingProducerIds };
}

export function digitalStateOutcome(disposition) {
  if (disposition === 'resolved-low') return completedExperimentOutcome({
    assertions: [{ code: 'EXPECTED_LOW_OBSERVED', passed: true }],
  });
  if (disposition === 'high-impedance') return completedExperimentOutcome({
    evidence: [{ code: 'INPUT_UNDRIVEN', complete: false }],
  });
  if (disposition === 'unknown-evidence') return completedExperimentOutcome({
    evidence: [{ code: 'SIGNAL_EVIDENCE_MISSING', complete: false }],
  });
  if (disposition === 'conflict') return null;
  reject('DIGITAL_STATE_DISPOSITION_UNKNOWN');
}

function validOutcome(value, status, reason = null) {
  return value?.schema === 'intent-mcu-experiment-outcome@1' && value.academicStatus === status
    && value.jobStatus === 'completed' && (reason === null || value.reasons.includes(reason));
}
function expectedRow(caseId) {
  return {
    'X33-LOW': ['resolved-low', 'resolved', 'LOW', 'accepted', 'OK', 'passed', null],
    'X33-HIGH-Z': ['high-impedance', 'resolved', 'HIGH_Z', 'accepted', 'OK', 'indeterminate', 'INPUT_UNDRIVEN'],
    'X33-CONFLICT': ['conflict', 'resolved', 'CONFLICT', 'rejected-before-execution', 'OUTPUT_CONTENTION', null, null],
    'X33-UNKNOWN-EVIDENCE': ['unknown-evidence', 'not-evaluated', null, 'not-run-incomplete',
      'SIGNAL_EVIDENCE_MISSING', 'indeterminate', 'SIGNAL_EVIDENCE_MISSING'],
  }[caseId];
}

export function validateDigitalStateRow(row, plan) {
  if (!exactKeys(row, ['caseId', 'netId', 'requirementId', 'producerAnnotations',
    'missingProducerIds', 'resolution', 'validation', 'disposition', 'outcome'])
      || row.caseId !== plan.caseId || row.netId !== plan.netId
      || row.requirementId !== plan.requirementId
      || !exactKeys(row.resolution, ['status', 'state'])
      || !exactKeys(row.validation, ['status', 'code'])) reject('DIGITAL_STATE_ROW_INVALID');
  const prepared = prepareDigitalStateEvidence(plan, row.producerAnnotations);
  if (stableDigitalStateStringify(prepared.missingProducerIds)
      !== stableDigitalStateStringify(row.missingProducerIds)) reject('DIGITAL_STATE_ROW_MISSING_INVALID');
  const [disposition, resolutionStatus, state, validationStatus, code, academic, reason] = expectedRow(plan.caseId);
  if (row.disposition !== disposition || row.resolution.status !== resolutionStatus
      || row.resolution.state !== state || row.validation.status !== validationStatus
      || row.validation.code !== code) reject('DIGITAL_STATE_ROW_CLASSIFICATION_INVALID');
  if (academic === null ? row.outcome !== null : !validOutcome(row.outcome, academic, reason)) {
    reject('DIGITAL_STATE_ROW_OUTCOME_INVALID');
  }
  return clone(row);
}

function validatePullup(value, suite) {
  if (!exactKeys(value, ['caseId', 'netId', 'producerAnnotations', 'resolution', 'status', 'code'])
      || value.caseId !== suite.pullupCompanion.caseId || value.netId !== suite.pullupCompanion.netId
      || stableDigitalStateStringify(validateDigitalStateAnnotations(value.producerAnnotations))
        !== stableDigitalStateStringify(suite.pullupCompanion.producers)
      || value.resolution !== 'PULLED_HIGH' || value.status !== 'completed-supported'
      || value.code !== 'OK') reject('DIGITAL_STATE_PULLUP_INVALID');
  return clone(value);
}

export function digitalStateRepeatProjection(value) {
  return { rows: value.rows, pullupCompanion: value.pullupCompanion };
}
export function semanticDigitalStateProjection(value) {
  return { schema: value.schema, suiteId: value.suiteId, suiteSha256: value.suiteSha256,
    profile: value.profile, fixtureId: value.fixtureId, label: value.label,
    repeats: value.repeats.map(digitalStateRepeatProjection),
    repeatSemanticSha256: value.repeatSemanticSha256,
    strictParserProbe: value.strictParserProbe, staleRecordProbe: value.staleRecordProbe,
    limits: value.limits };
}

export async function validateDigitalStateReport(value, suite = X33_DIGITAL_STATE_SUITE) {
  const accepted = validateDigitalStateSuite(suite);
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteSha256', 'profile', 'fixtureId', 'label',
    'repeats', 'repeatSemanticSha256', 'strictParserProbe', 'staleRecordProbe', 'limits', 'semanticSha256'])
      || value.schema !== DIGITAL_STATE_REPORT_SCHEMA || value.suiteId !== accepted.suiteId
      || value.suiteSha256 !== await digitalStateSuiteIdentity(accepted)
      || value.profile !== accepted.profile || value.fixtureId !== accepted.fixtureId
      || value.label !== accepted.label || !Array.isArray(value.repeats) || value.repeats.length !== 2
      || stableDigitalStateStringify(value.limits) !== stableDigitalStateStringify(accepted.limits)) {
    reject('DIGITAL_STATE_REPORT_STALE_OR_UNKNOWN');
  }
  const repeatHashes = [];
  for (let index = 0; index < 2; index += 1) {
    const repeat = value.repeats[index];
    if (!exactKeys(repeat, ['repeat', 'rows', 'pullupCompanion'])
        || repeat.repeat !== accepted.repeats[index] || !Array.isArray(repeat.rows)
        || repeat.rows.length !== accepted.cases.length) reject('DIGITAL_STATE_REPEAT_INVALID');
    repeat.rows.forEach((row, rowIndex) => validateDigitalStateRow(row, accepted.cases[rowIndex]));
    validatePullup(repeat.pullupCompanion, accepted);
    repeatHashes.push(await digitalStateSha256(stableDigitalStateStringify(digitalStateRepeatProjection(repeat))));
  }
  if (repeatHashes[0] !== repeatHashes[1] || value.repeatSemanticSha256 !== repeatHashes[0]) {
    reject('DIGITAL_STATE_REPEAT_SEMANTIC_MISMATCH');
  }
  if (!exactKeys(value.strictParserProbe, ['status', 'code', 'resolverCalled', 'equalLevelsDistinctProducersAccepted'])
      || value.strictParserProbe.status !== 'rejected-before-resolution'
      || value.strictParserProbe.code !== 'DIGITAL_STATE_ANNOTATION_UNKNOWN'
      || value.strictParserProbe.resolverCalled !== false
      || value.strictParserProbe.equalLevelsDistinctProducersAccepted !== true) reject('DIGITAL_STATE_PARSER_PROBE_INVALID');
  if (!exactKeys(value.staleRecordProbe, ['status', 'code', 'priorReportRetained'])
      || value.staleRecordProbe.status !== 'rejected-atomically'
      || value.staleRecordProbe.code !== 'DIGITAL_STATE_REPORT_STALE_OR_UNKNOWN'
      || value.staleRecordProbe.priorReportRetained !== true) reject('DIGITAL_STATE_STALE_PROBE_INVALID');
  const semantic = await digitalStateSha256(stableDigitalStateStringify(semanticDigitalStateProjection(value)));
  if (!hashPattern.test(value.semanticSha256 ?? '') || value.semanticSha256 !== semantic) {
    reject('DIGITAL_STATE_REPORT_SEMANTIC_HASH_INVALID');
  }
  return clone(value);
}

export function digitalStateReportPassed(value) {
  return value?.repeats?.length === 2 && value.repeats.every((repeat) => {
    const [low, highZ, conflict, unknown] = repeat.rows;
    return low?.outcome?.academicStatus === 'passed'
      && highZ?.outcome?.academicStatus === 'indeterminate'
      && conflict?.outcome === null && unknown?.outcome?.academicStatus === 'indeterminate'
      && repeat.pullupCompanion?.resolution === 'PULLED_HIGH';
  });
}
