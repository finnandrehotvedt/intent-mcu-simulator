// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { completedExperimentOutcome } from '../src/experiment-outcomes.mjs';
import {
  RESET_CLASS_REPORT_SCHEMA, RESET_CLASSES, X31_RESET_CLASS_SUITE,
  evaluateResetClassExecution, resetClassSha256, resetClassSuiteIdentity,
  resetExecutionProjection, semanticResetClassProjection, stableResetStringify,
  validateResetClass, validateResetClassReport, validateResetClassSuite,
} from '../src/reset-class-contract.mjs';
import { executeResetClass } from '../src/reset-class-runner.mjs';

const artifactSha256 = 'a'.repeat(64);
const clone = (value) => structuredClone(value);

async function report() {
  const executions = [];
  for (const resetClass of RESET_CLASSES) for (const repeat of X31_RESET_CLASS_SUITE.repeats) {
    executions.push(executeResetClass({ hex: ':00000001FF', artifactSha256, resetClass, repeat,
      workerGenerationRetired: resetClass === 'power-on' }));
  }
  const classSemanticSha256 = {};
  for (const resetClass of RESET_CLASSES) {
    classSemanticSha256[resetClass] = await resetClassSha256(stableResetStringify(
      resetExecutionProjection(executions.find((item) => item.resetClass === resetClass))));
  }
  const leaked = clone(executions[0]); leaked.after.volatileByte = 0xa5;
  const value = { schema: RESET_CLASS_REPORT_SCHEMA, suiteId: X31_RESET_CLASS_SUITE.suiteId,
    suiteSha256: await resetClassSuiteIdentity(), profile: X31_RESET_CLASS_SUITE.profile,
    sourceSha256: X31_RESET_CLASS_SUITE.fixture.sourceSha256, artifactSha256,
    producer: 'bounded RuntimeKernel fixture', retention: clone(X31_RESET_CLASS_SUITE.retention),
    executions, classSemanticSha256,
    validationProbe: { status: 'rejected-before-execution', code: 'RESET_CLASS_UNKNOWN',
      academicOutcomeCreated: false },
    infrastructureProbe: { status: 'classified-without-execution', code: 'RESET_WORKER_UNAVAILABLE',
      academicOutcomeCreated: false },
    evidenceFailureProbe: { status: 'failed-as-expected', code: 'RESET_MEMORY_LEAK',
      outcome: evaluateResetClassExecution(leaked) },
    limits: clone(X31_RESET_CLASS_SUITE.limits) };
  value.semanticSha256 = await resetClassSha256(stableResetStringify(semanticResetClassProjection(value)));
  return value;
}

test('X31 immutable suite fixes three reset classes and a closed retention table', async () => {
  assert.deepEqual((await validateResetClassSuite()).classes, RESET_CLASSES);
  assert.deepEqual(Object.keys(X31_RESET_CLASS_SUITE.retention), RESET_CLASSES);
  assert.throws(() => validateResetClass('browser-reload'), /RESET_CLASS_UNKNOWN/u);
  await assert.rejects(validateResetClassSuite({ ...clone(X31_RESET_CLASS_SUITE), extra: true }),
    /RESET_CLASS_CONTRACT_DRIFT/u);
});

test('X31 runner clears fixed volatile memory and applies class-specific model/input semantics', () => {
  for (const resetClass of RESET_CLASSES) {
    const execution = executeResetClass({ hex: ':00000001FF', artifactSha256, resetClass, repeat: 'A',
      workerGenerationRetired: resetClass === 'power-on' });
    assert.equal(execution.before.volatileByte, 0xa5);
    assert.equal(execution.after.volatileByte, 0);
    assert.equal(execution.outcome.academicStatus, 'passed');
  }
});

test('X31 report requires repeat parity and keeps validation infrastructure and academic failure distinct', async () => {
  const accepted = await validateResetClassReport(await report());
  assert.equal(accepted.executions.length, 6);
  assert.equal(accepted.validationProbe.academicOutcomeCreated, false);
  assert.equal(accepted.infrastructureProbe.academicOutcomeCreated, false);
  assert.equal(accepted.evidenceFailureProbe.outcome.academicStatus, 'failed');
  const mismatched = await report(); mismatched.executions[1].after.controls.potPosition = 0.74;
  await assert.rejects(validateResetClassReport(mismatched), /RESET_CLASS_EXECUTION_INVALID/u);
});

test('X31 missing producer evidence is indeterminate and never an academic failure or pass', () => {
  const outcome = evaluateResetClassExecution({ resetClass: 'cpu-reset' });
  assert.deepEqual(outcome, completedExperimentOutcome({ evidence: [
    { code: 'RESET_CLASS_EVIDENCE_COMPLETE', complete: false },
  ] }));
  assert.equal(outcome.academicStatus, 'indeterminate');
  assert.equal(outcome.jobStatus, 'completed');
});
