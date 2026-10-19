// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { RUNTIME_BINDING_SCHEMA, validateWorkerRuntimeIdentity } from '../src/runtime-identity.mjs';

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
