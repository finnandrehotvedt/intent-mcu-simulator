// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import {
  MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA, validateWorkerRuntimeIdentity,
} from './runtime-identity.mjs';

export const X47_RUNTIME_AUTHORITY_SCHEMA = 'intent-mcu-x47-runtime-authority@2';
export const X47_WORKER_BINDING_SCHEMA = 'intent-mcu-x47-worker-binding@2';
export const X47_APPLY_REQUEST_SCHEMA = 'intent-mcu-x47-apply-request@2';
export const X47_QUEUE_RECEIPT_SCHEMA = 'intent-mcu-x47-queue-receipt@2';
export const X47_EXECUTION_RECEIPT_SCHEMA = 'intent-mcu-x47-execution-receipt@2';
export const X47_CANCEL_RECEIPT_SCHEMA = 'intent-mcu-x47-cancel-receipt@2';
export const X47_CANCEL_TIMEOUT_SCHEMA = 'intent-mcu-x47-cancel-timeout@2';
export const X47_AVR_PROFILE = 'board.atmega328p-16mhz-v1';
export const X47_OFFSET_MAX = 1_600_000;

const HASH = /^[a-f0-9]{64}$/u;
const GRAPH_HASH = /^sha256:[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const TRANSACTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const AUTHORITY_KEYS = [
  'schema', 'profile', 'projectGeneration', 'buildGeneration', 'sourceProjectRevision', 'sourceSha256',
  'graphIdentity', 'inputIdentitySha256', 'artifactIdentity', 'runtimeGeneration',
  'modelImplementationSha256', 'modelExecutionContextSha256',
];
const BINDING_KEYS = [...AUTHORITY_KEYS, 'workerInitialization', 'workerInstanceNonce'];
const REQUEST_KEYS = [
  'schema', 'transactionId', 'canonicalPulseSha256', 'binding', 'expectedBaseCycle', 'events',
];
const EVENT_KEYS = ['pin', 'offsetCycles', 'level'];
const QUEUED_EVENT_KEYS = ['eventIndex', 'pin', 'level', 'offsetCycles', 'targetCycle', 'queueSequence'];
const QUEUE_RETENTION_KEYS = [
  'limit', 'beforeRequestedRetained', 'beforeRequestedDropped',
  'afterRequestedRetained', 'afterRequestedDropped',
];
const QUEUE_RECEIPT_KEYS = [
  'schema', 'transactionId', 'canonicalPulseSha256', 'binding', 'baseCycle', 'events', 'retention',
];
const EXECUTION_EVENT_KEYS = [
  ...QUEUED_EVENT_KEYS, 'drainAppliedCycle', 'adapterAppliedCycle', 'transitionCycle', 'transitioned',
];
const RETENTION_CLASS_KEYS = ['expected', 'retained', 'dropped'];
const EXECUTION_RETENTION_KEYS = ['requested', 'drained', 'adapter', 'discontinuities'];
const EXECUTION_RECEIPT_KEYS = [
  'schema', 'transactionId', 'canonicalPulseSha256', 'binding', 'baseCycle', 'complete', 'events', 'retention',
];
const QUEUE_PENDING_KEYS = ['eventIndex', 'queueSequence', 'targetCycle'];
const ADAPTER_SCHEDULED_KEYS = ['eventIndex', 'targetCycle'];
const ADAPTER_APPLIED_KEYS = [
  'eventIndex', 'targetCycle', 'appliedCycle', 'transitioned', 'transitionCycle',
];
const CANCEL_RECEIPT_KEYS = [
  'schema', 'transactionId', 'canonicalPulseSha256', 'binding', 'baseCycle', 'reason',
  'cancelCycle', 'state', 'evidenceComplete', 'queuePending', 'adapterScheduled',
  'adapterApplied', 'retention',
];
const CANCEL_TIMEOUT_KEYS = [
  'schema', 'transactionId', 'binding', 'reason', 'state', 'timeoutMilliseconds',
];
const CANCEL_REASONS = new Set(['RESET', 'DISPOSE', 'EXPLICIT_CANCEL']);
const clone = (value) => structuredClone(value);
const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const positive = (value) => Number.isSafeInteger(value) && value >= 1;
const cycle = (value) => Number.isSafeInteger(value) && value >= 0;
const reject = (code) => { throw Object.assign(new TypeError(code), { code }); };

function authorityShape(value, schema, keys) {
  if (!exactKeys(value, keys) || value.schema !== schema || value.profile !== X47_AVR_PROFILE
      || !positive(value.projectGeneration) || !positive(value.buildGeneration)
      || !cycle(value.sourceProjectRevision)
      || !HASH.test(value.sourceSha256 ?? '') || !GRAPH_HASH.test(value.graphIdentity ?? '')
      || !HASH.test(value.inputIdentitySha256 ?? '') || !HASH.test(value.artifactIdentity ?? '')
      || !positive(value.runtimeGeneration) || !HASH.test(value.modelImplementationSha256 ?? '')
      || !HASH.test(value.modelExecutionContextSha256 ?? '')) reject('X47_RUNTIME_BINDING_INVALID');
  return value;
}

function runtimeBindingFor(authority) {
  return {
    schema: 'intent-mcu-runtime-binding@2',
    projectGeneration: authority.projectGeneration,
    runtimeGeneration: authority.runtimeGeneration,
    artifactIdentity: authority.artifactIdentity,
    modelImplementationSha256: authority.modelImplementationSha256,
    modelExecutionContextSha256: authority.modelExecutionContextSha256,
  };
}

export function validateX47RuntimeAuthority(value, runtimeIdentity) {
  const authority = authorityShape(value, X47_RUNTIME_AUTHORITY_SCHEMA, AUTHORITY_KEYS);
  if (!runtimeIdentity || runtimeIdentity.schema !== MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA) {
    reject('X47_MODEL_BOUND_WORKER_REQUIRED');
  }
  validateWorkerRuntimeIdentity(runtimeIdentity, runtimeBindingFor(authority), runtimeIdentity.workerInstanceNonce);
  return deepFreeze(clone(authority));
}

export function createX47WorkerBinding(authorityValue, runtimeIdentity) {
  const authority = validateX47RuntimeAuthority(authorityValue, runtimeIdentity);
  return deepFreeze({ ...clone(authority), schema: X47_WORKER_BINDING_SCHEMA,
    workerInitialization: runtimeIdentity.workerInitialization,
    workerInstanceNonce: runtimeIdentity.workerInstanceNonce });
}

export function validateX47WorkerBinding(value, authorityValue, runtimeIdentity) {
  const binding = authorityShape(value, X47_WORKER_BINDING_SCHEMA, BINDING_KEYS);
  if (!positive(binding.workerInitialization) || !NONCE.test(binding.workerInstanceNonce ?? '')) {
    reject('X47_WORKER_BINDING_INVALID');
  }
  const expected = createX47WorkerBinding(authorityValue, runtimeIdentity);
  if (stableStringify(binding) !== stableStringify(expected)) reject('X47_WORKER_BINDING_STALE');
  return deepFreeze(clone(binding));
}

export function validateX47BoundRequest(value, options) {
  if (!exactKeys(value, REQUEST_KEYS) || value.schema !== X47_APPLY_REQUEST_SCHEMA
      || !TRANSACTION_ID.test(value.transactionId ?? '')
      || !HASH.test(value.canonicalPulseSha256 ?? '') || !cycle(value.expectedBaseCycle)
      || !Array.isArray(value.events) || value.events.length !== 2) reject('X47_APPLY_REQUEST_INVALID');
  const binding = validateX47WorkerBinding(value.binding, options?.authority, options?.runtimeIdentity);
  let priorOffset = 0;
  const events = value.events.map((event, index) => {
    if (!exactKeys(event, EVENT_KEYS) || event.pin !== 2 || typeof event.level !== 'boolean'
        || event.level !== (index === 1) || !positive(event.offsetCycles)
        || event.offsetCycles <= priorOffset || event.offsetCycles > X47_OFFSET_MAX
        || value.expectedBaseCycle > Number.MAX_SAFE_INTEGER - event.offsetCycles) {
      reject('X47_PULSE_EVENTS_INVALID');
    }
    priorOffset = event.offsetCycles;
    return clone(event);
  });
  return deepFreeze({ ...clone(value), binding, events });
}

export function validateX47ApplyRequest(value, options) {
  const request = validateX47BoundRequest(value, options);
  if (options?.profile !== X47_AVR_PROFILE) reject('X47_PROFILE_UNAVAILABLE');
  if (options?.paused !== true) reject('X47_PAUSED_RUNTIME_REQUIRED');
  if (!cycle(options?.currentCycle) || request.expectedBaseCycle !== options.currentCycle) {
    reject('X47_BASE_CYCLE_STALE');
  }
  if (!cycle(options?.pendingDigitalTailCycle)) reject('X47_PENDING_TAIL_INVALID');
  if (options.pendingDigitalTailCycle > options.currentCycle) reject('X47_PENDING_DIGITAL_SEQUENCE_CONFLICT');
  return request;
}

export function canonicalX47ApplyRequest(value) {
  return stableStringify(value);
}

function validQueuedEvent(event) {
  return exactKeys(event, QUEUED_EVENT_KEYS) && [0, 1].includes(event.eventIndex)
    && event.pin === 2 && event.level === (event.eventIndex === 1)
    && positive(event.offsetCycles) && cycle(event.targetCycle) && positive(event.queueSequence);
}

function receiptContext(options) {
  const request = validateX47BoundRequest(options?.request, options);
  return { request, authority: options.authority, runtimeIdentity: options.runtimeIdentity };
}

function assertReceiptIdentity(value, request) {
  if (value.transactionId !== request.transactionId
      || value.canonicalPulseSha256 !== request.canonicalPulseSha256
      || value.baseCycle !== request.expectedBaseCycle
      || stableStringify(value.binding) !== stableStringify(request.binding)) {
    reject('X47_RECEIPT_REQUEST_MISMATCH');
  }
}

function assertQueuedEvents(events, baseCycle, request) {
  let priorOffset = 0;
  let priorSequence = 0;
  const sequences = new Set();
  for (const [eventIndex, event] of events.entries()) {
    const expected = request.events[eventIndex];
    if (event.eventIndex !== eventIndex || event.pin !== expected.pin || event.level !== expected.level
        || event.offsetCycles !== expected.offsetCycles || event.offsetCycles <= priorOffset
        || event.offsetCycles > X47_OFFSET_MAX
        || baseCycle > Number.MAX_SAFE_INTEGER - event.offsetCycles
        || event.targetCycle !== baseCycle + event.offsetCycles) reject('X47_QUEUE_TARGET_INVALID');
    if (sequences.has(event.queueSequence) || event.queueSequence <= priorSequence) {
      reject('X47_QUEUE_EVENT_ORDER_INVALID');
    }
    priorOffset = event.offsetCycles;
    priorSequence = event.queueSequence;
    sequences.add(event.queueSequence);
  }
}

export function validateX47QueueReceipt(value, options) {
  if (!exactKeys(value, QUEUE_RECEIPT_KEYS) || value.schema !== X47_QUEUE_RECEIPT_SCHEMA
      || !TRANSACTION_ID.test(value.transactionId ?? '') || !HASH.test(value.canonicalPulseSha256 ?? '')
      || !cycle(value.baseCycle) || !Array.isArray(value.events) || value.events.length !== 2
      || value.events.some((event) => !validQueuedEvent(event))
      || !exactKeys(value.retention, QUEUE_RETENTION_KEYS)
      || !positive(value.retention.limit)
      || ['beforeRequestedRetained', 'beforeRequestedDropped', 'afterRequestedRetained',
        'afterRequestedDropped'].some((key) => !cycle(value.retention[key]))) {
    reject('X47_QUEUE_RECEIPT_INVALID');
  }
  const { request } = receiptContext(options);
  assertReceiptIdentity(value, request);
  assertQueuedEvents(value.events, value.baseCycle, request);
  if (value.retention.afterRequestedRetained !== value.retention.beforeRequestedRetained + 2
      || value.retention.afterRequestedDropped !== value.retention.beforeRequestedDropped) {
    reject('X47_QUEUE_RETENTION_INVALID');
  }
  return deepFreeze(clone(value));
}

function validRetentionClass(value) {
  return exactKeys(value, RETENTION_CLASS_KEYS) && positive(value.expected)
    && cycle(value.retained) && cycle(value.dropped);
}

export function validateX47ExecutionReceipt(value, options) {
  if (!exactKeys(value, EXECUTION_RECEIPT_KEYS) || value.schema !== X47_EXECUTION_RECEIPT_SCHEMA
      || !TRANSACTION_ID.test(value.transactionId ?? '') || !HASH.test(value.canonicalPulseSha256 ?? '')
      || !cycle(value.baseCycle)
      || typeof value.complete !== 'boolean' || !Array.isArray(value.events) || value.events.length !== 2
      || !exactKeys(value.retention, EXECUTION_RETENTION_KEYS)
      || !validRetentionClass(value.retention.requested)
      || !validRetentionClass(value.retention.drained)
      || !validRetentionClass(value.retention.adapter)
      || !cycle(value.retention.discontinuities)) reject('X47_EXECUTION_RECEIPT_INVALID');
  const { request } = receiptContext(options);
  const queueReceipt = validateX47QueueReceipt(options?.queueReceipt, options);
  assertReceiptIdentity(value, request);
  assertQueuedEvents(value.events, value.baseCycle, request);
  for (const [eventIndex, event] of value.events.entries()) {
    if (!exactKeys(event, EXECUTION_EVENT_KEYS) || !validQueuedEvent(Object.fromEntries(
      QUEUED_EVENT_KEYS.map((key) => [key, event[key]]),
    ))) reject('X47_EXECUTION_EVENT_INVALID');
    const queued = queueReceipt.events[eventIndex];
    if (QUEUED_EVENT_KEYS.some((key) => event[key] !== queued[key])) {
      reject('X47_EXECUTION_QUEUE_MISMATCH');
    }
    for (const key of ['drainAppliedCycle', 'adapterAppliedCycle', 'transitionCycle']) {
      if (event[key] !== null && !cycle(event[key])) reject('X47_EXECUTION_CYCLE_INVALID');
    }
    if (event.transitioned !== null && typeof event.transitioned !== 'boolean') {
      reject('X47_EXECUTION_TRANSITION_INVALID');
    }
    if ((event.adapterAppliedCycle === null) !== (event.transitioned === null)) {
      reject('X47_EXECUTION_ADAPTER_STATE_INVALID');
    }
    if (event.drainAppliedCycle !== null && event.drainAppliedCycle < event.targetCycle) {
      reject('X47_DRAIN_BEFORE_TARGET');
    }
    if (event.adapterAppliedCycle !== null && event.adapterAppliedCycle < event.targetCycle) {
      reject('X47_ADAPTER_BEFORE_TARGET');
    }
    if ((event.transitioned === true) !== (event.transitionCycle !== null)
        || (event.transitionCycle !== null && event.transitionCycle !== event.adapterAppliedCycle)) {
      reject('X47_TRANSITION_CORRELATION_INVALID');
    }
  }
  const expectedComplete = value.events.every((event) => event.drainAppliedCycle !== null
    && event.adapterAppliedCycle !== null)
    && value.retention.discontinuities === 0
    && [value.retention.requested, value.retention.drained, value.retention.adapter]
      .every((item) => item.retained === item.expected && item.dropped === 0);
  if (value.complete !== expectedComplete) reject('X47_EXECUTION_COMPLETION_INVALID');
  return deepFreeze(clone(value));
}

function validCancelCollection(value, keys) {
  return Array.isArray(value) && value.every((event) => exactKeys(event, keys)
    && [0, 1].includes(event.eventIndex) && cycle(event.targetCycle));
}

export function validateX47CancelReceipt(value, options) {
  if (!exactKeys(value, CANCEL_RECEIPT_KEYS) || value.schema !== X47_CANCEL_RECEIPT_SCHEMA
      || !TRANSACTION_ID.test(value.transactionId ?? '') || !HASH.test(value.canonicalPulseSha256 ?? '')
      || !cycle(value.baseCycle) || !CANCEL_REASONS.has(value.reason)
      || !cycle(value.cancelCycle) || value.state !== 'cancelled'
      || typeof value.evidenceComplete !== 'boolean'
      || !validCancelCollection(value.queuePending, QUEUE_PENDING_KEYS)
      || value.queuePending.some((event) => !positive(event.queueSequence))
      || !validCancelCollection(value.adapterScheduled, ADAPTER_SCHEDULED_KEYS)
      || !validCancelCollection(value.adapterApplied, ADAPTER_APPLIED_KEYS)
      || value.adapterApplied.some((event) => !cycle(event.appliedCycle)
        || typeof event.transitioned !== 'boolean'
        || (event.transitionCycle !== null && !cycle(event.transitionCycle)))
      || !exactKeys(value.retention, EXECUTION_RETENTION_KEYS)
      || !validRetentionClass(value.retention.requested)
      || !validRetentionClass(value.retention.drained)
      || !validRetentionClass(value.retention.adapter)
      || !cycle(value.retention.discontinuities)) reject('X47_CANCEL_RECEIPT_INVALID');
  const { request } = receiptContext(options);
  const queueReceipt = validateX47QueueReceipt(options?.queueReceipt, options);
  assertReceiptIdentity(value, request);
  const expectedByIndex = new Map(queueReceipt.events.map((event) => [event.eventIndex, event]));
  for (const collection of [value.queuePending, value.adapterScheduled, value.adapterApplied]) {
    const seen = new Set();
    for (const event of collection) {
      const expected = expectedByIndex.get(event.eventIndex);
      if (!expected || seen.has(event.eventIndex) || event.targetCycle !== expected.targetCycle
          || (Object.hasOwn(event, 'queueSequence') && event.queueSequence !== expected.queueSequence)) {
        reject('X47_CANCEL_EVENT_MISMATCH');
      }
      seen.add(event.eventIndex);
    }
  }
  for (const event of value.adapterApplied) {
    if (event.appliedCycle < event.targetCycle
        || ((event.transitioned === true) !== (event.transitionCycle !== null))
        || (event.transitionCycle !== null && event.transitionCycle !== event.appliedCycle)) {
      reject('X47_CANCEL_EVENT_MISMATCH');
    }
  }
  const adapterKnown = new Set([...value.adapterScheduled, ...value.adapterApplied]
    .map((event) => event.eventIndex));
  const expectedComplete = adapterKnown.size === queueReceipt.events.length
    && value.retention.discontinuities === 0
    && [value.retention.requested, value.retention.adapter]
      .every((item) => item.retained === item.expected && item.dropped === 0);
  if (value.evidenceComplete !== expectedComplete) reject('X47_CANCEL_COMPLETION_INVALID');
  return deepFreeze(clone(value));
}

export function createX47CancelTimeout({ transactionId, binding, timeoutMilliseconds }) {
  if (!TRANSACTION_ID.test(transactionId ?? '') || !positive(timeoutMilliseconds)) {
    reject('X47_CANCEL_TIMEOUT_INVALID');
  }
  return deepFreeze({ schema: X47_CANCEL_TIMEOUT_SCHEMA, transactionId, binding: clone(binding),
    reason: 'ACK_TIMEOUT', state: 'not-completed', timeoutMilliseconds });
}

export function validateX47CancelTimeout(value, authority, runtimeIdentity) {
  if (!exactKeys(value, CANCEL_TIMEOUT_KEYS) || value.schema !== X47_CANCEL_TIMEOUT_SCHEMA
      || !TRANSACTION_ID.test(value.transactionId ?? '') || value.reason !== 'ACK_TIMEOUT'
      || value.state !== 'not-completed' || !positive(value.timeoutMilliseconds)) {
    reject('X47_CANCEL_TIMEOUT_INVALID');
  }
  validateX47WorkerBinding(value.binding, authority, runtimeIdentity);
  return deepFreeze(clone(value));
}
