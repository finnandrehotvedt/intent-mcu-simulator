// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACADEMIC_OUTCOMES, EXPERIMENT_JOB_STATUSES, aggregateExperimentOutcomes,
  completedExperimentOutcome, interruptedExperimentOutcome, unsupportedExperimentOutcome,
} from '../src/experiment-outcomes.mjs';

const observation = (scenarioId, outcome) => ({ scenarioId, status: outcome.academicStatus, outcome });

test('X18 keeps the four academic outcomes disjoint from job lifecycle', () => {
  const passed = completedExperimentOutcome({ evidence: [{ code: 'MISSING', complete: true }],
    assertions: [{ code: 'MISMATCH', passed: true }] });
  const failed = completedExperimentOutcome({ evidence: [{ code: 'MISSING', complete: true }],
    assertions: [{ code: 'MISMATCH', passed: false }] });
  const indeterminate = completedExperimentOutcome({ evidence: [{ code: 'MISSING', complete: false }],
    assertions: [{ code: 'MISMATCH', passed: false }] });
  const unsupported = unsupportedExperimentOutcome('PROFILE_UNSUPPORTED');
  assert.deepEqual([passed, failed, indeterminate, unsupported].map((item) => item.academicStatus),
    ACADEMIC_OUTCOMES);
  assert.equal(failed.jobStatus, 'completed');
  assert.equal(indeterminate.jobStatus, 'completed');
  assert.equal(unsupported.jobStatus, 'not-started');
  assert.deepEqual(EXPERIMENT_JOB_STATUSES,
    ['completed', 'not-started', 'cancelled', 'timeout', 'infrastructure-error']);
});

test('X18 cancellation timeout and infrastructure errors cannot become academic pass or fail', () => {
  for (const [job, code] of [
    ['cancelled', 'ACTION_CANCELLED'], ['timeout', 'ACTION_TIMEOUT'],
    ['infrastructure-error', 'COMPILER_CONNECTION_FAILED'],
  ]) {
    const outcome = interruptedExperimentOutcome(job, code);
    assert.equal(outcome.academicStatus, 'indeterminate');
    assert.equal(outcome.jobStatus, job);
    assert.equal(outcome.evidenceStatus, 'incomplete');
  }
});

test('X18 aggregate prioritizes failed assertions, then incomplete evidence, then unsupported', () => {
  const pass = completedExperimentOutcome({ assertions: [{ code: 'A', passed: true }] });
  const fail = completedExperimentOutcome({ assertions: [{ code: 'A', passed: false }] });
  const unknown = completedExperimentOutcome({ evidence: [{ code: 'E', complete: false }] });
  const unsupported = unsupportedExperimentOutcome();
  assert.equal(aggregateExperimentOutcomes([observation('S1', pass)]).academicStatus, 'passed');
  assert.equal(aggregateExperimentOutcomes([observation('S1', pass), observation('S2', fail)]).academicStatus, 'failed');
  assert.equal(aggregateExperimentOutcomes([observation('S1', pass), observation('S2', unknown)]).academicStatus, 'indeterminate');
  assert.equal(aggregateExperimentOutcomes([observation('S1', unsupported)]).academicStatus, 'unsupported');
});
