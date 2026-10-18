// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  REGRESSION_REPORT_SCHEMA, X26_REGRESSION_MATRIX, regressionMatrixIdentity,
  semanticRegressionProjection, sha256Text, stableStringify, validateExpectationOverride,
  validateRegressionMatrix,
} from './regression-matrix-contract.mjs';
import {
  completedExperimentOutcome, interruptedExperimentOutcome, jobStatusFromCode,
  unsupportedExperimentOutcome,
} from './experiment-outcomes.mjs';

const clone = (value) => structuredClone(value);
const HASH = /^[0-9a-f]{64}$/u;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function validateExecution(cell, value) {
  const keys = ['caseId', 'profile', 'profileVersion', 'fixtureSha256', 'sourceSha256', 'artifactSha256',
    'producer', 'actual', 'rawVirtualTime', 'durationMilliseconds'];
  if (!exactKeys(value, keys) || value.caseId !== cell.caseId || value.profile !== cell.profile
      || value.profileVersion !== cell.profileVersion || value.fixtureSha256 !== cell.fixtureSha256
      || value.sourceSha256 !== cell.sourceSha256 || !HASH.test(value.artifactSha256)
      || typeof value.producer !== 'string' || !value.producer
      || typeof value.durationMilliseconds !== 'number' || value.durationMilliseconds < 0
      || value.rawVirtualTime === null || typeof value.rawVirtualTime !== 'object'
      || Array.isArray(value.rawVirtualTime)) {
    throw Object.assign(new Error('REGRESSION_EXECUTION_PROFILE_SUBSTITUTION'), { code: 'REGRESSION_EXECUTION_PROFILE_SUBSTITUTION' });
  }
  return clone(value);
}

function selectedCells(matrix, selector) {
  if (selector === 'all') return matrix.cells;
  const cell = matrix.cells.find((item) => item.caseId === selector);
  if (!cell) throw Object.assign(new Error('REGRESSION_MATRIX_SELECTOR_UNKNOWN'), { code: 'REGRESSION_MATRIX_SELECTOR_UNKNOWN' });
  return [cell];
}

function failedExecution(cell, expected, error) {
  const code = error?.code ?? error?.message ?? 'REGRESSION_EXECUTION_FAILED';
  const outcome = String(code).includes('UNSUPPORTED')
    ? unsupportedExperimentOutcome(code)
    : interruptedExperimentOutcome(jobStatusFromCode(code), code);
  return {
    caseId: cell.caseId, profile: cell.profile, profileVersion: cell.profileVersion,
    fixtureSha256: cell.fixtureSha256, sourceSha256: cell.sourceSha256,
    artifactSha256: '0'.repeat(64), producer: cell.observationOwner,
    expected: clone(expected), actual: null, outcome,
    rawVirtualTime: { timebase: 'unavailable', values: [] }, durationMilliseconds: 0,
    limitation: cell.limitation,
  };
}

export async function executeRegressionMatrix({
  matrix = X26_REGRESSION_MATRIX, selector = 'all', expectationOverride = null, executeCell,
} = {}) {
  const validated = await validateRegressionMatrix(matrix);
  if (typeof executeCell !== 'function') throw new TypeError('REGRESSION_EXECUTOR_REQUIRED');
  const override = expectationOverride ? await validateExpectationOverride(expectationOverride, validated) : null;
  if (override && selector !== override.caseId) {
    throw Object.assign(new Error('REGRESSION_EXPECTATION_OVERRIDE_SELECTOR'), { code: 'REGRESSION_EXPECTATION_OVERRIDE_SELECTOR' });
  }
  const matrixSha256 = await regressionMatrixIdentity(validated);
  const overrideSha256 = override ? await sha256Text(stableStringify(override)) : null;
  const results = [];
  for (const cell of selectedCells(validated, selector)) {
    const expected = override?.caseId === cell.caseId ? override.expected : cell.expected;
    try {
      const execution = validateExecution(cell, await executeCell(clone(cell)));
      const passed = stableStringify(execution.actual) === stableStringify(expected);
      results.push({
        ...execution,
        expected: clone(expected),
        outcome: completedExperimentOutcome({ assertions: [{ code: 'PROFILE_EXPECTATION_MISMATCH', passed }] }),
        limitation: cell.limitation,
      });
    } catch (error) {
      results.push(failedExecution(cell, expected, error));
    }
  }
  const report = {
    schema: REGRESSION_REPORT_SCHEMA, matrixId: validated.matrixId, matrixSha256,
    selector, expectationOverrideSha256: overrideSha256, results,
  };
  report.semanticSha256 = await sha256Text(stableStringify(semanticRegressionProjection(report)));
  return report;
}

export function regressionReportPassed(report) {
  return report.results.length > 0 && report.results.every(
    (item) => item.outcome.academicStatus === 'passed' && item.outcome.jobStatus === 'completed',
  );
}
