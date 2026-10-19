// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK, RETAINED_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import {
  MODEL_RUNTIME_BINDING_SCHEMA, RUNTIME_BINDING_SCHEMA, validateWorkerRuntimeIdentity,
} from '../src/runtime-identity.mjs';

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
