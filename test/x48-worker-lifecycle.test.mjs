// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { MODEL_RUNTIME_BINDING_SCHEMA } from '../src/runtime-identity.mjs';
import { createThermostatExperiment, openThermostatExperiment } from '../src/thermostat-experiment.mjs';
import { X48_PLANT_ID, X48_PROFILE, X48_SCHEMA } from '../src/x48-ideal-room-plant.mjs';

const messages = [];
globalThis.self = globalThis;
globalThis.postMessage = (message) => messages.push(structuredClone(message));
globalThis.close = () => {};
await import(`../src/simulator.worker.mjs?x48-worker=${Date.now()}`);

async function send(data, accept) {
  const start = messages.length;
  globalThis.self.onmessage({ data });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const found = messages.slice(start).find(accept);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('X48_WORKER_TEST_TIMEOUT');
}

test('X48 uses one current worker, applies cycle-zero inputs and cancels between slices', async () => {
  const opened = openThermostatExperiment(createThermostatExperiment().text);
  const runtimeBinding = {
    schema: MODEL_RUNTIME_BINDING_SCHEMA, projectGeneration: 7, runtimeGeneration: 9,
    artifactIdentity: 'a'.repeat(64),
    modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: 'b'.repeat(64),
  };
  const ready = await send({ command: 'init', hex: ':00000001FF',
    circuit: opened.session.runtimeProject.circuit, runtimeBinding,
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: runtimeBinding.modelExecutionContextSha256,
    instruments: { logicChannels: ['D13', 'D2'], selectedPin: 'D13', serialHistoryLimit: 512 },
  }, (message) => message.kind === 'ready');
  const binding = {
    schema: X48_SCHEMA, plantId: X48_PLANT_ID, profile: X48_PROFILE,
    inputIdentity: 'c'.repeat(64), projectGeneration: ready.runtimeIdentity.projectGeneration,
    runtimeGeneration: ready.runtimeIdentity.runtimeGeneration,
    artifactIdentity: ready.runtimeIdentity.artifactIdentity,
    modelImplementationSha256: ready.runtimeIdentity.modelImplementationSha256,
    modelExecutionContextSha256: ready.runtimeIdentity.modelExecutionContextSha256,
    workerInitialization: ready.runtimeIdentity.workerInitialization,
    workerInstanceNonce: ready.runtimeIdentity.workerInstanceNonce,
  };
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
