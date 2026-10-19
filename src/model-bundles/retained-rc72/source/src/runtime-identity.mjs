// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';

export const RUNTIME_BINDING_SCHEMA = 'intent-mcu-runtime-binding@1';
export const WORKER_RUNTIME_IDENTITY_SCHEMA = 'intent-mcu-worker-runtime-identity@1';
const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const clone = (value) => structuredClone(value);
function reject(code) { throw Object.assign(new Error(code), { code }); }

export function runtimeInitBinding(value) {
  if (!exactKeys(value, ['schema', 'projectGeneration', 'runtimeGeneration', 'artifactIdentity'])
      || value.schema !== RUNTIME_BINDING_SCHEMA
      || !Number.isSafeInteger(value.projectGeneration) || value.projectGeneration < 1
      || !Number.isSafeInteger(value.runtimeGeneration) || value.runtimeGeneration < 1
      || !HASH.test(value.artifactIdentity)) reject('RUNTIME_BINDING_INVALID');
  return clone(value);
}

export function createWorkerRuntimeIdentity(value, workerInitialization, cryptoImpl = crypto) {
  const binding = runtimeInitBinding(value);
  if (!Number.isSafeInteger(workerInitialization) || workerInitialization < 1
      || typeof cryptoImpl?.getRandomValues !== 'function') reject('RUNTIME_WORKER_IDENTITY_INVALID');
  const nonceBytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(nonceBytes);
  const workerInstanceNonce = [...nonceBytes]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return Object.freeze({
    schema: WORKER_RUNTIME_IDENTITY_SCHEMA,
    projectGeneration: binding.projectGeneration,
    runtimeGeneration: binding.runtimeGeneration,
    artifactIdentity: binding.artifactIdentity,
    workerInitialization,
    workerInstanceNonce,
  });
}

export function validateWorkerRuntimeIdentity(value, binding, expectedNonce = null) {
  const accepted = runtimeInitBinding(binding);
  if (!exactKeys(value, ['schema', 'projectGeneration', 'runtimeGeneration', 'artifactIdentity',
    'workerInitialization', 'workerInstanceNonce'])
      || value.schema !== WORKER_RUNTIME_IDENTITY_SCHEMA
      || value.projectGeneration !== accepted.projectGeneration
      || value.runtimeGeneration !== accepted.runtimeGeneration
      || value.artifactIdentity !== accepted.artifactIdentity
      || !Number.isSafeInteger(value.workerInitialization) || value.workerInitialization < 1
      || !NONCE.test(value.workerInstanceNonce)
      || (expectedNonce !== null && value.workerInstanceNonce !== expectedNonce)) {
    reject('RUNTIME_WORKER_IDENTITY_STALE');
  }
  return clone(value);
}
