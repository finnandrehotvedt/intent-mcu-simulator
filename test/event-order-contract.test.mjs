// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { completedExperimentOutcome } from '../src/experiment-outcomes.mjs';
import {
  EVENT_ORDER_PHASES,
  EVENT_ORDER_REPORT_SCHEMA,
  X30_EVENT_ORDER_SUITE,
  evaluateEventOrderPhases,
  eventOrderExecutionProjection,
  eventOrderReportPassed,
  eventOrderSha256,
  eventOrderSuiteIdentity,
  semanticEventOrderProjection,
  stableEventOrderStringify,
  validateEventOrderPlan,
  validateEventOrderReport,
  validateEventOrderSuite,
} from '../src/event-order-contract.mjs';

const clone = (value) => structuredClone(value);

function producer({ cycle = 0, instructions = 0, controls = { potPosition: 0.5, buttonPressed: false },
  inputLog = [], pending = [], d13 = false, d13HighCycle = null, uartMarkerCycle = null } = {}) {
  return { cpuCycles: cycle, instructions, paused: true, pending, inputLog, controls,
    d13, d13HighCycle, uartMarkerCycle };
}

function phases() {
  const inputs = X30_EVENT_ORDER_SUITE.plan.inputs.map((entry) => ({
    sequence: entry.ordinal, targetCycle: entry.targetCycle, componentId: entry.componentId,
    key: entry.key, value: entry.value,
  }));
  const reset = producer();
  const applied = producer({ controls: { potPosition: 0.75, buttonPressed: true }, inputLog: inputs });
  const executed = producer({ cycle: 1_700_000, instructions: 1_020_000,
    controls: { potPosition: 0.75, buttonPressed: true }, inputLog: inputs,
    d13: true, d13HighCycle: 1_608_631, uartMarkerCycle: 1_608_795 });
  return [reset, applied, clone(applied), executed, clone(executed)].map((value, index) => ({
    epochId: X30_EVENT_ORDER_SUITE.plan.epochId,
    phase: EVENT_ORDER_PHASES[index], phaseOrdinal: index + 1,
    snapshotKind: ['reset', 'control-boundary', 'sample', 'paused', 'sample'][index], producer: value,
  }));
}

async function report() {
  const outcome = evaluateEventOrderPhases(phases());
  const execution = (executionId, wallDurationMilliseconds) => ({ executionId,
    ready: { cpuCycles: 0, instructions: 0 },
    preReset: { targetCycle: 1_000_000, queuedSequence: 1, pendingBeforeReset: 1,
      runningCycleBeforeReset: 32_000, resetCleared: true, generationRetired: true },
    phases: phases(), outcome, diagnostics: { wallDurationMilliseconds } });
  const executions = [execution('X30-REPEAT-A', 300), execution('X30-REPEAT-B', 500)];
  const repeatSemanticSha256 = await eventOrderSha256(stableEventOrderStringify(
    eventOrderExecutionProjection(executions[0]),
  ));
  const leaked = phases(); leaked[0].producer.pending.push({ targetCycle: 1_000_000 });
  const value = {
    schema: EVENT_ORDER_REPORT_SCHEMA, suiteId: X30_EVENT_ORDER_SUITE.suiteId,
    suiteSha256: await eventOrderSuiteIdentity(), profile: X30_EVENT_ORDER_SUITE.profile,
    sourceSha256: X30_EVENT_ORDER_SUITE.fixture.sourceSha256,
    artifactSha256: 'a'.repeat(64), producer: 'test producer', executions, repeatSemanticSha256,
    validationProbe: { status: 'rejected-before-execution', code: 'EVENT_ORDER_ORDINAL_SEQUENCE',
      academicOutcomeCreated: false },
    evidenceFailureProbe: { status: 'failed-as-expected', code: 'EVENT_ORDER_OLD_PENDING_LEAK',
      outcome: evaluateEventOrderPhases(leaked) },
    limits: clone(X30_EVENT_ORDER_SUITE.limits),
  };
  value.semanticSha256 = await eventOrderSha256(stableEventOrderStringify(semanticEventOrderProjection(value)));
  return value;
}

test('X30 immutable contract fixes reset, input, sample and execution phase order', async () => {
  assert.deepEqual((await validateEventOrderSuite()).phases, EVENT_ORDER_PHASES);
  assert.match(await eventOrderSuiteIdentity(), /^[0-9a-f]{64}$/u);
  assert.deepEqual(validateEventOrderPlan(X30_EVENT_ORDER_SUITE.plan), X30_EVENT_ORDER_SUITE.plan);
});

test('X30 plan validation rejects missing order, same-slot conflict and wall ordering separately', () => {
  const reversed = clone(X30_EVENT_ORDER_SUITE.plan); reversed.inputs[0].ordinal = 2;
  assert.throws(() => validateEventOrderPlan(reversed), /EVENT_ORDER_ORDINAL_SEQUENCE/u);
  const conflict = clone(X30_EVENT_ORDER_SUITE.plan);
  conflict.inputs[1] = { ...conflict.inputs[0], ordinal: 2, value: 0.25 };
  assert.throws(() => validateEventOrderPlan(conflict), /EVENT_ORDER_INPUT_SLOT_CONFLICT/u);
  assert.throws(() => validateEventOrderPlan({ ...clone(X30_EVENT_ORDER_SUITE.plan), wallMilliseconds: 5 }),
    /EVENT_ORDER_WALL_FIELD_FORBIDDEN/u);
});

test('X30 evaluator keeps validation rejection distinct from producer evidence failure', () => {
  assert.equal(evaluateEventOrderPhases(phases()).academicStatus, 'passed');
  const leaked = phases(); leaked[0].producer.pending.push({ targetCycle: 1_000_000 });
  const outcome = evaluateEventOrderPhases(leaked);
  assert.equal(outcome.academicStatus, 'failed');
  assert.equal(outcome.jobStatus, 'completed');
  assert.deepEqual(outcome.reasons, ['EVENT_ORDER_OLD_PENDING_RETIRED']);
});

test('X30 report accepts repeat semantic parity while excluding wall diagnostics', async () => {
  const value = await report();
  assert.equal(eventOrderReportPassed(await validateEventOrderReport(value)), true);
  const changedWall = clone(value); changedWall.executions[0].diagnostics.wallDurationMilliseconds = 999;
  changedWall.semanticSha256 = await eventOrderSha256(stableEventOrderStringify(semanticEventOrderProjection(changedWall)));
  assert.equal(changedWall.semanticSha256, value.semanticSha256);
  assert.equal(eventOrderReportPassed(await validateEventOrderReport(changedWall)), true);
});

test('X30 report rejects a sample that advances or applies state', async () => {
  const value = await report();
  value.executions[0].phases[2].producer.cpuCycles = 1;
  value.executions[0].outcome = completedExperimentOutcome({ assertions: [
    { code: 'EVENT_ORDER_PRE_SAMPLE_READ_ONLY', passed: false },
  ] });
  await assert.rejects(validateEventOrderReport(value), /EVENT_ORDER_REPORT_EXECUTION_INVALID/u);
});

