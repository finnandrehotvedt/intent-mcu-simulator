// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { MODEL_RUNTIME_BINDING_SCHEMA } from '../src/runtime-identity.mjs';
import { validateX46UsartConfigurationSource } from '../src/x46-usart-configuration-producer.mjs';

const messages = [];
globalThis.crypto ??= webcrypto;
globalThis.self = globalThis;
globalThis.postMessage = (message) => messages.push(structuredClone(message));
globalThis.close = () => {};
await import(`../src/simulator.worker.mjs?x46-usart-config=${Date.now()}`);

async function send(data, accept) {
  const start = messages.length;
  globalThis.self.onmessage({ data });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = messages.slice(start).find(accept);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`X46_SYNTHETIC_WORKER_TEST_TIMEOUT:${JSON.stringify(messages.slice(start))}`);
}

test('synthetic in-process worker binds empty configuration source and advances Reset epoch', async () => {
  const binding = {
    schema: MODEL_RUNTIME_BINDING_SCHEMA,
    projectGeneration: 4,
    runtimeGeneration: 9,
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

  assert.deepEqual(ready.usartConfiguration.runtimeIdentity, ready.runtimeIdentity);
  assert.equal(ready.usartConfiguration.resetEpoch, 1);
  assert.equal(ready.usartConfiguration.records.length, 0);
  assert.throws(() => validateX46UsartConfigurationSource(
    ready.usartConfiguration,
    { runtimeIdentity: ready.runtimeIdentity, resetEpoch: 1 },
  ), { code: 'X46_USART_CONFIG_SOURCE_MISSING' });

  const reset = await send({ command: 'reset' }, (message) => message.kind === 'reset');
  assert.deepEqual(reset.usartConfiguration.runtimeIdentity, ready.runtimeIdentity);
  assert.equal(reset.usartConfiguration.resetEpoch, 2);
  assert.equal(reset.usartConfiguration.records.length, 0);
  assert.throws(() => validateX46UsartConfigurationSource(
    ready.usartConfiguration,
    { runtimeIdentity: reset.runtimeIdentity, resetEpoch: 2 },
  ), { code: 'X46_USART_CONFIG_SOURCE_STALE' });
});
