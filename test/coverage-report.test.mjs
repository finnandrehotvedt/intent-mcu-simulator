// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { X26_REGRESSION_MATRIX, createExpectationOverride } from '../src/regression-matrix-contract.mjs';
import { executeRegressionMatrix } from '../src/regression-matrix-runner.mjs';
import {
  COVERAGE_REPORT_SCHEMA, X27_PARTITIONS, createPartitionEvidence,
  projectCoverageReport, validateCoverageReport,
} from '../src/coverage-report.mjs';

const successful = (cell) => ({
  caseId: cell.caseId, profile: cell.profile, profileVersion: cell.profileVersion,
  fixtureSha256: cell.fixtureSha256, sourceSha256: cell.sourceSha256,
  artifactSha256: 'a'.repeat(64), producer: cell.observationOwner, actual: structuredClone(cell.expected),
  rawVirtualTime: { timebase: `${cell.caseId}-native`, values: [1] }, durationMilliseconds: 9,
});

async function acceptedFixture() {
  const executions = new Map();
  const regressionReport = await executeRegressionMatrix({ executeCell: async (cell) => {
    const execution = successful(cell); executions.set(cell.caseId, execution); return execution;
  } });
  const partitionEvidence = await Promise.all(X26_REGRESSION_MATRIX.cells.map(async (cell) => {
    const partitions = X27_PARTITIONS.filter((item) => item.caseId === cell.caseId)
      .map((item) => ({ partitionId: item.partitionId, complete: true, passed: true, observed: { level: true, id: item.partitionId } }));
    return createPartitionEvidence(executions.get(cell.caseId), partitions);
  }));
  return { regressionReport, partitionEvidence };
}

test('X27 projects seven explicit partitions across four profiles and one requirement family', async () => {
  const fixture = await acceptedFixture();
  const report = await projectCoverageReport(fixture);
  assert.equal(report.schema, COVERAGE_REPORT_SCHEMA);
  assert.deepEqual(report.requirementFamily, {
    id: 'REQ-EDITED-SOURCE-OUTPUT-OBSERVATION', declaredPartitions: 7, profiles: 4,
  });
  assert.deepEqual(report.counts, {
    declared: 7, supported: 7, executed: 7, passed: 7, failed: 0,
    notRun: 0, unsupported: 0, indeterminate: 0, infrastructureError: 0,
  });
  assert.equal(report.instructionCoverage, 'unavailable');
  assert.equal(report.physicalBehaviourCoverage, 'not-claimed');
  assert.equal(report.rows[0].academicOutcome, 'passed');
  assert.equal(report.rows[0].jobOutcome, 'completed');
  assert.equal(report.rows[0].exercisedPartitions.length, 4);
  assert.match(report.semanticSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(await validateCoverageReport(report, fixture.regressionReport), report);
});

test('X27 never infers four AVR partitions from its aggregate summary', async () => {
  const fixture = await acceptedFixture();
  fixture.partitionEvidence = fixture.partitionEvidence.filter((item) => item.caseId !== 'X26-AVR-THERMOSTAT-D13');
  const report = await projectCoverageReport(fixture);
  const avr = report.rows[0];
  assert.equal(avr.partitions.length, 4);
  assert.ok(avr.partitions.every((item) => item.status === 'indeterminate'));
  assert.equal(report.counts.declared, 7);
  assert.equal(report.counts.executed, 3);
  assert.equal(report.counts.indeterminate, 4);
});

test('X27 wrong RP2040 expectation is one executed failure while the job completes', async () => {
  const caseId = 'X26-RP2040-GPIO0-UART0';
  const execution = successful(X26_REGRESSION_MATRIX.cells[1]);
  const override = await createExpectationOverride(caseId, {
    kind: 'rp2040.gpio-uart', gpio0: false, uartText: 'PICO PUBLIC',
  });
  const regressionReport = await executeRegressionMatrix({ selector: caseId, expectationOverride: override,
    executeCell: async () => execution });
  const partitionEvidence = [await createPartitionEvidence(execution, [{
    partitionId: 'rp2040-default-gpio0-high-uart0-v1', complete: true, passed: true,
    observed: execution.actual,
  }])];
  const report = await projectCoverageReport({ regressionReport, partitionEvidence });
  assert.equal(regressionReport.results[0].outcome.jobStatus, 'completed');
  assert.equal(report.counts.executed, 1);
  assert.equal(report.counts.passed, 0);
  assert.equal(report.counts.failed, 1);
  assert.equal(report.counts.notRun, 6);
});

test('X27 rejects stale, duplicate and unknown evidence and keeps failure classes disjoint', async () => {
  const fixture = await acceptedFixture();
  const stale = structuredClone(fixture.partitionEvidence);
  stale[0].artifactSha256 = 'b'.repeat(64);
  await assert.rejects(projectCoverageReport({ regressionReport: fixture.regressionReport, partitionEvidence: stale }), /STALE_OR_UNKNOWN/u);
  const staleReport = structuredClone(fixture.regressionReport); staleReport.results[0].sourceSha256 = 'b'.repeat(64);
  await assert.rejects(projectCoverageReport({ regressionReport: staleReport, partitionEvidence: fixture.partitionEvidence }), /STALE_OR_UNKNOWN/u);
  const valid = await projectCoverageReport(fixture); const unknown = structuredClone(valid); unknown.unapproved = true;
  await assert.rejects(validateCoverageReport(unknown, fixture.regressionReport), /STALE_OR_UNKNOWN/u);
  await assert.rejects(projectCoverageReport({ regressionReport: fixture.regressionReport,
    partitionEvidence: [...fixture.partitionEvidence, fixture.partitionEvidence[0]] }), /STALE_OR_UNKNOWN/u);

  for (const [code, field] of [['PROFILE_UNSUPPORTED', 'unsupported'], ['RUNTIME_TIMEOUT', 'indeterminate'], ['BROKER_FAILURE', 'infrastructureError']]) {
    const regressionReport = await executeRegressionMatrix({ selector: 'X26-AVR-THERMOSTAT-D13',
      executeCell: async () => { throw Object.assign(new Error(code), { code }); } });
    const report = await projectCoverageReport({ regressionReport, partitionEvidence: [] });
    assert.equal(report.counts[field], 4);
    assert.equal(report.counts.executed, 0);
  }
});

test('X27 semantic identity excludes raw native timebase labels but retains evidence identity', async () => {
  const fixture = await acceptedFixture();
  const first = await projectCoverageReport(fixture);
  const changed = structuredClone(fixture);
  for (const result of changed.regressionReport.results) result.rawVirtualTime.timebase += '-later';
  for (const evidence of changed.partitionEvidence) evidence.timebase += '-later';
  const second = await projectCoverageReport(changed);
  assert.equal(first.semanticSha256, second.semanticSha256);
});
