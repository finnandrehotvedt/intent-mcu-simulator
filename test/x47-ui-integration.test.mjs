// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { X47_RUNTIME_AUTHORITY_SCHEMA } from '../src/x47-runtime-transaction.mjs';
import { createX47UiOwner } from '../src/x47-ui-integration.mjs';

const hash = (character) => character.repeat(64);
const runtimeIdentity = {
  schema: 'intent-mcu-worker-runtime-identity@2', projectGeneration: 7,
  runtimeGeneration: 11, artifactIdentity: hash('a'),
  modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
  modelExecutionContextSha256: hash('b'), workerInitialization: 3,
  workerInstanceNonce: '1'.repeat(32),
};
const authority = {
  schema: X47_RUNTIME_AUTHORITY_SCHEMA, profile: 'board.atmega328p-16mhz-v1',
  projectGeneration: 7, buildGeneration: 5, sourceProjectRevision: 19,
  sourceSha256: hash('c'), graphIdentity: `sha256:${hash('d')}`,
  inputIdentitySha256: hash('e'), artifactIdentity: hash('a'), runtimeGeneration: 11,
  modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
  modelExecutionContextSha256: hash('b'),
};
const preview = { canonicalPulseSha256: hash('f'), events: [
  { pin: 2, offsetCycles: 2, level: false },
  { pin: 2, offsetCycles: 4, level: true },
] };

function acceptedOwner() {
  const owner = createX47UiOwner();
  owner.bind({ authority, runtimeIdentity, workerToken: 9 });
  owner.noteRun({ workerToken: 9, runtimeIdentity });
  owner.noteExplicitPause({ workerToken: 9, runtimeIdentity, cycle: 0, preview });
  const request = owner.beginApply('x47-ui-one');
  const kernel = new RuntimeKernel(':00000001FF', DEFAULT_CIRCUIT, {
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    modelExecutionContextSha256: runtimeIdentity.modelExecutionContextSha256,
    x47RuntimeAuthority: authority, runtimeIdentity,
  });
  const queue = kernel.queueX47Transaction(request);
  owner.accept({ workerToken: 9, runtimeIdentity, receipt: queue,
    executionReceipt: kernel.x47ExecutionReceipt(queue.transactionId) });
  return { owner, request, kernel, queue };
}

test('private X47 owner requires Run then explicit Pause and one exact Apply', () => {
  const owner = createX47UiOwner();
  owner.bind({ authority, runtimeIdentity, workerToken: 9 });
  assert.equal(owner.snapshot().phase, 'await-run');
  assert.throws(() => owner.noteExplicitPause({ workerToken: 9, runtimeIdentity,
    cycle: 0, preview }), /X47_UI_PAUSE_INVALID/u);
  owner.noteRun({ workerToken: 9, runtimeIdentity });
  owner.noteExplicitPause({ workerToken: 9, runtimeIdentity, cycle: 0, preview });
  const request = owner.beginApply('x47-ui-one');
  assert.equal(request.expectedBaseCycle, 0);
  assert.deepEqual(request.events, preview.events);
  assert.throws(() => owner.beginApply('x47-ui-two'), /X47_UI_APPLY_NOT_READY/u);
});

test('accepted queue and execution are joined to the exact saved request and worker', () => {
  const { owner, kernel, queue } = acceptedOwner();
  assert.equal(owner.snapshot().phase, 'resume-required');
  const changed = structuredClone(kernel.x47ExecutionReceipt(queue.transactionId));
  changed.canonicalPulseSha256 = hash('0');
  assert.throws(() => owner.observeExecution({ workerToken: 9, runtimeIdentity,
    executionReceipt: changed }), /X47_RECEIPT_REQUEST_MISMATCH/u);
  assert.throws(() => owner.resume({ workerToken: 10, runtimeIdentity }), /X47_UI_WORKER_STALE/u);
  owner.resume({ workerToken: 9, runtimeIdentity });
  assert.equal(owner.snapshot().phase, 'running');
});

test('Stop requires exact cancellation before exact disposed and preserves incomplete truth', () => {
  const { owner, kernel, queue } = acceptedOwner();
  owner.beginStop('dispose-one');
  const [receipt] = kernel.cancelX47Transactions('DISPOSE', queue.transactionId, queue.binding);
  assert.equal(receipt.evidenceComplete, false);
  owner.acceptCancellation({ workerToken: 9, runtimeIdentity, disposeToken: 'dispose-one', receipt });
  assert.throws(() => owner.acceptDisposed({ workerToken: 9, runtimeIdentity,
    disposeToken: 'wrong' }), /X47_UI_DISPOSE_STALE/u);
  const stopped = owner.acceptDisposed({ workerToken: 9, runtimeIdentity, disposeToken: 'dispose-one' });
  assert.equal(stopped.phase, 'stopped');
  assert.match(stopped.reason, /incomplete/u);
});

test('timeout is not completion and late cancellation cannot resurrect authority', () => {
  const { owner, kernel, queue } = acceptedOwner();
  owner.beginStop('dispose-timeout');
  const timedOut = owner.timeout(750);
  assert.equal(timedOut.phase, 'timeout');
  assert.equal(timedOut.cancelTimeout.state, 'not-completed');
  const [receipt] = kernel.cancelX47Transactions('DISPOSE', queue.transactionId, queue.binding);
  assert.throws(() => owner.acceptCancellation({ workerToken: 9, runtimeIdentity,
    disposeToken: 'dispose-timeout', receipt }), /X47_UI_(?:CANCEL|WORKER)_STALE/u);
});

test('retirement clears current authority before stale lifecycle messages', () => {
  const { owner, kernel, queue } = acceptedOwner();
  const retired = owner.retire('X47_SOURCE_EDITED');
  assert.equal(retired.authority, null);
  assert.equal(retired.runtimeIdentity, null);
  assert.throws(() => owner.observeExecution({ workerToken: 9, runtimeIdentity,
    executionReceipt: kernel.x47ExecutionReceipt(queue.transactionId) }), /X47_UI_WORKER_STALE/u);
});

test('source or Open retirement cannot be resurrected by a late Apply acceptance', () => {
  const owner = createX47UiOwner();
  owner.bind({ authority, runtimeIdentity, workerToken: 9 });
  owner.noteRun({ workerToken: 9, runtimeIdentity });
  owner.noteExplicitPause({ workerToken: 9, runtimeIdentity, cycle: 0, preview });
  const request = owner.beginApply('x47-ui-late-acceptance');
  const kernel = new RuntimeKernel(':00000001FF', DEFAULT_CIRCUIT, {
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    modelExecutionContextSha256: runtimeIdentity.modelExecutionContextSha256,
    x47RuntimeAuthority: authority, runtimeIdentity,
  });
  const queue = kernel.queueX47Transaction(request);
  owner.retire('X47_PROJECT_REPLACED');
  assert.throws(() => owner.accept({ workerToken: 9, runtimeIdentity, receipt: queue,
    executionReceipt: kernel.x47ExecutionReceipt(queue.transactionId) }), /X47_UI_WORKER_STALE/u);
  assert.equal(owner.snapshot().phase, 'retired');
  assert.equal(owner.snapshot().authority, null);
});
