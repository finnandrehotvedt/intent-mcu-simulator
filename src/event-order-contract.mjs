// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { completedExperimentOutcome } from './experiment-outcomes.mjs';
import { X29_FIXTURE_SOURCE } from './time-invariance-contract.mjs';

export const EVENT_ORDER_CONTRACT_SCHEMA = 'intent-mcu-event-order-contract@1';
export const EVENT_ORDER_REPORT_SCHEMA = 'intent-mcu-event-order-report@1';
export const X30_SUITE_ID = 'x30-avr-epoch-order-v1';
export const EVENT_ORDER_PHASES = Object.freeze([
  'RESET_BARRIER',
  'INPUT_ORDINAL_ASC',
  'PRE_EXECUTION_SAMPLE',
  'CPU_EXECUTION',
  'FINAL_SAMPLE',
]);

const SUITE = {
  schema: EVENT_ORDER_CONTRACT_SCHEMA,
  suiteId: X30_SUITE_ID,
  suiteVersion: '1.0.0',
  profile: 'board.atmega328p-16mhz-v1',
  clock: { cpuCyclesPerSecond: 16_000_000, targetUnit: 'cpu-cycle' },
  fixture: {
    id: 'x30-avr-epoch-order-fixture-v1',
    sourceSha256: '9d1730ec4ed1a0dbf23ac6638ba8ba99264dfb8041e222bca4d240345978c76d',
  },
  plan: {
    epochId: 'X30-EPOCH-1',
    preReset: { componentId: 'pot-1', key: 'position', value: 0.9, targetCycle: 1_000_000 },
    inputs: [
      { ordinal: 1, componentId: 'pot-1', key: 'position', value: 0.75, targetCycle: 0 },
      { ordinal: 2, componentId: 'button-1', key: 'pressed', value: true, targetCycle: 0 },
    ],
    execution: {
      minimumFinalCycle: 1_600_000,
      maximumFinalCycle: 2_400_000,
      expectedD13: true,
      uartMarker: 'X29 EVENT',
    },
  },
  repeats: ['X30-REPEAT-A', 'X30-REPEAT-B'],
  phases: [...EVENT_ORDER_PHASES],
  limits: {
    controller: 'ATmega328P only',
    pausedEpochBoundaryOnly: true,
    asynchronousRunningResetClaimed: false,
    interruptPeripheralTieClaimed: false,
    crossProfileOrderClaimed: false,
    physicalSamplingClaimed: false,
  },
};

const clone = (value) => structuredClone(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const hashPattern = /^[0-9a-f]{64}$/u;

export function stableEventOrderStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableEventOrderStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableEventOrderStringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function eventOrderSha256(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export const X30_EVENT_ORDER_SUITE = Object.freeze(SUITE);

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

export function validateEventOrderPlan(value) {
  if (!exactKeys(value, ['epochId', 'preReset', 'inputs', 'execution'])) {
    const wallKey = value && typeof value === 'object'
      && Object.keys(value).some((key) => /wall|latency|throughput/iu.test(key));
    reject(wallKey ? 'EVENT_ORDER_WALL_FIELD_FORBIDDEN' : 'EVENT_ORDER_PLAN_SHAPE');
  }
  if (value.epochId !== 'X30-EPOCH-1'
      || !exactKeys(value.preReset, ['componentId', 'key', 'value', 'targetCycle'])
      || !Array.isArray(value.inputs) || value.inputs.length !== 2
      || !exactKeys(value.execution, ['minimumFinalCycle', 'maximumFinalCycle', 'expectedD13', 'uartMarker'])) {
    reject('EVENT_ORDER_PLAN_SHAPE');
  }
  const slots = new Set();
  for (const [index, input] of value.inputs.entries()) {
    if (!exactKeys(input, ['ordinal', 'componentId', 'key', 'value', 'targetCycle'])
        || input.ordinal !== index + 1 || input.targetCycle !== 0) reject('EVENT_ORDER_ORDINAL_SEQUENCE');
    const slot = `${input.targetCycle}:${input.componentId}:${input.key}`;
    if (slots.has(slot)) reject('EVENT_ORDER_INPUT_SLOT_CONFLICT');
    slots.add(slot);
  }
  if (value.inputs[0].componentId !== 'pot-1' || value.inputs[0].key !== 'position'
      || value.inputs[0].value !== 0.75 || value.inputs[1].componentId !== 'button-1'
      || value.inputs[1].key !== 'pressed' || value.inputs[1].value !== true
      || value.preReset.componentId !== 'pot-1' || value.preReset.key !== 'position'
      || value.preReset.value !== 0.9 || value.preReset.targetCycle !== 1_000_000
      || value.execution.minimumFinalCycle !== 1_600_000 || value.execution.maximumFinalCycle !== 2_400_000
      || value.execution.expectedD13 !== true || value.execution.uartMarker !== 'X29 EVENT') {
    reject('EVENT_ORDER_PLAN_DRIFT');
  }
  return clone(value);
}

export async function validateEventOrderSuite(value = X30_EVENT_ORDER_SUITE) {
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteVersion', 'profile', 'clock', 'fixture',
    'plan', 'repeats', 'phases', 'limits'])
      || stableEventOrderStringify(value) !== stableEventOrderStringify(X30_EVENT_ORDER_SUITE)
      || value.schema !== EVENT_ORDER_CONTRACT_SCHEMA || value.suiteId !== X30_SUITE_ID
      || value.profile !== 'board.atmega328p-16mhz-v1'
      || value.clock.cpuCyclesPerSecond !== 16_000_000 || value.clock.targetUnit !== 'cpu-cycle'
      || !hashPattern.test(value.fixture.sourceSha256)
      || JSON.stringify(value.repeats) !== JSON.stringify(['X30-REPEAT-A', 'X30-REPEAT-B'])
      || JSON.stringify(value.phases) !== JSON.stringify(EVENT_ORDER_PHASES)) reject('EVENT_ORDER_CONTRACT_DRIFT');
  if (await eventOrderSha256(X29_FIXTURE_SOURCE) !== value.fixture.sourceSha256) reject('EVENT_ORDER_FIXTURE_HASH_STALE');
  validateEventOrderPlan(value.plan);
  return clone(value);
}

export async function eventOrderSuiteIdentity(suite = X30_EVENT_ORDER_SUITE) {
  await validateEventOrderSuite(suite);
  return eventOrderSha256(stableEventOrderStringify(suite));
}

function validInputLog(value) {
  return Array.isArray(value) && value.every((entry) => exactKeys(entry,
    ['sequence', 'targetCycle', 'componentId', 'key', 'value'])
    && Number.isSafeInteger(entry.sequence) && entry.sequence > 0
    && Number.isSafeInteger(entry.targetCycle) && entry.targetCycle >= 0
    && typeof entry.componentId === 'string' && typeof entry.key === 'string');
}

function validProducer(value) {
  return exactKeys(value, ['cpuCycles', 'instructions', 'paused', 'pending', 'inputLog',
    'controls', 'd13', 'd13HighCycle', 'uartMarkerCycle'])
    && Number.isSafeInteger(value.cpuCycles) && value.cpuCycles >= 0
    && Number.isSafeInteger(value.instructions) && value.instructions >= 0
    && typeof value.paused === 'boolean' && Array.isArray(value.pending)
    && validInputLog(value.inputLog)
    && exactKeys(value.controls, ['potPosition', 'buttonPressed'])
    && typeof value.controls.potPosition === 'number'
    && typeof value.controls.buttonPressed === 'boolean'
    && [true, false, null].includes(value.d13)
    && (value.d13HighCycle === null || Number.isSafeInteger(value.d13HighCycle))
    && (value.uartMarkerCycle === null || Number.isSafeInteger(value.uartMarkerCycle));
}

function phaseProducer(phase) {
  return phase?.producer;
}

function producerSame(left, right) {
  return stableEventOrderStringify(left) === stableEventOrderStringify(right);
}

export function evaluateEventOrderPhases(phases, suite = X30_EVENT_ORDER_SUITE) {
  const validShape = Array.isArray(phases) && phases.length === EVENT_ORDER_PHASES.length
    && phases.every((phase, index) => exactKeys(phase, ['epochId', 'phase', 'phaseOrdinal', 'snapshotKind', 'producer'])
      && phase.epochId === suite.plan.epochId && phase.phase === EVENT_ORDER_PHASES[index]
      && phase.phaseOrdinal === index + 1 && validProducer(phase.producer));
  if (!validShape) return completedExperimentOutcome({ evidence: [
    { code: 'EVENT_ORDER_PHASE_EVIDENCE_COMPLETE', complete: false },
  ] });
  const [reset, input, preSample, execution, finalSample] = phases.map(phaseProducer);
  const expectedInputs = suite.plan.inputs.map((entry) => ({
    sequence: entry.ordinal, targetCycle: entry.targetCycle, componentId: entry.componentId,
    key: entry.key, value: entry.value,
  }));
  const resetClean = reset.cpuCycles === 0 && reset.instructions === 0
    && reset.pending.length === 0 && reset.inputLog.length === 0
    && reset.controls.potPosition === 0.5 && reset.controls.buttonPressed === false;
  const inputsOrdered = input.cpuCycles === 0 && input.instructions === 0 && input.pending.length === 0
    && stableEventOrderStringify(input.inputLog) === stableEventOrderStringify(expectedInputs)
    && input.controls.potPosition === 0.75 && input.controls.buttonPressed === true;
  const preSampleReadOnly = producerSame(input, preSample);
  const executed = execution.cpuCycles >= suite.plan.execution.minimumFinalCycle
    && execution.cpuCycles <= suite.plan.execution.maximumFinalCycle
    && execution.instructions > 0 && execution.d13 === suite.plan.execution.expectedD13
    && execution.d13HighCycle > 0 && execution.d13HighCycle <= execution.cpuCycles
    && execution.uartMarkerCycle > 0 && execution.uartMarkerCycle <= execution.cpuCycles
    && stableEventOrderStringify(execution.inputLog) === stableEventOrderStringify(expectedInputs);
  const finalSampleReadOnly = producerSame(execution, finalSample);
  return completedExperimentOutcome({ evidence: [
    { code: 'EVENT_ORDER_PHASE_EVIDENCE_COMPLETE', complete: true },
  ], assertions: [
    { code: 'EVENT_ORDER_OLD_PENDING_RETIRED', passed: resetClean },
    { code: 'EVENT_ORDER_INPUT_SEQUENCE_EXACT', passed: inputsOrdered },
    { code: 'EVENT_ORDER_PRE_SAMPLE_READ_ONLY', passed: preSampleReadOnly },
    { code: 'EVENT_ORDER_CPU_EVIDENCE_OBSERVED', passed: executed },
    { code: 'EVENT_ORDER_FINAL_SAMPLE_READ_ONLY', passed: finalSampleReadOnly },
  ] });
}

export function eventOrderExecutionProjection(execution) {
  return {
    ready: execution.ready,
    preReset: {
      targetCycle: execution.preReset.targetCycle,
      queuedSequence: execution.preReset.queuedSequence,
      pendingBeforeReset: execution.preReset.pendingBeforeReset,
      resetCleared: execution.preReset.resetCleared,
      generationRetired: execution.preReset.generationRetired,
    },
    phases: execution.phases,
    outcome: execution.outcome,
  };
}

export function semanticEventOrderProjection(report) {
  return {
    schema: report.schema,
    suiteId: report.suiteId,
    suiteSha256: report.suiteSha256,
    profile: report.profile,
    sourceSha256: report.sourceSha256,
    artifactSha256: report.artifactSha256,
    producer: report.producer,
    repeats: report.executions.map(eventOrderExecutionProjection),
    repeatSemanticSha256: report.repeatSemanticSha256,
    validationProbe: report.validationProbe,
    evidenceFailureProbe: report.evidenceFailureProbe,
    limits: report.limits,
  };
}

function validOutcome(value, academicStatus) {
  return value?.schema === 'intent-mcu-experiment-outcome@1'
    && value.academicStatus === academicStatus && value.jobStatus === 'completed';
}

export async function validateEventOrderReport(value, suite = X30_EVENT_ORDER_SUITE) {
  const accepted = await validateEventOrderSuite(suite);
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteSha256', 'profile', 'sourceSha256',
    'artifactSha256', 'producer', 'executions', 'repeatSemanticSha256', 'validationProbe',
    'evidenceFailureProbe', 'limits', 'semanticSha256'])
      || value.schema !== EVENT_ORDER_REPORT_SCHEMA || value.suiteId !== accepted.suiteId
      || value.suiteSha256 !== await eventOrderSuiteIdentity(accepted)
      || value.profile !== accepted.profile || value.sourceSha256 !== accepted.fixture.sourceSha256
      || !hashPattern.test(value.artifactSha256) || value.executions.length !== 2
      || stableEventOrderStringify(value.limits) !== stableEventOrderStringify(accepted.limits)) {
    reject('EVENT_ORDER_REPORT_STALE_OR_UNKNOWN');
  }
  const repeatHashes = [];
  for (const [index, execution] of value.executions.entries()) {
    if (!exactKeys(execution, ['executionId', 'ready', 'preReset', 'phases', 'outcome', 'diagnostics'])
        || execution.executionId !== accepted.repeats[index]
        || !exactKeys(execution.ready, ['cpuCycles', 'instructions'])
        || execution.ready.cpuCycles !== 0 || execution.ready.instructions !== 0
        || !exactKeys(execution.preReset, ['targetCycle', 'queuedSequence', 'pendingBeforeReset',
          'runningCycleBeforeReset', 'resetCleared', 'generationRetired'])
        || execution.preReset.targetCycle !== accepted.plan.preReset.targetCycle
        || execution.preReset.queuedSequence !== 1 || execution.preReset.pendingBeforeReset !== 1
        || !Number.isSafeInteger(execution.preReset.runningCycleBeforeReset)
        || execution.preReset.runningCycleBeforeReset <= 0
        || execution.preReset.runningCycleBeforeReset >= accepted.plan.preReset.targetCycle
        || execution.preReset.resetCleared !== true || execution.preReset.generationRetired !== true
        || !exactKeys(execution.diagnostics, ['wallDurationMilliseconds'])
        || !validOutcome(execution.outcome, 'passed')
        || evaluateEventOrderPhases(execution.phases, accepted).academicStatus !== 'passed') {
      reject('EVENT_ORDER_REPORT_EXECUTION_INVALID');
    }
    repeatHashes.push(await eventOrderSha256(stableEventOrderStringify(eventOrderExecutionProjection(execution))));
  }
  if (repeatHashes[0] !== repeatHashes[1] || value.repeatSemanticSha256 !== repeatHashes[0]) {
    reject('EVENT_ORDER_REPEAT_SEMANTIC_MISMATCH');
  }
  if (!exactKeys(value.validationProbe, ['status', 'code', 'academicOutcomeCreated'])
      || value.validationProbe.status !== 'rejected-before-execution'
      || value.validationProbe.code !== 'EVENT_ORDER_ORDINAL_SEQUENCE'
      || value.validationProbe.academicOutcomeCreated !== false) reject('EVENT_ORDER_VALIDATION_PROBE_INVALID');
  if (!exactKeys(value.evidenceFailureProbe, ['status', 'code', 'outcome'])
      || value.evidenceFailureProbe.status !== 'failed-as-expected'
      || value.evidenceFailureProbe.code !== 'EVENT_ORDER_OLD_PENDING_LEAK'
      || !validOutcome(value.evidenceFailureProbe.outcome, 'failed')
      || !value.evidenceFailureProbe.outcome.reasons.includes('EVENT_ORDER_OLD_PENDING_RETIRED')) {
    reject('EVENT_ORDER_EVIDENCE_FAILURE_PROBE_INVALID');
  }
  const semantic = await eventOrderSha256(stableEventOrderStringify(semanticEventOrderProjection(value)));
  if (value.semanticSha256 !== semantic) reject('EVENT_ORDER_REPORT_SEMANTIC_HASH_INVALID');
  return clone(value);
}

export function eventOrderReportPassed(report) {
  return report.executions.length === 2
    && report.executions.every((execution) => validOutcome(execution.outcome, 'passed'))
    && report.validationProbe.status === 'rejected-before-execution'
    && report.validationProbe.academicOutcomeCreated === false
    && validOutcome(report.evidenceFailureProbe.outcome, 'failed');
}
