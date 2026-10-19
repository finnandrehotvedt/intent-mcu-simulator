// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  UNSUPPORTED_ACCESS_REPORT_SCHEMA, X32_UNSUPPORTED_ACCESS_SUITE,
  evaluateUnsupportedAccessExecution, semanticUnsupportedAccessProjection,
  stableUnsupportedAccessStringify, unsupportedAccessExecutionProjection,
  unsupportedAccessReportPassed, unsupportedAccessSha256, unsupportedAccessSuiteIdentity,
  validateUnsupportedAccessDetector, validateUnsupportedAccessReport,
  validateUnsupportedAccessSuite,
} from '../src/unsupported-access-contract.mjs';
import {
  goodCompanionFromWorker, unsupportedAccessExecutionFromWorker,
} from '../src/unsupported-access-runner.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const ARTIFACT = '7beb4671705455ceb4dd3376c23a6ff597bffaca4365df683ff7447149248a78';
const GOOD_ARTIFACT = '66c26627b06bc53779aba5ada03a6255965a4d9a5a02e600ce1086a73daed9d5';
const workerMessage = () => ({ kind: 'stopped-error', cycle: 225, instructions: 152,
  unsupported: [{ peripheral: 'SPI', address: 0x4c, value: 0x40, cycle: 224 }],
  trace: [{ pin: 13, level: true, cycle: 220 }] });

const classifications = (execution) => ({
  compiler: { status: 'rejected-before-runtime', code: 'COMPILE_FAILED', artifactCreated: false,
    academicOutcomeCreated: false },
  validation: { status: 'rejected-before-execution', code: 'UNSUPPORTED_ACCESS_DETECTOR_UNKNOWN',
    academicOutcomeCreated: false },
  runtimeCapability: { status: 'stopped-unsupported', code: 'RUNTIME_CAPABILITY_UNSUPPORTED',
    academicStatus: 'unsupported' },
  infrastructure: { status: 'classified-without-execution',
    code: 'UNSUPPORTED_ACCESS_WORKER_UNAVAILABLE', academicOutcomeCreated: false },
  academic: { status: 'indeterminate-as-expected', code: 'UNSUPPORTED_ACCESS_EVIDENCE_MISSING',
    outcome: evaluateUnsupportedAccessExecution({ ...execution, access: null }) },
});

async function validReport() {
  const executions = ['A', 'B'].map((repeat) => unsupportedAccessExecutionFromWorker({
    message: workerMessage(), artifactSha256: ARTIFACT, repeat,
    blockedReplayNoAdvance: true, postFaultAcceptedRecords: 0,
  }));
  const repeatSemanticSha256 = await unsupportedAccessSha256(stableUnsupportedAccessStringify(
    unsupportedAccessExecutionProjection(executions[0])));
  const report = {
    schema: UNSUPPORTED_ACCESS_REPORT_SCHEMA, suiteId: X32_UNSUPPORTED_ACCESS_SUITE.suiteId,
    suiteSha256: await unsupportedAccessSuiteIdentity(), profile: X32_UNSUPPORTED_ACCESS_SUITE.profile,
    sourceSha256: X32_UNSUPPORTED_ACCESS_SUITE.fixture.sourceSha256,
    artifactSha256: ARTIFACT, projectSha256: X32_UNSUPPORTED_ACCESS_SUITE.fixture.projectSha256,
    producer: 'actual simulator.worker/RuntimeKernel/avr8js unsupported-register monitor',
    detector: structuredClone(X32_UNSUPPORTED_ACCESS_SUITE.detector),
    affectedRequirement: structuredClone(X32_UNSUPPORTED_ACCESS_SUITE.affectedRequirement),
    executions, repeatSemanticSha256,
    goodCompanion: { sourceSha256: X32_UNSUPPORTED_ACCESS_SUITE.fixture.goodSourceSha256,
      artifactSha256: GOOD_ARTIFACT, status: 'completed-supported', unsupportedRecords: 0,
      supportedObservation: true },
    classifications: classifications(executions[0]),
    staleRecordProbe: { status: 'rejected-atomically',
      code: 'UNSUPPORTED_ACCESS_REPORT_STALE_OR_UNKNOWN', priorReportRetained: true },
    limits: structuredClone(X32_UNSUPPORTED_ACCESS_SUITE.limits), semanticSha256: '',
  };
  report.semanticSha256 = await unsupportedAccessSha256(stableUnsupportedAccessStringify(
    semanticUnsupportedAccessProjection(report)));
  return report;
}

test('X32 exact suite is checksum-bound to one AVR SPI access and closed limits', async () => {
  const suite = await validateUnsupportedAccessSuite();
  assert.equal(suite.detector.address, 0x4c);
  assert.equal(suite.detector.value, 0x40);
  assert.equal(suite.affectedRequirement.expectedStatus, 'unsupported');
  assert.equal(suite.limits.exhaustiveRegisterCoverage, false);
  assert.match(await unsupportedAccessSuiteIdentity(), /^[0-9a-f]{64}$/u);
  assert.throws(() => validateUnsupportedAccessDetector('avr-unknown'),
    /UNSUPPORTED_ACCESS_DETECTOR_UNKNOWN/u);
  await assert.rejects(validateUnsupportedAccessSuite({ ...suite, extra: true }),
    /UNSUPPORTED_ACCESS_CONTRACT_DRIFT/u);
});

test('X32 shared runner projects producer access and evaluator never makes it falsely green', () => {
  const execution = unsupportedAccessExecutionFromWorker({ message: workerMessage(),
    artifactSha256: ARTIFACT, repeat: 'A', blockedReplayNoAdvance: true });
  assert.equal(execution.access.address, 0x4c);
  assert.equal(execution.access.value, 0x40);
  assert.equal(execution.access.cycle, 224);
  assert.equal(execution.access.instructionOrdinal, 152);
  assert.equal(execution.lastSupportedObservation.cycle, 220);
  assert.equal(execution.outcome.academicStatus, 'unsupported');
  const missing = evaluateUnsupportedAccessExecution({ ...execution, access: null });
  assert.equal(missing.academicStatus, 'indeterminate');
  assert.notEqual(missing.academicStatus, 'passed');
  assert.notEqual(missing.academicStatus, 'failed');
});

test('X32 good companion stays separate and has no unsupported record', () => {
  const companion = goodCompanionFromWorker({ artifactSha256: GOOD_ARTIFACT,
    message: { kind: 'status', cycle: 19_915, unsupported: [],
      trace: [{ pin: 13, level: true, cycle: 220 }] } });
  assert.deepEqual(companion, { sourceSha256: X32_UNSUPPORTED_ACCESS_SUITE.fixture.goodSourceSha256,
    artifactSha256: GOOD_ARTIFACT, status: 'completed-supported', unsupportedRecords: 0,
    supportedObservation: true });
});

test('X32 strict report accepts two semantic repeats and atomically rejects stale or extra records', async () => {
  const report = await validReport();
  assert.deepEqual(await validateUnsupportedAccessReport(report), report);
  assert.equal(unsupportedAccessReportPassed(report), true);
  await assert.rejects(validateUnsupportedAccessReport({ ...report,
    sourceSha256: '0'.repeat(64) }), /UNSUPPORTED_ACCESS_REPORT_STALE_OR_UNKNOWN/u);
  await assert.rejects(validateUnsupportedAccessReport({ ...report,
    extra: true }), /UNSUPPORTED_ACCESS_REPORT_STALE_OR_UNKNOWN/u);
  const wrongRepeat = structuredClone(report); wrongRepeat.executions[1].access.cycle += 1;
  await assert.rejects(validateUnsupportedAccessReport(wrongRepeat),
    /UNSUPPORTED_ACCESS_EXECUTION_INVALID|UNSUPPORTED_ACCESS_REPEAT_SEMANTIC_MISMATCH/u);
});

test('X32 compiler, validation, capability, infrastructure and academic states remain distinct', async () => {
  const { classifications: value } = await validReport();
  assert.equal(value.compiler.status, 'rejected-before-runtime');
  assert.equal(value.validation.status, 'rejected-before-execution');
  assert.equal(value.runtimeCapability.status, 'stopped-unsupported');
  assert.equal(value.infrastructure.status, 'classified-without-execution');
  assert.equal(value.academic.outcome.academicStatus, 'indeterminate');
  assert.equal(value.compiler.academicOutcomeCreated, false);
  assert.equal(value.validation.academicOutcomeCreated, false);
  assert.equal(value.infrastructure.academicOutcomeCreated, false);
});
