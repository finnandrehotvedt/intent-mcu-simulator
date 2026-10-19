// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MODEL_RUNTIME_BINDING_SCHEMA, MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA,
  RUNTIME_BINDING_SCHEMA, createWorkerRuntimeIdentity, runtimeInitBinding,
  validateWorkerRuntimeIdentity,
} from '../src/runtime-identity.mjs';

const binding = () => ({ schema: RUNTIME_BINDING_SCHEMA, projectGeneration: 2,
  runtimeGeneration: 3, artifactIdentity: 'a'.repeat(64) });
const fakeCrypto = { getRandomValues(value) { value.fill(0x5a); return value; } };

test('normal runtime init and every status bind exact generation and artifact', () => {
  assert.deepEqual(runtimeInitBinding(binding()), binding());
  const identity = createWorkerRuntimeIdentity(binding(), 4, fakeCrypto);
  assert.equal(identity.workerInstanceNonce, '5a'.repeat(16));
  assert.deepEqual(validateWorkerRuntimeIdentity(identity, binding()), identity);
  assert.deepEqual(validateWorkerRuntimeIdentity(identity, binding(), identity.workerInstanceNonce), identity);
});

test('model-bound runtime identity echoes exact implementation and execution context', () => {
  const modelBinding = { ...binding(), schema: MODEL_RUNTIME_BINDING_SCHEMA,
    modelImplementationSha256: 'b'.repeat(64), modelExecutionContextSha256: 'c'.repeat(64) };
  const identity = createWorkerRuntimeIdentity(modelBinding, 5, fakeCrypto);
  assert.equal(identity.schema, MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA);
  assert.equal(identity.modelImplementationSha256, modelBinding.modelImplementationSha256);
  assert.equal(identity.modelExecutionContextSha256, modelBinding.modelExecutionContextSha256);
  assert.deepEqual(validateWorkerRuntimeIdentity(identity, modelBinding), identity);
  assert.throws(() => validateWorkerRuntimeIdentity({ ...identity,
    modelExecutionContextSha256: 'd'.repeat(64) }, modelBinding), {
    code: 'RUNTIME_WORKER_IDENTITY_STALE',
  });
});

test('stale, malformed and nonce-swapped worker messages reject', () => {
  const identity = createWorkerRuntimeIdentity(binding(), 4, fakeCrypto);
  for (const changed of [
    { ...identity, runtimeGeneration: 4 },
    { ...identity, artifactIdentity: 'b'.repeat(64) },
    { ...identity, workerInstanceNonce: 'c'.repeat(32) },
    { projectGeneration: 2 },
  ]) assert.throws(() => validateWorkerRuntimeIdentity(changed, binding(), identity.workerInstanceNonce), {
    code: 'RUNTIME_WORKER_IDENTITY_STALE',
  });
});
