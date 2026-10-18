// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const EXPERIMENT_OUTCOME_SCHEMA = 'intent-mcu-experiment-outcome@1';
export const ACADEMIC_OUTCOMES = Object.freeze([
  'passed', 'failed', 'indeterminate', 'unsupported',
]);
export const EXPERIMENT_JOB_STATUSES = Object.freeze([
  'completed', 'not-started', 'cancelled', 'timeout', 'infrastructure-error',
]);

const clone = (value) => structuredClone(value);

function namedChecks(value, field) {
  if (!Array.isArray(value) || value.some((entry) => !entry || typeof entry !== 'object'
      || Array.isArray(entry) || typeof entry.code !== 'string'
      || typeof entry[field] !== 'boolean')) throw new TypeError('EXPERIMENT_OUTCOME_CHECKS_INVALID');
  return value.map((entry) => ({ code: entry.code, [field]: entry[field] }));
}

export function completedExperimentOutcome({ supported = true, evidence = [], assertions = [] } = {}) {
  if (typeof supported !== 'boolean') throw new TypeError('EXPERIMENT_OUTCOME_SUPPORT_INVALID');
  const evidenceChecks = namedChecks(evidence, 'complete');
  const assertionChecks = namedChecks(assertions, 'passed');
  let status;
  let reasons;
  if (!supported) {
    status = 'unsupported'; reasons = ['EXPERIMENT_NOT_SUPPORTED'];
  } else {
    reasons = evidenceChecks.filter((item) => !item.complete).map((item) => item.code);
    if (reasons.length) status = 'indeterminate';
    else {
      reasons = assertionChecks.filter((item) => !item.passed).map((item) => item.code);
      status = reasons.length ? 'failed' : 'passed';
    }
  }
  return Object.freeze({
    schema: EXPERIMENT_OUTCOME_SCHEMA,
    academicStatus: status,
    academicCode: `ACADEMIC_${status.toUpperCase()}`,
    jobStatus: 'completed',
    jobCode: 'JOB_COMPLETED',
    evidenceStatus: status === 'unsupported' ? 'unsupported'
      : status === 'indeterminate' ? 'incomplete' : 'complete',
    reasons: Object.freeze(reasons),
  });
}

export function interruptedExperimentOutcome(jobStatus, code) {
  if (!EXPERIMENT_JOB_STATUSES.includes(jobStatus) || jobStatus === 'completed') {
    throw new TypeError('EXPERIMENT_JOB_STATUS_INVALID');
  }
  return Object.freeze({
    schema: EXPERIMENT_OUTCOME_SCHEMA,
    academicStatus: 'indeterminate',
    academicCode: 'ACADEMIC_INDETERMINATE',
    jobStatus,
    jobCode: code,
    evidenceStatus: 'incomplete',
    reasons: Object.freeze([code]),
  });
}

export function unsupportedExperimentOutcome(code = 'EXPERIMENT_NOT_SUPPORTED') {
  return Object.freeze({
    schema: EXPERIMENT_OUTCOME_SCHEMA,
    academicStatus: 'unsupported',
    academicCode: 'ACADEMIC_UNSUPPORTED',
    jobStatus: 'not-started',
    jobCode: code,
    evidenceStatus: 'unsupported',
    reasons: Object.freeze([code]),
  });
}

export function aggregateExperimentOutcomes(observations) {
  if (!Array.isArray(observations) || !observations.length
      || observations.some((item) => !ACADEMIC_OUTCOMES.includes(item?.status)
        || item?.outcome?.schema !== EXPERIMENT_OUTCOME_SCHEMA
        || item.outcome.academicStatus !== item.status)) {
    throw new TypeError('EXPERIMENT_OBSERVATION_SET_INVALID');
  }
  const statuses = observations.map((item) => item.status);
  const status = statuses.includes('failed') ? 'failed'
    : statuses.includes('indeterminate') ? 'indeterminate'
      : statuses.includes('unsupported') ? 'unsupported' : 'passed';
  return Object.freeze({
    schema: EXPERIMENT_OUTCOME_SCHEMA,
    academicStatus: status,
    academicCode: `ACADEMIC_${status.toUpperCase()}`,
    jobStatus: 'completed',
    jobCode: 'JOB_COMPLETED',
    evidenceStatus: ['passed', 'failed'].includes(status) ? 'complete'
      : status === 'unsupported' ? 'unsupported' : 'incomplete',
    reasons: Object.freeze(observations.filter((item) => item.status !== 'passed')
      .flatMap((item) => item.outcome.reasons.map((reason) => `${item.scenarioId}:${reason}`))),
  });
}

export function jobStatusFromCode(code) {
  const value = String(code ?? '').toUpperCase();
  if (value.includes('CANCEL')) return 'cancelled';
  if (value.includes('TIMEOUT')) return 'timeout';
  return 'infrastructure-error';
}

export function cloneExperimentOutcome(value) {
  return clone(value);
}
