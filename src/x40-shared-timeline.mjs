// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import { validateWorkerRuntimeIdentity } from './runtime-identity.mjs';

export const X40_SHARED_TIMELINE_SCHEMA = 'intent-mcu-x40-avr-shared-timeline@1';
export const X40_PROFILE = 'board.atmega328p-16mhz-v1';
export const X40_EXPERIMENT_ID = 'avr-thermostat-boundary-v1';
export const X40_CLOCK_HERTZ = 16_000_000;
export const X40_CYCLES_PER_MILLISECOND = 16_000;
export const X40_CLASS_ORDER = Object.freeze(['reset', 'input', 'gpio', 'serial', 'test-marker']);
export const X40_TIE_ORDER_LABEL = 'presentation order across channels; not CPU execution order';

const HASH = /^[a-f0-9]{64}$/u;
const CLASS_ORDER = new Map(X40_CLASS_ORDER.map((value, index) => [value, index]));
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const validCycle = (value) => Number.isSafeInteger(value) && value >= 0;

export function stableX40Stringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableX40Stringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableX40Stringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function x40Sha256(value) {
  const input = typeof value === 'string' ? value : stableX40Stringify(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function contextIdentity(context) {
  if (!exactKeys(context, ['profile', 'projectGeneration', 'runtimeBinding', 'reset',
    'observation', 'inputIdentity', 'artifactIdentity', 'scenarioId', 'result'])
      || context.profile !== X40_PROFILE
      || !Number.isSafeInteger(context.projectGeneration) || context.projectGeneration < 1
      || !HASH.test(context.inputIdentity ?? '') || !HASH.test(context.artifactIdentity ?? '')
      || typeof context.scenarioId !== 'string' || !context.scenarioId) reject('X40_CONTEXT_INVALID');
  const resetIdentity = validateWorkerRuntimeIdentity(
    context.reset?.runtimeIdentity, context.runtimeBinding,
  );
  const observationIdentity = validateWorkerRuntimeIdentity(
    context.observation?.runtimeIdentity, context.runtimeBinding, resetIdentity.workerInstanceNonce,
  );
  if (context.runtimeBinding.projectGeneration !== context.projectGeneration
      || context.runtimeBinding.artifactIdentity !== context.artifactIdentity
      || stableX40Stringify(resetIdentity) !== stableX40Stringify(observationIdentity)) {
    reject('X40_RUNTIME_IDENTITY_STALE');
  }
  return observationIdentity;
}

function inputEvidence(observation) {
  const eventLog = observation?.eventLog;
  const requested = eventLog?.log?.filter((event) => event.type === 'control') ?? [];
  const applied = eventLog?.applied?.filter((event) => event.type === 'control') ?? [];
  const retention = eventLog?.retention;
  if (eventLog?.dropped !== 0 || requested.length !== 2 || applied.length !== 2
      || retention?.limit !== 10_000
      || retention.requested?.retained !== requested.length || retention.requested?.dropped !== 0
      || retention.applied?.retained !== applied.length || retention.applied?.dropped !== 0) {
    reject('X40_INPUT_RETENTION_INCOMPLETE');
  }
  for (const request of requested) {
    if (!Number.isSafeInteger(request.sequence) || request.sequence < 1
        || !validCycle(request.targetCycle) || Object.hasOwn(request, 'appliedCycle')) {
      reject('X40_REQUESTED_INPUT_INVALID');
    }
    const actual = applied.find((entry) => entry.sequence === request.sequence);
    if (!actual || actual.componentId !== request.componentId || actual.key !== request.key
        || stableX40Stringify(actual.value) !== stableX40Stringify(request.value)
        || actual.targetCycle !== request.targetCycle || !validCycle(actual.appliedCycle)
        || actual.appliedCycle < actual.targetCycle) reject('X40_APPLIED_INPUT_INVALID');
  }
  const ordered = [...applied].sort((left, right) => left.appliedCycle - right.appliedCycle
    || left.sequence - right.sequence);
  if (stableX40Stringify(ordered) !== stableX40Stringify(applied)) reject('X40_APPLIED_INPUT_ORDER_INVALID');
  return { requested: clone(requested), applied: clone(applied), retention: clone(retention) };
}

function runtimeEvidence(context) {
  const { reset, observation, result } = context;
  if (reset?.kind !== 'reset' || reset.paused !== true || reset.cycle !== 0) {
    reject('X40_RESET_ANCHOR_INVALID');
  }
  if (!validCycle(observation?.cycle) || observation.paused !== true) {
    reject('X40_OBSERVATION_CYCLE_INVALID');
  }
  const logic = observation.instruments?.logic;
  const serial = observation.instruments?.serial;
  const gpio = logic?.transitions?.filter((entry) => entry.pin === 'D13') ?? [];
  const serialRecords = serial?.records ?? [];
  if (logic?.dropped !== 0 || !gpio.length
      || gpio.some((entry) => !validCycle(entry.cycle) || typeof entry.level !== 'boolean')) {
    reject('X40_GPIO_EVIDENCE_INVALID');
  }
  if (serial?.dropped !== 0 || !serialRecords.length
      || serialRecords.some((entry) => !validCycle(entry.cycle)
        || !['tx', 'rx'].includes(entry.direction) || !Number.isInteger(entry.value))) {
    reject('X40_SERIAL_EVIDENCE_INVALID');
  }
  if (result?.schema !== 'intent-mcu-scenario-observation-result@1'
      || result.scenarioId !== context.scenarioId || result.status !== 'passed'
      || result.outcome?.academicStatus !== 'passed' || result.outcome?.jobStatus !== 'completed'
      || result.outcome?.evidenceStatus !== 'complete'
      || result.checks?.inputsComplete !== true || result.checks?.pinObserved !== true
      || result.checks?.primaryExecutedPin !== true
      || result.virtualMilliseconds !== observation.cycle / X40_CYCLES_PER_MILLISECOND) {
    reject('X40_TEST_MARKER_INVALID');
  }
  return { gpio: clone(gpio), serial: clone(serialRecords) };
}

function timelineRows(context, inputs, runtime) {
  const rows = [
    { class: 'reset', cycle: 0, producerSequence: 0,
      value: { paused: true }, provenance: 'worker reset snapshot' },
    ...inputs.applied.map((entry) => ({
      class: 'input', cycle: entry.appliedCycle, producerSequence: entry.sequence,
      value: { componentId: entry.componentId, key: entry.key, value: clone(entry.value),
        targetCycle: entry.targetCycle, appliedCycle: entry.appliedCycle, sequence: entry.sequence },
      provenance: 'OrderedInputQueue successful apply',
    })),
    ...runtime.gpio.map((entry, index) => ({
      class: 'gpio', cycle: entry.cycle, producerSequence: index + 1,
      value: { pin: 'D13', level: entry.level }, provenance: 'avr8js GPIO callback',
    })),
    ...runtime.serial.map((entry, index) => ({
      class: 'serial', cycle: entry.cycle, producerSequence: index + 1,
      value: { direction: entry.direction, value: entry.value, text: entry.text ?? '' },
      provenance: 'avr8js USART0 callback',
    })),
    { class: 'test-marker', cycle: context.observation.cycle, producerSequence: 0,
      value: { scenarioId: context.scenarioId, status: context.result.status,
        jobStatus: context.result.outcome.jobStatus },
      provenance: 'accepted paused worker observation' },
  ];
  rows.sort((left, right) => left.cycle - right.cycle
    || CLASS_ORDER.get(left.class) - CLASS_ORDER.get(right.class)
    || left.producerSequence - right.producerSequence);
  let priorCycle = null;
  let sameCycleSequence = 0;
  return rows.map((row) => {
    sameCycleSequence = row.cycle === priorCycle ? sameCycleSequence + 1 : 1;
    priorCycle = row.cycle;
    return { ...row, sameCycleSequence };
  });
}

export function semanticX40Projection(value) {
  return {
    schema: value.schema, profile: value.profile, nativeTimebase: value.nativeTimebase,
    identity: value.identity, scenario: value.scenario, retention: value.retention,
    rows: value.rows, firstCycle: value.firstCycle, lastCycle: value.lastCycle,
  };
}

export async function createX40SharedTimeline(context) {
  const identity = contextIdentity(context);
  const inputs = inputEvidence(context.observation);
  const runtime = runtimeEvidence(context);
  const rows = timelineRows(context, inputs, runtime);
  const timeline = {
    schema: X40_SHARED_TIMELINE_SCHEMA,
    profile: X40_PROFILE,
    nativeTimebase: { id: 'avr8js-cycles', clockHertz: X40_CLOCK_HERTZ,
      cyclesPerMillisecond: X40_CYCLES_PER_MILLISECOND,
      classOrder: [...X40_CLASS_ORDER], tieOrderMeaning: X40_TIE_ORDER_LABEL },
    identity: { projectGeneration: context.projectGeneration,
      runtimeGeneration: identity.runtimeGeneration,
      workerInitialization: identity.workerInitialization,
      workerInstanceNonce: identity.workerInstanceNonce,
      inputIdentity: context.inputIdentity, artifactIdentity: context.artifactIdentity },
    scenario: { experimentId: X40_EXPERIMENT_ID, scenarioId: context.scenarioId,
      status: context.result.status, jobStatus: context.result.outcome.jobStatus,
      observationCycle: context.observation.cycle },
    retention: { requestedInputs: clone(inputs.retention.requested),
      appliedInputs: clone(inputs.retention.applied), gpio: { retained: runtime.gpio.length, dropped: 0 },
      serial: { retained: runtime.serial.length, dropped: 0 } },
    rows,
    firstCycle: rows[0].cycle,
    lastCycle: rows.at(-1).cycle,
    semanticSha256: '',
  };
  timeline.semanticSha256 = await x40Sha256(semanticX40Projection(timeline));
  return timeline;
}

export async function validateX40SharedTimeline(value, currentContext) {
  if (!exactKeys(value, ['schema', 'profile', 'nativeTimebase', 'identity', 'scenario',
    'retention', 'rows', 'firstCycle', 'lastCycle', 'semanticSha256'])
      || value.schema !== X40_SHARED_TIMELINE_SCHEMA || !HASH.test(value.semanticSha256 ?? '')
      || value.semanticSha256 !== await x40Sha256(semanticX40Projection(value))) {
    reject('X40_TIMELINE_INVALID');
  }
  const expected = await createX40SharedTimeline(currentContext);
  if (stableX40Stringify(value) !== stableX40Stringify(expected)) reject('X40_TIMELINE_STALE');
  return clone(value);
}

export function x40TimelineRetainsForLifecycle(event) {
  return Boolean(event && exactKeys(event, ['type', 'relevance'])
    && event.type === 'project.edit' && event.relevance === 'visual');
}

export function x40TimelineRetainsForWorkerMessage(timeline, message) {
  if (!timeline || !message || message.kind !== 'paused' || message.paused !== true
      || message.cycle !== timeline.scenario?.observationCycle) return false;
  const identity = message.runtimeIdentity;
  return Boolean(identity
    && identity.projectGeneration === timeline.identity?.projectGeneration
    && identity.runtimeGeneration === timeline.identity?.runtimeGeneration
    && identity.workerInitialization === timeline.identity?.workerInitialization
    && identity.workerInstanceNonce === timeline.identity?.workerInstanceNonce
    && identity.artifactIdentity === timeline.identity?.artifactIdentity);
}
