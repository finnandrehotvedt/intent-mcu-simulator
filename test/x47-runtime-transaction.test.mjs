// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import {
  X47_APPLY_REQUEST_SCHEMA,
  X47_RUNTIME_AUTHORITY_SCHEMA,
  createX47CancelTimeout,
  createX47WorkerBinding,
  validateX47ApplyRequest,
  validateX47CancelReceipt,
  validateX47CancelTimeout,
  validateX47ExecutionReceipt,
  validateX47QueueReceipt,
} from '../src/x47-runtime-transaction.mjs';

const hash = (character) => character.repeat(64);
const identity = (nonce = '1'.repeat(32)) => ({
  schema: 'intent-mcu-worker-runtime-identity@2',
  projectGeneration: 7,
  runtimeGeneration: 11,
  artifactIdentity: hash('a'),
  modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
  modelExecutionContextSha256: hash('b'),
  workerInitialization: 3,
  workerInstanceNonce: nonce,
});
const authority = () => ({
  schema: X47_RUNTIME_AUTHORITY_SCHEMA,
  profile: 'board.atmega328p-16mhz-v1',
  projectGeneration: 7,
  sourceProjectRevision: 19,
  sourceSha256: hash('c'),
  graphIdentity: `sha256:${hash('d')}`,
  inputIdentitySha256: hash('e'),
  artifactIdentity: hash('a'),
  runtimeGeneration: 11,
  modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
  modelExecutionContextSha256: hash('b'),
});
const request = (runtimeIdentity = identity(), values = {}) => ({
  schema: X47_APPLY_REQUEST_SCHEMA,
  transactionId: 'x47-pulse-0001',
  canonicalPulseSha256: hash('f'),
  binding: createX47WorkerBinding(authority(), runtimeIdentity),
  expectedBaseCycle: 0,
  events: [
    { pin: 2, offsetCycles: 2, level: false },
    { pin: 2, offsetCycles: 4, level: true },
  ],
  ...values,
});
const runtime = (runtimeIdentity = identity()) => new RuntimeKernel(':00000001FF', DEFAULT_CIRCUIT, {
  modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
  modelExecutionContextSha256: runtimeIdentity.modelExecutionContextSha256,
  x47RuntimeAuthority: authority(),
  runtimeIdentity,
});

test('X47 request is strict, paused, same-worker, same-base and tail-conflict fail-closed', () => {
  const runtimeIdentity = identity();
  const base = request(runtimeIdentity);
  const options = { authority: authority(), runtimeIdentity,
    profile: 'board.atmega328p-16mhz-v1', paused: true, currentCycle: 0,
    pendingDigitalTailCycle: 0 };
  assert.deepEqual(validateX47ApplyRequest(base, options), base);
  const cases = [
    [{ ...base, extra: true }, options, /X47_APPLY_REQUEST_INVALID/u],
    [{ ...base, expectedBaseCycle: 1 }, options, /X47_BASE_CYCLE_STALE/u],
    [base, { ...options, paused: false }, /X47_PAUSED_RUNTIME_REQUIRED/u],
    [base, { ...options, pendingDigitalTailCycle: 1 }, /X47_PENDING_DIGITAL_SEQUENCE_CONFLICT/u],
    [{ ...base, events: [{ pin: 2, offsetCycles: 2, level: true }, base.events[1]] },
      options, /X47_PULSE_EVENTS_INVALID/u],
    [{ ...base, events: [base.events[0], { pin: 3, offsetCycles: 4, level: true }] },
      options, /X47_PULSE_EVENTS_INVALID/u],
    [{ ...base, binding: { ...base.binding, workerInstanceNonce: '2'.repeat(32) } },
      options, /X47_WORKER_BINDING_STALE/u],
    [{ ...base, expectedBaseCycle: Number.MAX_SAFE_INTEGER,
      events: [{ pin: 2, offsetCycles: 2, level: false },
        { pin: 2, offsetCycles: 4, level: true }] },
    { ...options, currentCycle: Number.MAX_SAFE_INTEGER, pendingDigitalTailCycle: Number.MAX_SAFE_INTEGER },
    /X47_PULSE_EVENTS_INVALID/u],
  ];
  for (const [value, candidateOptions, pattern] of cases) {
    assert.throws(() => validateX47ApplyRequest(value, candidateOptions), pattern);
  }
});

test('X47 kernel queues idempotently and distinguishes drain from truthful D2 transitions', () => {
  const kernel = runtime();
  kernel.adapter.setDigitalPin(2, true);
  const first = kernel.queueX47Transaction(request());
  const repeated = kernel.queueX47Transaction(request());
  assert.deepEqual(repeated, first);
  assert.deepEqual(first.events.map((event) => [event.targetCycle, event.queueSequence]), [[2, 1], [4, 2]]);
  assert.equal(kernel.inputs.snapshot().log.length, 2);
  assert.throws(() => kernel.queueX47Transaction(request(identity(), {
    canonicalPulseSha256: hash('0'),
  })), /X47_TRANSACTION_ID_CONFLICT/u);
  for (let index = 0; index < 5; index += 1) kernel.step();
  const receipt = kernel.x47ExecutionReceipt(first.transactionId);
  assert.equal(receipt.complete, true);
  assert.deepEqual(receipt.events.map((event) => ({
    target: event.targetCycle,
    drain: event.drainAppliedCycle,
    adapter: event.adapterAppliedCycle,
    transition: event.transitionCycle,
    transitioned: event.transitioned,
  })), [
    { target: 2, drain: 2, adapter: 2, transition: 2, transitioned: true },
    { target: 4, drain: 4, adapter: 4, transition: 4, transitioned: true },
  ]);
  assert.deepEqual(receipt.retention, {
    requested: { expected: 2, retained: 2, dropped: 0 },
    drained: { expected: 2, retained: 2, dropped: 0 },
    adapter: { expected: 2, retained: 2, dropped: 0 },
    discontinuities: 0,
  });
});

test('X47 adapter reports a same-level application without inventing a transition cycle', () => {
  const kernel = runtime();
  kernel.adapter.setDigitalPin(2, false);
  const accepted = kernel.queueX47Transaction(request());
  for (let index = 0; index < 3; index += 1) kernel.step();
  const first = kernel.x47ExecutionReceipt(accepted.transactionId).events[0];
  assert.equal(first.adapterAppliedCycle, 2);
  assert.equal(first.transitioned, false);
  assert.equal(first.transitionCycle, null);
});

test('X47 cancellation receipts precede explicit removal and reset ledger erasure', () => {
  const explicit = runtime();
  const accepted = explicit.queueX47Transaction(request());
  const [receipt] = explicit.cancelX47Transactions('EXPLICIT_CANCEL', accepted.transactionId,
    accepted.binding);
  assert.equal(receipt.state, 'cancelled');
  assert.deepEqual(receipt.unapplied.map((event) => event.queueSequence), [1, 2]);
  assert.equal(explicit.inputs.snapshot().pending.length, 0);
  assert.throws(() => explicit.queueX47Transaction(request()), /X47_TRANSACTION_CANCELLED/u);

  const resetting = runtime();
  resetting.queueX47Transaction(request());
  const reset = resetting.reset();
  assert.equal(reset.x47CancellationReceipts.length, 1);
  assert.equal(reset.x47CancellationReceipts[0].reason, 'RESET');
  assert.equal(resetting.inputs.snapshot().log.length, 0);
  assert.equal(Object.hasOwn(resetting.snapshot(), 'x47'), false);
  assert.throws(() => resetting.queueX47Transaction(request()), /X47_RUNTIME_AUTHORITY_UNAVAILABLE/u);
});

test('X47 cancellation timeout is explicitly not a worker acknowledgement', () => {
  const runtimeIdentity = identity();
  const binding = createX47WorkerBinding(authority(), runtimeIdentity);
  const timeout = createX47CancelTimeout({ transactionId: 'x47-pulse-0001', binding,
    timeoutMilliseconds: 750 });
  assert.equal(timeout.state, 'not-completed');
  assert.equal(timeout.reason, 'ACK_TIMEOUT');
  assert.deepEqual(validateX47CancelTimeout(timeout, authority(), runtimeIdentity), timeout);
});

test('X47 queue, execution and cancellation receipts reject mutation or inferred edges', () => {
  const runtimeIdentity = identity();
  const kernel = runtime(runtimeIdentity);
  kernel.adapter.setDigitalPin(2, false);
  const queue = kernel.queueX47Transaction(request(runtimeIdentity));
  assert.deepEqual(validateX47QueueReceipt(queue, authority(), runtimeIdentity), queue);
  assert.throws(() => validateX47QueueReceipt({ ...queue, extra: true }, authority(), runtimeIdentity),
    /X47_QUEUE_RECEIPT_INVALID/u);
  const wrongTarget = structuredClone(queue); wrongTarget.events[0].targetCycle += 1;
  assert.throws(() => validateX47QueueReceipt(wrongTarget, authority(), runtimeIdentity),
    /X47_QUEUE_TARGET_INVALID/u);
  for (let index = 0; index < 5; index += 1) kernel.step();
  const execution = kernel.x47ExecutionReceipt(queue.transactionId);
  assert.deepEqual(validateX47ExecutionReceipt(execution, authority(), runtimeIdentity), execution);
  const invented = structuredClone(execution);
  invented.events[0].transitionCycle = invented.events[0].adapterAppliedCycle;
  assert.throws(() => validateX47ExecutionReceipt(invented, authority(), runtimeIdentity),
    /X47_EXECUTION_COMPLETION_INVALID|X47_TRANSITION_CORRELATION_INVALID/u);
  const [cancelled] = kernel.cancelX47Transactions('EXPLICIT_CANCEL', queue.transactionId, queue.binding);
  assert.deepEqual(validateX47CancelReceipt(cancelled, authority(), runtimeIdentity), cancelled);
  assert.throws(() => validateX47CancelReceipt({ ...cancelled, reason: 'TIMEOUT' },
    authority(), runtimeIdentity), /X47_CANCEL_RECEIPT_INVALID/u);
});
