// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  X26_REGRESSION_MATRIX, createExpectationOverride,
} from '../src/regression-matrix-contract.mjs';
import {
  executeRegressionMatrix, regressionReportPassed,
} from '../src/regression-matrix-runner.mjs';

function successfulExecution(cell) {
  return {
    caseId: cell.caseId, profile: cell.profile, profileVersion: cell.profileVersion,
    fixtureSha256: cell.fixtureSha256, sourceSha256: cell.sourceSha256,
    artifactSha256: cell.sourceSha256, producer: cell.observationOwner,
    actual: structuredClone(cell.expected),
    rawVirtualTime: { timebase: `${cell.profile}.native`, values: [101, 202] },
    durationMilliseconds: 14.5,
  };
}

test('X26 runner selects one or all cells in fixed order and produces deterministic semantics', async () => {
  const visited = [];
  const all = await executeRegressionMatrix({ executeCell: async (cell) => {
    visited.push(cell.caseId); return successfulExecution(cell);
  } });
  assert.deepEqual(visited, X26_REGRESSION_MATRIX.cells.map((cell) => cell.caseId));
  assert.equal(regressionReportPassed(all), true);
  assert.match(all.semanticSha256, /^[0-9a-f]{64}$/u);
  const one = await executeRegressionMatrix({ selector: visited[2], executeCell: async (cell) => successfulExecution(cell) });
  assert.deepEqual(one.results.map((item) => item.caseId), [visited[2]]);
  assert.equal(one.results[0].outcome.jobStatus, 'completed');
});

test('X26 wrong expectation fails academically with completed job and reruns only its cell', async () => {
  const caseId = 'X26-RP2040-GPIO0-UART0';
  const override = await createExpectationOverride(caseId, {
    kind: 'rp2040.gpio-uart', gpio0: false, uartText: 'PICO PUBLIC',
  });
  const visited = [];
  const report = await executeRegressionMatrix({ selector: caseId, expectationOverride: override,
    executeCell: async (cell) => { visited.push(cell.caseId); return successfulExecution(cell); } });
  assert.deepEqual(visited, [caseId]);
  assert.equal(report.results[0].outcome.academicStatus, 'failed');
  assert.equal(report.results[0].outcome.jobStatus, 'completed');
});

test('X26 keeps unsupported, timeout and infrastructure failure distinct from assertion failure', async () => {
  for (const [code, academicStatus, jobStatus] of [
    ['PROFILE_UNSUPPORTED', 'unsupported', 'not-started'],
    ['RUNTIME_TIMEOUT', 'indeterminate', 'timeout'],
    ['BROKER_FAILURE', 'indeterminate', 'infrastructure-error'],
  ]) {
    const report = await executeRegressionMatrix({ selector: 'X26-AVR-THERMOSTAT-D13',
      executeCell: async () => { throw Object.assign(new Error(code), { code }); } });
    assert.equal(report.results[0].outcome.academicStatus, academicStatus);
    assert.equal(report.results[0].outcome.jobStatus, jobStatus);
  }
});

test('X26 rejects cross-profile execution substitution before it can pass', async () => {
  const report = await executeRegressionMatrix({ selector: 'X26-RP2040-GPIO0-UART0', executeCell: async (cell) => ({
    ...successfulExecution(cell), profile: 'board.atmega328p-16mhz-v1',
  }) });
  assert.equal(report.results[0].outcome.academicStatus, 'indeterminate');
  assert.equal(report.results[0].outcome.jobStatus, 'infrastructure-error');
  assert.equal(report.results[0].outcome.reasons[0], 'REGRESSION_EXECUTION_PROFILE_SUBSTITUTION');
});
