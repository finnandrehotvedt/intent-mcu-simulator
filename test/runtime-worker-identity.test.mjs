// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK, RETAINED_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import {
  MODEL_RUNTIME_BINDING_SCHEMA, RUNTIME_BINDING_SCHEMA, validateWorkerRuntimeIdentity,
} from '../src/runtime-identity.mjs';
import {
  X47_APPLY_REQUEST_SCHEMA, X47_RUNTIME_AUTHORITY_SCHEMA, createX47WorkerBinding,
} from '../src/x47-runtime-transaction.mjs';

const messages = [];
globalThis.self = globalThis;
globalThis.postMessage = (message) => messages.push(structuredClone(message));
globalThis.close = () => {};
await import(`../src/simulator.worker.mjs?identity-test=${Date.now()}`);

async function send(data, accept) {
  const start = messages.length;
  globalThis.self.onmessage({ data });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = messages.slice(start).find(accept);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('WORKER_TEST_TIMEOUT');
}

test('bound worker emits one stable identity on ready, sample, step, reset and dispose', async () => {
  const binding = { schema: RUNTIME_BINDING_SCHEMA, projectGeneration: 3,
    runtimeGeneration: 5, artifactIdentity: 'a'.repeat(64) };
  const ready = await send({ command: 'init', hex: ':00000001FF', circuit: DEFAULT_CIRCUIT,
    runtimeBinding: binding }, (message) => message.kind === 'ready');
  const nonce = ready.runtimeIdentity.workerInstanceNonce;
  validateWorkerRuntimeIdentity(ready.runtimeIdentity, binding, nonce);
  for (const [command, kind] of [['sample', 'sample'], ['step', 'stepped'], ['reset', 'reset']]) {
    const response = await send({ command }, (message) => message.kind === kind);
    assert.deepEqual(validateWorkerRuntimeIdentity(response.runtimeIdentity, binding, nonce), ready.runtimeIdentity);
  }
  const disposed = await send({ command: 'dispose' }, (message) => message.kind === 'disposed');
  assert.deepEqual(validateWorkerRuntimeIdentity(disposed.runtimeIdentity, binding, nonce), ready.runtimeIdentity);
  assert.equal(Object.hasOwn(disposed, 'x47CancellationReceipts'), false);
});

test('retained worker projects only its validated model execution context into accepted snapshots', async () => {
  const binding = {
    schema: MODEL_RUNTIME_BINDING_SCHEMA,
    projectGeneration: 7,
    runtimeGeneration: 11,
    artifactIdentity: 'b'.repeat(64),
    modelImplementationSha256: RETAINED_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: 'c'.repeat(64),
  };
  const init = {
    command: 'init',
    hex: ':00000001FF',
    circuit: DEFAULT_CIRCUIT,
    runtimeBinding: binding,
    modelLibraryLock: RETAINED_MODEL_LIBRARY_LOCK,
    modelImplementationSha256: RETAINED_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: binding.modelExecutionContextSha256,
  };
  const ready = await send(init, (message) => message.kind === 'ready');
  assert.equal(ready.modelExecutionContextSha256, binding.modelExecutionContextSha256);
  assert.equal(ready.runtimeIdentity.modelExecutionContextSha256, binding.modelExecutionContextSha256);
  validateWorkerRuntimeIdentity(ready.runtimeIdentity, binding, ready.runtimeIdentity.workerInstanceNonce);

  const sample = await send({ command: 'sample' }, (message) => message.kind === 'sample');
  assert.equal(sample.modelExecutionContextSha256, binding.modelExecutionContextSha256);
  assert.deepEqual(sample.runtimeIdentity, ready.runtimeIdentity);
});

test('current worker keeps the same validated execution-context projection', async () => {
  const binding = {
    schema: MODEL_RUNTIME_BINDING_SCHEMA,
    projectGeneration: 9,
    runtimeGeneration: 13,
    artifactIdentity: 'a'.repeat(64),
    modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: 'b'.repeat(64),
  };
  const ready = await send({
    command: 'init',
    hex: ':00000001FF',
    circuit: DEFAULT_CIRCUIT,
    runtimeBinding: binding,
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: binding.modelExecutionContextSha256,
  }, (message) => message.kind === 'ready');
  assert.equal(ready.modelExecutionContextSha256, binding.modelExecutionContextSha256);
  assert.equal(ready.runtimeIdentity.modelExecutionContextSha256, binding.modelExecutionContextSha256);
  validateWorkerRuntimeIdentity(ready.runtimeIdentity, binding, ready.runtimeIdentity.workerInstanceNonce);
});

test('retained worker does not project absent or mismatched execution context', async () => {
  const binding = {
    schema: MODEL_RUNTIME_BINDING_SCHEMA,
    projectGeneration: 8,
    runtimeGeneration: 12,
    artifactIdentity: 'd'.repeat(64),
    modelImplementationSha256: RETAINED_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: 'e'.repeat(64),
  };
  const mismatch = await send({
    command: 'init',
    hex: ':00000001FF',
    circuit: DEFAULT_CIRCUIT,
    runtimeBinding: binding,
    modelLibraryLock: RETAINED_MODEL_LIBRARY_LOCK,
    modelImplementationSha256: RETAINED_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: 'f'.repeat(64),
  }, (message) => message.kind === 'error');
  assert.equal(mismatch.message, 'MODEL_LIBRARY_EXECUTION_CONTEXT_MISMATCH');
  assert.equal(Object.hasOwn(mismatch, 'modelExecutionContextSha256'), false);

  const absentBinding = structuredClone(binding);
  delete absentBinding.modelExecutionContextSha256;
  const absent = await send({
    command: 'init',
    hex: ':00000001FF',
    circuit: DEFAULT_CIRCUIT,
    runtimeBinding: absentBinding,
    modelLibraryLock: RETAINED_MODEL_LIBRARY_LOCK,
    modelImplementationSha256: RETAINED_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: binding.modelExecutionContextSha256,
  }, (message) => message.kind === 'error');
  assert.equal(absent.message, 'RUNTIME_BINDING_INVALID');
  assert.equal(Object.hasOwn(absent, 'modelExecutionContextSha256'), false);
});

test('private X47 worker contract binds acceptance and cancellation to one current worker epoch', async () => {
  const runtimeBinding = {
    schema: MODEL_RUNTIME_BINDING_SCHEMA,
    projectGeneration: 17,
    runtimeGeneration: 23,
    artifactIdentity: '1'.repeat(64),
    modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: '2'.repeat(64),
  };
  const authority = {
    schema: X47_RUNTIME_AUTHORITY_SCHEMA,
    profile: 'board.atmega328p-16mhz-v1',
    projectGeneration: runtimeBinding.projectGeneration,
    sourceProjectRevision: 29,
    sourceSha256: '3'.repeat(64),
    graphIdentity: `sha256:${'4'.repeat(64)}`,
    inputIdentitySha256: '5'.repeat(64),
    artifactIdentity: runtimeBinding.artifactIdentity,
    runtimeGeneration: runtimeBinding.runtimeGeneration,
    modelImplementationSha256: runtimeBinding.modelImplementationSha256,
    modelExecutionContextSha256: runtimeBinding.modelExecutionContextSha256,
  };
  const initialize = () => send({ command: 'init', hex: ':00000001FF', circuit: DEFAULT_CIRCUIT,
    runtimeBinding, modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: runtimeBinding.modelExecutionContextSha256,
    x47RuntimeAuthority: authority }, (message) => message.kind === 'ready');
  const applyRequest = (workerIdentity, transactionId) => ({
    schema: X47_APPLY_REQUEST_SCHEMA,
    transactionId,
    canonicalPulseSha256: '6'.repeat(64),
    binding: createX47WorkerBinding(authority, workerIdentity),
    expectedBaseCycle: 0,
    events: [{ pin: 2, offsetCycles: 2, level: false },
      { pin: 2, offsetCycles: 4, level: true }],
  });

  const firstReady = await initialize();
  const firstRequest = applyRequest(firstReady.runtimeIdentity, 'x47-worker-first');
  const accepted = await send({ command: 'x47-apply', request: firstRequest },
    (message) => message.kind === 'x47-accepted');
  assert.equal(accepted.receipt.transactionId, firstRequest.transactionId);
  const reset = await send({ command: 'reset' }, (message) => message.kind === 'reset');
  assert.equal(reset.x47CancellationReceipts.length, 1);
  assert.equal(reset.x47CancellationReceipts[0].reason, 'RESET');
  const resetIndex = messages.lastIndexOf(reset);
  assert.equal(messages[resetIndex - 1].kind, 'x47-cancelled');
  assert.equal(messages[resetIndex - 1].reason, 'RESET');
  const revoked = await send({ command: 'x47-apply', request: firstRequest },
    (message) => message.kind === 'error');
  assert.equal(revoked.message, 'X47_RUNTIME_AUTHORITY_UNAVAILABLE');

  const secondReady = await initialize();
  assert.notEqual(secondReady.runtimeIdentity.workerInstanceNonce,
    firstReady.runtimeIdentity.workerInstanceNonce);
  const stale = await send({ command: 'x47-apply', request: firstRequest },
    (message) => message.kind === 'error');
  assert.equal(stale.message, 'X47_WORKER_BINDING_STALE');
  const secondRequest = applyRequest(secondReady.runtimeIdentity, 'x47-worker-second');
  await send({ command: 'x47-apply', request: secondRequest },
    (message) => message.kind === 'x47-accepted');
  const disposed = await send({ command: 'dispose' }, (message) => message.kind === 'disposed');
  assert.equal(disposed.x47CancellationReceipts.length, 1);
  assert.equal(disposed.x47CancellationReceipts[0].reason, 'DISPOSE');
  const disposedIndex = messages.lastIndexOf(disposed);
  assert.equal(messages[disposedIndex - 1].kind, 'x47-cancelled');
  assert.equal(messages[disposedIndex - 1].reason, 'DISPOSE');
  assert.deepEqual(disposed.runtimeIdentity, secondReady.runtimeIdentity);
});
