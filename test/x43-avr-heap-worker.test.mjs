// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { MODEL_RUNTIME_BINDING_SCHEMA } from '../src/runtime-identity.mjs';
import { X43_AVR_HEAP_SYMBOL_SCHEMA } from '../src/x43-avr-heap-profile.mjs';
import { AVR_ALLOCATOR_PROVENANCE_SCHEMA } from '../compiler/avr-allocator-provenance.mjs';

const messages = [];
globalThis.crypto ??= webcrypto;
globalThis.self = globalThis;
globalThis.postMessage = (message) => messages.push(structuredClone(message));
globalThis.close = () => {};
await import(`../src/simulator.worker.mjs?x43-heap-worker=${Date.now()}`);

async function send(data, accept) {
  const start = messages.length;
  globalThis.self.onmessage({ data });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = messages.slice(start).find(accept);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('X43_HEAP_WORKER_TIMEOUT');
}

test('worker accepts only artifact/model-bound metadata and identity-bound sample commands', async () => {
  const runtimeBinding = { schema: MODEL_RUNTIME_BINDING_SCHEMA, projectGeneration: 3,
    runtimeGeneration: 7, artifactIdentity: 'a'.repeat(64),
    modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: 'b'.repeat(64) };
  const unavailable = { schema: X43_AVR_HEAP_SYMBOL_SCHEMA, state: 'unavailable',
    reason: 'avr-libc-allocator-symbol-set-not-linked', artifactIdentity: runtimeBinding.artifactIdentity,
    elfSha256: 'c'.repeat(64), modelImplementationSha256: runtimeBinding.modelImplementationSha256,
    modelExecutionContextSha256: runtimeBinding.modelExecutionContextSha256,
    allocator: null, provenance: { schema: AVR_ALLOCATOR_PROVENANCE_SCHEMA,
      state: 'unavailable', reason: 'avr-libc-allocator-symbol-set-not-linked',
      elfSha256: 'c'.repeat(64), allocator: null, archiveSha256: null,
      member: null, memberSha256: null, symbols: null }, symbols: null };
  const init = { command: 'init', hex: ':00000001FF', circuit: DEFAULT_CIRCUIT,
    runtimeBinding, modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    modelImplementationSha256: runtimeBinding.modelImplementationSha256,
    modelExecutionContextSha256: runtimeBinding.modelExecutionContextSha256,
    x43HeapProfile: unavailable };
  const ready = await send(init, (message) => message.kind === 'ready');
  assert.equal(ready.x43HeapProfile.reason, 'avr-libc-allocator-symbol-set-not-linked');
  const command = { command: 'x43-heap-sample', token: 'worker-heap-sample',
    artifactIdentity: runtimeBinding.artifactIdentity,
    runtimeGeneration: runtimeBinding.runtimeGeneration,
    workerInstanceNonce: ready.runtimeIdentity.workerInstanceNonce };
  const unavailableResult = await send(command, (message) => message.kind === 'error');
  assert.equal(unavailableResult.message, 'X43_HEAP_ALLOCATOR_UNAVAILABLE');
  const stale = await send({ ...command, token: 'worker-heap-stale',
    workerInstanceNonce: 'd'.repeat(32) }, (message) => message.kind === 'error');
  assert.equal(stale.message, 'X43_HEAP_COMMAND_STALE');

  const mismatched = structuredClone(unavailable);
  mismatched.artifactIdentity = 'e'.repeat(64);
  const rejected = await send({ ...init, x43HeapProfile: mismatched },
    (message) => message.kind === 'error');
  assert.equal(rejected.message, 'X43_HEAP_RUNTIME_BINDING_MISMATCH');
});
