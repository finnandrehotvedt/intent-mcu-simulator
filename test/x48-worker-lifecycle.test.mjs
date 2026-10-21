// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { MODEL_RUNTIME_BINDING_SCHEMA } from '../src/runtime-identity.mjs';
import { createThermostatExperiment, openThermostatExperiment } from '../src/thermostat-experiment.mjs';
import {
  X48_AUTHORITY_SCHEMA, X48_PLANT_CONTRACT_IDENTITY, X48_PLANT_ID, X48_PROFILE,
  createX48Binding,
} from '../src/x48-ideal-room-plant.mjs';

const messages = [];
globalThis.self = globalThis;
globalThis.postMessage = (message) => messages.push(structuredClone(message));
globalThis.close = () => {};
await import(`../src/simulator.worker.mjs?x48-worker=${Date.now()}`);

async function send(data, accept) {
  const start = messages.length;
  globalThis.self.onmessage({ data });
  return waitFrom(start, accept);
}

async function waitFrom(start, accept) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const found = messages.slice(start).find(accept);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('X48_WORKER_TEST_TIMEOUT');
}

async function initialize(suffix = 'a') {
  const opened = openThermostatExperiment(createThermostatExperiment().text);
  const runtimeBinding = {
    schema: MODEL_RUNTIME_BINDING_SCHEMA, projectGeneration: 7, runtimeGeneration: 9,
    artifactIdentity: suffix.repeat(64),
    modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: 'b'.repeat(64),
  };
  const authority = {
    schema: X48_AUTHORITY_SCHEMA, plantId: X48_PLANT_ID,
    plantContractIdentity: X48_PLANT_CONTRACT_IDENTITY, profile: X48_PROFILE,
    inputIdentity: 'c'.repeat(64), sourceIdentity: 'd'.repeat(64),
    graphIdentity: `sha256:${'e'.repeat(64)}`, projectGeneration: 7, buildGeneration: 8,
    sourceProjectRevision: 11, runtimeGeneration: 9, artifactIdentity: runtimeBinding.artifactIdentity,
    modelImplementationSha256: runtimeBinding.modelImplementationSha256,
    modelExecutionContextSha256: runtimeBinding.modelExecutionContextSha256,
  };
  const ready = await send({ command: 'init', hex: ':00000001FF',
    circuit: opened.session.runtimeProject.circuit, runtimeBinding,
    x48Authority: authority,
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: runtimeBinding.modelExecutionContextSha256,
    instruments: { logicChannels: ['D13', 'D2'], selectedPin: 'D13', serialHistoryLimit: 512 },
  }, (message) => message.kind === 'ready');
  const binding = createX48Binding(authority, ready.runtimeIdentity, 'f'.repeat(32));
  return { ready, authority, binding };
}

test('X48 uses one current worker, applies cycle-zero inputs and cancels between slices', async () => {
  const { binding } = await initialize('a');
  const started = await send({ command: 'x48-run', binding },
    (message) => message.kind === 'x48-started');
  assert.equal(started.cycle, 0);
  assert.deepEqual(started.initialInputs.temperature, { targetCycle: 0, appliedCycle: 0 });
  assert.deepEqual(started.initialInputs.enable, { targetCycle: 0, appliedCycle: 0 });
  const cancelled = await send({ command: 'x48-cancel' },
    (message) => message.kind === 'x48-cancelled');
  assert.equal(cancelled.result.status, 'indeterminate');
  assert.equal(cancelled.result.reason, 'X48_USER_CANCELLED');
  assert.equal(cancelled.runtimeIdentity.workerInstanceNonce, binding.workerInstanceNonce);
  assert.equal(messages.filter((message) => message.kind === 'ready').length, 1);
});

test('X48 rejects a direct worker request whose source does not join trusted init authority', async () => {
  const { binding } = await initialize('6');
  const stale = { ...binding, sourceIdentity: '9'.repeat(64) };
  const error = await send({ command: 'x48-run', binding: stale },
    (message) => message.kind === 'error' && /X48_BINDING_STALE/u.test(message.message));
  assert.equal(error.paused, true);
});

test('X48 reset and dispose emit indeterminate cancellation before lifecycle completion', async () => {
  let initialized = await initialize('7');
  await send({ command: 'x48-run', binding: initialized.binding },
    (message) => message.kind === 'x48-started');
  const resetStart = messages.length;
  globalThis.self.onmessage({ data: { command: 'reset' } });
  const resetCancel = await waitFrom(resetStart,
    (message) => message.kind === 'x48-cancelled' && message.result.reason === 'X48_RESET');
  assert(messages.indexOf(resetCancel) >= resetStart);

  initialized = await initialize('8');
  await send({ command: 'x48-run', binding: initialized.binding },
    (message) => message.kind === 'x48-started');
  const disposeStart = messages.length;
  globalThis.self.onmessage({ data: { command: 'dispose', disposeToken: 'x48-dispose-test' } });
  for (let attempt = 0; attempt < 100 && messages.length < disposeStart + 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  const tail = messages.slice(disposeStart);
  assert.equal(tail[0].kind, 'x48-cancelled');
  assert.equal(tail[0].result.reason, 'X48_DISPOSED');
  assert.equal(tail[1].kind, 'disposed');
});
