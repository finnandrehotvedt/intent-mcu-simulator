// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { completedExperimentOutcome } from '../src/experiment-outcomes.mjs';
import {
  TIME_REPORT_SCHEMA, X29_TIME_SUITE, semanticTimeProjection, stableTimeStringify,
  timeReportPassed, timeSha256, timeSuiteIdentity, validateTimeReport,
  validateTimeRequirement, validateTimeSuite, virtualNanoseconds,
} from '../src/time-invariance-contract.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const clone = (value) => structuredClone(value);
const outcome = () => completedExperimentOutcome({ evidence: [
  { code: 'TIME_D13_UART_PRODUCER_EVIDENCE', complete: true },
], assertions: [
  { code: 'TIME_VIRTUAL_REQUIREMENT_SATISFIED', passed: true },
] });

async function reportFixture() {
  const pauseSnapshot = { cpuCycles: 400000, instructions: 250000,
    virtualNanoseconds: virtualNanoseconds(400000), pendingTarget: 1600000 };
  const executions = X29_TIME_SUITE.executions.map((spec, index) => ({
    executionId: spec.executionId, pacing: spec.pacing,
    ready: { cpuCycles: 0, instructions: 0, virtualNanoseconds: 0 },
    requirement: clone(X29_TIME_SUITE.requirement),
    actual: { eventLoggedTarget: 1600000, d13HighCycle: 1600100, uartMarkerCycle: 1600200,
      finalD13: true, finalCpuCycles: 1800000 + index, finalInstructions: 1100000 + index,
      finalVirtualNanoseconds: virtualNanoseconds(1800000 + index),
      pauseProbe: spec.pause ? { before: pauseSnapshot, after: clone(pauseSnapshot), wallWaitMilliseconds: 175,
        requirementSatisfiedBeforeWait: false, requirementSatisfiedAfterWait: false } : null },
    outcome: outcome(),
    diagnostics: { wallDurationMilliseconds: 20 + index * 90, measuredCyclesPerSecond: 8000000 - index },
  }));
  const report = { schema: TIME_REPORT_SCHEMA, suiteId: X29_TIME_SUITE.suiteId,
    suiteSha256: await timeSuiteIdentity(), profile: X29_TIME_SUITE.profile,
    sourceSha256: X29_TIME_SUITE.fixture.sourceSha256, artifactSha256: 'a'.repeat(64),
    producer: 'existing browser simulator.worker/RuntimeKernel/avr8js 0.21.1', executions,
    validationProbe: { status: 'rejected-before-execution', code: 'TIME_CONTRACT_WALL_REQUIREMENT_FORBIDDEN',
      academicOutcomeCreated: false }, limits: clone(X29_TIME_SUITE.limits) };
  report.semanticSha256 = await timeSha256(stableTimeStringify(semanticTimeProjection(report)));
  return report;
}

test('X29 pins one AVR clock contract and exactly three pacing executions', async () => {
  const suite = await validateTimeSuite();
  assert.equal(suite.clock.cpuCyclesPerSecond, 16000000);
  assert.deepEqual(suite.executions.map((entry) => entry.executionId),
    ['X29-REFERENCE-1X', 'X29-MAXIMUM', 'X29-PAUSE-RESUME']);
  assert.deepEqual(suite.executions.map((entry) => entry.pacing), [1, 'maximum', 1]);
  assert.equal(virtualNanoseconds(1600000), 100000000);
});

test('X29 rejects wall-clock requirements before execution without an academic outcome', () => {
  const invalid = { ...clone(X29_TIME_SUITE.requirement), wallMilliseconds: 150 };
  assert.throws(() => validateTimeRequirement(invalid), { code: 'TIME_CONTRACT_WALL_REQUIREMENT_FORBIDDEN' });
});

test('X29 report keeps wall diagnostics outside semantic identity', async () => {
  const report = await reportFixture();
  assert.equal(timeReportPassed(await validateTimeReport(report)), true);
  const changed = clone(report);
  changed.executions[0].diagnostics.wallDurationMilliseconds = 99999;
  changed.executions[1].diagnostics.measuredCyclesPerSecond = 1;
  assert.equal(await timeSha256(stableTimeStringify(semanticTimeProjection(changed))), report.semanticSha256);
  await validateTimeReport(changed);
});

test('X29 rejects producer-time drift and virtual progress during Pause', async () => {
  const drift = await reportFixture();
  drift.executions[0].actual.d13HighCycle = 2500000;
  await assert.rejects(validateTimeReport(drift), { code: 'TIME_REPORT_EXECUTION_INVALID' });
  const pauseDrift = await reportFixture();
  pauseDrift.executions[2].actual.pauseProbe.after.cpuCycles += 1;
  await assert.rejects(validateTimeReport(pauseDrift), { code: 'TIME_REPORT_PAUSE_INVALID' });
});
