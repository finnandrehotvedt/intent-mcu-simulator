// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { RUNTIME_BINDING_SCHEMA } from '../src/runtime-identity.mjs';

const messages = [];
globalThis.crypto ??= webcrypto;
globalThis.self = globalThis;
globalThis.postMessage = (message) => messages.push(structuredClone(message));
globalThis.close = () => {};
await import(`../src/simulator.worker.mjs?x43-stack-worker=${Date.now()}`);

async function send(data, accept) {
  const start = messages.length;
  globalThis.self.onmessage({ data });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = messages.slice(start).find(accept);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('X43_STACK_WORKER_TIMEOUT');
}

test('worker stack interval is bound to exact worker identity and reset clears it', async () => {
  const binding = { schema: RUNTIME_BINDING_SCHEMA, projectGeneration: 2,
    runtimeGeneration: 3, artifactIdentity: 'a'.repeat(64) };
  const ready = await send({ command: 'init', hex: ':02000000FFDF20\n:00000001FF',
    circuit: DEFAULT_CIRCUIT, runtimeBinding: binding }, (message) => message.kind === 'ready');
  const command = (name, token = 'worker-stack-interval') => ({ command: name, token,
    artifactIdentity: binding.artifactIdentity, runtimeGeneration: binding.runtimeGeneration,
    workerInstanceNonce: ready.runtimeIdentity.workerInstanceNonce });
  const started = await send(command('x43-stack-start'), (message) => message.kind === 'x43-stack-started');
  assert.equal(started.x43Stack.interval.state, 'observing');
  const stepped = await send({ command: 'step' }, (message) => message.kind === 'stepped');
  assert.equal(stepped.x43Stack.current.depthBytes, 2);
  const captured = await send(command('x43-stack-capture'), (message) => message.kind === 'x43-stack-captured');
  assert.equal(captured.x43Stack.interval.maximumObservedDepthBytes, 2);

  const stale = await send({ ...command('x43-stack-start', 'stale'), workerInstanceNonce: 'b'.repeat(32) },
    (message) => message.kind === 'error');
  assert.equal(stale.message, 'X43_STACK_COMMAND_STALE');
  const reset = await send({ command: 'reset' }, (message) => message.kind === 'reset');
  assert.equal(reset.x43Stack.interval, null);
  assert.equal(reset.x43Stack.allTime.maximumObservedDepthBytes, 0);
});
