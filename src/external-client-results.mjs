// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { BOUNDED_ACTION_RESULT_LIMIT } from './bounded-action-contracts.mjs';
import {
  ACADEMIC_OUTCOMES, EXPERIMENT_OUTCOME_SCHEMA, unsupportedExperimentOutcome,
} from './experiment-outcomes.mjs';

export const EXTERNAL_CLIENT_RESULT_SCHEMA = 'intent-mcu-external-client-result@1';
export const EXTERNAL_CLIENT_RESULT_LIMIT = BOUNDED_ACTION_RESULT_LIMIT;

export const EXTERNAL_CLIENT_RESULT_CATEGORIES = Object.freeze([
  'success',
  'validation-failure',
  'unsupported',
  'temporarily-busy',
  'timeout',
  'cancelled',
  'test-failure',
  'execution-failure',
]);

const CATEGORY_CODES = Object.freeze({
  success: 'RESULT_SUCCESS',
  'validation-failure': 'RESULT_VALIDATION_FAILURE',
  unsupported: 'RESULT_UNSUPPORTED',
  'temporarily-busy': 'RESULT_TEMPORARILY_BUSY',
  timeout: 'RESULT_TIMEOUT',
  cancelled: 'RESULT_CANCELLED',
  'test-failure': 'RESULT_TEST_FAILURE',
  'execution-failure': 'RESULT_EXECUTION_FAILURE',
});

const VALIDATION_MARKERS = Object.freeze([
  'INVALID', 'SHAPE', 'REJECTED', 'MISMATCH', 'STALE', 'REPLAY', 'REQUIRED',
  'LIMIT', 'REQUEST_ID', 'PROFILE', 'GENERATION', 'TTL', 'NOT_YET_VALID',
  'UNSAVED_CHANGES', 'DUPLICATE_KEY', 'EXPIRED',
]);

const clone = (value) => structuredClone(value);
const safeString = (value) => typeof value === 'string' && value.length <= 160 ? value : null;
const safeGeneration = (value) => Number.isSafeInteger(value) && value >= 1 ? value : null;

function testVerdictFrom(result) {
  const evidence = result?.result?.testEvidence;
  if (result?.executed === true
      && evidence?.schema === 'intent-mcu-bounded-test-evidence@1'
      && ACADEMIC_OUTCOMES.includes(evidence.status)
      && typeof evidence.artifactIdentity === 'string'
      && typeof evidence.sourceIdentity === 'string') {
    return {
      schema: evidence.schema,
      experimentId: safeString(evidence.experimentId),
      scenarioId: safeString(evidence.primaryObservation?.scenarioId),
      status: evidence.status,
      outcome: evidence.outcome?.schema === EXPERIMENT_OUTCOME_SCHEMA
        ? clone(evidence.outcome) : null,
      artifactIdentity: safeString(evidence.artifactIdentity),
      sourceIdentity: safeString(evidence.sourceIdentity),
    };
  }
  const candidate = result?.result?.observation;
  if (result?.executed !== true || result?.result?.code !== 'DOMAIN_TEST_EVALUATED'
      || candidate?.schema !== 'intent-mcu-thermostat-observation-result@1'
      || !ACADEMIC_OUTCOMES.includes(candidate.status)) return null;
  return {
    schema: candidate.schema,
    experimentId: safeString(candidate.experimentId),
    scenarioId: safeString(candidate.scenarioId),
    status: candidate.status,
    outcome: candidate.outcome?.schema === EXPERIMENT_OUTCOME_SCHEMA
      ? clone(candidate.outcome) : null,
    artifactIdentity: null,
    sourceIdentity: null,
  };
}

export function classifyExternalClientResult(result) {
  const verdict = testVerdictFrom(result);
  if (verdict?.status === 'failed') return 'test-failure';
  if (result?.ok === true) return 'success';
  const code = String(result?.code ?? 'EXTERNAL_CLIENT_ACTION_FAILED').toUpperCase();
  if (code === 'ACTION_BUSY' || code.endsWith('_BUSY')) return 'temporarily-busy';
  if (code === 'ACTION_TIMEOUT' || code.endsWith('_TIMEOUT')) return 'timeout';
  if (code === 'ACTION_CANCELLED' || code.endsWith('_CANCELLED')) return 'cancelled';
  if (code.includes('UNSUPPORTED') || code.includes('UNAVAILABLE')) return 'unsupported';
  if (VALIDATION_MARKERS.some((marker) => code.includes(marker))) return 'validation-failure';
  return 'execution-failure';
}

function unsupportedTestVerdict(result, association) {
  const code = String(result?.code ?? '').toUpperCase();
  if (association?.action !== 'test.run' || !code.includes('UNSUPPORTED')) return null;
  return {
    schema: EXPERIMENT_OUTCOME_SCHEMA,
    experimentId: null,
    scenarioId: null,
    status: 'unsupported',
    outcome: unsupportedExperimentOutcome(code),
    artifactIdentity: null,
    sourceIdentity: null,
  };
}

function jobStatusForCategory(category) {
  if (['success', 'test-failure'].includes(category)) return 'completed';
  if (category === 'cancelled') return 'cancelled';
  if (category === 'timeout') return 'timeout';
  if (category === 'execution-failure') return 'infrastructure-error';
  return 'not-started';
}

export function externalClientRequestAssociation(value = {}) {
  return Object.freeze({
    requestId: safeString(value.requestId),
    action: safeString(value.action),
    profile: safeString(value.profile),
    expectedGeneration: safeGeneration(value.expectedGeneration),
  });
}

export function externalClientResult(result, association = {}, sourceIdentity = null) {
  const authoritativeResult = result && typeof result === 'object' && !Array.isArray(result)
    ? clone(result) : { ok: false, code: 'EXTERNAL_CLIENT_RESULT_INVALID', executed: false };
  const request = externalClientRequestAssociation(association);
  const category = classifyExternalClientResult(authoritativeResult);
  const verdict = testVerdictFrom(authoritativeResult)
    ?? unsupportedTestVerdict(authoritativeResult, request);
  const jobStatus = jobStatusForCategory(category);
  const envelope = {
    schema: EXTERNAL_CLIENT_RESULT_SCHEMA,
    ok: category === 'success',
    category,
    jobStatus,
    code: CATEGORY_CODES[category],
    request,
    generation: {
      expected: request.expectedGeneration,
      before: safeGeneration(authoritativeResult.generationBefore),
      after: safeGeneration(authoritativeResult.generationAfter),
    },
    source: {
      transport: 'local-stdio',
      identity: sourceIdentity && typeof sourceIdentity === 'object' ? clone(sourceIdentity) : null,
      schema: safeString(authoritativeResult.schema),
      router: safeString(authoritativeResult.router),
      code: safeString(authoritativeResult.code) ?? 'EXTERNAL_CLIENT_ACTION_FAILED',
      executed: authoritativeResult.executed === true,
    },
    retry: category === 'temporarily-busy'
      ? { recommended: true, afterMs: 250, requiresNewRequestId: true }
      : { recommended: false, afterMs: null, requiresNewRequestId: category === 'timeout' },
    testVerdict: verdict,
    authoritativeResult,
  };
  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > EXTERNAL_CLIENT_RESULT_LIMIT) {
    return externalClientResult({ ok: false, code: 'EXTERNAL_CLIENT_RESULT_LIMIT', executed: false },
      association, sourceIdentity);
  }
  return Object.freeze(envelope);
}
