// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
